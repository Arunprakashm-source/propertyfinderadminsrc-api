const asyncHandler = require('express-async-handler');
const mongoose = require('mongoose');

const Newprojects = require('../models/newprojectsModel');
const Developer = require('../models/developersModel');
const Agency = require('../models/agenciesModel');
const Amenities = require('../models/amenitiesModel');
const ProjectLayout = require('../models/projectLayoutModel');
const ProjectBuilding = require('../models/projectBuildingModel');
const ProjectUnit = require('../models/projectUnitModel');
const ProjectAgencyAllocation = require('../models/projectAgencyAllocationModel');
const ProjectAgentAllocation = require('../models/projectAgentAllocationModel');
const LeadAssignment = require('../models/leadAssignmentModel');
const Inquirys = require('../models/inquirysModel');
const DealClosure = require('../models/dealClosureModel');
const Reports = require('../models/reportsModel');
const Users = require('../models/usersModel');
const Notifications = require('../models/notificationModel');
const PropertyAllocation = require('../models/propertyallocationModel');
const ActivityLog = require('../models/activityLogModel');
const ListingSearchCity = require('../models/listingSearchCityModel');
const uploadService = require('../services/uploadService');
const { success, failure, generateSlug } = require('../utils/helpers');
const { logger } = require('../utils/logger');

const { Types } = mongoose;
const DEFAULT_PROFILE_PICTURE = 'profileless.png';

const validateObjectId = (id) => id && Types.ObjectId.isValid(id);

const getAdminId = (req) =>
  req.admin?.id || req.admin?._id || req.user?.id || req.user?._id;

const recalcDeveloperProjectStats = async (developerId, session) => {
  if (!developerId) return;

  const developerObjectId = new Types.ObjectId(developerId);
  const baseMatch = { developer: developerObjectId, isActive: true };

  const [totalProjectsCount, completedProjectsCount, offPlanProjectsCount, ongoingProjectsCount] =
    await Promise.all([
      Newprojects.countDocuments(baseMatch).session(session),
      Newprojects.countDocuments({ ...baseMatch, completionStatus: 'ready' }).session(session),
      Newprojects.countDocuments({ ...baseMatch, completionStatus: 'off-plan' }).session(session),
      Newprojects.countDocuments({
        ...baseMatch,
        completionStatus: { $in: ['off-plan', 'under-construction'] },
      }).session(session),
    ]);

  await Developer.findByIdAndUpdate(
    developerObjectId,
    {
      $set: {
        totalProjects: totalProjectsCount,
        completedProjects: completedProjectsCount,
        ongoingProjects: ongoingProjectsCount,
        offPlanProjects: offPlanProjectsCount,
      },
    },
    { session }
  );
};

const decrementProjectSearchCity = async (cityName) => {
  const raw = String(cityName || '').trim();
  if (!raw) return;
  const cityKey = raw.toLowerCase();
  await ListingSearchCity.updateOne({ cityKey }, { $inc: { projectCount: -1 } });
  await ListingSearchCity.updateOne(
    { cityKey, projectCount: { $lt: 0 } },
    { $set: { projectCount: 0 } }
  );
};

const deleteStoredMediaFile = async (filename, mediaKind = 'image') => {
  if (!filename) return;
  const storage = (process.env.UPLOAD_STORAGE || 'local').toLowerCase();
  let mediaUrl;
  if (mediaKind === 'video') {
    mediaUrl = uploadService.getProjectVideoUrl(filename);
  } else if (mediaKind === 'doc') {
    mediaUrl = uploadService.getProjectDocumentUrl(filename);
  } else {
    mediaUrl = uploadService.getProjectImageUrl(filename);
  }
  if (!mediaUrl) return;
  if (storage !== 's3' && !mediaUrl.startsWith('http')) {
    const folder =
      mediaKind === 'video' ? 'vid/project' : mediaKind === 'doc' ? 'doc/project' : 'img/project';
    mediaUrl = `${uploadService.uploadsBaseUrl || 'http://localhost:5000/uploads'}/${folder}/${String(filename).replace(/^\/+/, '')}`;
  }
  try {
    await uploadService.delete(mediaUrl).catch((err) => {
      logger.warn('Failed to delete project media file', { error: err.message, url: mediaUrl });
    });
  } catch (err) {
    logger.warn('Unexpected error when deleting project media', { error: err.message });
  }
};

const deleteProjectMediaFiles = async (project, layoutFloorPlans = []) => {
  if (!project) return;

  for (const image of project.images || []) {
    await deleteStoredMediaFile(image?.url, 'image');
  }

  for (const plan of project.masterPlan || []) {
    await deleteStoredMediaFile(plan, 'image');
  }

  if (project.brochure) {
    await deleteStoredMediaFile(project.brochure, 'doc');
  }

  if (project.videoTour) {
    await deleteStoredMediaFile(project.videoTour, 'video');
  }

  for (const plan of layoutFloorPlans) {
    await deleteStoredMediaFile(plan, 'image');
  }
};

const escapeRegex = (text = '') =>
  text.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const normalizeArray = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter((item) => item !== null && item !== undefined);
  return [value];
};

const toNumberOrNull = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

const isValidGeoPoint = (coord) => {
  if (!coord || typeof coord !== 'object') return false;
  const coords = coord.coordinates;
  if (!Array.isArray(coords) || coords.length !== 2) return false;
  const [lng, lat] = coords;
  return (
    Number.isFinite(lng) &&
    Number.isFinite(lat) &&
    lng >= -180 &&
    lng <= 180 &&
    lat >= -90 &&
    lat <= 90
  );
};

const normalizeStoredMediaFilename = (value) => {
  if (!value) return '';
  const raw = String(value).trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw.split('/').pop() || raw;
  return raw.includes('/') ? raw.split('/').pop() : raw;
};

const mapProjectImages = (images = [], limit = 2) => {
  const mapped = (images || []).map((img, idx) => ({
    url: normalizeStoredMediaFilename(img?.url),
    isPrimary: Boolean(img?.isPrimary),
    order: typeof img?.order === 'number' ? img.order : idx,
  }));
  const sorted = [...mapped]
    .filter((img) => img.url)
    .sort((a, b) => {
      if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
      return a.order - b.order;
    });
  return limit == null ? sorted : sorted.slice(0, limit);
};

const mapDisplayStatus = (project) => {
  const publish = String(project?.publishStatus || '').toLowerCase();
  if (publish === 'soldout') return 'sold';
  if (!project?.isActive) return 'inactive';
  if (publish === 'published') return 'active';
  if (publish === 'unpublished' || publish === 'draft') return 'pending';
  return 'pending';
};

const mapDeveloperRef = (developer) => {
  if (!developer || typeof developer !== 'object') return null;
  const stored =
    uploadService.toStoredProfileFilename(developer.profilePicture || developer.logo) ||
    DEFAULT_PROFILE_PICTURE;
  return {
    _id: developer._id,
    name: developer.name || '',
    email: developer.email || '',
    profilePicture: stored,
  };
};

const mapAgencyChip = (agency) => {
  if (!agency) return null;
  if (typeof agency === 'string') return { _id: agency, agencyName: agency };
  if (typeof agency !== 'object') return null;
  const stored =
    uploadService.toStoredProfileFilename(agency.profilePicture) || DEFAULT_PROFILE_PICTURE;
  return {
    _id: agency._id,
    agencyName: agency.agencyName || '',
    email: agency.email || '',
    profilePicture: stored,
  };
};

const mapProjectListItem = (project) => {
  const launch = project.launchPrice || {};
  const location = project.location || {};
  const agencies = (project.authorizedAgencies || [])
    .map(mapAgencyChip)
    .filter(Boolean);

  return {
    _id: project._id,
    projectName: project.projectName,
    slug: project.slug,
    projectType: project.projectType,
    publishStatus: project.publishStatus,
    status: mapDisplayStatus(project),
    isActive: project.isActive,
    isFeatured: project.isFeatured,
    isVerified: project.isVerified,
    location: {
      city: location.city || '',
      zone: location.zone || '',
      address: location.address || '',
    },
    launchPrice: launch,
    priceLabel:
      typeof launch.startingFrom === 'number'
        ? `${launch.currency || 'AED'} ${launch.startingFrom.toLocaleString('en-US')}`
        : null,
    developer: mapDeveloperRef(project.developer),
    authorizedAgencies: agencies,
    authorizedAgencyNames: agencies.map((a) => a.agencyName).filter(Boolean),
    images: mapProjectImages(project.images),
    totalUnits: project.totalUnits ?? 0,
    publishedAt: project.publishedAt,
    createdAt: project.createdAt,
  };
};

const buildUnitProperties = async (projectId) => {
  const layoutsForUnits = await ProjectLayout.find({
    project: projectId,
    isActive: true,
  })
    .sort({ createdAt: 1 })
    .lean();

  const buildingsForUnits = await ProjectBuilding.find({
    project: projectId,
    isActive: true,
  }).lean();

  const buildingMap = new Map(buildingsForUnits.map((b) => [String(b._id), b]));
  const unitPropertyGroups = new Map();

  for (const layout of layoutsForUnits) {
    const buildingKey = layout.building ? String(layout.building) : 'none';
    const typeKey = String(layout.propertyType);
    const groupKey = `${buildingKey}|${typeKey}`;

    if (!unitPropertyGroups.has(groupKey)) {
      const buildingDoc = layout.building ? buildingMap.get(String(layout.building)) : null;
      unitPropertyGroups.set(groupKey, {
        _id: buildingDoc?._id,
        buildingName: buildingDoc?.buildingName || '',
        propertyType: typeKey,
        areaSqm: layout.areaSqm,
        areaSqft: layout.areaSqft,
        layouts: [],
      });
    }

    const group = unitPropertyGroups.get(groupKey);
    group.layouts.push({
      _id: layout._id,
      layoutName: layout.layoutName,
      bedrooms: layout.bedrooms,
      maidBedroom: Boolean(layout.maidBedroom),
      bathrooms: layout.bathrooms,
      areaSqm: layout.areaSqm,
      areaSqft: layout.areaSqft,
      startingPrice: layout.startingPrice || null,
      floorPlans: Array.isArray(layout.floorPlans) ? layout.floorPlans : [],
      totalUnits: layout.totalUnits,
    });
  }

  return Array.from(unitPropertyGroups.values());
};

const mapProjectDetail = (project) => ({
  ...project,
  images: mapProjectImages(project.images, null),
  masterPlan: (project.masterPlan || []).map((fp) => normalizeStoredMediaFilename(fp)).filter(Boolean),
  videoTour: project.videoTour ? normalizeStoredMediaFilename(project.videoTour) : project.videoTour,
  brochure: project.brochure ? normalizeStoredMediaFilename(project.brochure) : project.brochure,
  developer: mapDeveloperRef(project.developer),
  authorizedAgencies: (project.authorizedAgencies || []).map(mapAgencyChip).filter(Boolean),
  status: mapDisplayStatus(project),
});

const buildListFilter = async (query) => {
  const {
    search,
    developer,
    agency,
    city,
    startDate,
    endDate,
    status,
    sortBy,
  } = query;

  const filter = {
    isActive: true,
    publishStatus: { $ne: 'draft' },
  };

  if (developer) {
    if (!validateObjectId(developer)) {
      return { error: 'Invalid developer ID', code: 'VALIDATION_ERROR' };
    }
    filter.developer = new Types.ObjectId(developer);
  }

  if (agency) {
    if (!validateObjectId(agency)) {
      return { error: 'Invalid agency ID', code: 'VALIDATION_ERROR' };
    }
    filter.authorizedAgencies = new Types.ObjectId(agency);
  }

  if (city && String(city).trim() && String(city).toLowerCase() !== 'all locations') {
    const cityStr = String(city).trim();
    if (validateObjectId(cityStr)) {
      const cityDoc = await ListingSearchCity.findById(cityStr).lean();
      if (cityDoc?.displayName) {
        filter['location.city'] = new RegExp(`^${escapeRegex(cityDoc.displayName)}$`, 'i');
      }
    } else {
      filter['location.city'] = new RegExp(escapeRegex(cityStr), 'i');
    }
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

  const normalizedStatus = String(status || sortBy || '')
    .trim()
    .toLowerCase();
  if (normalizedStatus === 'active') {
    filter.publishStatus = 'published';
    filter.isActive = true;
  } else if (normalizedStatus === 'inactive') {
    filter.isActive = false;
  } else if (normalizedStatus === 'sold') {
    filter.publishStatus = 'soldout';
  } else if (normalizedStatus === 'pending') {
    filter.publishStatus = 'unpublished';
  }

  if (search && String(search).trim()) {
    const searchRegex = { $regex: escapeRegex(search), $options: 'i' };
    filter.$or = [
      { projectName: searchRegex },
      { 'location.city': searchRegex },
      { 'location.zone': searchRegex },
      { 'location.address': searchRegex },
    ];
  }

  return { filter };
};

const buildListSort = (sortBy) => {
  const normalized = String(sortBy || '').trim().toLowerCase();
  if (normalized === 'oldest') return { createdAt: 1 };
  if (normalized === 'price-asc') return { 'launchPrice.startingFrom': 1 };
  if (normalized === 'price-desc') return { 'launchPrice.startingFrom': -1 };
  return { publishedAt: -1, createdAt: -1 };
};

/**
 * @swagger
 * /projects:
 *   get:
 *     summary: List projects with filters (admin)
 *     description: |
 *       Paginated project list for Listing Project management.
 *       Supports search, developer, authorized agency, city (ListingSearchCity id or city name),
 *       created date range, and sort. Display status is derived from publishStatus and isActive.
 *       Draft projects (`publishStatus: draft`) are never returned.
 *     tags: [Admin - Project Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search project name, city, zone, or address
 *       - in: query
 *         name: developer
 *         schema:
 *           type: string
 *         description: Filter by developer ObjectId
 *       - in: query
 *         name: agency
 *         schema:
 *           type: string
 *         description: Filter by authorized agency ObjectId
 *       - in: query
 *         name: city
 *         schema:
 *           type: string
 *         description: ListingSearchCity ObjectId or city display name
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [active, inactive, sold, pending]
 *         description: Filter by display status (also applied when sortBy is active/inactive/sold)
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter createdAt from (inclusive), YYYY-MM-DD
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter createdAt to (inclusive), YYYY-MM-DD
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           enum: [newest, oldest, active, inactive, sold, price-asc, price-desc]
 *           default: newest
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
 *         description: Projects fetched successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
const listProjects = asyncHandler(async (req, res) => {
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

    const [projects, total] = await Promise.all([
      Newprojects.find(filterResult.filter)
        .sort(sort)
        .skip(skip)
        .limit(limitNum)
        .populate('developer', 'name email profilePicture logo')
        .populate('authorizedAgencies', 'agencyName email profilePicture')
        .lean(),
      Newprojects.countDocuments(filterResult.filter),
    ]);

    const totalPages = Math.ceil(total / limitNum) || 1;

    return success(res, 'Projects fetched successfully', {
      projects: projects.map(mapProjectListItem),
      pagination: {
        currentPage: pageNum,
        totalPages,
        totalProjects: total,
        limit: limitNum,
        hasNextPage: pageNum < totalPages,
        hasPrevPage: pageNum > 1,
      },
    });
  } catch (error) {
    logger.error('List projects failed', { error: error.message, stack: error.stack });
    return failure(res, 500, 'Failed to fetch projects', 'SERVER_ERROR', error.message);
  }
});

/**
 * @swagger
 * /projects/{id}:
 *   get:
 *     summary: Get project details by ID (admin)
 *     description: |
 *       Full project detail for the listing project detail page, including populated
 *       developer, amenities, authorized agencies, unit property groups, and unit summary counts.
 *       Media fields return stored filenames only; use supportedUrls.projectUrl for CDN bases.
 *     tags: [Admin - Project Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Project ObjectId
 *     responses:
 *       200:
 *         description: Project fetched successfully
 *       400:
 *         description: Invalid project ID
 *       404:
 *         description: Project not found
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
const getProjectById = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    if (!validateObjectId(id)) {
      return failure(res, 400, 'Invalid project ID', 'VALIDATION_ERROR');
    }

    const project = await Newprojects.findById(id)
      .populate('amenities', 'name slug category icon image')
      .populate('developer', 'name email profilePicture logo')
      .populate('authorizedAgencies', 'agencyName email profilePicture')
      .lean();

    if (!project) {
      return failure(res, 404, 'Project not found', 'NOT_FOUND');
    }

    const unitProperties = await buildUnitProperties(id);

    return success(res, 'Project fetched successfully', {
      project: mapProjectDetail(project),
      unitProperties,
      unitSummary: {
        total: project.totalUnits || 0,
        available: project.availableUnits || 0,
        sold: project.soldUnits || 0,
        reserved: project.reservedUnits || 0,
      },
    });
  } catch (error) {
    logger.error('Get project by id failed', { error: error.message, stack: error.stack });
    return failure(res, 500, 'Failed to fetch project', 'SERVER_ERROR', error.message);
  }
});

/**
 * @swagger
 * /projects/{id}:
 *   put:
 *     summary: Update project (admin)
 *     description: |
 *       Partial update for admin project edit tabs (status, media metadata, price, location, amenities, etc.).
 *       Same body shape as developer `PUT /developers/projects/:id` for shared fields.
 *       **Note:** `properties` (unit/layout structure) is not supported from admin; returns 400 if sent.
 *     tags: [Admin - Project Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Project ObjectId
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               projectName:
 *                 type: string
 *               projectType:
 *                 type: string
 *                 enum: [off-plan, ready]
 *               description:
 *                 type: string
 *               aboutProject:
 *                 type: string
 *               amenities:
 *                 type: array
 *                 items:
 *                   type: string
 *               launchPrice:
 *                 type: object
 *                 properties:
 *                   startingFrom:
 *                     type: number
 *                   currency:
 *                     type: string
 *               governmentFees:
 *                 type: number
 *               paymentPlans:
 *                 type: array
 *                 items:
 *                   type: object
 *               location:
 *                 type: object
 *               virtualTour360:
 *                 type: string
 *               images:
 *                 type: array
 *                 items:
 *                   type: object
 *               isActive:
 *                 type: boolean
 *               isFeatured:
 *                 type: boolean
 *               isVerified:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Project updated successfully
 *       400:
 *         description: Validation error or sold-out project
 *       404:
 *         description: Project not found
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
const updateProjectById = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    if (!validateObjectId(id)) {
      return failure(res, 400, 'Invalid project ID', 'VALIDATION_ERROR');
    }

    const project = await Newprojects.findById(id);
    if (!project) {
      return failure(res, 404, 'Project not found', 'NOT_FOUND');
    }

    if (project.publishStatus === 'soldout') {
      return failure(res, 400, 'Cannot edit a sold out project', 'VALIDATION_ERROR');
    }

    if (req.body?.properties !== undefined) {
      return failure(
        res,
        400,
        'Unit layout updates are not supported from admin yet. Use the developer portal for unit changes.',
        'VALIDATION_ERROR'
      );
    }

    const adminId = req.admin?.id || req.admin?._id;
    const {
      projectName,
      projectTitle,
      title,
      description,
      aboutProject,
      projectType,
      amenities,
      images,
      projectImages,
      masterPlan,
      brochure,
      videoTour,
      projectVideo,
      virtualTour360,
      tour360,
      tour360Url,
      launchPrice,
      price,
      propertyPrice,
      currency,
      governmentFees,
      paymentPlans,
      hasPostHandoverPayment,
      postHandoverDetails,
      deliveryDate,
      expectedCompletionDate,
      projectAnnouncement,
      bookingOpen,
      constructionStarted,
      launchDate,
      location,
      address,
      projectAddress,
      city,
      zone,
      googlePlaceId,
      coordinates,
      latitude,
      longitude,
      isDldRegistered,
      dldRegistrationNumber,
      registrationDetails,
      completionStatus,
      constructionProgress,
      progressStatus,
      isActive,
      isFeatured,
      isVerified,
    } = req.body || {};

    const updateData = { lastModifiedAt: new Date() };
    if (adminId) updateData.lastModifiedBy = adminId;

    const finalProjectName = (projectName || projectTitle || title || '').trim() || null;
    const finalAddress =
      location?.address || address || projectAddress || project.location?.address || null;
    const finalCity = (location?.city || city || project.location?.city || '').trim();
    const finalPrice = toNumberOrNull(launchPrice?.startingFrom ?? price ?? propertyPrice);
    const finalGovernmentFees =
      governmentFees !== undefined ? toNumberOrNull(governmentFees) : null;

    if (projectType !== undefined) {
      if (!['off-plan', 'ready'].includes(projectType)) {
        return failure(res, 400, 'projectType must be "off-plan" or "ready"', 'VALIDATION_ERROR');
      }
      updateData.projectType = projectType;
    }

    if (finalProjectName) {
      if (finalProjectName.length < 3 || finalProjectName.length > 200) {
        return failure(res, 400, 'projectName must be between 3 and 200 characters', 'VALIDATION_ERROR');
      }
      updateData.projectName = finalProjectName;
      if (finalProjectName !== project.projectName) {
        const baseSlug = generateSlug(finalProjectName) || generateSlug(`project-${Date.now()}`);
        let slug = baseSlug;
        let suffix = 0;
        while (
          await Newprojects.exists({
            slug,
            _id: { $ne: id },
            isActive: true,
          })
        ) {
          suffix += 1;
          slug = `${baseSlug}-${suffix}`;
        }
        updateData.slug = slug;
      }
    }

    if (description !== undefined) updateData.description = description ? String(description).trim() : null;
    if (aboutProject !== undefined) {
      updateData.aboutProject = aboutProject ? String(aboutProject).trim() : null;
    }

    if (amenities !== undefined) {
      const amenityIds = normalizeArray(amenities).map(String);
      const invalid = amenityIds.find((aid) => !validateObjectId(aid));
      if (invalid) {
        return failure(res, 400, 'Invalid amenity ID', 'VALIDATION_ERROR');
      }
      if (amenityIds.length) {
        const count = await Amenities.countDocuments({ _id: { $in: amenityIds }, isActive: true });
        if (count !== amenityIds.length) {
          return failure(res, 400, 'One or more amenities not found', 'VALIDATION_ERROR');
        }
      }
      updateData.amenities = amenityIds;
    }

    const normalizedImagesInput = normalizeArray(images || projectImages);
    if (images !== undefined || projectImages !== undefined) {
      updateData.images = normalizedImagesInput
        .map((img, idx) => {
          if (typeof img === 'string') {
            const filename = img.includes('/') ? img.split('/').pop() : img;
            return { url: filename, isPrimary: idx === 0, order: idx, uploadedAt: new Date() };
          }
          const filename = img.url?.includes('/') ? img.url.split('/').pop() : img.url;
          return {
            url: filename,
            isPrimary: Boolean(img.isPrimary),
            order: typeof img.order === 'number' ? img.order : idx,
            caption: img.caption || undefined,
            uploadedAt: new Date(),
          };
        })
        .filter((row) => row?.url);
      if (updateData.images.length && !updateData.images.some((img) => img.isPrimary)) {
        updateData.images[0].isPrimary = true;
      }
    }

    const virtualTourUrl = tour360Url || tour360 || virtualTour360;
    if (virtualTour360 !== undefined || tour360 !== undefined || tour360Url !== undefined) {
      updateData.virtualTour360 = virtualTourUrl || null;
    }

    const videoTourInput = projectVideo || videoTour;
    if (projectVideo !== undefined || videoTour !== undefined) {
      updateData.videoTour = videoTourInput
        ? videoTourInput.includes('/')
          ? videoTourInput.split('/').pop()
          : videoTourInput
        : null;
    }

    if (brochure !== undefined) {
      updateData.brochure = brochure
        ? brochure.includes('/')
          ? brochure.split('/').pop()
          : brochure
        : null;
    }

    if (masterPlan !== undefined) {
      const masterPlanArr = Array.isArray(masterPlan)
        ? masterPlan.map((u) => (typeof u === 'string' && u.includes('/') ? u.split('/').pop() : u))
        : [];
      updateData.masterPlan = masterPlanArr.length ? masterPlanArr : [];
    }

    if (
      location !== undefined ||
      address !== undefined ||
      projectAddress !== undefined ||
      city !== undefined ||
      latitude !== undefined ||
      longitude !== undefined ||
      coordinates !== undefined ||
      zone !== undefined ||
      googlePlaceId !== undefined
    ) {
      const loc = {
        address: finalAddress || project.location?.address || null,
        city: finalCity || project.location?.city || null,
        zone: location?.zone || zone || project.location?.zone || null,
        googlePlaceId:
          location?.googlePlaceId || googlePlaceId || project.location?.googlePlaceId || null,
      };
      if (location?.coordinates && isValidGeoPoint(location.coordinates)) {
        loc.coordinates = location.coordinates;
      } else if (latitude != null || longitude != null || coordinates) {
        const lat = toNumberOrNull(latitude ?? coordinates?.lat ?? coordinates?.latitude);
        const lng = toNumberOrNull(longitude ?? coordinates?.lng ?? coordinates?.longitude);
        if (lat !== null && lng !== null) {
          loc.coordinates = { type: 'Point', coordinates: [lng, lat] };
        }
      }
      updateData.location = loc;
    }

    if (launchPrice !== undefined || price !== undefined || propertyPrice !== undefined) {
      if (finalPrice != null) {
        updateData.launchPrice = {
          startingFrom: finalPrice,
          currency: currency || launchPrice?.currency || project.launchPrice?.currency || 'AED',
        };
      }
    }
    if (finalGovernmentFees !== null) updateData.governmentFees = finalGovernmentFees;

    if (paymentPlans !== undefined) {
      let parsedPlans = paymentPlans;
      if (typeof parsedPlans === 'string') {
        try {
          parsedPlans = JSON.parse(parsedPlans);
        } catch (_err) {
          return failure(res, 400, 'Invalid paymentPlans JSON', 'VALIDATION_ERROR');
        }
      }
      const plansArray = Array.isArray(parsedPlans) ? parsedPlans : [];
      updateData.paymentPlans = plansArray.map((plan) => ({
        planName: plan.planName || 'Plan',
        downPayment: {
          percentage: toNumberOrNull(plan.downPayment?.percentage) ?? 0,
          amount: toNumberOrNull(plan.downPayment?.amount) ?? null,
        },
        duringConstruction: {
          percentage: toNumberOrNull(plan.duringConstruction?.percentage) ?? 0,
          amount: toNumberOrNull(plan.duringConstruction?.amount) ?? null,
          installments: (plan.duringConstruction?.installments || []).map((inst) => ({
            percentage: toNumberOrNull(inst.percentage) ?? 0,
            amount: toNumberOrNull(inst.amount) ?? null,
            date: inst.date ? new Date(inst.date) : null,
          })),
        },
        onHandover: {
          percentage: toNumberOrNull(plan.onHandover?.percentage) ?? 0,
          amount: toNumberOrNull(plan.onHandover?.amount) ?? null,
        },
      }));
    }

    if (hasPostHandoverPayment !== undefined) {
      updateData.hasPostHandoverPayment = Boolean(hasPostHandoverPayment);
      updateData.postHandoverDetails =
        hasPostHandoverPayment && postHandoverDetails
          ? {
              duration: postHandoverDetails.duration,
              percentage: toNumberOrNull(postHandoverDetails.percentage),
            }
          : null;
    }

    const dateFields = {
      deliveryDate,
      expectedCompletionDate,
      projectAnnouncement,
      bookingOpen,
      constructionStarted,
      launchDate,
    };
    Object.entries(dateFields).forEach(([key, value]) => {
      if (value !== undefined) {
        updateData[key] = value ? new Date(value) : null;
      }
    });

    if (isDldRegistered !== undefined) {
      updateData.isDldRegistered = Boolean(isDldRegistered);
      updateData.dldRegistrationNumber = isDldRegistered ? dldRegistrationNumber || null : null;
      updateData.registrationDetails = isDldRegistered ? registrationDetails || null : null;
    }

    if (completionStatus !== undefined) updateData.completionStatus = completionStatus;
    if (constructionProgress !== undefined) {
      updateData.constructionProgress = toNumberOrNull(constructionProgress);
    }
    if (progressStatus !== undefined) updateData.progressStatus = progressStatus || null;
    if (isActive !== undefined) updateData.isActive = Boolean(isActive);
    if (isFeatured !== undefined) updateData.isFeatured = Boolean(isFeatured);
    if (isVerified !== undefined) updateData.isVerified = Boolean(isVerified);

    const updated = await Newprojects.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true }
    )
      .populate('amenities', 'name slug category icon image')
      .populate('developer', 'name email profilePicture logo')
      .populate('authorizedAgencies', 'agencyName email profilePicture')
      .lean();

    const unitProperties = await buildUnitProperties(id);

    return success(res, 'Project updated successfully', {
      project: mapProjectDetail(updated),
      unitProperties,
    });
  } catch (error) {
    logger.error('Update project failed', { error: error.message, stack: error.stack });
    return failure(res, 500, 'Failed to update project', 'SERVER_ERROR', error.message);
  }
});

/**
 * @swagger
 * /projects/upload-media:
 *   post:
 *     summary: Upload or remove project media (admin)
 *     description: |
 *       Multipart upload for project images, master plan, brochure (PDF), and video.
 *       Requires `projectId` in the form body. Optional `removeKeys` to delete existing media by filename or id.
 *       Floor plan files are returned under `uploads.floorPlans` but are not persisted on the project document here.
 *     tags: [Admin - Project Management]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - projectId
 *             properties:
 *               projectId:
 *                 type: string
 *                 description: Project ObjectId
 *               removeKeys:
 *                 oneOf:
 *                   - type: string
 *                   - type: array
 *                     items:
 *                       type: string
 *                 description: Image filename/url/id, master plan, brochure, or video to remove
 *               images:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *               masterPlan:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *               brochure:
 *                 type: string
 *                 format: binary
 *               video:
 *                 type: string
 *                 format: binary
 *               floorPlans:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *     responses:
 *       200:
 *         description: Project media uploaded successfully
 *       400:
 *         description: Validation error
 *       404:
 *         description: Project not found
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
const uploadProjectMedia = asyncHandler(async (req, res) => {
  try {
    const { projectId, removeKeys } = req.body || {};
    const removeKeyArray = Array.isArray(removeKeys) ? removeKeys : removeKeys ? [removeKeys] : [];

    if (!projectId || !validateObjectId(projectId)) {
      return failure(res, 400, 'Valid projectId is required', 'VALIDATION_ERROR');
    }

    const project = await Newprojects.findById(projectId);
    if (!project) {
      return failure(res, 404, 'Project not found', 'NOT_FOUND');
    }

    if (removeKeyArray.length) {
      for (const removeKey of removeKeyArray) {
        const removeFilename = removeKey.includes('/') ? removeKey.split('/').pop() : removeKey;
        const imageIndex = (project.images || []).findIndex((img) => {
          const imgFilename = img.url?.includes('/') ? img.url.split('/').pop() : img.url;
          return (
            img.url === removeKey ||
            img.url === removeFilename ||
            imgFilename === removeFilename ||
            String(img._id) === removeKey
          );
        });
        if (imageIndex >= 0) project.images.splice(imageIndex, 1);
        else if (project.masterPlan?.[0] === removeKey || project.masterPlan?.[0] === removeFilename) {
          project.masterPlan = [];
        } else if (project.brochure === removeKey || project.brochure === removeFilename) {
          project.brochure = null;
        } else if (project.videoTour === removeKey || project.videoTour === removeFilename) {
          project.videoTour = null;
        }
      }
      await project.save();
    }

    const uploads = { images: [], masterPlan: null, brochure: null, video: null, floorPlans: [] };
    const files = req.files || {};

    const imageFiles = files.images || [];
    const baseOrder = project.images?.length || 0;
    for (let i = 0; i < imageFiles.length; i += 1) {
      const file = imageFiles[i];
      const uploaded = await uploadService.upload(file, 'project', { generateThumbnail: false });
      const filename = uploaded.path?.split('/').pop() || uploaded.filename;
      project.images.push({
        url: filename,
        isPrimary: project.images.length === 0,
        order: baseOrder + i,
        uploadedAt: new Date(),
      });
      uploads.images.push({
        url: filename,
        isPrimary: project.images[project.images.length - 1].isPrimary,
        order: project.images[project.images.length - 1].order,
      });
    }

    if (files.masterPlan?.[0]) {
      const uploaded = await uploadService.upload(files.masterPlan[0], 'project', {
        generateThumbnail: false,
      });
      const filename = uploaded.path?.split('/').pop() || uploaded.filename;
      project.masterPlan = [filename];
      uploads.masterPlan = filename;
    }

    if (files.brochure?.[0]) {
      const uploaded = await uploadService.uploadDocument(files.brochure[0], 'project');
      const filename = uploaded.path?.split('/').pop() || uploaded.filename;
      project.brochure = filename;
      uploads.brochure = filename;
    }

    if (files.video?.[0]) {
      const uploaded = await uploadService.uploadVideo(files.video[0], 'project');
      const filename = uploaded.path?.split('/').pop() || uploaded.filename;
      project.videoTour = filename;
      uploads.video = filename;
    }

    const floorPlanFiles = files.floorPlans || [];
    for (const file of floorPlanFiles) {
      const uploaded = await uploadService.upload(file, 'project', { generateThumbnail: false });
      const filename = uploaded.path?.split('/').pop() || uploaded.filename;
      uploads.floorPlans.push({ url: filename });
    }

    await project.save();

    return success(res, 'Project media uploaded successfully', { uploads, projectId });
  } catch (error) {
    logger.error('Upload project media failed', { error: error.message, stack: error.stack });
    return failure(res, 500, 'Failed to upload project media', 'SERVER_ERROR', error.message);
  }
});

/**
 * @swagger
 * /projects/{id}:
 *   delete:
 *     summary: Permanently delete a project and all related data (admin)
 *     description: >
 *       Hard-deletes the project and removes related units, layouts, buildings, allocations,
 *       lead assignments, inquiries, deal closures, reports, notifications, and user contact records.
 *     tags: [Admin - Project Management]
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
 *         description: Project deleted successfully
 *       400:
 *         description: Invalid project ID
 *       404:
 *         description: Project not found
 *       401:
 *         description: Unauthorized
 */
const deleteProject = asyncHandler(async (req, res) => {
  const session = await mongoose.startSession();

  try {
    await session.startTransaction();

    const adminId = getAdminId(req);
    const { id } = req.params;

    if (!validateObjectId(id)) {
      await session.abortTransaction();
      return failure(res, 400, 'Invalid project ID format', 'VALIDATION_ERROR');
    }

    const project = await Newprojects.findById(id).session(session);
    if (!project) {
      await session.abortTransaction();
      return failure(res, 404, 'Project not found', 'NOT_FOUND');
    }

    const snapshot = project.toObject ? project.toObject() : project;
    const projectObjectId = project._id;
    const developerId = project.developer;
    const wasPublished = String(project.publishStatus || '').toLowerCase() === 'published';
    const deleteCityRaw = project.location?.city;

    const layoutDocs = await ProjectLayout.find({ project: projectObjectId })
      .select('floorPlans')
      .lean()
      .session(session);
    const layoutFloorPlans = layoutDocs.flatMap((layout) =>
      Array.isArray(layout.floorPlans) ? layout.floorPlans : []
    );

    const inquiryRows = await Inquirys.find({ project: projectObjectId })
      .select('_id')
      .lean()
      .session(session);
    const inquiryIds = inquiryRows.map((row) => row._id);

    const notificationOr = [
      { 'relatedItem.itemType': 'project', 'relatedItem.itemId': projectObjectId },
    ];
    if (inquiryIds.length) {
      notificationOr.push({
        'relatedItem.itemType': 'inquiry',
        'relatedItem.itemId': { $in: inquiryIds },
      });
    }

    await Promise.all([
      Inquirys.deleteMany({ project: projectObjectId }, { session }),
      DealClosure.deleteMany({ dealCategory: 'project', project: projectObjectId }, { session }),
      Reports.deleteMany({ reportType: 'project', reportedItem: projectObjectId }, { session }),
      Notifications.deleteMany({ $or: notificationOr }, { session }),
      Users.updateMany(
        {},
        { $pull: { contactedProperties: { project: projectObjectId } } },
        { session }
      ),
      PropertyAllocation.deleteMany({ project: projectObjectId }, { session }),
      LeadAssignment.deleteMany({ project: projectObjectId }, { session }),
      ProjectAgentAllocation.deleteMany({ project: projectObjectId }, { session }),
      ProjectAgencyAllocation.deleteMany({ project: projectObjectId }, { session }),
      ProjectUnit.deleteMany({ project: projectObjectId }, { session }),
      ProjectLayout.deleteMany({ project: projectObjectId }, { session }),
      ProjectBuilding.deleteMany({ project: projectObjectId }, { session }),
    ]);

    await Newprojects.deleteOne({ _id: projectObjectId }, { session });

    if (developerId) {
      await recalcDeveloperProjectStats(developerId, session);
    }

    await ActivityLog.create(
      [
        {
          actor: { actorType: 'admin', actorId: adminId },
          action: 'delete',
          resource: { resourceType: 'project', resourceId: projectObjectId },
          description: 'Project deleted by admin',
          changes: {
            before: { projectName: project.projectName, publishStatus: project.publishStatus },
            after: null,
          },
          metadata: { developer: developerId, slug: project.slug },
          status: 'success',
          timestamp: new Date(),
        },
      ],
      { session }
    );

    await session.commitTransaction();

    if (wasPublished) {
      void decrementProjectSearchCity(deleteCityRaw).catch((err) => {
        logger.warn('ListingSearchCity decrement (project delete) failed', { error: err.message });
      });
    }

    void deleteProjectMediaFiles(snapshot, layoutFloorPlans).catch((err) => {
      logger.warn('Project media cleanup after delete failed', { error: err.message });
    });

    return success(res, 'Project deleted successfully', { projectId: String(projectObjectId) });
  } catch (error) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    logger.error('Delete project failed', { error: error.message, stack: error.stack });
    return failure(res, 500, 'Failed to delete project', 'SERVER_ERROR', error.message);
  } finally {
    session.endSession();
  }
});

module.exports = {
  listProjects,
  getProjectById,
  updateProjectById,
  uploadProjectMedia,
  deleteProject,
};
