const asyncHandler = require('express-async-handler');
const mongoose = require('mongoose');
const crypto = require('crypto');

const Agency = require('../models/agenciesModel');
const Developer = require('../models/developersModel');
const Agent = require('../models/agentsModel');
const CountriesModel = require('../models/countriesModel');
const ActivityLog = require('../models/activityLogModel');
const uploadService = require('../services/uploadService');
const { sendInvitationEmail } = require('../services/emailService');
const {
  success,
  failure,
  sanitizeAgency,
  formatPhoneNumber,
  isPhone,
  isEmail,
} = require('../utils/helpers');
const { logger } = require('../utils/logger');

const DEFAULT_PROFILE_PICTURE = 'profileless.png';
const { Types } = mongoose;
const FRONTEND_URL = process.env.EXPERTS_UI_URL || '';
const INVITATION_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;

const getAdminId = (req) =>
  req.admin?.id || req.admin?._id || req.user?.id || req.user?._id;

const validateObjectId = (id) => id && Types.ObjectId.isValid(id);
const normalizeEmail = (email = '') => email.toString().toLowerCase().trim();

const findExistingExpertByEmail = async (email) => {
  const normalizedEmail = normalizeEmail(email);

  const existingAgency = await Agency.findOne({ email: normalizedEmail }).select('_id');
  if (existingAgency) return { role: 'agency', entity: existingAgency };

  const existingDeveloper = await Developer.findOne({ email: normalizedEmail }).select('_id');
  if (existingDeveloper) return { role: 'developer', entity: existingDeveloper };

  const existingAgent = await Agent.findOne({ email: normalizedEmail }).select('_id');
  if (existingAgent) return { role: 'agent', entity: existingAgent };

  return null;
};

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
const toBoolean = (value) => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return ['true', '1', 'yes', 'on'].includes(normalized);
  }
  return false;
};

const normalizeListSortBy = (raw) => {
  let s = String(raw || '').toLowerCase().trim().replace(/\s+/g, '-');
  if (s === 'approval-pending' || s === 'pending-approval') s = 'pending';
  if (s === 'approval-declined') s = 'declined';
  if (s === 'invitation-expired') s = 'expired';
  const allowed = new Set(['active', 'inactive', 'pending', 'expired', 'declined', 'invited']);
  return allowed.has(s) ? s : null;
};

const buildSafeAgency = (agency) => {
  const safe = sanitizeAgency(agency);
  delete safe.passwordResetOTPHash;
  delete safe.passwordResetOTPExpires;
  delete safe.passwordResetEligibleUntil;
  const storedPicture = uploadService.toStoredProfileFilename(safe.profilePicture);
  safe.profilePicture = storedPicture || DEFAULT_PROFILE_PICTURE;
  return safe;
};

const resolveAgencyProfilePicturePath = (profilePicture) => {
  if (!profilePicture || profilePicture === DEFAULT_PROFILE_PICTURE) return null;
  return profilePicture.includes('/') ? profilePicture : `img/agency/${profilePicture}`;
};
const isDefaultProfilePicture = (value) =>
  !value || String(value).trim().toLowerCase().includes('profileless.png');

const runWithTimeout = (promise, timeoutMs = 2500) =>
  Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Operation timed out')), timeoutMs);
    }),
  ]);

const mapAgencyListItem = (agency) => {
  const profilePicture =
    uploadService.toStoredProfileFilename(agency.profilePicture) || DEFAULT_PROFILE_PICTURE;
  return {
    _id: agency._id,
    agencyName: agency.agencyName,
    email: agency.email,
    phoneNumber: agency.phoneNumber,
    orn: agency.orn,
    profilePicture,
    profilePictureUrl: uploadService.getAgencyProfileImageUrl(profilePicture),
    isActive: agency.isActive,
    isVerified: agency.isVerified,
    invitationStatus: agency.invitationStatus,
    subscriptionActive: agency.subscription?.isActive ?? false,
    agentCount: agency.agentCount ?? 0,
    nationality: agency.nationality,
    createdAt: agency.createdAt,
    lastLogin: agency.lastLogin,
  };
};

/**
 * @swagger
 * /agency/invite-agency:
 *   post:
 *     summary: Send agency invitation (admin)
 *     tags: [Admin - Agency Management]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               agencyName:
 *                 type: string
 *     responses:
 *       200:
 *         description: Invitation sent successfully
 *       400:
 *         description: Validation error
 *       409:
 *         description: Email already in use
 */
const sendAgencyInvitation = asyncHandler(async (req, res) => {
  try {
    const { email, agencyName } = req.body || {};

    if (!email || !isEmail(email)) {
      return failure(res, 400, 'Valid email is required', 'VALIDATION_ERROR');
    }

    const existingExpert = await findExistingExpertByEmail(email);
    if (existingExpert) {
      return failure(res, 409, `Email already used by ${existingExpert.role}`, 'CONFLICT');
    }

    const normalizedEmail = normalizeEmail(email);
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + INVITATION_EXPIRY_MS);
    const invitationLink = `${FRONTEND_URL}/agency/accept-invitation?token=${token}`;
    const normalizedAgencyName = String(agencyName || '').trim() || 'Invited Agency';

    const agency = await Agency.create({
      email: normalizedEmail,
      agencyName: normalizedAgencyName,
      invitationToken: token,
      invitationStatus: 'pending',
      invitationSentAt: new Date(),
      invitationExpiry: expiresAt,
      isActive: true,
      isVerified: false,
    });

    try {
      await sendInvitationEmail(
        normalizedEmail,
        normalizedAgencyName,
        invitationLink,
        'Admin Team',
        'Agency Partner'
      );
    } catch (emailError) {
      logger.warn('Failed to send agency invitation email', { error: emailError.message });
    }

    return success(res, 'Invitation sent successfully', {
      email: agency.email,
      invitationToken: token,
      expiresAt,
    });
  } catch (error) {
    logger.error('Send agency invitation failed', { error: error.message, stack: error.stack });
    return failure(res, 500, 'Failed to send invitation', 'SERVER_ERROR');
  }
});

/**
 * @swagger
 * /agencies:
 *   get:
 *     summary: List agencies with filters
 *     tags: [Admin - Agency Management]
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
 *         name: invitationStatus
 *         schema:
 *           type: string
 *           enum: [pending, accepted, expired, declined]
 *       - in: query
 *         name: subscriptionActive
 *         schema:
 *           type: boolean
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           enum: [active, inactive, pending, expired, declined, invited]
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
 *         description: Agencies fetched successfully
 */
const listAgencies = asyncHandler(async (req, res) => {
  try {
    const {
      search,
      isActive,
      isVerified,
      invitationStatus,
      subscriptionActive,
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
        { agencyName: searchRegex },
        { email: searchRegex },
        { phoneNumber: searchRegex },
        { orn: searchRegex },
      ];
    }

    if (typeof isActive !== 'undefined') {
      filter.isActive = isActive === true || isActive === 'true';
    }
    if (typeof isVerified !== 'undefined') {
      filter.isVerified = isVerified === true || isVerified === 'true';
    }
    if (invitationStatus) {
      const allowed = ['pending', 'accepted', 'expired', 'declined'];
      const status = String(invitationStatus).toLowerCase();
      if (!allowed.includes(status)) {
        return failure(res, 400, 'Invalid invitationStatus');
      }
      filter.invitationStatus = status;
    }
    if (typeof subscriptionActive !== 'undefined') {
      filter['subscription.isActive'] = subscriptionActive === true || subscriptionActive === 'true';
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
    } else if (sortBy === 'declined') {
      filter.invitationStatus = 'declined';
    } else if (sortBy === 'invited') {
      filter.invitationStatus = 'pending';
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

    const [agencies, totalAgencies] = await Promise.all([
      Agency.find(filter)
        .populate('nationality', 'name code')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Agency.countDocuments(filter),
    ]);

    const agencyIds = agencies.map((a) => a._id);
    const agentCounts = await Agent.aggregate([
      { $match: { agency: { $in: agencyIds } } },
      { $group: { _id: '$agency', count: { $sum: 1 } } },
    ]);
    const countMap = Object.fromEntries(
      agentCounts.map((row) => [row._id.toString(), row.count])
    );

    const enriched = agencies.map((agency) => ({
      ...agency,
      agentCount: countMap[agency._id.toString()] || 0,
    }));

    const totalPages = Math.ceil(totalAgencies / limitNum) || 1;

    return success(res, 'Agencies fetched successfully', {
      agencies: enriched.map(mapAgencyListItem),
      pagination: {
        currentPage: pageNum,
        totalPages,
        totalAgencies,
        limit: limitNum,
        hasNextPage: pageNum < totalPages,
        hasPrevPage: pageNum > 1,
      },
    });
  } catch (error) {
    logger.error('List agencies failed', { error: error.message, stack: error.stack });
    return failure(res, 500, 'Failed to fetch agencies', 'SERVER_ERROR', error.message);
  }
});

/**
 * @swagger
 * /agencies/{id}:
 *   get:
 *     summary: Get agency details by ID
 *     tags: [Admin - Agency Management]
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
 *         description: Agency details fetched successfully
 *       404:
 *         description: Agency not found
 */
const getAgencyDetails = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    if (!validateObjectId(id)) {
      return failure(res, 400, 'Invalid agency ID format');
    }

    const agency = await Agency.findById(id)
      .populate('nationality', 'name code phoneCode flag')
      .populate('verifiedBy', 'firstName lastName email')
      .lean();

    if (!agency) {
      return failure(res, 404, 'Agency not found', 'NOT_FOUND');
    }

    const [agentCount, superAgentCount, activeAgentCount] = await Promise.all([
      Agent.countDocuments({ agency: id }),
      Agent.countDocuments({ agency: id, agentType: 'superagent' }),
      Agent.countDocuments({ agency: id, isActive: true, isVerified: true }),
    ]);

    const safeAgency = buildSafeAgency(agency);
    safeAgency.profilePictureUrl = uploadService.getAgencyProfileImageUrl(agency.profilePicture);

    return success(res, 'Agency details fetched successfully', {
      agency: {
        ...safeAgency,
        statistics: agency.statistics || {},
        ratings: agency.ratings || {},
        subscription: agency.subscription || {},
        address: agency.address || {},
        preferences: agency.preferences || {},
      },
      agentsSummary: {
        total: agentCount,
        superAgents: superAgentCount,
        activeVerified: activeAgentCount,
      },
    });
  } catch (error) {
    logger.error('Get agency details failed', { error: error.message, stack: error.stack });
    return failure(res, 500, 'Failed to fetch agency details', 'SERVER_ERROR', error.message);
  }
});

/**
 * @swagger
 * /agencies/{id}:
 *   put:
 *     summary: Update agency profile and status (admin)
 *     tags: [Admin - Agency Management]
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
 *     responses:
 *       200:
 *         description: Agency updated successfully
 */
const updateAgency = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const adminId = getAdminId(req);
    const body = req.body || {};

    if (!validateObjectId(id)) {
      return failure(res, 400, 'Invalid agency ID format');
    }

    const agency = await Agency.findById(id);
    if (!agency) {
      return failure(res, 404, 'Agency not found', 'NOT_FOUND');
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
      agencyName,
      email,
      phoneNumber,
      phoneCode,
      orn,
      address,
      nationality,
      description,
      aboutUs,
      website,
      foundedYear,
      verificationNotes,
      deactivationReason,
      preferences,
    } = body;

    const isActiveParsed = parseOptionalBoolean(body.isActive, 'isActive');
    if (isActiveParsed.error) return failure(res, 400, isActiveParsed.error);
    const isVerifiedParsed = parseOptionalBoolean(body.isVerified, 'isVerified');
    if (isVerifiedParsed.error) return failure(res, 400, isVerifiedParsed.error);
    const isEmailVerifiedParsed = parseOptionalBoolean(body.isEmailVerified, 'isEmailVerified');
    if (isEmailVerifiedParsed.error) return failure(res, 400, isEmailVerifiedParsed.error);
    const isPhoneVerifiedParsed = parseOptionalBoolean(body.isPhoneVerified, 'isPhoneVerified');
    if (isPhoneVerifiedParsed.error) return failure(res, 400, isPhoneVerifiedParsed.error);

    if (typeof agencyName !== 'undefined') {
      const name = String(agencyName).trim();
      if (!name) return failure(res, 400, 'Invalid agency name');
      track('agencyName', agency.agencyName, name);
      agency.agencyName = name;
    }

    if (typeof email !== 'undefined') {
      const normalizedEmail = String(email).trim().toLowerCase();
      if (!isEmail(normalizedEmail)) {
        return failure(res, 400, 'A valid email is required');
      }
      const duplicate = await Agency.findOne({
        email: normalizedEmail,
        _id: { $ne: agency._id },
      }).select('_id');
      if (duplicate) {
        return failure(res, 409, 'Email is already in use', 'CONFLICT');
      }
      track('email', agency.email, normalizedEmail);
      agency.email = normalizedEmail;
    }

    if (typeof orn !== 'undefined') {
      const normalizedOrn = String(orn).trim();
      if (normalizedOrn) {
        const duplicateOrn = await Agency.findOne({
          orn: normalizedOrn,
          _id: { $ne: agency._id },
        }).select('_id');
        if (duplicateOrn) {
          return failure(res, 409, 'ORN is already in use', 'CONFLICT');
        }
      }
      track('orn', agency.orn, normalizedOrn || null);
      agency.orn = normalizedOrn || undefined;
    }

    if (typeof phoneNumber !== 'undefined') {
      let resolvedPhoneCode = (phoneCode || agency.phoneCode || '').trim();
      const normalizedPhoneNumber = `${phoneNumber || ''}`.trim();
      if (!normalizedPhoneNumber) {
        return failure(res, 400, 'Invalid phone number provided');
      }
      if (!resolvedPhoneCode && agency.nationality) {
        const country = await CountriesModel.findById(agency.nationality).select('phoneCode');
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
      track('phoneNumber', agency.phoneNumber, normalizedPhone);
      agency.phoneNumber = normalizedPhone;
      agency.phoneCode = normalizedResolvedPhoneCode || null;
      agency.phoneNumberWithoutCode = localDigits || null;
    }

    if (nationality !== undefined) {
      if (nationality && !validateObjectId(nationality)) {
        return failure(res, 400, 'Invalid nationality id');
      }
      track('nationality', agency.nationality?.toString(), nationality || null);
      agency.nationality = nationality || undefined;
    }

    if (address && typeof address === 'object' && !Array.isArray(address)) {
      agency.address = agency.address || {};
      ['street', 'city', 'state', 'country', 'zipCode', 'fullAddress'].forEach((key) => {
        if (typeof address[key] !== 'undefined') {
          agency.address[key] = String(address[key] || '').trim();
          updatesApplied = true;
        }
      });
    }

    if (description !== undefined) {
      agency.description = description;
      updatesApplied = true;
    }
    if (aboutUs !== undefined) {
      agency.aboutUs = aboutUs;
      updatesApplied = true;
    }
    if (website !== undefined) {
      agency.website = String(website || '').trim();
      updatesApplied = true;
    }
    if (foundedYear !== undefined) {
      const year = Number(foundedYear);
      if (!Number.isFinite(year) || year < 1800 || year > new Date().getFullYear() + 1) {
        return failure(res, 400, 'Invalid founded year');
      }
      agency.foundedYear = year;
      updatesApplied = true;
    }
    if (verificationNotes !== undefined) {
      agency.verificationNotes = String(verificationNotes || '').trim().slice(0, 1000);
      updatesApplied = true;
    }

    if (preferences && typeof preferences === 'object' && !Array.isArray(preferences)) {
      agency.preferences = agency.preferences || {};
      if (typeof preferences.currency !== 'undefined') {
        agency.preferences.currency = String(preferences.currency || '').trim();
        updatesApplied = true;
      }
      if (typeof preferences.language !== 'undefined') {
        agency.preferences.language = String(preferences.language || '').trim();
        updatesApplied = true;
      }
    }

    if (typeof isEmailVerifiedParsed.value !== 'undefined') {
      track('isEmailVerified', agency.isEmailVerified, isEmailVerifiedParsed.value);
      agency.isEmailVerified = isEmailVerifiedParsed.value;
    }
    if (typeof isPhoneVerifiedParsed.value !== 'undefined') {
      track('isPhoneVerified', agency.isPhoneVerified, isPhoneVerifiedParsed.value);
      agency.isPhoneVerified = isPhoneVerifiedParsed.value;
    }

    if (typeof isVerifiedParsed.value !== 'undefined') {
      track('isVerified', agency.isVerified, isVerifiedParsed.value);
      agency.isVerified = isVerifiedParsed.value;
      if (isVerifiedParsed.value) {
        agency.verifiedAt = new Date();
        agency.verifiedBy = adminId ? new Types.ObjectId(adminId) : undefined;
      } else {
        agency.verifiedAt = undefined;
        agency.verifiedBy = undefined;
      }
    }

    if (typeof isActiveParsed.value !== 'undefined') {
      track('isActive', agency.isActive, isActiveParsed.value);
      agency.isActive = isActiveParsed.value;
      if (!isActiveParsed.value) {
        agency.deactivatedAt = new Date();
        agency.deactivatedBy = adminId ? new Types.ObjectId(adminId) : undefined;
        if (deactivationReason && String(deactivationReason).trim()) {
          agency.deactivationReason = String(deactivationReason).trim().slice(0, 500);
        }
      } else {
        agency.deactivatedAt = undefined;
        agency.deactivatedBy = undefined;
        agency.deactivationReason = undefined;
      }
    }

    if (!updatesApplied) {
      return failure(res, 400, 'No valid fields provided for update');
    }

    await agency.save();
    await agency.populate([
      { path: 'nationality', select: 'name code' },
      { path: 'verifiedBy', select: 'firstName lastName email' },
    ]);

    if (adminId) {
      ActivityLog.create({
        actor: { actorType: 'admin', actorId: new Types.ObjectId(adminId) },
        action: 'update',
        resource: { resourceType: 'agency', resourceId: agency._id },
        description: 'Agency updated by admin',
        changes,
        requestDetails: {
          ipAddress: req.ip || req.connection?.remoteAddress,
          userAgent: req.get('user-agent'),
        },
        status: 'success',
        timestamp: new Date(),
      }).catch((err) => logger.warn('Activity log failed', { error: err.message }));
    }

    const safeAgency = buildSafeAgency(agency);
    safeAgency.profilePictureUrl = uploadService.getAgencyProfileImageUrl(agency.profilePicture);

    return success(res, 'Agency updated successfully', { agency: safeAgency });
  } catch (error) {
    logger.error('Update agency failed', { error: error.message, stack: error.stack });
    return failure(res, 500, 'Failed to update agency', 'SERVER_ERROR', error.message);
  }
});

/**
 * @swagger
 * /agencies/{id}/verify:
 *   post:
 *     summary: Admin approve or reject agency verification
 *     tags: [Admin - Agency Management]
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
 *               verificationNotes:
 *                 type: string
 *               isActive:
 *                 type: boolean
 *               reason:
 *                 type: string
 *     responses:
 *       200:
 *         description: Agency verification updated
 */
const verifyAgency = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const adminId = getAdminId(req);
    const { action, verificationNotes, isActive, reason } = req.body || {};

    if (!validateObjectId(id)) {
      return failure(res, 400, 'Invalid agency ID format');
    }

    const normalizedAction = action != null ? String(action).toLowerCase() : '';
    if (!['approve', 'reject'].includes(normalizedAction)) {
      return failure(res, 400, 'action must be approve or reject');
    }

    const agency = await Agency.findById(id);
    if (!agency) {
      return failure(res, 404, 'Agency not found', 'NOT_FOUND');
    }

    if (normalizedAction === 'approve') {
      if (agency.isVerified) {
        return failure(res, 400, 'Agency is already verified');
      }
      if (agency.invitationStatus !== 'accepted') {
        return failure(
          res,
          400,
          'Agency must complete invitation signup before admin verification'
        );
      }

      agency.isVerified = true;
      agency.verifiedAt = new Date();
      agency.verifiedBy = adminId ? new Types.ObjectId(adminId) : undefined;
      agency.isActive = typeof isActive === 'boolean' ? isActive : true;
      agency.deactivatedAt = undefined;
      agency.deactivatedBy = undefined;
      agency.deactivationReason = undefined;
      if (verificationNotes && String(verificationNotes).trim()) {
        agency.verificationNotes = String(verificationNotes).trim().slice(0, 1000);
      }
    } else {
      if (agency.isVerified) {
        return failure(res, 400, 'Cannot reject a verified agency. Deactivate instead.');
      }
      agency.isActive = false;
      agency.isVerified = false;
      agency.invitationStatus = 'declined';
      agency.invitationToken = undefined;
      if (reason && String(reason).trim()) {
        agency.deactivationReason = String(reason).trim().slice(0, 500);
      }
      agency.deactivatedAt = new Date();
      agency.deactivatedBy = adminId ? new Types.ObjectId(adminId) : undefined;
    }

    await agency.save();
    await agency.populate('nationality', 'name code');

    const message =
      normalizedAction === 'approve'
        ? 'Agency verified successfully by admin'
        : 'Agency verification rejected by admin';

    const safeAgency = buildSafeAgency(agency);
    safeAgency.profilePictureUrl = uploadService.getAgencyProfileImageUrl(agency.profilePicture);

    return success(res, message, { agency: safeAgency });
  } catch (error) {
    logger.error('Verify agency failed', { error: error.message, stack: error.stack });
    return failure(res, 500, 'Failed to verify agency', 'SERVER_ERROR', error.message);
  }
});

/**
 * @swagger
 * /agencies/{id}:
 *   delete:
 *     summary: Permanently delete an agency
 *     tags: [Admin - Agency Management]
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
 *         description: Agency deleted permanently
 *       400:
 *         description: Agency has linked agents
 *       404:
 *         description: Agency not found
 */
const deleteAgency = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const adminId = getAdminId(req);

    if (!validateObjectId(id)) {
      return failure(res, 400, 'Invalid agency ID format', 'VALIDATION_ERROR');
    }

    const agency = await Agency.findById(id).lean();
    if (!agency) {
      return failure(res, 404, 'Agency not found', 'NOT_FOUND');
    }

    const agentCount = await Agent.countDocuments({ agency: id });
    if (agentCount > 0) {
      return failure(
        res,
        400,
        `Cannot delete agency with ${agentCount} linked agent(s). Remove or reassign agents first.`,
        'HAS_DEPENDENTS'
      );
    }

    const deletedSnapshot = {
      _id: agency._id,
      agencyName: agency.agencyName,
      email: agency.email,
      orn: agency.orn,
    };

    const profilePath = resolveAgencyProfilePicturePath(agency.profilePicture);
    const { deletedCount } = await Agency.deleteOne({ _id: agency._id });

    if (deletedCount === 0) {
      return failure(res, 404, 'Agency not found', 'NOT_FOUND');
    }

    setImmediate(() => {
      const tasks = [];
      if (profilePath) {
        tasks.push(
          runWithTimeout(uploadService.delete(profilePath), 2500).catch((error) => {
            logger.warn('Failed to delete agency profile picture', { error: error.message });
          })
        );
      }
      if (adminId) {
        tasks.push(
          ActivityLog.create({
            actor: { actorType: 'admin', actorId: new Types.ObjectId(adminId) },
            action: 'delete',
            resource: { resourceType: 'agency', resourceId: agency._id },
            description: 'Agency permanently deleted by admin',
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

    return success(res, 'Agency deleted permanently', { deleted: deletedSnapshot });
  } catch (error) {
    logger.error('Delete agency failed', { error: error.message, stack: error.stack });
    return failure(res, 500, 'Failed to delete agency', 'SERVER_ERROR', error.message);
  }
});

const updateAgencyProfilePicture = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const removeRequested = toBoolean(req.body?.removeProfilePicture);

    if (!id || !validateObjectId(id)) {
      return failure(res, 400, 'Invalid agency ID format');
    }

    const agency = await Agency.findById(id);
    if (!agency) {
      return failure(res, 404, 'Agency not found', 'NOT_FOUND');
    }

    const previousPicture = agency.profilePicture;

    if (removeRequested && !req.file) {
      if (!isDefaultProfilePicture(previousPicture)) {
        const previousPicturePath = previousPicture.includes('/')
          ? previousPicture
          : `img/agency/${previousPicture}`;
        await uploadService.delete(previousPicturePath).catch((error) => {
          logger.warn('Failed to delete previous agency profile picture', { error: error.message });
        });
      }

      agency.profilePicture = DEFAULT_PROFILE_PICTURE;
      await agency.save();

      const safeAgency = buildSafeAgency(agency);
      safeAgency.profilePictureUrl = uploadService.getAgencyProfileImageUrl(agency.profilePicture);
      return success(res, 'Profile picture removed', { agency: safeAgency }, 200);
    }

    if (!req.file) {
      return failure(res, 400, 'No profile picture provided');
    }

    const uploaded = await uploadService.upload(req.file, 'agency', {
      generateThumbnail: false,
    });

    const storedFilename =
      uploadService.toStoredProfileFilename(uploaded.filename) ||
      uploadService.toStoredProfileFilename(uploaded.path);
    if (!storedFilename) {
      return failure(res, 500, 'Failed to resolve uploaded filename', 'SERVER_ERROR');
    }

    // Save only the filename in the database (same as main API agency profile-picture upload).
    agency.profilePicture = storedFilename;
    await agency.save();

    if (
      previousPicture &&
      uploadService.toStoredProfileFilename(previousPicture) !== storedFilename &&
      !isDefaultProfilePicture(previousPicture)
    ) {
      const previousPicturePath = previousPicture.includes('/')
        ? previousPicture
        : `img/agency/${previousPicture}`;
      await uploadService.delete(previousPicturePath).catch((error) => {
        logger.warn('Failed to delete previous agency profile picture', { error: error.message });
      });
    }

    const safeAgency = buildSafeAgency(agency);
    safeAgency.profilePictureUrl = uploadService.getAgencyProfileImageUrl(agency.profilePicture);
    const responseData = uploadService.buildStandardResponse(
      uploaded,
      { images: 'agency' },
      { agency: safeAgency }
    );
    return success(res, 'Profile picture updated', responseData, 200);
  } catch (error) {
    logger.error('Update agency profile picture failed', { error: error.message, stack: error.stack });
    return failure(res, 500, 'Failed to update profile picture', 'SERVER_ERROR', error.message);
  }
});

module.exports = {
  sendAgencyInvitation,
  listAgencies,
  getAgencyDetails,
  updateAgency,
  updateAgencyProfilePicture,
  verifyAgency,
  deleteAgency,
};
