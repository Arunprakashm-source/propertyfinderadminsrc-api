const asyncHandler = require('express-async-handler');
const mongoose = require('mongoose');

const Properties = require('../models/propertiesModal');
const ListingType = require('../models/listingTypeModel');
const PropertyType = require('../models/propertyTypeModel');
const Amenities = require('../models/amenitiesModel');
const Agencies = require('../models/agenciesModel');
const ActivityLog = require('../models/activityLogModel');
const DealClosure = require('../models/dealClosureModel');
const Inquirys = require('../models/inquirysModel');
const Reports = require('../models/reportsModel');
const Users = require('../models/usersModel');
const uploadService = require('../services/uploadService');
const { success, failure, generateSlug } = require('../utils/helpers');
const { logger } = require('../utils/logger');

const { Types } = mongoose;
const DEFAULT_PROFILE_PICTURE = 'profileless.png';

const PROPERTY_STATUSES = new Set(['active', 'inactive', 'sold', 'rented', 'pending']);
const COMPLETION_STATUSES = new Set(['off-plan', 'ready']);
const FURNISHED_STATUSES = new Set(['fully', 'partially', 'unfurnished']);

const PROPERTY_LIST_POPULATE = [
  { path: 'listingType', select: 'name slug transaction category' },
  { path: 'propertyType', select: 'name slug category' },
  {
    path: 'agent',
    select: 'fullName email phoneNumber profilePicture agentType',
  },
  { path: 'agency', select: 'agencyName email profilePicture' },
];

const PROPERTY_DETAIL_POPULATE = [
  ...PROPERTY_LIST_POPULATE,
  { path: 'amenities', select: 'name slug category icon image' },
  { path: 'developer', select: 'name email profilePicture logo' },
  { path: 'featured.featuredBy', select: 'name email' },
];

const validateObjectId = (id) => id && Types.ObjectId.isValid(id);

const getAdminId = (req) =>
  req.admin?.id || req.admin?._id || req.user?.id || req.user?._id;

const normalizeArray = (value) => {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null || value === '') return [];
  return [value];
};

const toNumberOrNull = (value) => {
  if (value === undefined || value === null || value === '') return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

const parseOptionalBoolean = (value) => {
  if (typeof value === 'undefined') return undefined;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
  }
  return undefined;
};

const escapeRegex = (text = '') =>
  text.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const isAgencyPopulated = (agency) =>
  Boolean(agency && typeof agency === 'object' && agency.agencyName != null);

const attachAgencyDetails = async (properties) => {
  const list = Array.isArray(properties) ? properties : [properties];
  const plains = list.map((doc) =>
    doc && typeof doc.toObject === 'function' ? doc.toObject() : doc
  );

  const agencyIds = [
    ...new Set(
      plains
        .map((row) => {
          if (isAgencyPopulated(row?.agency)) return null;
          const raw = row?.agency;
          if (!raw) return null;
          const id = raw._id ?? raw;
          return Types.ObjectId.isValid(id) ? String(id) : null;
        })
        .filter(Boolean)
    ),
  ];

  if (!agencyIds.length) return plains;

  const agencies = await Agencies.find({ _id: { $in: agencyIds } })
    .select('agencyName email profilePicture')
    .lean();
  const agencyById = new Map(agencies.map((row) => [String(row._id), row]));

  return plains.map((row) => {
    if (isAgencyPopulated(row?.agency)) return row;
    const raw = row?.agency;
    if (!raw) return row;
    const doc = agencyById.get(String(raw._id ?? raw));
    return doc ? { ...row, agency: doc } : row;
  });
};

const mapProfileRef = (entity) => {
  if (!entity || typeof entity !== 'object') return null;
  const stored =
    uploadService.toStoredProfileFilename(entity.profilePicture || entity.logo) ||
    DEFAULT_PROFILE_PICTURE;
  return {
    _id: entity._id,
    fullName: entity.fullName || entity.name,
    agencyName: entity.agencyName,
    name: entity.name,
    email: entity.email,
    phoneNumber: entity.phoneNumber,
    agentType: entity.agentType,
    profilePicture: stored,
  };
};

const normalizeStoredMediaFilename = (value) => {
  if (!value) return '';
  const raw = String(value).trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw.split('/').pop() || raw;
  return raw.includes('/') ? raw.split('/').pop() : raw;
};

const PROPERTY_IMAGE_LIMIT = 2;

/** Primary first, then by order. List uses limit 2; detail passes limit null for all images. */
const mapPropertyImages = (images = [], limit = PROPERTY_IMAGE_LIMIT) => {
  const mapped = (images || []).map((img, idx) => ({
    url: normalizeStoredMediaFilename(img?.url),
    isPrimary: Boolean(img?.isPrimary),
    order: typeof img?.order === 'number' ? img.order : idx,
    caption: img?.caption || '',
    uploadedAt: img?.uploadedAt,
  }));
  const sorted = [...mapped]
    .filter((img) => img.url)
    .sort((a, b) => {
      if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
      return a.order - b.order;
    });
  if (limit == null) return sorted;
  return sorted.slice(0, limit);
};

const withRentPricing = (property) => {
  if (!property) return property;
  const transaction = property?.listingType?.transaction;
  const amount = property?.price;
  return {
    ...property,
    rentPricing:
      transaction === 'rent' && typeof amount === 'number'
        ? { yearly: amount, monthly: Math.round(amount / 12) }
        : null,
  };
};

const mapPropertyListItem = (property) => {
  const source = withRentPricing({
    ...property,
    images: mapPropertyImages(property.images),
    agent: mapProfileRef(property.agent),
    agency: mapProfileRef(property.agency),
  });

  return {
    _id: source._id,
    title: source.title,
    slug: source.slug,
    status: source.status,
    isActive: source.isActive,
    isFeatured: source.isFeatured,
    isVerified: source.isVerified,
    price: source.price,
    currency: source.currency,
    bedrooms: source.bedrooms,
    bathrooms: source.bathrooms,
    area: source.area,
    location: source.location,
    listingType: source.listingType,
    propertyType: source.propertyType,
    agent: source.agent,
    agency: source.agency,
    images: source.images,
    views: source.views ?? 0,
    inquiries: source.inquiries ?? 0,
    likes: source.likes ?? 0,
    createdAt: source.createdAt,
    publishedAt: source.publishedAt,
    rentPricing: source.rentPricing,
  };
};

const mapPropertyDetail = (property) =>
  withRentPricing({
    ...property,
    images: mapPropertyImages(property.images, null),
    floorPlan: (property.floorPlan || [])
      .map((fp) => normalizeStoredMediaFilename(fp))
      .filter(Boolean),
    videoTour: property.videoTour
      ? normalizeStoredMediaFilename(property.videoTour)
      : property.videoTour,
    agent: mapProfileRef(property.agent),
    agency: mapProfileRef(property.agency),
    developer: property.developer
      ? (() => {
          const dev = property.developer;
          const stored =
            uploadService.toStoredProfileFilename(dev.profilePicture || dev.logo) ||
            DEFAULT_PROFILE_PICTURE;
          return {
            _id: dev._id,
            name: dev.name,
            email: dev.email,
            profilePicture: stored,
          };
        })()
      : null,
  });

const enrichPropertyDealInfoFromClosures = async (property) => {
  if (!property) return property;

  const status = String(property.status || '').toLowerCase();
  const hasDealInfo = Boolean(
    property.dealInfo &&
      (property.dealInfo.dealType ||
        property.dealInfo.dealAmount != null ||
        property.dealInfo.dealClosedDate ||
        property.dealInfo.customer?.name)
  );

  if (hasDealInfo || (status !== 'sold' && status !== 'rented')) {
    return property;
  }

  const latestDeal = await DealClosure.findOne({
    dealCategory: 'property',
    property: property._id,
    status: { $in: ['approved', 'completed'] },
  })
    .select('dealType dealAmount closedDate customer')
    .sort({ closedDate: -1, createdAt: -1 })
    .lean();

  if (!latestDeal) return property;

  return {
    ...property,
    dealInfo: {
      dealType: latestDeal.dealType,
      dealAmount: latestDeal.dealAmount,
      dealClosedDate: latestDeal.closedDate,
      customer: latestDeal.customer
        ? {
            name: latestDeal.customer.name,
            email: latestDeal.customer.email,
            phone: latestDeal.customer.phoneNumber,
          }
        : undefined,
    },
  };
};

const buildListSort = (sortByRaw) => {
  const sortBy = String(sortByRaw || 'newest').toLowerCase().trim();
  if (sortBy === 'oldest') return { createdAt: 1 };
  if (sortBy === 'price-asc' || sortBy === 'price-low') return { price: 1 };
  if (sortBy === 'price-desc' || sortBy === 'price-high') return { price: -1 };
  if (sortBy === 'featured') return { isFeatured: -1, createdAt: -1 };
  if (PROPERTY_STATUSES.has(sortBy)) return { createdAt: -1 };
  return { createdAt: -1 };
};

const countPropertyListStats = async (baseFilter = {}) => {
  const [totalProperties, activeProperties, inactiveProperties, soldProperties, rentedProperties, pendingProperties] =
    await Promise.all([
      Properties.countDocuments(baseFilter),
      Properties.countDocuments({ ...baseFilter, status: 'active' }),
      Properties.countDocuments({ ...baseFilter, status: 'inactive' }),
      Properties.countDocuments({ ...baseFilter, status: 'sold' }),
      Properties.countDocuments({ ...baseFilter, status: 'rented' }),
      Properties.countDocuments({ ...baseFilter, status: 'pending' }),
    ]);

  return {
    totalProperties,
    activeProperties,
    inactiveProperties,
    soldProperties,
    rentedProperties,
    pendingProperties,
  };
};

const normalizePropertyListTransaction = (raw) => {
  const s = String(raw ?? '').trim().toLowerCase();
  if (!s) return null;
  if (['sale', 'buy'].includes(s)) return 'buy';
  if (s === 'rent') return 'rent';
  return null;
};

const applyListingTypeAndTransactionFilter = async (filter, { listingType, transaction, tab }) => {
  const tabTransaction = normalizePropertyListTransaction(transaction ?? tab);
  const excludedListingTypeRows = await ListingType.find({ slug: 'new-projects' }).select('_id').lean();
  const excludedListingTypeIds = excludedListingTypeRows.map((row) => row._id);
  const isExcludedListingType = (id) =>
    excludedListingTypeIds.some((excludedId) => excludedId.toString() === id.toString());

  if (listingType && validateObjectId(listingType)) {
    const listingTypeObjectId = new Types.ObjectId(listingType);
    if (isExcludedListingType(listingTypeObjectId)) {
      filter._id = { $in: [] };
      return null;
    }
    filter.listingType = listingTypeObjectId;
    if (tabTransaction) {
      const ltDoc = await ListingType.findById(listingType).select('transaction slug').lean();
      if (!ltDoc) {
        return { error: 'Invalid listing type', code: 'VALIDATION_ERROR' };
      }
      if (ltDoc.slug === 'new-projects') {
        filter._id = { $in: [] };
        return null;
      }
      if (ltDoc.transaction !== tabTransaction) {
        return {
          error: 'Listing type does not match the selected sale/rent tab',
          code: 'VALIDATION_ERROR',
        };
      }
    }
    return null;
  }

  if (tabTransaction) {
    const rows = await ListingType.find({
      isActive: true,
      transaction: tabTransaction,
      slug: { $ne: 'new-projects' },
    })
      .select('_id')
      .lean();
    const ids = rows.map((r) => r._id);
    filter.listingType = ids.length ? { $in: ids } : { $in: [] };
    return null;
  }

  if (excludedListingTypeIds.length) {
    filter.listingType = { $nin: excludedListingTypeIds };
  }
  return null;
};

const buildListFilter = async (query) => {
  const {
    search,
    agent,
    agency,
    listingType,
    transaction,
    tab,
    propertyType,
    status,
    sortBy,
    city,
    isFeatured,
    isVerified,
    startDate,
    endDate,
  } = query;

  const filter = {};

  if (agent) {
    if (!validateObjectId(agent)) {
      return { error: 'Invalid agent ID', code: 'VALIDATION_ERROR' };
    }
    filter.agent = new Types.ObjectId(agent);
  }

  if (agency) {
    if (!validateObjectId(agency)) {
      return { error: 'Invalid agency ID', code: 'VALIDATION_ERROR' };
    }
    filter.agency = new Types.ObjectId(agency);
  }

  const listingTypeFilterResult = await applyListingTypeAndTransactionFilter(filter, {
    listingType,
    transaction,
    tab,
  });
  if (listingTypeFilterResult?.error) {
    return listingTypeFilterResult;
  }

  if (propertyType) {
    if (!validateObjectId(propertyType)) {
      return { error: 'Invalid propertyType ID', code: 'VALIDATION_ERROR' };
    }
    filter.propertyType = new Types.ObjectId(propertyType);
  }

  const normalizedStatus = String(status || '')
    .trim()
    .toLowerCase();
  const statusFromSort = PROPERTY_STATUSES.has(String(sortBy || '').trim().toLowerCase())
    ? String(sortBy).trim().toLowerCase()
    : null;
  const effectiveStatus = normalizedStatus || statusFromSort;

  if (effectiveStatus) {
    if (!PROPERTY_STATUSES.has(effectiveStatus)) {
      return { error: 'Invalid status', code: 'VALIDATION_ERROR' };
    }
    filter.status = effectiveStatus;
  }

  if (city && String(city).trim()) {
    filter['location.city'] = new RegExp(escapeRegex(String(city)), 'i');
  }

  const featuredFlag = parseOptionalBoolean(isFeatured);
  if (typeof featuredFlag === 'boolean') {
    filter.isFeatured = featuredFlag;
  }

  const verifiedFlag = parseOptionalBoolean(isVerified);
  if (typeof verifiedFlag === 'boolean') {
    filter.isVerified = verifiedFlag;
  }

  if (search && String(search).trim()) {
    const searchRegex = new RegExp(escapeRegex(String(search)), 'i');
    filter.$or = [
      { title: searchRegex },
      { description: searchRegex },
      { 'location.fullAddress': searchRegex },
      { 'location.city': searchRegex },
      { 'location.zone': searchRegex },
      { dldPermitNumber: searchRegex },
      { referenceId: searchRegex },
    ];
  }

  if (startDate || endDate) {
    filter.createdAt = {};
    if (startDate) {
      const start = new Date(startDate);
      if (Number.isNaN(start.getTime())) {
        return { error: 'Invalid startDate', code: 'VALIDATION_ERROR' };
      }
      start.setHours(0, 0, 0, 0);
      filter.createdAt.$gte = start;
    }
    if (endDate) {
      const end = new Date(endDate);
      if (Number.isNaN(end.getTime())) {
        return { error: 'Invalid endDate', code: 'VALIDATION_ERROR' };
      }
      end.setHours(23, 59, 59, 999);
      filter.createdAt.$lte = end;
    }
  }

  return { filter };
};

const deletePropertyMediaFiles = async (property) => {
  if (!property) return;
  const images = property.images || [];
  const videoTour = property.videoTour;
  const storage = (process.env.UPLOAD_STORAGE || 'local').toLowerCase();

  for (const image of images) {
    try {
      if (!image?.url) continue;
      let imageUrl = uploadService.getPropertyImageUrl(image.url);
      if (!imageUrl) continue;
      if (storage !== 's3' && !imageUrl.startsWith('http')) {
        imageUrl = `${uploadService.uploadsBaseUrl || 'http://localhost:5000/uploads'}/img/property/${image.url}`;
      }
      await uploadService.delete(imageUrl).catch((err) => {
        logger.warn('Failed to delete property image file', { error: err.message, url: imageUrl });
      });
    } catch (err) {
      logger.warn('Unexpected error when deleting property image', { error: err.message });
    }
  }

  if (videoTour) {
    try {
      let videoUrl = uploadService.getPropertyVideoUrl(videoTour);
      if (storage !== 's3' && videoUrl && !videoUrl.startsWith('http')) {
        videoUrl = `${uploadService.uploadsBaseUrl || 'http://localhost:5000/uploads'}/vid/property/${videoTour}`;
      }
      if (videoUrl) {
        await uploadService.delete(videoUrl).catch((err) => {
          logger.warn('Failed to delete property video', { error: err.message, url: videoUrl });
        });
      }
    } catch (err) {
      logger.warn('Unexpected error when deleting property video', { error: err.message });
    }
  }
};

/**
 * @swagger
 * /properties:
 *   get:
 *     summary: List properties with filters (admin)
 *     description: Paginated property list for Listing Property management. Supports search, agent/agency filters, status, featured, verified, and date range.
 *     tags: [Admin - Property Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search title, description, location, DLD permit, reference ID
 *       - in: query
 *         name: agent
 *         schema:
 *           type: string
 *         description: Filter by agent ObjectId
 *       - in: query
 *         name: agency
 *         schema:
 *           type: string
 *         description: Filter by agency ObjectId
 *       - in: query
 *         name: listingType
 *         schema:
 *           type: string
 *         description: Filter by ListingType ObjectId
 *       - in: query
 *         name: propertyType
 *         schema:
 *           type: string
 *         description: Filter by PropertyType ObjectId
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [active, inactive, sold, rented, pending]
 *       - in: query
 *         name: city
 *         schema:
 *           type: string
 *         description: Filter by location.city (case-insensitive)
 *       - in: query
 *         name: isFeatured
 *         schema:
 *           type: boolean
 *       - in: query
 *         name: isVerified
 *         schema:
 *           type: boolean
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter createdAt from (inclusive)
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter createdAt to (inclusive)
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           enum: [newest, oldest, active, inactive, sold, rented, pending, price-asc, price-desc]
 *           default: newest
 *         description: Sort order, or filter by status when value is active/inactive/sold/rented/pending
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *           maximum: 100
 *     responses:
 *       200:
 *         description: Properties fetched successfully (each item includes up to 2 images with url filename only)
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 */
const listProperties = asyncHandler(async (req, res) => {
  try {
    const { page = 1, limit = 10, sortBy } = req.query;
    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);

    if (Number.isNaN(pageNum) || pageNum < 1) {
      return failure(res, 400, 'Page must be a positive integer');
    }
    if (Number.isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
      return failure(res, 400, 'Limit must be between 1 and 100');
    }

    const filterResult = await buildListFilter(req.query);
    if (filterResult.error) {
      return failure(res, 400, filterResult.error, filterResult.code);
    }

    const skip = (pageNum - 1) * limitNum;
    const sort = buildListSort(sortBy);

    const statsFilter = { ...filterResult.filter };
    delete statsFilter.status;

    const [properties, total, counts] = await Promise.all([
      Properties.find(filterResult.filter)
        .sort(sort)
        .skip(skip)
        .limit(limitNum)
        .populate(PROPERTY_LIST_POPULATE)
        .lean(),
      Properties.countDocuments(filterResult.filter),
      countPropertyListStats(statsFilter),
    ]);

    const enriched = await attachAgencyDetails(properties);
    const totalPages = Math.ceil(total / limitNum) || 1;

    return success(res, 'Properties fetched successfully', {
      properties: enriched.map(mapPropertyListItem),
      pagination: {
        currentPage: pageNum,
        totalPages,
        totalProperties: total,
        limit: limitNum,
        hasNextPage: pageNum < totalPages,
        hasPrevPage: pageNum > 1,
      },
      counts,
    });
  } catch (error) {
    logger.error('List properties failed', { error: error.message, stack: error.stack });
    return failure(res, 500, 'Failed to fetch properties', 'SERVER_ERROR', error.message);
  }
});

/**
 * @swagger
 * /properties/{id}:
 *   get:
 *     summary: Get property details by ID (admin)
 *     description: Full property detail including all images (filename in url only; UI uses supportedUrls.propertyUrl.img).
 *     tags: [Admin - Property Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Property ObjectId
 *     responses:
 *       200:
 *         description: Property fetched successfully
 *       400:
 *         description: Invalid property ID
 *       404:
 *         description: Property not found
 *       401:
 *         description: Unauthorized
 */
const getPropertyById = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    if (!validateObjectId(id)) {
      return failure(res, 400, 'Invalid property ID format');
    }

    const property = await Properties.findById(id).populate(PROPERTY_DETAIL_POPULATE).lean();
    if (!property) {
      return failure(res, 404, 'Property not found', 'NOT_FOUND');
    }

    const [enriched] = await attachAgencyDetails([property]);
    const enrichedWithDealInfo = await enrichPropertyDealInfoFromClosures(enriched);
    return success(res, 'Property fetched successfully', {
      property: mapPropertyDetail(enrichedWithDealInfo),
    });
  } catch (error) {
    logger.error('Get property details failed', { error: error.message, stack: error.stack });
    return failure(res, 500, 'Failed to fetch property', 'SERVER_ERROR', error.message);
  }
});

const uploadPropertyMedia = asyncHandler(async (req, res) => {
  try {
    const images = Array.isArray(req.files?.images) ? req.files.images : [];
    const videos = Array.isArray(req.files?.video) ? req.files.video : [];

    if (!images.length && !videos.length) {
      return failure(res, 400, 'No media files provided', 'VALIDATION_ERROR');
    }

    const uploadedImages = await Promise.all(
      images.map((file) => uploadService.upload(file, 'property'))
    );
    const uploadedVideos = await Promise.all(
      videos.map((file) => uploadService.uploadVideo(file, 'property'))
    );

    return success(res, 'Property media uploaded successfully', {
      uploads: {
        images: uploadedImages,
        videos: uploadedVideos,
      },
      propertyUrl: {
        img: `${uploadService.uploadsBaseUrl}/img/property/`,
        vid: `${uploadService.uploadsBaseUrl}/vid/property/`,
      },
    });
  } catch (error) {
    logger.error('Upload property media failed', { error: error.message, stack: error.stack });
    return failure(res, 500, 'Failed to upload media', 'SERVER_ERROR', error.message);
  }
});

/**
 * @swagger
 * /properties/{id}:
 *   put:
 *     summary: Update property (admin — single endpoint for all changes)
 *     description: |
 *       Updates any property field in one request. Use for listing edits, status changes,
 *       featured/verify toggles, pricing, media, and location. There are no separate
 *       `/status`, `/feature`, or `/verify` endpoints.
 *
 *       When setting `status` to `sold` or `rented`, include `dealInfo` with `dealAmount`
 *       and `customer.name`. Sold/rented properties cannot be moved back to other statuses.
 *     tags: [Admin - Property Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Property updated successfully
 *       400:
 *         description: Validation error (invalid IDs, status, or missing dealInfo)
 *       404:
 *         description: Property or related resource not found
 *       401:
 *         description: Unauthorized
 */
const updateProperty = asyncHandler(async (req, res) => {
  try {
    const adminId = getAdminId(req);
    const { id } = req.params;
    if (!validateObjectId(id)) {
      return failure(res, 400, 'Invalid property ID format');
    }

    const property = await Properties.findById(id);
    if (!property) {
      return failure(res, 404, 'Property not found', 'NOT_FOUND');
    }

    const body = req.body || {};
    const {
      title,
      description,
      listingType,
      propertyType,
      agent,
      agency,
      developer,
      bedrooms,
      maidBedroom,
      bathrooms,
      area,
      areaSqm,
      areaSqft,
      price,
      propertyPrice,
      monthlyRentalPrice,
      maintenanceFees,
      serviceCharges,
      maintenanceFee,
      serviceCharge,
      currency,
      location,
      fullAddress,
      city,
      zone,
      zoneLocation,
      building,
      googlePlaceId,
      coordinates,
      latitude,
      longitude,
      dldPermitNumber,
      dldPermitUrl,
      furnishedStatus,
      completionStatus,
      amenities,
      images,
      propertyImages,
      virtualTour360,
      videoTour,
      tour360,
      tour360Url,
      floorPlan,
      floorPlans,
      floorPlanFiles,
      referenceId,
      status,
      publishedAt,
      metaTitle,
      metaDescription,
      metaKeywords,
      isActive,
      isFeatured,
      isVerified,
      isPetFriendly,
      isWaterfront,
      isSuperagentListing,
      featured,
      dealInfo,
      priceChangeReason,
      slug,
    } = body;

    if (listingType !== undefined) {
      if (!validateObjectId(listingType)) {
        return failure(res, 400, 'Invalid listingType', 'VALIDATION_ERROR');
      }
      const exists = await ListingType.exists({ _id: listingType });
      if (!exists) return failure(res, 404, 'Listing type not found', 'NOT_FOUND');
      property.listingType = listingType;
    }

    if (propertyType !== undefined) {
      if (!validateObjectId(propertyType)) {
        return failure(res, 400, 'Invalid propertyType', 'VALIDATION_ERROR');
      }
      const exists = await PropertyType.exists({ _id: propertyType });
      if (!exists) return failure(res, 404, 'Property type not found', 'NOT_FOUND');
      property.propertyType = propertyType;
    }

    if (agent !== undefined) {
      if (!validateObjectId(agent)) {
        return failure(res, 400, 'Invalid agent', 'VALIDATION_ERROR');
      }
      property.agent = agent;
    }

    if (agency !== undefined) {
      if (!validateObjectId(agency)) {
        return failure(res, 400, 'Invalid agency', 'VALIDATION_ERROR');
      }
      property.agency = agency;
    }

    if (developer !== undefined) {
      if (developer === null || developer === '') {
        property.developer = undefined;
      } else {
        if (!validateObjectId(developer)) {
          return failure(res, 400, 'Invalid developer', 'VALIDATION_ERROR');
        }
        property.developer = developer;
      }
    }

    const amenityIds = normalizeArray(amenities).filter(Boolean);
    if (amenityIds.length) {
      const invalid = amenityIds.find((aid) => !validateObjectId(aid));
      if (invalid) {
        return failure(res, 400, `Invalid amenity id: ${invalid}`, 'VALIDATION_ERROR');
      }
      const count = await Amenities.countDocuments({ _id: { $in: amenityIds } });
      if (count !== amenityIds.length) {
        return failure(res, 404, 'One or more amenities not found', 'NOT_FOUND');
      }
      property.amenities = amenityIds;
    }

    const parsedBedrooms = bedrooms !== undefined ? toNumberOrNull(bedrooms) : null;
    const parsedBathrooms = bathrooms !== undefined ? toNumberOrNull(bathrooms) : null;
    const parsedAreaSqm =
      area?.sqm !== undefined || areaSqm !== undefined
        ? toNumberOrNull(area?.sqm ?? areaSqm)
        : null;
    const parsedAreaSqft =
      area?.sqft !== undefined || areaSqft !== undefined
        ? toNumberOrNull(area?.sqft ?? areaSqft)
        : null;
    const parsedMaintenance =
      maintenanceFees !== undefined || maintenanceFee !== undefined
        ? toNumberOrNull(maintenanceFees ?? maintenanceFee)
        : null;
    const parsedServiceCharges =
      serviceCharges !== undefined || serviceCharge !== undefined
        ? toNumberOrNull(serviceCharges ?? serviceCharge)
        : null;

    const newPrimaryPrice =
      toNumberOrNull(price) ??
      toNumberOrNull(propertyPrice) ??
      toNumberOrNull(monthlyRentalPrice);

    if (newPrimaryPrice !== null && newPrimaryPrice !== property.price) {
      property.priceHistory = property.priceHistory || [];
      property.priceHistory.push({
        price: newPrimaryPrice,
        changedAt: new Date(),
        changedBy: property.agent,
        reason: priceChangeReason || 'Updated by admin',
      });
      property.price = newPrimaryPrice;
    }

    if (title !== undefined) {
      property.title = String(title).trim();
      if (!slug && property.title) {
        property.slug = await ensureUniqueSlug(generateSlug(property.title), property._id);
      }
    }
    if (slug !== undefined && String(slug).trim()) {
      property.slug = await ensureUniqueSlug(String(slug).trim(), property._id);
    }
    if (description !== undefined) property.description = description;
    if (parsedBedrooms !== null) property.bedrooms = parsedBedrooms;
    if (maidBedroom !== undefined) property.maidBedroom = Boolean(maidBedroom);
    if (parsedBathrooms !== null) property.bathrooms = parsedBathrooms;

    if (parsedAreaSqm !== null || parsedAreaSqft !== null) {
      property.area = property.area || {};
      if (parsedAreaSqm !== null) property.area.sqm = parsedAreaSqm;
      if (parsedAreaSqft !== null) property.area.sqft = parsedAreaSqft;
    }

    if (parsedMaintenance !== null) property.maintenanceFees = parsedMaintenance;
    if (parsedServiceCharges !== null) property.serviceCharges = parsedServiceCharges;
    if (currency !== undefined) property.currency = currency;

    const normalizedImagesInput = normalizeArray(images || propertyImages);
    if (normalizedImagesInput.length) {
      if (normalizedImagesInput.length > 50) {
        return failure(res, 400, 'You can upload up to 50 images', 'VALIDATION_ERROR');
      }
      property.images = normalizedImagesInput
        .map((img, idx) => {
          if (typeof img === 'string') {
            const filename = img.includes('/') ? img.split('/').pop() : img;
            return { url: filename, order: idx };
          }
          if (img && typeof img === 'object' && img.url) {
            const filename = img.url.includes('/') ? img.url.split('/').pop() : img.url;
            return {
              url: filename,
              isPrimary: Boolean(img.isPrimary),
              order: typeof img.order === 'number' ? img.order : idx,
              caption: img.caption,
              uploadedAt: img.uploadedAt,
            };
          }
          return null;
        })
        .filter(Boolean);
    }

    const floorPlanPayload = normalizeArray(floorPlan || floorPlans || floorPlanFiles).filter(
      Boolean
    );
    if (floorPlanPayload.length) {
      property.floorPlan = floorPlanPayload.map((fp) =>
        String(fp).includes('/') ? fp.split('/').pop() : String(fp)
      );
    }

    const virtualTourUrl = tour360Url || tour360 || virtualTour360;
    if (virtualTourUrl !== undefined) {
      property.virtualTour360 = virtualTourUrl || undefined;
    }
    if (videoTour !== undefined) {
      property.videoTour = videoTour || undefined;
    }

    if (referenceId !== undefined) property.referenceId = referenceId;
    if (completionStatus !== undefined) {
      const cs = String(completionStatus).toLowerCase();
      if (!COMPLETION_STATUSES.has(cs)) {
        return failure(res, 400, 'Invalid completionStatus', 'VALIDATION_ERROR');
      }
      property.completionStatus = cs;
    }
    if (furnishedStatus !== undefined) {
      const fs = String(furnishedStatus).toLowerCase();
      if (!FURNISHED_STATUSES.has(fs)) {
        return failure(res, 400, 'Invalid furnishedStatus', 'VALIDATION_ERROR');
      }
      property.furnishedStatus = fs;
    }
    if (publishedAt !== undefined) property.publishedAt = publishedAt ? new Date(publishedAt) : null;
    if (metaTitle !== undefined) property.metaTitle = metaTitle;
    if (metaDescription !== undefined) property.metaDescription = metaDescription;
    if (metaKeywords !== undefined) property.metaKeywords = metaKeywords;
    if (dldPermitNumber !== undefined) property.dldPermitNumber = dldPermitNumber;
    if (dldPermitUrl !== undefined) property.dldPermitUrl = dldPermitUrl;

    if (isActive !== undefined) property.isActive = Boolean(isActive);
    if (isPetFriendly !== undefined) property.isPetFriendly = Boolean(isPetFriendly);
    if (isWaterfront !== undefined) property.isWaterfront = Boolean(isWaterfront);
    if (isSuperagentListing !== undefined) {
      property.isSuperagentListing = Boolean(isSuperagentListing);
    }
    if (isVerified !== undefined) property.isVerified = Boolean(isVerified);

    if (isFeatured !== undefined || featured !== undefined) {
      const featuredObj = featured && typeof featured === 'object' ? featured : {};
      const nextFeatured =
        typeof isFeatured === 'boolean' ? isFeatured : featuredObj.isFeatured;
      if (typeof nextFeatured === 'boolean') {
        property.isFeatured = nextFeatured;
        property.featured = property.featured || {};
        property.featured.isFeatured = nextFeatured;
        if (nextFeatured && adminId) {
          property.featured.featuredBy = adminId;
        }
      }
      if (featuredObj.priority !== undefined) {
        const priority = toNumberOrNull(featuredObj.priority);
        if (priority !== null) {
          property.featured = property.featured || {};
          property.featured.priority = priority;
        }
      }
      if (featuredObj.featuredUntil !== undefined) {
        property.featured = property.featured || {};
        property.featured.featuredUntil = featuredObj.featuredUntil
          ? new Date(featuredObj.featuredUntil)
          : null;
      }
    }

    if (status !== undefined) {
      const nextStatus = String(status).toLowerCase().trim();
      if (!PROPERTY_STATUSES.has(nextStatus)) {
        return failure(res, 400, 'Invalid status', 'VALIDATION_ERROR');
      }
      const prevNorm = String(property.status || '').toLowerCase();
      if (prevNorm === 'sold' || prevNorm === 'rented') {
        if (nextStatus !== 'sold' && nextStatus !== 'rented') {
          return failure(
            res,
            400,
            'Sold or rented properties cannot be moved back to another status',
            'VALIDATION_ERROR'
          );
        }
      }

      if (nextStatus === 'sold' || nextStatus === 'rented') {
        if (!dealInfo || typeof dealInfo !== 'object') {
          return failure(
            res,
            400,
            'dealInfo is required when marking as sold or rented',
            'VALIDATION_ERROR'
          );
        }
        const { dealAmount, dealClosedDate, customer } = dealInfo;
        if (dealAmount === undefined || dealAmount === null || Number.isNaN(Number(dealAmount))) {
          return failure(res, 400, 'dealInfo.dealAmount is required', 'VALIDATION_ERROR');
        }
        if (!customer?.name) {
          return failure(res, 400, 'dealInfo.customer.name is required', 'VALIDATION_ERROR');
        }
        const closedDate = dealClosedDate ? new Date(dealClosedDate) : new Date();
        if (Number.isNaN(closedDate.getTime())) {
          return failure(res, 400, 'Invalid dealClosedDate', 'VALIDATION_ERROR');
        }
        property.dealInfo = {
          dealType: nextStatus === 'sold' ? 'sale' : 'rent',
          dealAmount: Number(dealAmount),
          dealClosedDate: closedDate,
          dealClosedBy: property.agent,
          customer: {
            name: customer.name,
            email: customer.email,
            phone: customer.phone,
          },
        };
      }

      property.status = nextStatus;
      if (nextStatus === 'inactive') {
        property.deactivatedAt = new Date();
        property.deactivatedBy = property.agent;
      }
    }

    const hasLocationUpdate =
      location !== undefined ||
      fullAddress !== undefined ||
      city !== undefined ||
      zone !== undefined ||
      zoneLocation !== undefined ||
      building !== undefined ||
      googlePlaceId !== undefined ||
      latitude !== undefined ||
      longitude !== undefined ||
      coordinates !== undefined;

    if (hasLocationUpdate) {
      const incomingLocation = location && typeof location === 'object' ? location : {};
      const nextFullAddress =
        fullAddress !== undefined ? fullAddress : incomingLocation.fullAddress;
      const nextCity = city !== undefined ? city : incomingLocation.city;
      const nextZone =
        zone !== undefined || zoneLocation !== undefined
          ? zoneLocation || zone
          : incomingLocation.zone;
      const nextBuilding = building !== undefined ? building : incomingLocation.building;
      const nextGooglePlaceId =
        googlePlaceId !== undefined ? googlePlaceId : incomingLocation.googlePlaceId;

      if (nextFullAddress !== undefined) property.set('location.fullAddress', nextFullAddress);
      if (nextCity !== undefined) property.set('location.city', nextCity);
      if (nextZone !== undefined) property.set('location.zone', nextZone);
      if (nextBuilding !== undefined) property.set('location.building', nextBuilding);
      if (nextGooglePlaceId !== undefined) property.set('location.googlePlaceId', nextGooglePlaceId);

      const directCoordinates = incomingLocation.coordinates;
      const directValidPoint =
        directCoordinates &&
        typeof directCoordinates === 'object' &&
        directCoordinates.type === 'Point' &&
        Array.isArray(directCoordinates.coordinates) &&
        directCoordinates.coordinates.length === 2;

      let nextPoint = null;
      if (directValidPoint) {
        nextPoint = {
          type: 'Point',
          coordinates: [
            Number(directCoordinates.coordinates[0]),
            Number(directCoordinates.coordinates[1]),
          ],
        };
      } else if (latitude !== undefined || longitude !== undefined || coordinates !== undefined) {
        const lat = toNumberOrNull(latitude ?? coordinates?.lat ?? coordinates?.latitude);
        const lng = toNumberOrNull(longitude ?? coordinates?.lng ?? coordinates?.longitude);
        if (lat !== null && lng !== null) {
          nextPoint = { type: 'Point', coordinates: [lng, lat] };
        }
      }
      if (nextPoint) property.set('location.coordinates', nextPoint);
    }

    property.lastModifiedAt = new Date();
    property.lastModifiedBy = property.agent;

    await property.save();
    await property.populate(PROPERTY_DETAIL_POPULATE);
    const plain = property.toObject();
    const [enriched] = await attachAgencyDetails([plain]);

    return success(res, 'Property updated successfully', {
      property: mapPropertyDetail(enriched),
    });
  } catch (error) {
    logger.error('Update property failed', { error: error.message, stack: error.stack });
    return failure(res, 500, 'Failed to update property', 'SERVER_ERROR', error.message);
  }
});

/**
 * @swagger
 * /properties/{id}:
 *   delete:
 *     summary: Permanently delete a property (admin)
 *     description: Hard-deletes the property document and removes associated image/video files from storage.
 *     tags: [Admin - Property Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Property deleted successfully
 *       400:
 *         description: Invalid property ID
 *       404:
 *         description: Property not found
 *       401:
 *         description: Unauthorized
 */
const deleteProperty = asyncHandler(async (req, res) => {
  try {
    const adminId = getAdminId(req);
    const { id } = req.params;
    if (!validateObjectId(id)) {
      return failure(res, 400, 'Invalid property ID format');
    }

    const property = await Properties.findById(id);
    if (!property) {
      return failure(res, 404, 'Property not found', 'NOT_FOUND');
    }

    const snapshot = property.toObject ? property.toObject() : property;
    const propertyObjectId = property._id;

    await Promise.all([
      Inquirys.deleteMany({ property: propertyObjectId }),
      DealClosure.deleteMany({ dealCategory: 'property', property: propertyObjectId }),
      Reports.deleteMany({ reportType: 'property', reportedItem: propertyObjectId }),
      Users.updateMany({}, {
        $pull: {
          savedProperties: { property: propertyObjectId },
          contactedProperties: { property: propertyObjectId },
        },
      }),
    ]);

    await Properties.deleteOne({ _id: id });

    await ActivityLog.create({
      actor: { actorType: 'admin', actorId: adminId },
      action: 'delete',
      resource: { resourceType: 'property', resourceId: property._id },
      description: 'Property deleted by admin',
      changes: { before: { status: property.status, title: property.title }, after: null },
      metadata: { slug: property.slug, agency: property.agency, agent: property.agent },
      status: 'success',
      timestamp: new Date(),
    });
    await deletePropertyMediaFiles(snapshot);

    return success(res, 'Property deleted successfully');
  } catch (error) {
    logger.error('Delete property failed', { error: error.message, stack: error.stack });
    return failure(res, 500, 'Failed to delete property', 'SERVER_ERROR', error.message);
  }
});

async function ensureUniqueSlug(baseSlug, excludeId) {
  const slugBase = (baseSlug || 'property').toLowerCase().trim() || 'property';
  let candidate = slugBase;
  let counter = 1;
  while (true) {
    const query = { slug: candidate };
    if (excludeId) query._id = { $ne: excludeId };
    const exists = await Properties.exists(query);
    if (!exists) return candidate;
    candidate = `${slugBase}-${counter}`;
    counter += 1;
  }
}

module.exports = {
  listProperties,
  getPropertyById,
  uploadPropertyMedia,
  updateProperty,
  deleteProperty,
};
