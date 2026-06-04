const asyncHandler = require('express-async-handler');
const mongoose = require('mongoose');

const Countries = require('../models/countriesModel');
const ListingSearchCity = require('../models/listingSearchCityModel');
const Amenities = require('../models/amenitiesModel');
const PropertyType = require('../models/propertyTypeModel');
const ListingType = require('../models/listingTypeModel');
const JobTitles = require('../models/jobTitlesModel');
const Agent = require('../models/agentsModel');
const Properties = require('../models/propertiesModal');
const {
  AGENT_TYPE_OPTIONS,
  AGENT_EXPERIENCE_OPTIONS,
  FURNISHED_STATUS,
} = require('../utils/constants');
const { success, failure, generateSlug } = require('../utils/helpers');
const { logger } = require('../utils/logger');
const uploadService = require('../services/uploadService');

const { Types } = mongoose;

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const countJobTitleStats = async () => {
  const [total, active, inactive] = await Promise.all([
    JobTitles.countDocuments({}),
    JobTitles.countDocuments({ isActive: true }),
    JobTitles.countDocuments({ isActive: false }),
  ]);
  return { total, active, inactive };
};

const countAmenityStats = async () => {
  const [total, active, inactive] = await Promise.all([
    Amenities.countDocuments({}),
    Amenities.countDocuments({ isActive: true }),
    Amenities.countDocuments({ isActive: false }),
  ]);
  return { total, active, inactive };
};

const parseBoolField = (value) => value === true || value === 'true';

const formatAmenity = (amenity) => {
  if (!amenity) return amenity;
  const plain = amenity.toObject ? amenity.toObject() : { ...amenity };
  plain.imageUrl = uploadService.getAmenityImageUrl(plain.image);
  return plain;
};

const formatAmenities = (items) => (Array.isArray(items) ? items.map(formatAmenity) : []);

const parseAmenityBody = (body = {}) => {
  const data = {};

  if (body.name !== undefined) {
    data.name = String(body.name).trim();
  }
  if (body.slug !== undefined && body.slug !== '') {
    data.slug = String(body.slug).trim().toLowerCase();
  }
  if (body.category !== undefined && body.category !== '') {
    const category = String(body.category).trim();
    if (category.length > 100) {
      return { error: 'Category must be 100 characters or less' };
    }
    data.category = category;
  }
  if (body.description !== undefined) {
    data.description = body.description ? String(body.description).trim() : '';
  }
  if (body.icon !== undefined) {
    data.icon = body.icon ? String(body.icon).trim() : '';
  }
  if (body.isActive !== undefined) {
    data.isActive = parseBoolField(body.isActive);
  }
  if (body.displayOrder !== undefined && body.displayOrder !== '') {
    const order = parseInt(body.displayOrder, 10);
    if (Number.isNaN(order) || order < 0) {
      return { error: 'displayOrder must be a non-negative integer' };
    }
    data.displayOrder = order;
  }
  if (parseBoolField(body.removeImage)) {
    data.removeImage = true;
  }

  return { data };
};

const saveAmenityImage = async (file) => {
  const uploaded = await uploadService.upload(file, 'amenities', { generateThumbnail: false });
  return uploadService.toStoredProfileFilename(uploaded.filename) || uploaded.filename;
};

const deleteStoredAmenityImage = async (filename) => {
  if (!filename) return;
  const path = String(filename).includes('/') ? filename : `img/amenities/${filename}`;
  await uploadService.delete(path).catch((error) => {
    logger.warn('Failed to delete amenity image', { error: error.message, path });
  });
};

/**
 * GET /master-data — dropdown / lookup master data (existing behaviour).
 */
const getMasterData = asyncHandler(async (req, res) => {
  try {
    const { type, types } = req.query || {};

    let requestedTypes = [];

    if (types) {
      requestedTypes = String(types)
        .split(',')
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean);
    } else if (type) {
      requestedTypes = [String(type).trim().toLowerCase()];
    }

    if (!requestedTypes.length) {
      return failure(res, 400, 'Query parameter "type" or "types" is required', 'VALIDATION_ERROR');
    }

    const supportedTypes = [
      'countries',
      'amenities',
      'propertytypes',
      'listingtypes',
      'supportedurls',
      'agenttypes',
      'jobtitles',
      'agentexperience',
      'propertylocations',
      'projectlocations',
      'projectlocation',
      'furnishedstatus',
    ];
    const invalidTypes = requestedTypes.filter((t) => !supportedTypes.includes(t));

    if (invalidTypes.length) {
      return failure(
        res,
        400,
        `Invalid master data type(s): ${invalidTypes.join(', ')}`,
        'VALIDATION_ERROR'
      );
    }

    const data = {};

    if (requestedTypes.includes('countries')) {
      const countries = await Countries.find({ isActive: true })
        .sort({ displayOrder: 1, name: 1 })
        .lean();
      data.countries = countries;
    }

    if (requestedTypes.includes('amenities')) {
      const amenities = await Amenities.find({ isActive: true })
        .sort({ displayOrder: 1, name: 1 })
        .lean();
      data.amenities = amenities;
    }

    if (requestedTypes.includes('propertytypes')) {
      const propertyTypes = await PropertyType.find({ isActive: true })
        .sort({ displayOrder: 1, name: 1 })
        .lean();
      data.propertyTypes = propertyTypes;
    }

    if (requestedTypes.includes('listingtypes')) {
      const listingTypes = await ListingType.find({ isActive: true })
        .sort({ displayOrder: 1, name: 1 })
        .lean();
      data.listingTypes = listingTypes;
    }

    if (requestedTypes.includes('agenttypes')) {
      data.agentTypes = AGENT_TYPE_OPTIONS;
    }

    if (requestedTypes.includes('jobtitles')) {
      const jobTitles = await JobTitles.find({ isActive: true })
        .sort({ title: 1 })
        .lean();
      data.jobTitles = jobTitles;
    }

    if (requestedTypes.includes('agentexperience')) {
      data.agentExperience = AGENT_EXPERIENCE_OPTIONS;
    }

    if (requestedTypes.includes('propertylocations')) {
      data.propertyLocations = await ListingSearchCity.find({ propertyCount: { $gt: 0 } })
        .select('cityKey displayName propertyCount updatedAt')
        .sort({ displayName: 1 })
        .lean();
    }

    if (
      requestedTypes.includes('projectlocations') ||
      requestedTypes.includes('projectlocation')
    ) {
      const projectLocations = await ListingSearchCity.find({ projectCount: { $gt: 0 } })
        .select('cityKey displayName projectCount updatedAt')
        .sort({ displayName: 1 })
        .lean();
      data.projectLocations = projectLocations;
      data.projectlocations = projectLocations;
    }

    if (requestedTypes.includes('furnishedstatus')) {
      data.furnishedStatus = FURNISHED_STATUS;
    }

    if (requestedTypes.includes('supportedurls')) {
      data.supportedUrls = {
        projectUrl: {
          img: 'https://d1dp1oh0ra5b0z.cloudfront.net/img/project/',
          vid: 'https://d1dp1oh0ra5b0z.cloudfront.net/vid/project/',
          doc: 'https://d1dp1oh0ra5b0z.cloudfront.net/doc/project/',
        },
        propertyUrl: {
          img: 'https://d1dp1oh0ra5b0z.cloudfront.net/img/property/',
          vid: 'https://d1dp1oh0ra5b0z.cloudfront.net/vid/property/',
          doc: 'https://d1dp1oh0ra5b0z.cloudfront.net/doc/property/',
        },
        agentUrl: {
          img: 'https://d1dp1oh0ra5b0z.cloudfront.net/img/agents/',
          vid: 'https://d1dp1oh0ra5b0z.cloudfront.net/vid/agents/',
          doc: 'https://d1dp1oh0ra5b0z.cloudfront.net/doc/agents/',
        },
        agencyUrl: {
          img: 'https://d1dp1oh0ra5b0z.cloudfront.net/img/agency/',
          vid: 'https://d1dp1oh0ra5b0z.cloudfront.net/vid/agency/',
          doc: 'https://d1dp1oh0ra5b0z.cloudfront.net/doc/agency/',
        },
        developerUrl: {
          img: 'https://d1dp1oh0ra5b0z.cloudfront.net/img/developer/',
          vid: 'https://d1dp1oh0ra5b0z.cloudfront.net/vid/developer/',
          doc: 'https://d1dp1oh0ra5b0z.cloudfront.net/doc/developer/',
        },
        userUrl: {
          img: 'https://d1dp1oh0ra5b0z.cloudfront.net/img/user/',
          vid: 'https://d1dp1oh0ra5b0z.cloudfront.net/vid/user/',
          doc: 'https://d1dp1oh0ra5b0z.cloudfront.net/doc/user/',
        },
        amenityUrl: {
          img: 'https://d1dp1oh0ra5b0z.cloudfront.net/img/amenities/',
          vid: '',
          doc: '',
        },
        awardUrl: {
          img: 'https://d1dp1oh0ra5b0z.cloudfront.net/img/award/',
          vid: '',
          doc: '',
        },
      };
    }

    return success(res, 'Master data fetched successfully', data);
  } catch (error) {
    logger.error('Get master data failed', { error: error.message });
    return failure(res, 500, 'Failed to fetch master data', 'SERVER_ERROR');
  }
});

/**
 * @swagger
 * /master-data/job-titles:
 *   get:
 *     summary: List job titles with filters, pagination, and stat counts
 *     tags: [Admin - Master Data - Job Titles]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search in title or description (case-insensitive)
 *       - in: query
 *         name: isActive
 *         schema:
 *           type: boolean
 *         description: Filter by active status
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number (min 1)
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *           maximum: 100
 *         description: Items per page (1–100)
 *     responses:
 *       200:
 *         description: Job titles fetched successfully (jobTitles, pagination, counts)
 *       400:
 *         description: Invalid page or limit
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
const listJobTitles = asyncHandler(async (req, res) => {
  try {
    const { search, isActive, page = 1, limit = 20 } = req.query;

    const pageNum = parseInt(page, 10);
    const limitNum = Math.min(parseInt(limit, 10) || 20, 100);

    if (Number.isNaN(pageNum) || pageNum < 1) {
      return failure(res, 400, 'Page must be a positive integer', 'VALIDATION_ERROR');
    }
    if (Number.isNaN(limitNum) || limitNum < 1) {
      return failure(res, 400, 'Limit must be between 1 and 100', 'VALIDATION_ERROR');
    }

    const filter = {};

    if (search && String(search).trim()) {
      const rx = new RegExp(escapeRegex(String(search).trim()), 'i');
      filter.$or = [{ title: rx }, { description: rx }];
    }

    if (isActive !== undefined && isActive !== '') {
      filter.isActive = isActive === true || isActive === 'true';
    }

    const skip = (pageNum - 1) * limitNum;

    const [jobTitles, filteredCount, counts] = await Promise.all([
      JobTitles.find(filter).sort({ title: 1 }).skip(skip).limit(limitNum).lean(),
      JobTitles.countDocuments(filter),
      countJobTitleStats(),
    ]);

    const totalPages = Math.ceil(filteredCount / limitNum) || 1;

    return success(res, 'Job titles fetched successfully', {
      jobTitles,
      pagination: {
        currentPage: pageNum,
        totalPages,
        totalJobTitles: filteredCount,
        limit: limitNum,
        hasNextPage: pageNum < totalPages,
        hasPrevPage: pageNum > 1,
      },
      counts: {
        totalJobTitles: counts.total,
        activeJobTitles: counts.active,
        inactiveJobTitles: counts.inactive,
      },
    });
  } catch (error) {
    logger.error('List job titles failed', { error: error.message, stack: error.stack });
    return failure(res, 500, 'Failed to fetch job titles', 'SERVER_ERROR', error.message);
  }
});

/**
 * @swagger
 * /master-data/job-titles:
 *   post:
 *     summary: Create a new job title
 *     tags: [Admin - Master Data - Job Titles]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *             properties:
 *               title:
 *                 type: string
 *                 minLength: 2
 *                 maxLength: 120
 *                 example: Sales Agent
 *               description:
 *                 type: string
 *                 example: Handles residential sales leads
 *               isActive:
 *                 type: boolean
 *                 default: true
 *     responses:
 *       201:
 *         description: Job title created successfully
 *       400:
 *         description: Validation error (title required or length)
 *       401:
 *         description: Unauthorized
 *       409:
 *         description: Job title already exists
 *       500:
 *         description: Server error
 */
const createJobTitle = asyncHandler(async (req, res) => {
  try {
    const { title, description, isActive } = req.body || {};
    const trimmedTitle = String(title || '').trim();

    if (!trimmedTitle) {
      return failure(res, 400, 'Title is required', 'VALIDATION_ERROR');
    }
    if (trimmedTitle.length < 2 || trimmedTitle.length > 120) {
      return failure(res, 400, 'Title must be between 2 and 120 characters', 'VALIDATION_ERROR');
    }

    const existing = await JobTitles.findOne({
      title: new RegExp(`^${escapeRegex(trimmedTitle)}$`, 'i'),
    });
    if (existing) {
      return failure(res, 409, 'Job title already exists', 'DUPLICATE');
    }

    const jobTitle = await JobTitles.create({
      title: trimmedTitle,
      description: description ? String(description).trim() : undefined,
      isActive: isActive !== false && isActive !== 'false',
    });

    return success(res, 'Job title created successfully', { jobTitle }, 201);
  } catch (error) {
    logger.error('Create job title failed', { error: error.message, stack: error.stack });
    if (error.code === 11000) {
      return failure(res, 409, 'Job title already exists', 'DUPLICATE');
    }
    if (error.name === 'ValidationError') {
      return failure(res, 400, error.message, 'VALIDATION_ERROR');
    }
    return failure(res, 500, 'Failed to create job title', 'SERVER_ERROR', error.message);
  }
});

/**
 * @swagger
 * /master-data/job-titles/{id}:
 *   put:
 *     summary: Update an existing job title
 *     tags: [Admin - Master Data - Job Titles]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Job title ObjectId
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *                 minLength: 2
 *                 maxLength: 120
 *               description:
 *                 type: string
 *               isActive:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Job title updated successfully
 *       400:
 *         description: Invalid ID or validation error
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Job title not found
 *       409:
 *         description: Duplicate title
 *       500:
 *         description: Server error
 */
const updateJobTitle = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    if (!Types.ObjectId.isValid(id)) {
      return failure(res, 400, 'Invalid job title ID', 'VALIDATION_ERROR');
    }

    const jobTitle = await JobTitles.findById(id);
    if (!jobTitle) {
      return failure(res, 404, 'Job title not found', 'NOT_FOUND');
    }

    const { title, description, isActive } = req.body || {};

    if (title !== undefined) {
      const trimmedTitle = String(title).trim();
      if (!trimmedTitle) {
        return failure(res, 400, 'Title is required', 'VALIDATION_ERROR');
      }
      if (trimmedTitle.length < 2 || trimmedTitle.length > 120) {
        return failure(res, 400, 'Title must be between 2 and 120 characters', 'VALIDATION_ERROR');
      }
      const duplicate = await JobTitles.findOne({
        _id: { $ne: id },
        title: new RegExp(`^${escapeRegex(trimmedTitle)}$`, 'i'),
      });
      if (duplicate) {
        return failure(res, 409, 'Job title already exists', 'DUPLICATE');
      }
      jobTitle.title = trimmedTitle;
    }

    if (description !== undefined) {
      jobTitle.description = description ? String(description).trim() : '';
    }

    if (isActive !== undefined) {
      jobTitle.isActive = isActive === true || isActive === 'true';
    }

    await jobTitle.save();

    return success(res, 'Job title updated successfully', { jobTitle });
  } catch (error) {
    logger.error('Update job title failed', { error: error.message, stack: error.stack });
    if (error.code === 11000) {
      return failure(res, 409, 'Job title already exists', 'DUPLICATE');
    }
    if (error.name === 'ValidationError') {
      return failure(res, 400, error.message, 'VALIDATION_ERROR');
    }
    return failure(res, 500, 'Failed to update job title', 'SERVER_ERROR', error.message);
  }
});

/**
 * @swagger
 * /master-data/job-titles/{id}:
 *   delete:
 *     summary: Delete a job title
 *     tags: [Admin - Master Data - Job Titles]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Job title ObjectId
 *     responses:
 *       200:
 *         description: Job title deleted successfully
 *       400:
 *         description: Invalid ID or job title assigned to agents (IN_USE)
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Job title not found
 *       500:
 *         description: Server error
 */
const deleteJobTitle = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    if (!Types.ObjectId.isValid(id)) {
      return failure(res, 400, 'Invalid job title ID', 'VALIDATION_ERROR');
    }

    const jobTitle = await JobTitles.findById(id);
    if (!jobTitle) {
      return failure(res, 404, 'Job title not found', 'NOT_FOUND');
    }

    const agentCount = await Agent.countDocuments({ specialization: id });
    if (agentCount > 0) {
      return failure(
        res,
        400,
        'Cannot delete job title assigned to agents. Deactivate it or reassign agents first.',
        'IN_USE'
      );
    }

    await JobTitles.findByIdAndDelete(id);

    return success(res, 'Job title deleted successfully', {});
  } catch (error) {
    logger.error('Delete job title failed', { error: error.message, stack: error.stack });
    return failure(res, 500, 'Failed to delete job title', 'SERVER_ERROR', error.message);
  }
});

/**
 * GET /master-data/amenities — list amenities with filters and pagination.
 */
const listAmenities = asyncHandler(async (req, res) => {
  try {
    const { search, category, isActive, page = 1, limit = 20 } = req.query;

    const pageNum = parseInt(page, 10);
    const limitNum = Math.min(parseInt(limit, 10) || 20, 100);

    if (Number.isNaN(pageNum) || pageNum < 1) {
      return failure(res, 400, 'Page must be a positive integer', 'VALIDATION_ERROR');
    }
    if (Number.isNaN(limitNum) || limitNum < 1) {
      return failure(res, 400, 'Limit must be between 1 and 100', 'VALIDATION_ERROR');
    }

    const filter = {};
    if (search && String(search).trim()) {
      const rx = new RegExp(escapeRegex(String(search).trim()), 'i');
      filter.$or = [{ name: rx }, { slug: rx }, { description: rx }];
    }
    if (category) {
      filter.category = String(category).trim().toLowerCase();
    }
    if (isActive !== undefined && isActive !== '') {
      filter.isActive = parseBoolField(isActive);
    }

    const skip = (pageNum - 1) * limitNum;

    const [amenities, filteredCount, counts] = await Promise.all([
      Amenities.find(filter)
        .sort({ displayOrder: 1, name: 1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Amenities.countDocuments(filter),
      countAmenityStats(),
    ]);

    const totalPages = Math.ceil(filteredCount / limitNum) || 1;

    return success(res, 'Amenities fetched successfully', {
      amenities: formatAmenities(amenities),
      pagination: {
        currentPage: pageNum,
        totalPages,
        totalAmenities: filteredCount,
        limit: limitNum,
        hasNextPage: pageNum < totalPages,
        hasPrevPage: pageNum > 1,
      },
      counts: {
        totalAmenities: counts.total,
        activeAmenities: counts.active,
        inactiveAmenities: counts.inactive,
      },
    });
  } catch (error) {
    logger.error('List amenities failed', { error: error.message, stack: error.stack });
    return failure(res, 500, 'Failed to fetch amenities', 'ERROR', error.message);
  }
});

/**
 * GET /master-data/amenities/:id — get single amenity for detail/edit page.
 */
const getAmenityById = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    if (!Types.ObjectId.isValid(id)) {
      return failure(res, 400, 'Invalid amenity ID format', 'VALIDATION_ERROR');
    }

    const amenity = await Amenities.findById(id).lean();
    if (!amenity) {
      return failure(res, 404, 'Amenity not found', 'NOT_FOUND');
    }

    return success(res, 'Amenity fetched successfully', { amenity: formatAmenity(amenity) });
  } catch (error) {
    logger.error('Get amenity failed', { error: error.message, stack: error.stack });
    return failure(res, 500, 'Failed to fetch amenity', 'ERROR', error.message);
  }
});

/**
 * POST /master-data/amenities — create amenity (multipart: fields + optional image file).
 */
const createAmenity = asyncHandler(async (req, res) => {
  try {
    const parsed = parseAmenityBody(req.body);
    if (parsed.error) {
      return failure(res, 400, parsed.error, 'VALIDATION_ERROR');
    }

    const name = parsed.data.name;
    if (!name) {
      return failure(res, 400, 'Name is required', 'VALIDATION_ERROR');
    }

    let finalSlug = parsed.data.slug;
    if (!finalSlug) {
      finalSlug = generateSlug(name);
    }

    const existingAmenity = await Amenities.findOne({
      $or: [{ name: new RegExp(`^${escapeRegex(name)}$`, 'i') }, { slug: finalSlug }],
    });

    if (existingAmenity) {
      if (existingAmenity.name.toLowerCase() === name.toLowerCase()) {
        return failure(res, 409, 'Amenity with this name already exists', 'DUPLICATE');
      }
      if (existingAmenity.slug === finalSlug) {
        return failure(res, 409, 'Amenity with this slug already exists', 'DUPLICATE');
      }
    }

    const highestOrder = await Amenities.findOne()
      .sort({ displayOrder: -1 })
      .select('displayOrder')
      .lean();
    const displayOrder = highestOrder ? (highestOrder.displayOrder || 0) + 1 : 1;

    const amenityData = {
      name,
      slug: finalSlug,
      category: parsed.data.category || 'basic',
      usageCount: 0,
      isActive: parsed.data.isActive !== undefined ? parsed.data.isActive : true,
      displayOrder: parsed.data.displayOrder ?? displayOrder,
    };

    // if (parsed.data.icon) amenityData.icon = parsed.data.icon;
    if (parsed.data.description) amenityData.description = parsed.data.description;

    if (req.file) {
      amenityData.image = await saveAmenityImage(req.file);
      amenityData.icon = amenityData.image;
    }

    const amenity = await Amenities.create(amenityData);

    return success(res, 'Amenity created successfully', { amenity: formatAmenity(amenity) }, 201);
  } catch (error) {
    logger.error('Create amenity failed', { error: error.message, stack: error.stack });

    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      return failure(res, 409, `Amenity with this ${field} already exists`, 'DUPLICATE');
    }

    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map((err) => ({
        field: err.path,
        message: err.message,
      }));
      return failure(res, 400, 'Validation failed', 'VALIDATION_ERROR', errors);
    }

    return failure(res, 500, 'Failed to create amenity', 'ERROR', error.message);
  }
});

/**
 * PUT /master-data/amenities/:id — update amenity (multipart: fields + optional image file).
 */
const updateAmenity = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    if (!Types.ObjectId.isValid(id)) {
      return failure(res, 400, 'Invalid amenity ID format', 'VALIDATION_ERROR');
    }

    const amenity = await Amenities.findById(id);
    if (!amenity) {
      return failure(res, 404, 'Amenity not found', 'NOT_FOUND');
    }

    const parsed = parseAmenityBody(req.body);
    if (parsed.error) {
      return failure(res, 400, parsed.error, 'VALIDATION_ERROR');
    }

    const updateData = { ...parsed.data };
    const removeImage = updateData.removeImage;
    delete updateData.removeImage;

    let finalSlug = updateData.slug;

    if (updateData.name && updateData.name !== amenity.name) {
      if (!updateData.slug) {
        finalSlug = generateSlug(updateData.name);
        updateData.slug = finalSlug;
      }
    }

    if (updateData.slug) {
      updateData.slug = updateData.slug.toLowerCase().trim();
    }

    const hasFile = Boolean(req.file);
    const hasFieldUpdates = Object.keys(updateData).length > 0;

    if (!hasFile && !hasFieldUpdates && !removeImage) {
      return failure(res, 400, 'At least one field must be provided for update', 'VALIDATION_ERROR');
    }

    if (updateData.name || updateData.slug) {
      const duplicateFilter = {
        _id: { $ne: id },
        $or: [],
      };

      if (updateData.name) {
        duplicateFilter.$or.push({
          name: new RegExp(`^${escapeRegex(updateData.name)}$`, 'i'),
        });
      }
      if (updateData.slug) {
        duplicateFilter.$or.push({ slug: updateData.slug });
      }

      if (duplicateFilter.$or.length > 0) {
        const existingAmenity = await Amenities.findOne(duplicateFilter);
        if (existingAmenity) {
          if (
            updateData.name &&
            existingAmenity.name.toLowerCase() === updateData.name.toLowerCase()
          ) {
            return failure(res, 409, 'Amenity with this name already exists', 'DUPLICATE');
          }
          if (updateData.slug && existingAmenity.slug === updateData.slug) {
            return failure(res, 409, 'Amenity with this slug already exists', 'DUPLICATE');
          }
        }
      }
    }

    if (removeImage && amenity.image) {
      await deleteStoredAmenityImage(amenity.image);
      amenity.image = null;
      amenity.icon = null;
    }

    if (req.file) {
      if (amenity.image) {
        await deleteStoredAmenityImage(amenity.image);
      }
      amenity.image = await saveAmenityImage(req.file);
      amenity.icon = amenity.image;
    }

    Object.assign(amenity, updateData);
    amenity.updatedAt = new Date();
    await amenity.save();

    return success(res, 'Amenity updated successfully', { amenity: formatAmenity(amenity) });
  } catch (error) {
    logger.error('Update amenity failed', { error: error.message, stack: error.stack });

    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      return failure(res, 409, `Amenity with this ${field} already exists`, 'DUPLICATE');
    }

    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map((err) => ({
        field: err.path,
        message: err.message,
      }));
      return failure(res, 400, 'Validation failed', 'VALIDATION_ERROR', errors);
    }

    return failure(res, 500, 'Failed to update amenity', 'ERROR', error.message);
  }
});

/**
 * DELETE /master-data/amenities/:id — delete amenity.
 */
const deleteAmenity = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;

    if (!Types.ObjectId.isValid(id)) {
      return failure(res, 400, 'Invalid amenity ID format');
    }

    const amenity = await Amenities.findById(id);
    if (!amenity) {
      return failure(res, 404, 'Amenity not found');
    }

    if (amenity.usageCount > 0) {
      return failure(
        res,
        400,
        'Cannot delete amenity that is in use by properties. Please remove from properties first.'
      );
    }

    const propertyCount = await Properties.countDocuments({ amenities: id });
    if (propertyCount > 0) {
      return failure(
        res,
        400,
        'Cannot delete amenity that is in use by properties. Please remove from properties first.'
      );
    }

    if (amenity.image) {
      await deleteStoredAmenityImage(amenity.image);
    }

    await Amenities.findByIdAndDelete(id);

    return success(res, 'Amenity deleted successfully', {});
  } catch (error) {
    logger.error('Delete amenity failed', { error: error.message, stack: error.stack });
    return failure(res, 500, 'Failed to delete amenity', 'ERROR', error.message);
  }
});

module.exports = {
  getMasterData,
  listJobTitles,
  createJobTitle,
  updateJobTitle,
  deleteJobTitle,
  listAmenities,
  getAmenityById,
  createAmenity,
  updateAmenity,
  deleteAmenity,
};
