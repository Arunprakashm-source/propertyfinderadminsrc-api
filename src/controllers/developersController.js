const asyncHandler = require('express-async-handler');
const mongoose = require('mongoose');

const Developer = require('../models/developersModel');
const NewProject = require('../models/newprojectsModel');
const CountriesModel = require('../models/countriesModel');
const ActivityLog = require('../models/activityLogModel');
const uploadService = require('../services/uploadService');
const {
  success,
  failure,
  sanitizeDeveloper,
  formatPhoneNumber,
  isPhone,
  isEmail,
} = require('../utils/helpers');
const { logger } = require('../utils/logger');

const DEFAULT_PROFILE_PICTURE = 'profileless.png';
const { Types } = mongoose;

const getAdminId = (req) =>
  req.admin?.id || req.admin?._id || req.user?.id || req.user?._id;

const validateObjectId = (id) => id && Types.ObjectId.isValid(id);

const parseOptionalBoolean = (value, fieldName) => {
  if (typeof value === 'undefined') return { value: undefined };
  if (typeof value === 'boolean') return { value };
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') return { value: true };
    if (normalized === 'false') return { value: false };
  }
  return { error: `${fieldName} must be a boolean` };
};

const normalizeListSortBy = (raw) => {
  let s = String(raw || '').toLowerCase().trim().replace(/\s+/g, '-');
  if (s === 'approval-pending' || s === 'pending-approval') s = 'pending';
  const allowed = new Set(['active', 'inactive', 'pending', 'expired', 'invited', 'featured']);
  return allowed.has(s) ? s : null;
};

const getDisplayImage = (developer) =>
  developer?.profilePicture || developer?.logo || DEFAULT_PROFILE_PICTURE;

const buildSafeDeveloper = (developer) => {
  const safe = sanitizeDeveloper(developer);
  const displayImage = getDisplayImage(developer);
  safe.profilePicture = displayImage === DEFAULT_PROFILE_PICTURE ? DEFAULT_PROFILE_PICTURE : displayImage;
  safe.logo = developer.logo || safe.profilePicture;
  return safe;
};

const resolveDeveloperImagePath = (filename) => {
  if (!filename || filename === DEFAULT_PROFILE_PICTURE) return null;
  return filename.includes('/') ? filename : `img/developer/${filename}`;
};

const runWithTimeout = (promise, timeoutMs = 2500) =>
  Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Operation timed out')), timeoutMs);
    }),
  ]);

const mapDeveloperListItem = (developer) => {
  const image = getDisplayImage(developer);
  return {
    _id: developer._id,
    name: developer.name,
    email: developer.email,
    phoneNumber: developer.phoneNumber,
    profilePicture: image,
    logo: developer.logo || image,
    profilePictureUrl: uploadService.getDeveloperProfileImageUrl(image),
    isActive: developer.isActive,
    isVerified: developer.isVerified,
    isFeatured: developer.isFeatured,
    invitationStatus: developer.invitationStatus,
    totalProjects: developer.totalProjects ?? 0,
    projectCount: developer.projectCount ?? developer.totalProjects ?? 0,
    nationality: developer.nationality,
    createdAt: developer.createdAt,
    lastLogin: developer.lastLogin,
  };
};

/**
 * @swagger
 * /developers:
 *   get:
 *     summary: List developers with filters
 *     tags: [Admin - Developer Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *       - in: query
 *         name: isActive
 *         schema:
 *           type: boolean
 *       - in: query
 *         name: isVerified
 *         schema:
 *           type: boolean
 *       - in: query
 *         name: isFeatured
 *         schema:
 *           type: boolean
 *       - in: query
 *         name: invitationStatus
 *         schema:
 *           type: string
 *           enum: [pending, accepted, expired]
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           enum: [active, inactive, pending, expired, invited, featured]
 *       - in: query
 *         name: registrationDate
 *         schema:
 *           type: string
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
 *     responses:
 *       200:
 *         description: Developers fetched successfully
 */
const listDevelopers = asyncHandler(async (req, res) => {
  try {
    const {
      search,
      isActive,
      isVerified,
      isFeatured,
      invitationStatus,
      registrationDate,
      page = 1,
      limit = 20,
      sortBy: sortByRaw,
    } = req.query;

    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    if (isNaN(pageNum) || pageNum < 1) {
      return failure(res, 400, 'Page must be a positive integer');
    }
    if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
      return failure(res, 400, 'Limit must be between 1 and 100');
    }

    const filter = {};
    const sortBy = normalizeListSortBy(sortByRaw);

    if (search) {
      const searchRegex = new RegExp(
        search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
        'i'
      );
      filter.$or = [
        { name: searchRegex },
        { email: searchRegex },
        { phoneNumber: searchRegex },
        { slug: searchRegex },
      ];
    }

    if (typeof isActive !== 'undefined') {
      filter.isActive = isActive === true || isActive === 'true';
    }
    if (typeof isVerified !== 'undefined') {
      filter.isVerified = isVerified === true || isVerified === 'true';
    }
    if (typeof isFeatured !== 'undefined') {
      filter.isFeatured = isFeatured === true || isFeatured === 'true';
    }
    if (invitationStatus) {
      const allowed = ['pending', 'accepted', 'expired'];
      const status = String(invitationStatus).toLowerCase();
      if (!allowed.includes(status)) {
        return failure(res, 400, 'Invalid invitationStatus');
      }
      filter.invitationStatus = status;
    }

    if (sortBy === 'active') {
      filter.isVerified = true;
      filter.isActive = true;
      filter.invitationStatus = 'accepted';
    } else if (sortBy === 'inactive') {
      filter.isVerified = true;
      filter.isActive = false;
    } else if (sortBy === 'pending') {
      filter.invitationStatus = 'accepted';
      filter.isVerified = false;
    } else if (sortBy === 'expired') {
      filter.invitationStatus = 'expired';
    } else if (sortBy === 'invited') {
      filter.invitationStatus = 'pending';
    } else if (sortBy === 'featured') {
      filter.isFeatured = true;
      filter.isActive = true;
    }

    if (registrationDate) {
      const datePattern = /^\d{4}-\d{2}-\d{2}(,\d{4}-\d{2}-\d{2})?$/;
      if (!datePattern.test(registrationDate)) {
        return failure(res, 400, 'Invalid date format. Use YYYY-MM-DD or YYYY-MM-DD,YYYY-MM-DD');
      }
      const dates = registrationDate.split(',');
      if (dates.length === 2) {
        const startDate = new Date(dates[0].trim());
        const endDate = new Date(dates[1].trim());
        endDate.setHours(23, 59, 59, 999);
        filter.createdAt = { $gte: startDate, $lte: endDate };
      } else {
        const date = new Date(dates[0].trim());
        const startDate = new Date(date);
        startDate.setHours(0, 0, 0, 0);
        const endDate = new Date(date);
        endDate.setHours(23, 59, 59, 999);
        filter.createdAt = { $gte: startDate, $lte: endDate };
      }
    }

    const skip = (pageNum - 1) * limitNum;

    const [developers, totalDevelopers] = await Promise.all([
      Developer.find(filter)
        .populate('nationality', 'name code')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Developer.countDocuments(filter),
    ]);

    const developerIds = developers.map((d) => d._id);
    const projectCounts = await NewProject.aggregate([
      { $match: { developer: { $in: developerIds } } },
      { $group: { _id: '$developer', count: { $sum: 1 } } },
    ]);
    const countMap = Object.fromEntries(
      projectCounts.map((row) => [row._id.toString(), row.count])
    );

    const enriched = developers.map((dev) => ({
      ...dev,
      projectCount: countMap[dev._id.toString()] || 0,
    }));

    const totalPages = Math.ceil(totalDevelopers / limitNum) || 1;

    return success(res, 'Developers fetched successfully', {
      developers: enriched.map(mapDeveloperListItem),
      pagination: {
        currentPage: pageNum,
        totalPages,
        totalDevelopers,
        limit: limitNum,
        hasNextPage: pageNum < totalPages,
        hasPrevPage: pageNum > 1,
      },
    });
  } catch (error) {
    logger.error('List developers failed', { error: error.message, stack: error.stack });
    return failure(res, 500, 'Failed to fetch developers', 'SERVER_ERROR', error.message);
  }
});

/**
 * @swagger
 * /developers/{id}:
 *   get:
 *     summary: Get developer details by ID
 *     tags: [Admin - Developer Management]
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
 *         description: Developer details fetched successfully
 *       404:
 *         description: Developer not found
 */
const getDeveloperDetails = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    if (!validateObjectId(id)) {
      return failure(res, 400, 'Invalid developer ID format');
    }

    const developer = await Developer.findById(id)
      .populate('nationality', 'name code phoneCode flag')
      .populate('verifiedBy', 'firstName lastName email')
      .lean();

    if (!developer) {
      return failure(res, 404, 'Developer not found', 'NOT_FOUND');
    }

    const [projectCount, activeProjects, offPlanProjects] = await Promise.all([
      NewProject.countDocuments({ developer: id }),
      NewProject.countDocuments({ developer: id, isActive: true }),
      NewProject.countDocuments({ developer: id, completionStatus: 'off-plan' }),
    ]);

    const safeDeveloper = buildSafeDeveloper(developer);
    const image = getDisplayImage(developer);
    safeDeveloper.profilePictureUrl = uploadService.getDeveloperProfileImageUrl(image);

    return success(res, 'Developer details fetched successfully', {
      developer: {
        ...safeDeveloper,
        ratings: developer.ratings || {},
        socialLinks: developer.socialLinks || {},
        address: developer.address || {},
        preferences: developer.preferences || {},
        awards: developer.awards || [],
      },
      projectsSummary: {
        total: projectCount,
        active: activeProjects,
        offPlan: offPlanProjects,
        storedTotalProjects: developer.totalProjects ?? 0,
        completedProjects: developer.completedProjects ?? 0,
        ongoingProjects: developer.ongoingProjects ?? 0,
      },
    });
  } catch (error) {
    logger.error('Get developer details failed', { error: error.message, stack: error.stack });
    return failure(res, 500, 'Failed to fetch developer details', 'SERVER_ERROR', error.message);
  }
});

/**
 * @swagger
 * /developers/{id}:
 *   put:
 *     summary: Update developer profile and status (admin)
 *     tags: [Admin - Developer Management]
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
 *         description: Developer updated successfully
 */
const updateDeveloper = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const adminId = getAdminId(req);
    const body = req.body || {};

    if (!validateObjectId(id)) {
      return failure(res, 400, 'Invalid developer ID format');
    }

    const developer = await Developer.findById(id);
    if (!developer) {
      return failure(res, 404, 'Developer not found', 'NOT_FOUND');
    }

    const changes = { before: {}, after: {} };
    let updatesApplied = false;

    const track = (field, before, after) => {
      if (JSON.stringify(before) !== JSON.stringify(after)) {
        changes.before[field] = before;
        changes.after[field] = after;
        updatesApplied = true;
      }
    };

    const {
      name,
      email,
      phoneNumber,
      phoneCode,
      nationality,
      address,
      shortDescription,
      longDescription,
      description,
      aboutUs,
      website,
      foundedYear,
      slug,
      metaTitle,
      metaDescription,
      socialLinks,
      preferences,
      logo,
      profilePicture,
    } = body;

    const isActiveParsed = parseOptionalBoolean(body.isActive, 'isActive');
    if (isActiveParsed.error) return failure(res, 400, isActiveParsed.error);
    const isVerifiedParsed = parseOptionalBoolean(body.isVerified, 'isVerified');
    if (isVerifiedParsed.error) return failure(res, 400, isVerifiedParsed.error);
    const isFeaturedParsed = parseOptionalBoolean(body.isFeatured, 'isFeatured');
    if (isFeaturedParsed.error) return failure(res, 400, isFeaturedParsed.error);
    const isEmailVerifiedParsed = parseOptionalBoolean(body.isEmailVerified, 'isEmailVerified');
    if (isEmailVerifiedParsed.error) return failure(res, 400, isEmailVerifiedParsed.error);
    const isPhoneVerifiedParsed = parseOptionalBoolean(body.isPhoneVerified, 'isPhoneVerified');
    if (isPhoneVerifiedParsed.error) return failure(res, 400, isPhoneVerifiedParsed.error);

    if (typeof name !== 'undefined') {
      const trimmed = String(name).trim();
      if (!trimmed) return failure(res, 400, 'Invalid developer name');
      track('name', developer.name, trimmed);
      developer.name = trimmed;
    }

    if (typeof email !== 'undefined') {
      const normalizedEmail = String(email).trim().toLowerCase();
      if (!isEmail(normalizedEmail)) {
        return failure(res, 400, 'A valid email is required');
      }
      const duplicate = await Developer.findOne({
        email: normalizedEmail,
        _id: { $ne: developer._id },
      }).select('_id');
      if (duplicate) {
        return failure(res, 409, 'Email is already in use', 'CONFLICT');
      }
      track('email', developer.email, normalizedEmail);
      developer.email = normalizedEmail;
    }

    if (typeof slug !== 'undefined' && slug) {
      const normalizedSlug = String(slug).trim().toLowerCase();
      const duplicateSlug = await Developer.findOne({
        slug: normalizedSlug,
        _id: { $ne: developer._id },
      }).select('_id');
      if (duplicateSlug) {
        return failure(res, 409, 'Slug is already in use', 'CONFLICT');
      }
      track('slug', developer.slug, normalizedSlug);
      developer.slug = normalizedSlug;
    }

    if (typeof phoneNumber !== 'undefined') {
      let resolvedPhoneCode = (phoneCode || developer.phoneCode || '').trim();
      const normalizedPhoneNumber = `${phoneNumber || ''}`.trim();
      if (!normalizedPhoneNumber) {
        return failure(res, 400, 'Invalid phone number provided');
      }
      if (!resolvedPhoneCode && developer.nationality) {
        const country = await CountriesModel.findById(developer.nationality).select('phoneCode');
        if (country?.phoneCode) resolvedPhoneCode = country.phoneCode;
      }
      if (!resolvedPhoneCode) {
        return failure(res, 400, 'Country dial code is required for phone updates');
      }
      const normalizedResolvedPhoneCode = formatPhoneNumber(resolvedPhoneCode);
      const normalizedPhone = formatPhoneNumber(
        `${normalizedResolvedPhoneCode}${normalizedPhoneNumber}`
      );
      if (!isPhone(normalizedPhone)) {
        return failure(res, 400, 'Invalid phone number format');
      }
      const localDigits = normalizedPhoneNumber.replace(/\D/g, '');
      track('phoneNumber', developer.phoneNumber, normalizedPhone);
      developer.phoneNumber = normalizedPhone;
      developer.phoneCode = normalizedResolvedPhoneCode || null;
      developer.phoneNumberWithoutCode = localDigits || null;
    }

    if (nationality !== undefined) {
      if (nationality && !validateObjectId(nationality)) {
        return failure(res, 400, 'Invalid nationality id');
      }
      track('nationality', developer.nationality?.toString(), nationality || null);
      developer.nationality = nationality || undefined;
    }

    if (address && typeof address === 'object' && !Array.isArray(address)) {
      developer.address = developer.address || {};
      ['street', 'city', 'state', 'country', 'zipCode', 'fullAddress'].forEach((key) => {
        if (typeof address[key] !== 'undefined') {
          developer.address[key] = String(address[key] || '').trim();
          updatesApplied = true;
        }
      });
    }

    if (shortDescription !== undefined) {
      developer.shortDescription = shortDescription;
      updatesApplied = true;
    }
    if (longDescription !== undefined) {
      developer.longDescription = longDescription;
      updatesApplied = true;
    }
    if (description !== undefined) {
      developer.description = description;
      updatesApplied = true;
    }
    if (aboutUs !== undefined) {
      developer.aboutUs = aboutUs;
      updatesApplied = true;
    }
    if (website !== undefined) {
      developer.website = String(website || '').trim();
      updatesApplied = true;
    }
    if (foundedYear !== undefined) {
      const year = Number(foundedYear);
      if (!Number.isFinite(year) || year < 1800 || year > new Date().getFullYear() + 1) {
        return failure(res, 400, 'Invalid founded year');
      }
      developer.foundedYear = year;
      updatesApplied = true;
    }
    if (metaTitle !== undefined) {
      developer.metaTitle = String(metaTitle || '').trim();
      updatesApplied = true;
    }
    if (metaDescription !== undefined) {
      developer.metaDescription = String(metaDescription || '').trim();
      updatesApplied = true;
    }
    if (logo !== undefined) {
      developer.logo = logo;
      updatesApplied = true;
    }
    if (profilePicture !== undefined) {
      developer.profilePicture = profilePicture;
      updatesApplied = true;
    }

    if (socialLinks && typeof socialLinks === 'object' && !Array.isArray(socialLinks)) {
      developer.socialLinks = { ...(developer.socialLinks || {}), ...socialLinks };
      updatesApplied = true;
    }

    if (preferences && typeof preferences === 'object' && !Array.isArray(preferences)) {
      developer.preferences = developer.preferences || {};
      if (typeof preferences.currency !== 'undefined') {
        developer.preferences.currency = String(preferences.currency || '').trim();
        updatesApplied = true;
      }
      if (typeof preferences.language !== 'undefined') {
        developer.preferences.language = String(preferences.language || '').trim();
        updatesApplied = true;
      }
    }

    if (typeof isEmailVerifiedParsed.value !== 'undefined') {
      track('isEmailVerified', developer.isEmailVerified, isEmailVerifiedParsed.value);
      developer.isEmailVerified = isEmailVerifiedParsed.value;
    }
    if (typeof isPhoneVerifiedParsed.value !== 'undefined') {
      track('isPhoneVerified', developer.isPhoneVerified, isPhoneVerifiedParsed.value);
      developer.isPhoneVerified = isPhoneVerifiedParsed.value;
    }

    if (typeof isFeaturedParsed.value !== 'undefined') {
      track('isFeatured', developer.isFeatured, isFeaturedParsed.value);
      developer.isFeatured = isFeaturedParsed.value;
    }

    if (typeof isVerifiedParsed.value !== 'undefined') {
      track('isVerified', developer.isVerified, isVerifiedParsed.value);
      developer.isVerified = isVerifiedParsed.value;
      if (isVerifiedParsed.value) {
        developer.verifiedAt = new Date();
        developer.verifiedBy = adminId ? new Types.ObjectId(adminId) : undefined;
      } else {
        developer.verifiedAt = undefined;
        developer.verifiedBy = undefined;
      }
    }

    if (typeof isActiveParsed.value !== 'undefined') {
      track('isActive', developer.isActive, isActiveParsed.value);
      developer.isActive = isActiveParsed.value;
    }

    if (!updatesApplied) {
      return failure(res, 400, 'No valid fields provided for update');
    }

    await developer.save();
    await developer.populate([
      { path: 'nationality', select: 'name code' },
      { path: 'verifiedBy', select: 'firstName lastName email' },
    ]);

    if (adminId) {
      ActivityLog.create({
        actor: { actorType: 'admin', actorId: new Types.ObjectId(adminId) },
        action: 'update',
        resource: { resourceType: 'developer', resourceId: developer._id },
        description: 'Developer updated by admin',
        changes,
        requestDetails: {
          ipAddress: req.ip || req.connection?.remoteAddress,
          userAgent: req.get('user-agent'),
        },
        status: 'success',
        timestamp: new Date(),
      }).catch((err) => logger.warn('Activity log failed', { error: err.message }));
    }

    const safeDeveloper = buildSafeDeveloper(developer);
    safeDeveloper.profilePictureUrl = uploadService.getDeveloperProfileImageUrl(
      getDisplayImage(developer)
    );

    return success(res, 'Developer updated successfully', { developer: safeDeveloper });
  } catch (error) {
    logger.error('Update developer failed', { error: error.message, stack: error.stack });
    return failure(res, 500, 'Failed to update developer', 'SERVER_ERROR', error.message);
  }
});

/**
 * @swagger
 * /developers/{id}/verify:
 *   post:
 *     summary: Admin approve or reject developer verification
 *     tags: [Admin - Developer Management]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [action]
 *             properties:
 *               action:
 *                 type: string
 *                 enum: [approve, reject]
 *               isActive:
 *                 type: boolean
 *               isFeatured:
 *                 type: boolean
 *               reason:
 *                 type: string
 *     responses:
 *       200:
 *         description: Developer verification updated
 */
const verifyDeveloper = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const adminId = getAdminId(req);
    const { action, isActive, isFeatured, reason } = req.body || {};

    if (!validateObjectId(id)) {
      return failure(res, 400, 'Invalid developer ID format');
    }

    const normalizedAction = action != null ? String(action).toLowerCase() : '';
    if (!['approve', 'reject'].includes(normalizedAction)) {
      return failure(res, 400, 'action must be approve or reject');
    }

    const developer = await Developer.findById(id);
    if (!developer) {
      return failure(res, 404, 'Developer not found', 'NOT_FOUND');
    }

    if (normalizedAction === 'approve') {
      if (developer.isVerified) {
        return failure(res, 400, 'Developer is already verified');
      }
      if (developer.invitationStatus !== 'accepted') {
        return failure(
          res,
          400,
          'Developer must complete invitation signup before admin verification'
        );
      }

      developer.isVerified = true;
      developer.verifiedAt = new Date();
      developer.verifiedBy = adminId ? new Types.ObjectId(adminId) : undefined;
      developer.isActive = typeof isActive === 'boolean' ? isActive : true;
      if (typeof isFeatured === 'boolean') {
        developer.isFeatured = isFeatured;
      }
    } else {
      if (developer.isVerified) {
        return failure(res, 400, 'Cannot reject a verified developer. Deactivate instead.');
      }
      developer.isActive = false;
      developer.isVerified = false;
      developer.isFeatured = false;
      developer.invitationStatus = 'expired';
      developer.invitationToken = undefined;
    }

    await developer.save();
    await developer.populate('nationality', 'name code');

    if (adminId) {
      ActivityLog.create({
        actor: { actorType: 'admin', actorId: new Types.ObjectId(adminId) },
        action: normalizedAction === 'approve' ? 'verify' : 'reject',
        resource: { resourceType: 'developer', resourceId: developer._id },
        description:
          normalizedAction === 'approve'
            ? 'Developer verified by admin'
            : 'Developer verification rejected by admin',
        metadata: reason ? { reason: String(reason).trim() } : {},
        requestDetails: {
          ipAddress: req.ip || req.connection?.remoteAddress,
          userAgent: req.get('user-agent'),
        },
        status: 'success',
        timestamp: new Date(),
      }).catch((err) => logger.warn('Activity log failed', { error: err.message }));
    }

    const message =
      normalizedAction === 'approve'
        ? 'Developer verified successfully by admin'
        : 'Developer verification rejected by admin';

    const safeDeveloper = buildSafeDeveloper(developer);
    safeDeveloper.profilePictureUrl = uploadService.getDeveloperProfileImageUrl(
      getDisplayImage(developer)
    );

    return success(res, message, { developer: safeDeveloper });
  } catch (error) {
    logger.error('Verify developer failed', { error: error.message, stack: error.stack });
    return failure(res, 500, 'Failed to verify developer', 'SERVER_ERROR', error.message);
  }
});

/**
 * @swagger
 * /developers/{id}:
 *   delete:
 *     summary: Permanently delete a developer
 *     tags: [Admin - Developer Management]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Developer deleted permanently
 *       400:
 *         description: Developer has linked projects
 *       404:
 *         description: Developer not found
 */
const deleteDeveloper = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const adminId = getAdminId(req);

    if (!validateObjectId(id)) {
      return failure(res, 400, 'Invalid developer ID format', 'VALIDATION_ERROR');
    }

    const developer = await Developer.findById(id).lean();
    if (!developer) {
      return failure(res, 404, 'Developer not found', 'NOT_FOUND');
    }

    const projectCount = await NewProject.countDocuments({ developer: id });
    if (projectCount > 0) {
      return failure(
        res,
        400,
        `Cannot delete developer with ${projectCount} linked project(s). Remove projects first.`,
        'HAS_DEPENDENTS'
      );
    }

    const deletedSnapshot = {
      _id: developer._id,
      name: developer.name,
      email: developer.email,
    };

    const imagePaths = [
      resolveDeveloperImagePath(developer.profilePicture),
      resolveDeveloperImagePath(developer.logo),
    ].filter((path, index, arr) => path && arr.indexOf(path) === index);

    const { deletedCount } = await Developer.deleteOne({ _id: developer._id });

    if (deletedCount === 0) {
      return failure(res, 404, 'Developer not found', 'NOT_FOUND');
    }

    setImmediate(() => {
      const tasks = imagePaths.map((imagePath) =>
        runWithTimeout(uploadService.delete(imagePath), 2500).catch((error) => {
          logger.warn('Failed to delete developer image', { error: error.message, imagePath });
        })
      );

      if (adminId) {
        tasks.push(
          ActivityLog.create({
            actor: { actorType: 'admin', actorId: new Types.ObjectId(adminId) },
            action: 'delete',
            resource: { resourceType: 'developer', resourceId: developer._id },
            description: 'Developer permanently deleted by admin',
            metadata: deletedSnapshot,
            requestDetails: {
              ipAddress: req.ip || req.connection?.remoteAddress,
              userAgent: req.get('user-agent'),
            },
            status: 'success',
            timestamp: new Date(),
          }).catch((err) => logger.warn('Activity log failed', { error: err.message }))
        );
      }

      Promise.all(tasks).catch(() => {});
    });

    return success(res, 'Developer deleted permanently', { deleted: deletedSnapshot });
  } catch (error) {
    logger.error('Delete developer failed', { error: error.message, stack: error.stack });
    return failure(res, 500, 'Failed to delete developer', 'SERVER_ERROR', error.message);
  }
});

module.exports = {
  listDevelopers,
  getDeveloperDetails,
  updateDeveloper,
  verifyDeveloper,
  deleteDeveloper,
};
