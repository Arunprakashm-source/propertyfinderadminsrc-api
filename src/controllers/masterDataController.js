const asyncHandler = require('express-async-handler');
const mongoose = require('mongoose');

const Countries = require('../models/countriesModel');
const ListingSearchCity = require('../models/listingSearchCityModel');
const Amenities = require('../models/amenitiesModel');
const PropertyType = require('../models/propertyTypeModel');
const ListingType = require('../models/listingTypeModel');
const JobTitles = require('../models/jobTitlesModel');
const Languages = require('../models/languagesModel');
const Agent = require('../models/agentsModel');
const Properties = require('../models/propertiesModal');
const Newprojects = require('../models/newprojectsModel');
const ProjectLayout = require('../models/projectLayoutModel');
const ProjectUnit = require('../models/projectUnitModel');
const ProjectBuilding = require('../models/projectBuildingModel');
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

const countPropertyTypeStats = async () => {
  const [total, active, inactive] = await Promise.all([
    PropertyType.countDocuments({}),
    PropertyType.countDocuments({ isActive: true }),
    PropertyType.countDocuments({ isActive: false }),
  ]);
  return { total, active, inactive };
};

const countListingTypeStats = async () => {
  const [total, active, inactive] = await Promise.all([
    ListingType.countDocuments({}),
    ListingType.countDocuments({ isActive: true }),
    ListingType.countDocuments({ isActive: false }),
  ]);
  return { total, active, inactive };
};

const countLanguageStats = async () => {
  const [total, active, inactive] = await Promise.all([
    Languages.countDocuments({}),
    Languages.countDocuments({ isActive: true }),
    Languages.countDocuments({ isActive: false }),
  ]);
  return { total, active, inactive };
};

const parseLanguageBody = (body = {}, { isCreate = false } = {}) => {
  const data = {};

  if (body.name !== undefined) {
    data.name = String(body.name).trim();
  }
  if (body.code !== undefined) {
    data.code = body.code ? String(body.code).trim().toLowerCase() : '';
  }
  if (body.nativeName !== undefined) {
    data.nativeName = body.nativeName ? String(body.nativeName).trim() : '';
  }
  if (body.isActive !== undefined) {
    data.isActive = parseBoolField(body.isActive);
  }

  if (isCreate && !data.name) {
    return { error: 'Name is required' };
  }
  if (data.name && data.name.length > 120) {
    return { error: 'Name must be 120 characters or less' };
  }
  if (data.code && data.code.length > 20) {
    return { error: 'Code must be 20 characters or less' };
  }
  if (data.nativeName && data.nativeName.length > 100) {
    return { error: 'Native name must be 100 characters or less' };
  }

  return { data };
};

const LISTING_TYPE_CATEGORIES = ['residential', 'commercial', 'other'];
const LISTING_TYPE_TRANSACTIONS = ['buy', 'rent'];

const parsePropertyTypeBody = (body = {}, { isCreate = false } = {}) => {
  const data = {};

  if (body.name !== undefined) {
    data.name = String(body.name).trim();
  }
  if (body.category !== undefined) {
    const category = String(body.category).trim();
    if (category.length > 100) {
      return { error: 'Category must be 100 characters or less' };
    }
    data.category = category;
  }
  if (body.description !== undefined) {
    data.description = body.description ? String(body.description).trim() : '';
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

  if (isCreate && !data.name) {
    return { error: 'Name is required' };
  }

  return { data };
};

const parseListingTypeBody = (body = {}, { isCreate = false } = {}) => {
  const data = {};

  if (body.name !== undefined) {
    data.name = String(body.name).trim();
  }
  if (body.slug !== undefined && body.slug !== '') {
    data.slug = String(body.slug).trim().toLowerCase();
  }
  if (body.transaction !== undefined && body.transaction !== '') {
    const transaction = String(body.transaction).trim().toLowerCase();
    if (!LISTING_TYPE_TRANSACTIONS.includes(transaction)) {
      return { error: `transaction must be one of: ${LISTING_TYPE_TRANSACTIONS.join(', ')}` };
    }
    data.transaction = transaction;
  }
  if (body.category !== undefined && body.category !== '') {
    const category = String(body.category).trim().toLowerCase();
    if (!LISTING_TYPE_CATEGORIES.includes(category)) {
      return { error: `category must be one of: ${LISTING_TYPE_CATEGORIES.join(', ')}` };
    }
    data.category = category;
  }
  if (body.description !== undefined) {
    data.description = body.description ? String(body.description).trim() : '';
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

  if (isCreate) {
    if (!data.name) return { error: 'Name is required' };
    if (!data.transaction) return { error: 'Transaction is required (buy or rent)' };
  }

  return { data };
};

const nextDisplayOrder = async (Model) => {
  const highest = await Model.findOne().sort({ displayOrder: -1 }).select('displayOrder').lean();
  return highest ? (highest.displayOrder || 0) + 1 : 1;
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

    if (requestedTypes.includes('languages')) {
      const languages = await Languages.find({ isActive: true })
        .sort({ name: 1 })
        .lean();
      data.languages = languages;
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

/**
 * GET /master-data/property-types — list with filters and pagination.
 */
const listPropertyTypes = asyncHandler(async (req, res) => {
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
      filter.$or = [{ name: rx }, { slug: rx }, { description: rx }, { category: rx }];
    }
    if (isActive !== undefined && isActive !== '') {
      filter.isActive = parseBoolField(isActive);
    }

    const skip = (pageNum - 1) * limitNum;

    const [propertyTypes, filteredCount, counts] = await Promise.all([
      PropertyType.find(filter)
        .sort({ displayOrder: 1, name: 1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      PropertyType.countDocuments(filter),
      countPropertyTypeStats(),
    ]);

    const totalPages = Math.ceil(filteredCount / limitNum) || 1;

    return success(res, 'Property types fetched successfully', {
      propertyTypes,
      pagination: {
        currentPage: pageNum,
        totalPages,
        totalPropertyTypes: filteredCount,
        limit: limitNum,
        hasNextPage: pageNum < totalPages,
        hasPrevPage: pageNum > 1,
      },
      counts: {
        totalPropertyTypes: counts.total,
        activePropertyTypes: counts.active,
        inactivePropertyTypes: counts.inactive,
      },
    });
  } catch (error) {
    logger.error('List property types failed', { error: error.message, stack: error.stack });
    return failure(res, 500, 'Failed to fetch property types', 'SERVER_ERROR', error.message);
  }
});

const createPropertyType = asyncHandler(async (req, res) => {
  try {
    const parsed = parsePropertyTypeBody(req.body, { isCreate: true });
    if (parsed.error) {
      return failure(res, 400, parsed.error, 'VALIDATION_ERROR');
    }

    const { name, category, description, isActive, displayOrder } = parsed.data;
    const finalSlug = generateSlug(name);

    const existing = await PropertyType.findOne({
      $or: [{ name: new RegExp(`^${escapeRegex(name)}$`, 'i') }, { slug: finalSlug }],
    });
    if (existing) {
      if (existing.name.toLowerCase() === name.toLowerCase()) {
        return failure(res, 409, 'Property type with this name already exists', 'DUPLICATE');
      }
      return failure(res, 409, 'Property type with this slug already exists', 'DUPLICATE');
    }

    const propertyType = await PropertyType.create({
      name,
      slug: finalSlug,
      category: category ?? '',
      description: description || undefined,
      isActive: isActive !== undefined ? isActive : true,
      displayOrder: displayOrder ?? (await nextDisplayOrder(PropertyType)),
      totalListings: 0,
    });

    return success(res, 'Property type created successfully', { propertyType }, 201);
  } catch (error) {
    logger.error('Create property type failed', { error: error.message, stack: error.stack });
    if (error.code === 11000) {
      return failure(res, 409, 'Property type already exists', 'DUPLICATE');
    }
    if (error.name === 'ValidationError') {
      return failure(res, 400, error.message, 'VALIDATION_ERROR');
    }
    return failure(res, 500, 'Failed to create property type', 'SERVER_ERROR', error.message);
  }
});

const updatePropertyType = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    if (!Types.ObjectId.isValid(id)) {
      return failure(res, 400, 'Invalid property type ID', 'VALIDATION_ERROR');
    }

    const propertyType = await PropertyType.findById(id);
    if (!propertyType) {
      return failure(res, 404, 'Property type not found', 'NOT_FOUND');
    }

    const parsed = parsePropertyTypeBody(req.body);
    if (parsed.error) {
      return failure(res, 400, parsed.error, 'VALIDATION_ERROR');
    }

    const updateData = parsed.data;
    if (!Object.keys(updateData).length) {
      return failure(res, 400, 'At least one field must be provided for update', 'VALIDATION_ERROR');
    }

    if (updateData.name && updateData.name !== propertyType.name) {
      updateData.slug = generateSlug(updateData.name);
    }

    if (updateData.name) {
      const duplicateFilter = { _id: { $ne: id }, $or: [] };
      if (updateData.name) {
        duplicateFilter.$or.push({
          name: new RegExp(`^${escapeRegex(updateData.name)}$`, 'i'),
        });
      }
      if (updateData.slug) {
        duplicateFilter.$or.push({ slug: updateData.slug });
      }
      if (duplicateFilter.$or.length) {
        const existing = await PropertyType.findOne(duplicateFilter);
        if (existing) {
          return failure(res, 409, 'Property type with this name or slug already exists', 'DUPLICATE');
        }
      }
    }

    Object.assign(propertyType, updateData);
    propertyType.updatedAt = new Date();
    await propertyType.save();

    return success(res, 'Property type updated successfully', { propertyType });
  } catch (error) {
    logger.error('Update property type failed', { error: error.message, stack: error.stack });
    if (error.code === 11000) {
      return failure(res, 409, 'Property type already exists', 'DUPLICATE');
    }
    if (error.name === 'ValidationError') {
      return failure(res, 400, error.message, 'VALIDATION_ERROR');
    }
    return failure(res, 500, 'Failed to update property type', 'SERVER_ERROR', error.message);
  }
});

const deletePropertyType = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    if (!Types.ObjectId.isValid(id)) {
      return failure(res, 400, 'Invalid property type ID', 'VALIDATION_ERROR');
    }

    const propertyType = await PropertyType.findById(id);
    if (!propertyType) {
      return failure(res, 404, 'Property type not found', 'NOT_FOUND');
    }

    const [propertyCount, projectCount, layoutCount, unitCount, buildingCount] = await Promise.all([
      Properties.countDocuments({ propertyType: id }),
      Newprojects.countDocuments({ propertyTypes: id }),
      ProjectLayout.countDocuments({ propertyType: id }),
      ProjectUnit.countDocuments({ propertyType: id }),
      ProjectBuilding.countDocuments({ propertyType: id }),
    ]);

    const inUse = propertyCount + projectCount + layoutCount + unitCount + buildingCount;
    if (inUse > 0) {
      return failure(
        res,
        400,
        'Cannot delete property type that is in use. Deactivate it instead.',
        'IN_USE'
      );
    }

    await PropertyType.findByIdAndDelete(id);
    return success(res, 'Property type deleted successfully', {});
  } catch (error) {
    logger.error('Delete property type failed', { error: error.message, stack: error.stack });
    return failure(res, 500, 'Failed to delete property type', 'SERVER_ERROR', error.message);
  }
});

/**
 * GET /master-data/listing-types — list with filters and pagination.
 */
const listListingTypes = asyncHandler(async (req, res) => {
  try {
    const { search, category, transaction, isActive, page = 1, limit = 20 } = req.query;

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
    if (transaction) {
      filter.transaction = String(transaction).trim().toLowerCase();
    }
    if (isActive !== undefined && isActive !== '') {
      filter.isActive = parseBoolField(isActive);
    }

    const skip = (pageNum - 1) * limitNum;

    const [listingTypes, filteredCount, counts] = await Promise.all([
      ListingType.find(filter)
        .sort({ displayOrder: 1, name: 1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      ListingType.countDocuments(filter),
      countListingTypeStats(),
    ]);

    const totalPages = Math.ceil(filteredCount / limitNum) || 1;

    return success(res, 'Listing types fetched successfully', {
      listingTypes,
      pagination: {
        currentPage: pageNum,
        totalPages,
        totalListingTypes: filteredCount,
        limit: limitNum,
        hasNextPage: pageNum < totalPages,
        hasPrevPage: pageNum > 1,
      },
      counts: {
        totalListingTypes: counts.total,
        activeListingTypes: counts.active,
        inactiveListingTypes: counts.inactive,
      },
    });
  } catch (error) {
    logger.error('List listing types failed', { error: error.message, stack: error.stack });
    return failure(res, 500, 'Failed to fetch listing types', 'SERVER_ERROR', error.message);
  }
});

const createListingType = asyncHandler(async (req, res) => {
  try {
    const parsed = parseListingTypeBody(req.body, { isCreate: true });
    if (parsed.error) {
      return failure(res, 400, parsed.error, 'VALIDATION_ERROR');
    }

    const { name, slug, transaction, category, description, isActive, displayOrder } = parsed.data;
    let finalSlug = slug || generateSlug(name);

    const existing = await ListingType.findOne({
      $or: [{ name: new RegExp(`^${escapeRegex(name)}$`, 'i') }, { slug: finalSlug }],
    });
    if (existing) {
      if (existing.name.toLowerCase() === name.toLowerCase()) {
        return failure(res, 409, 'Listing type with this name already exists', 'DUPLICATE');
      }
      return failure(res, 409, 'Listing type with this slug already exists', 'DUPLICATE');
    }

    const listingType = await ListingType.create({
      name,
      slug: finalSlug,
      transaction,
      category: category || 'residential',
      description: description || undefined,
      isActive: isActive !== undefined ? isActive : true,
      displayOrder: displayOrder ?? (await nextDisplayOrder(ListingType)),
    });

    return success(res, 'Listing type created successfully', { listingType }, 201);
  } catch (error) {
    logger.error('Create listing type failed', { error: error.message, stack: error.stack });
    if (error.code === 11000) {
      return failure(res, 409, 'Listing type already exists', 'DUPLICATE');
    }
    if (error.name === 'ValidationError') {
      return failure(res, 400, error.message, 'VALIDATION_ERROR');
    }
    return failure(res, 500, 'Failed to create listing type', 'SERVER_ERROR', error.message);
  }
});

const updateListingType = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    if (!Types.ObjectId.isValid(id)) {
      return failure(res, 400, 'Invalid listing type ID', 'VALIDATION_ERROR');
    }

    const listingType = await ListingType.findById(id);
    if (!listingType) {
      return failure(res, 404, 'Listing type not found', 'NOT_FOUND');
    }

    const parsed = parseListingTypeBody(req.body);
    if (parsed.error) {
      return failure(res, 400, parsed.error, 'VALIDATION_ERROR');
    }

    const updateData = parsed.data;
    if (!Object.keys(updateData).length) {
      return failure(res, 400, 'At least one field must be provided for update', 'VALIDATION_ERROR');
    }

    if (updateData.name && !updateData.slug && updateData.name !== listingType.name) {
      updateData.slug = generateSlug(updateData.name);
    }

    if (updateData.name || updateData.slug) {
      const duplicateFilter = { _id: { $ne: id }, $or: [] };
      if (updateData.name) {
        duplicateFilter.$or.push({
          name: new RegExp(`^${escapeRegex(updateData.name)}$`, 'i'),
        });
      }
      if (updateData.slug) {
        duplicateFilter.$or.push({ slug: updateData.slug });
      }
      if (duplicateFilter.$or.length) {
        const existing = await ListingType.findOne(duplicateFilter);
        if (existing) {
          return failure(res, 409, 'Listing type with this name or slug already exists', 'DUPLICATE');
        }
      }
    }

    Object.assign(listingType, updateData);
    listingType.updatedAt = new Date();
    await listingType.save();

    return success(res, 'Listing type updated successfully', { listingType });
  } catch (error) {
    logger.error('Update listing type failed', { error: error.message, stack: error.stack });
    if (error.code === 11000) {
      return failure(res, 409, 'Listing type already exists', 'DUPLICATE');
    }
    if (error.name === 'ValidationError') {
      return failure(res, 400, error.message, 'VALIDATION_ERROR');
    }
    return failure(res, 500, 'Failed to update listing type', 'SERVER_ERROR', error.message);
  }
});

const deleteListingType = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    if (!Types.ObjectId.isValid(id)) {
      return failure(res, 400, 'Invalid listing type ID', 'VALIDATION_ERROR');
    }

    const listingType = await ListingType.findById(id);
    if (!listingType) {
      return failure(res, 404, 'Listing type not found', 'NOT_FOUND');
    }

    const propertyCount = await Properties.countDocuments({ listingType: id });
    if (propertyCount > 0) {
      return failure(
        res,
        400,
        'Cannot delete listing type that is in use by properties. Deactivate it instead.',
        'IN_USE'
      );
    }

    await ListingType.findByIdAndDelete(id);
    return success(res, 'Listing type deleted successfully', {});
  } catch (error) {
    logger.error('Delete listing type failed', { error: error.message, stack: error.stack });
    return failure(res, 500, 'Failed to delete listing type', 'SERVER_ERROR', error.message);
  }
});

/**
 * @swagger
 * /master-data/languages:
 *   get:
 *     summary: List languages with filters, pagination, and stat counts
 *     tags: [Admin - Master Data - Languages]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search in name, code, or native name (case-insensitive)
 *       - in: query
 *         name: isActive
 *         schema:
 *           type: boolean
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *           maximum: 100
 *     responses:
 *       200:
 *         description: Languages fetched successfully
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
const listLanguages = asyncHandler(async (req, res) => {
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
      filter.$or = [{ name: rx }, { code: rx }, { nativeName: rx }];
    }
    if (isActive !== undefined && isActive !== '') {
      filter.isActive = parseBoolField(isActive);
    }

    const skip = (pageNum - 1) * limitNum;

    const [languages, filteredCount, counts] = await Promise.all([
      Languages.find(filter).sort({ name: 1 }).skip(skip).limit(limitNum).lean(),
      Languages.countDocuments(filter),
      countLanguageStats(),
    ]);

    const totalPages = Math.ceil(filteredCount / limitNum) || 1;

    return success(res, 'Languages fetched successfully', {
      languages,
      pagination: {
        currentPage: pageNum,
        totalPages,
        totalLanguages: filteredCount,
        limit: limitNum,
        hasNextPage: pageNum < totalPages,
        hasPrevPage: pageNum > 1,
      },
      counts: {
        totalLanguages: counts.total,
        activeLanguages: counts.active,
        inactiveLanguages: counts.inactive,
      },
    });
  } catch (error) {
    logger.error('List languages failed', { error: error.message, stack: error.stack });
    return failure(res, 500, 'Failed to fetch languages', 'SERVER_ERROR', error.message);
  }
});

/**
 * @swagger
 * /master-data/languages:
 *   post:
 *     summary: Create a language
 *     tags: [Admin - Master Data - Languages]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *             properties:
 *               name:
 *                 type: string
 *                 example: English
 *               code:
 *                 type: string
 *                 example: en
 *               nativeName:
 *                 type: string
 *                 example: English
 *               isActive:
 *                 type: boolean
 *                 default: true
 *     responses:
 *       201:
 *         description: Language created successfully
 *       400:
 *         description: Validation error
 *       409:
 *         description: Duplicate name or code
 */
const createLanguage = asyncHandler(async (req, res) => {
  try {
    const parsed = parseLanguageBody(req.body, { isCreate: true });
    if (parsed.error) {
      return failure(res, 400, parsed.error, 'VALIDATION_ERROR');
    }

    const { name, code, nativeName, isActive } = parsed.data;

    const duplicateFilter = [{ name: new RegExp(`^${escapeRegex(name)}$`, 'i') }];
    if (code) {
      duplicateFilter.push({ code: new RegExp(`^${escapeRegex(code)}$`, 'i') });
    }
    const existing = await Languages.findOne({ $or: duplicateFilter });
    if (existing) {
      if (existing.name.toLowerCase() === name.toLowerCase()) {
        return failure(res, 409, 'Language with this name already exists', 'DUPLICATE');
      }
      return failure(res, 409, 'Language with this code already exists', 'DUPLICATE');
    }

    const language = await Languages.create({
      name,
      code: code || undefined,
      nativeName: nativeName || undefined,
      isActive: isActive !== undefined ? isActive : true,
    });

    return success(res, 'Language created successfully', { language }, 201);
  } catch (error) {
    logger.error('Create language failed', { error: error.message, stack: error.stack });
    if (error.code === 11000) {
      return failure(res, 409, 'Language already exists', 'DUPLICATE');
    }
    return failure(res, 500, 'Failed to create language', 'SERVER_ERROR', error.message);
  }
});

/**
 * @swagger
 * /master-data/languages/{id}:
 *   put:
 *     summary: Update a language
 *     tags: [Admin - Master Data - Languages]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               code:
 *                 type: string
 *               nativeName:
 *                 type: string
 *               isActive:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Language updated successfully
 *       404:
 *         description: Language not found
 */
const updateLanguage = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    if (!Types.ObjectId.isValid(id)) {
      return failure(res, 400, 'Invalid language ID', 'VALIDATION_ERROR');
    }

    const language = await Languages.findById(id);
    if (!language) {
      return failure(res, 404, 'Language not found', 'NOT_FOUND');
    }

    const parsed = parseLanguageBody(req.body);
    if (parsed.error) {
      return failure(res, 400, parsed.error, 'VALIDATION_ERROR');
    }

    const updateData = parsed.data;
    if (!Object.keys(updateData).length) {
      return failure(res, 400, 'At least one field must be provided for update', 'VALIDATION_ERROR');
    }

    if (updateData.name) {
      const nameTaken = await Languages.findOne({
        _id: { $ne: id },
        name: new RegExp(`^${escapeRegex(updateData.name)}$`, 'i'),
      });
      if (nameTaken) {
        return failure(res, 409, 'Language with this name already exists', 'DUPLICATE');
      }
    }

    if (updateData.code) {
      const codeTaken = await Languages.findOne({
        _id: { $ne: id },
        code: new RegExp(`^${escapeRegex(updateData.code)}$`, 'i'),
      });
      if (codeTaken) {
        return failure(res, 409, 'Language with this code already exists', 'DUPLICATE');
      }
    }

    Object.assign(language, updateData);
    await language.save();

    return success(res, 'Language updated successfully', { language });
  } catch (error) {
    logger.error('Update language failed', { error: error.message, stack: error.stack });
    if (error.code === 11000) {
      return failure(res, 409, 'Language already exists', 'DUPLICATE');
    }
    return failure(res, 500, 'Failed to update language', 'SERVER_ERROR', error.message);
  }
});

/**
 * @swagger
 * /master-data/languages/{id}:
 *   delete:
 *     summary: Delete a language
 *     tags: [Admin - Master Data - Languages]
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
 *         description: Language deleted successfully
 *       400:
 *         description: Language assigned to agents
 *       404:
 *         description: Language not found
 */
const deleteLanguage = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    if (!Types.ObjectId.isValid(id)) {
      return failure(res, 400, 'Invalid language ID', 'VALIDATION_ERROR');
    }

    const language = await Languages.findById(id);
    if (!language) {
      return failure(res, 404, 'Language not found', 'NOT_FOUND');
    }

    const agentCount = await Agent.countDocuments({ languages: id });
    if (agentCount > 0) {
      return failure(
        res,
        400,
        'Cannot delete language assigned to agents. Deactivate it or remove from agent profiles first.',
        'IN_USE'
      );
    }

    await Languages.findByIdAndDelete(id);
    return success(res, 'Language deleted successfully', {});
  } catch (error) {
    logger.error('Delete language failed', { error: error.message, stack: error.stack });
    return failure(res, 500, 'Failed to delete language', 'SERVER_ERROR', error.message);
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
  listPropertyTypes,
  createPropertyType,
  updatePropertyType,
  deletePropertyType,
  listListingTypes,
  createListingType,
  updateListingType,
  deleteListingType,
  listLanguages,
  createLanguage,
  updateLanguage,
  deleteLanguage,
};
