const asyncHandler = require('express-async-handler');
const mongoose = require('mongoose');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const Agency = require('../models/agenciesModel');
const Developer = require('../models/developersModel');
const Agent = require('../models/agentsModel');
const JobTitles = require('../models/jobTitlesModel');
const CountriesModel = require('../models/countriesModel');
const LanguagesModel = require('../models/languagesModel');
const ActivityLog = require('../models/activityLogModel');
const uploadService = require('../services/uploadService');
const { sendInvitationEmail } = require('../services/emailService');
const {
  success,
  failure,
  sanitizeAgent,
  formatPhoneNumber,
  isPhone,
  isEmail,
} = require('../utils/helpers');
const { logger } = require('../utils/logger');
const { countInvitationAccountStats } = require('../utils/accountListCounts');

const DEFAULT_PROFILE_PICTURE = 'profileless.png';
const { Types } = mongoose;
const FRONTEND_URL = process.env.EXPERTS_UI_URL || '';
const INVITATION_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;

const normalizeEmail = (email = '') => email.toString().toLowerCase().trim();

const findExistingExpertByEmail = async (email) => {
  const normalizedEmail = normalizeEmail(email);

  const existingAgency = await Agency.findOne({ email: normalizedEmail }).select('_id');
  if (existingAgency) return { role: 'agency', entity: existingAgency };

  const existingDeveloper = await Developer.findOne({ email: normalizedEmail }).select('_id');
  if (existingDeveloper) return { role: 'developer', entity: existingDeveloper };

  const existingAgent = await Agent.findOne({ email: normalizedEmail });
  if (existingAgent) return { role: 'agent', entity: existingAgent };

  return null;
};

const getAdminId = (req) =>
  req.admin?.id || req.admin?._id || req.user?.id || req.user?._id;

const validateObjectId = (id) => id && Types.ObjectId.isValid(id);

const toBoolean = (value) => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return ['true', '1', 'yes', 'on'].includes(normalized);
  }
  return false;
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

const normalizeAgentType = (raw) => {
  const v = String(raw || '').toLowerCase().trim();
  if (v === 'agent' || v === 'superagent') return v;
  return null;
};

const normalizeListSortBy = (raw) => {
  let s = String(raw || '').toLowerCase().trim().replace(/\s+/g, '-');
  if (s === 'approval-pending' || s === 'pending-approval') s = 'pending';
  if (s === 'approval-declined') s = 'declined';
  if (s === 'invitation-expired') s = 'expired';
  if (s === 'rejected') s = 'declined';
  const allowed = new Set(['active', 'inactive', 'pending', 'expired', 'declined', 'invited']);
  return allowed.has(s) ? s : null;
};

const buildSafeAgent = (agent) => {
  const safe = sanitizeAgent(agent);
  delete safe.passwordResetOTPHash;
  delete safe.passwordResetOTPExpires;
  delete safe.passwordResetEligibleUntil;
  const storedPicture = uploadService.toStoredProfileFilename(safe.profilePicture);
  safe.profilePicture = storedPicture || DEFAULT_PROFILE_PICTURE;
  return safe;
};

const resolveAgentProfilePicturePath = (profilePicture) => {
  if (!profilePicture || profilePicture === DEFAULT_PROFILE_PICTURE) return null;
  return profilePicture.includes('/') ? profilePicture : `img/agents/${profilePicture}`;
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

const mapAgentListItem = (agent) => ({
  _id: agent._id,
  fullName: agent.fullName,
  email: agent.email,
  phoneNumber: agent.phoneNumber,
  agentType: agent.agentType,
  brokerLicenseNumber: agent.brokerLicenseNumber,
  profilePicture: agent.profilePicture || DEFAULT_PROFILE_PICTURE,
  profilePictureUrl: uploadService.getAgentProfileImageUrl(agent.profilePicture),
  isActive: agent.isActive,
  isVerified: agent.isVerified,
  invitationStatus: agent.invitationStatus,
  agency: agent.agency
    ? (() => {
        const agencyProfilePicture =
          uploadService.toStoredProfileFilename(agent.agency.profilePicture) ||
          DEFAULT_PROFILE_PICTURE;
        return {
          _id: agent.agency._id || agent.agency,
          agencyName: agent.agency.agencyName,
          email: agent.agency.email,
          profilePicture: agencyProfilePicture,
          profilePictureUrl: uploadService.getAgencyProfileImageUrl(agencyProfilePicture),
        };
      })()
    : null,
  specialization: agent.specialization,
  createdAt: agent.createdAt,
  lastLogin: agent.lastLogin,
});

/**
 * @swagger
 * /agents/invite-agent:
 *   post:
 *     summary: Send agent invitation (admin, agency required)
 *     tags: [Admin - Agent Management]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [agencyId, email]
 *             properties:
 *               agencyId:
 *                 type: string
 *               email:
 *                 type: string
 *               fullName:
 *                 type: string
 *               agentType:
 *                 type: string
 *                 enum: [agent, superagent]
 *     responses:
 *       200:
 *         description: Invitation sent successfully
 */
const sendAgentInvitation = asyncHandler(async (req, res) => {
  try {
    const { agencyId, email, fullName, agentType } = req.body || {};

    if (!agencyId || !validateObjectId(agencyId)) {
      return failure(res, 400, 'Valid agency ID is required', 'VALIDATION_ERROR');
    }

    if (!email || !isEmail(email)) {
      return failure(res, 400, 'Valid email is required', 'VALIDATION_ERROR');
    }

    const agency = await Agency.findById(agencyId);
    if (!agency) {
      return failure(res, 404, 'Agency not found', 'NOT_FOUND');
    }

    if (String(agency.invitationStatus || '').toLowerCase() !== 'accepted') {
      return failure(
        res,
        400,
        'Agency must complete onboarding before inviting agents',
        'VALIDATION_ERROR'
      );
    }

    const normalizedAgentType = agentType ? normalizeAgentType(agentType) : null;
    if (agentType && !normalizedAgentType) {
      return failure(res, 400, 'Invalid agentType', 'VALIDATION_ERROR');
    }

    const existingExpert = await findExistingExpertByEmail(email);
    if (existingExpert && existingExpert.role !== 'agent') {
      return failure(res, 409, `Email already used by ${existingExpert.role}`, 'CONFLICT');
    }

    const normalizedEmail = normalizeEmail(email);
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + INVITATION_EXPIRY_MS);
    const invitationLink = `${FRONTEND_URL}/agent/accept-invitation?token=${token}`;
    const tempPassword = await bcrypt.hash(crypto.randomBytes(16).toString('hex'), 10);

    let agent = existingExpert?.entity;

    if (agent && agent.invitationStatus === 'accepted') {
      return failure(res, 409, 'Agent already onboarded', 'CONFLICT');
    }

    if (!agent) {
      agent = await Agent.create({
        email: normalizedEmail,
        fullName: String(fullName || '').trim() || undefined,
        agency: agency._id,
        agentType: normalizedAgentType || 'agent',
        invitationToken: token,
        invitationStatus: 'pending',
        invitationSentAt: new Date(),
        invitationExpiry: expiresAt,
        isActive: false,
        isVerified: false,
        isEmailVerified: false,
        isPhoneVerified: false,
        password: tempPassword,
      });
    } else {
      agent.fullName = String(fullName || '').trim() || agent.fullName;
      agent.agency = agency._id;
      if (normalizedAgentType) agent.agentType = normalizedAgentType;
      agent.invitationToken = token;
      agent.invitationStatus = 'pending';
      agent.invitationSentAt = new Date();
      agent.invitationExpiry = expiresAt;
      agent.isVerified = false;
      agent.isEmailVerified = false;
      agent.isPhoneVerified = false;
      agent.password = tempPassword;
      agent.isActive = false;
      agent.deactivationReason = undefined;
      agent.deactivatedAt = undefined;
      await agent.save();
    }

    try {
      await sendInvitationEmail(
        normalizedEmail,
        agent.fullName || 'Agent',
        invitationLink,
        agency.agencyName || 'Agency',
        'Agent Partner'
      );
    } catch (emailError) {
      logger.warn('Failed to send agent invitation email', { error: emailError.message });
    }

    return success(res, 'Invitation sent successfully', {
      email: agent.email,
      invitationToken: token,
      expiresAt,
    });
  } catch (error) {
    logger.error('Send agent invitation failed', { error: error.message, stack: error.stack });
    return failure(res, 500, 'Failed to send invitation', 'SERVER_ERROR');
  }
});

/**
 * @swagger
 * /agents/list:
 *   get:
 *     summary: List agents for admin dropdowns (filters, invite flows)
 *     tags: [Admin - Agent Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Optional filter by name, email, or phone
 *     responses:
 *       200:
 *         description: Agent dropdown options fetched successfully
 */
const listAgentsForDropdown = asyncHandler(async (req, res) => {
  try {
    const { search } = req.query;

    const filter = {
      invitationStatus: 'accepted',
      isVerified: true,
      isActive: true,
    };

    if (search) {
      const searchRegex = new RegExp(
        String(search).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
        'i'
      );
      filter.$or = [
        { fullName: searchRegex },
        { email: searchRegex },
        { phoneNumber: searchRegex },
      ];
    }

    const agents = await Agent.find(filter)
      .populate('agency', 'agencyName profilePicture')
      .select('_id fullName email agentType profilePicture agency')
      .sort({ fullName: 1 })
      .lean();

    return success(res, 'Agent options fetched successfully', {
      agents: agents.map((agent) => {
        const profilePicture =
          uploadService.toStoredProfileFilename(agent.profilePicture) ||
          DEFAULT_PROFILE_PICTURE;
        const agencyProfilePicture = agent.agency
          ? uploadService.toStoredProfileFilename(agent.agency.profilePicture) ||
            DEFAULT_PROFILE_PICTURE
          : null;
        return {
          _id: agent._id,
          fullName: agent.fullName || '',
          email: agent.email || '',
          agentType: agent.agentType || 'agent',
          profilePicture,
          agency: agent.agency
            ? {
                _id: agent.agency._id,
                agencyName: agent.agency.agencyName || '',
                profilePicture: agencyProfilePicture,
              }
            : null,
        };
      }),
    });
  } catch (error) {
    logger.error('List agents for dropdown failed', { error: error.message, stack: error.stack });
    return failure(res, 500, 'Failed to fetch agent options', 'SERVER_ERROR', error.message);
  }
});

/**
 * @swagger
 * /agents:
 *   get:
 *     summary: List agents (all agencies) with filters
 *     tags: [Admin - Agent Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *       - in: query
 *         name: agency
 *         schema:
 *           type: string
 *         description: Filter by agency ObjectId
 *       - in: query
 *         name: agentType
 *         schema:
 *           type: string
 *           enum: [agent, superagent]
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
 *         name: sortBy
 *         schema:
 *           type: string
 *           enum: [active, inactive, pending, rejected]
 *       - in: query
 *         name: registrationDate
 *         schema:
 *           type: string
 *         description: YYYY-MM-DD or YYYY-MM-DD,YYYY-MM-DD (createdAt)
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
 *         description: Agents fetched successfully
 */
const listAgents = asyncHandler(async (req, res) => {
  try {
    const {
      search,
      agency,
      agentType,
      isActive,
      isVerified,
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
        { fullName: searchRegex },
        { email: searchRegex },
        { phoneNumber: searchRegex },
        { brokerLicenseNumber: searchRegex },
      ];
    }

    if (agency) {
      if (!validateObjectId(agency)) {
        return failure(res, 400, 'Invalid agency ID format');
      }
      filter.agency = new Types.ObjectId(agency);
    }

    const normalizedAgentType = normalizeAgentType(agentType);
    if (agentType && !normalizedAgentType) {
      return failure(res, 400, 'Invalid agentType');
    }
    if (normalizedAgentType) {
      filter.agentType = normalizedAgentType;
    }

    if (typeof isActive !== 'undefined') {
      filter.isActive = isActive === true || isActive === 'true';
    }
    if (typeof isVerified !== 'undefined') {
      filter.isVerified = isVerified === true || isVerified === 'true';
    }
    if (invitationStatus) {
      const allowed = ['pending', 'accepted', 'expired', 'declined'];
      if (!allowed.includes(String(invitationStatus).toLowerCase())) {
        return failure(res, 400, 'Invalid invitationStatus');
      }
      filter.invitationStatus = String(invitationStatus).toLowerCase();
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
    } else if (sortBy === 'declined') {
      filter.invitationStatus = 'declined';
    } else if (sortBy === 'expired') {
      filter.invitationStatus = 'expired';
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
    const [agents, totalAgents, counts] = await Promise.all([
      Agent.find(filter)
        .populate('agency', 'agencyName email profilePicture')
        .populate('specialization', 'title')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Agent.countDocuments(filter),
      countInvitationAccountStats(Agent),
    ]);

    const totalPages = Math.ceil(totalAgents / limitNum) || 1;

    return success(res, 'Agents fetched successfully', {
      agents: agents.map(mapAgentListItem),
      pagination: {
        currentPage: pageNum,
        totalPages,
        totalAgents,
        limit: limitNum,
        hasNextPage: pageNum < totalPages,
        hasPrevPage: pageNum > 1,
      },
      counts: {
        totalAgents: counts.total,
        activeAgents: counts.active,
        inactiveAgents: counts.inactive,
        approvalPendingAgents: counts.approvalPending,
        declinedAgents: counts.declined,
        invitedAgents: counts.invited,
        expiredAgents: counts.expired,
      },
    });
  } catch (error) {
    logger.error('List agents failed', { error: error.message, stack: error.stack });
    return failure(res, 500, 'Failed to fetch agents', 'SERVER_ERROR', error.message);
  }
});

/**
 * @swagger
 * /agents/{id}:
 *   get:
 *     summary: Get agent details by ID
 *     tags: [Admin - Agent Management]
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
 *         description: Agent details fetched successfully
 *       404:
 *         description: Agent not found
 */
const getAgentDetails = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    if (!validateObjectId(id)) {
      return failure(res, 400, 'Invalid agent ID format');
    }

    const agent = await Agent.findById(id)
      .populate('agency', 'agencyName email phoneNumber orn isVerified isActive')
      .populate('specialization', 'title')
      .populate('languages', 'name code')
      .populate('nationality', 'name code phoneCode flag')
      .lean();

    if (!agent) {
      return failure(res, 404, 'Agent not found', 'NOT_FOUND');
    }

    const safeAgent = buildSafeAgent(agent);
    safeAgent.profilePictureUrl = uploadService.getAgentProfileImageUrl(agent.profilePicture);

    return success(res, 'Agent details fetched successfully', {
      agent: {
        ...safeAgent,
        statistics: agent.statistics || {},
        ratings: agent.ratings || {},
        socialLinks: agent.socialLinks || {},
        preferences: agent.preferences || {},
      },
    });
  } catch (error) {
    logger.error('Get agent details failed', { error: error.message, stack: error.stack });
    return failure(res, 500, 'Failed to fetch agent details', 'SERVER_ERROR', error.message);
  }
});

/**
 * @swagger
 * /agents/{id}:
 *   put:
 *     summary: Update agent profile and status (admin)
 *     tags: [Admin - Agent Management]
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
 *               fullName:
 *                 type: string
 *               email:
 *                 type: string
 *               phoneNumber:
 *                 type: string
 *               phoneCode:
 *                 type: string
 *               agentType:
 *                 type: string
 *                 enum: [agent, superagent]
 *               specialization:
 *                 type: string
 *               brokerLicenseNumber:
 *                 type: string
 *               experience:
 *                 type: string
 *               nationality:
 *                 type: string
 *               languages:
 *                 type: array
 *                 items:
 *                   type: string
 *               description:
 *                 type: string
 *               aboutMe:
 *                 type: string
 *               isActive:
 *                 type: boolean
 *               isVerified:
 *                 type: boolean
 *               isEmailVerified:
 *                 type: boolean
 *               isPhoneVerified:
 *                 type: boolean
 *               deactivationReason:
 *                 type: string
 *     responses:
 *       200:
 *         description: Agent updated successfully
 *       404:
 *         description: Agent or related resource not found
 */
const updateAgent = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const adminId = getAdminId(req);
    const body = req.body || {};

    if (!validateObjectId(id)) {
      return failure(res, 400, 'Invalid agent ID format');
    }

    const agent = await Agent.findById(id);
    if (!agent) {
      return failure(res, 404, 'Agent not found', 'NOT_FOUND');
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
      fullName,
      email,
      phoneNumber,
      phoneCode,
      agentType,
      specialization,
      brokerLicenseNumber,
      experience,
      nationality,
      languages,
      description,
      aboutMe,
      linkedinUrl,
      whatsappNumber,
      preferences,
      deactivationReason,
    } = body;

    const isActiveParsed = parseOptionalBoolean(body.isActive, 'isActive');
    if (isActiveParsed.error) return failure(res, 400, isActiveParsed.error);
    const isVerifiedParsed = parseOptionalBoolean(body.isVerified, 'isVerified');
    if (isVerifiedParsed.error) return failure(res, 400, isVerifiedParsed.error);
    const isEmailVerifiedParsed = parseOptionalBoolean(body.isEmailVerified, 'isEmailVerified');
    if (isEmailVerifiedParsed.error) return failure(res, 400, isEmailVerifiedParsed.error);
    const isPhoneVerifiedParsed = parseOptionalBoolean(body.isPhoneVerified, 'isPhoneVerified');
    if (isPhoneVerifiedParsed.error) return failure(res, 400, isPhoneVerifiedParsed.error);

    if (typeof fullName !== 'undefined') {
      const name = String(fullName).trim();
      if (!name) return failure(res, 400, 'Invalid full name');
      track('fullName', agent.fullName, name);
      agent.fullName = name;
    }

    if (typeof email !== 'undefined') {
      const normalizedEmail = String(email).trim().toLowerCase();
      if (!isEmail(normalizedEmail)) {
        return failure(res, 400, 'A valid email is required');
      }
      const duplicate = await Agent.findOne({ email: normalizedEmail, _id: { $ne: agent._id } }).select('_id');
      if (duplicate) {
        return failure(res, 409, 'Email is already in use', 'CONFLICT');
      }
      track('email', agent.email, normalizedEmail);
      agent.email = normalizedEmail;
    }

    if (typeof phoneNumber !== 'undefined') {
      let resolvedPhoneCode = (phoneCode || agent.phoneCode || '').trim();
      const normalizedPhoneNumber = `${phoneNumber || ''}`.trim();
      if (!normalizedPhoneNumber) {
        return failure(res, 400, 'Invalid phone number provided');
      }
      if (!resolvedPhoneCode && agent.nationality) {
        const country = await CountriesModel.findById(agent.nationality).select('phoneCode');
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
      track('phoneNumber', agent.phoneNumber, normalizedPhone);
      agent.phoneNumber = normalizedPhone;
      agent.phoneCode = normalizedResolvedPhoneCode || null;
      agent.phoneNumberWithoutCode = localDigits || null;
    }

    const normalizedAgentType = agentType !== undefined ? normalizeAgentType(agentType) : null;
    if (agentType !== undefined && !normalizedAgentType) {
      return failure(res, 400, 'Invalid agentType');
    }
    if (normalizedAgentType) {
      track('agentType', agent.agentType, normalizedAgentType);
      agent.agentType = normalizedAgentType;
    }

    if (specialization !== undefined) {
      if (!validateObjectId(specialization)) {
        return failure(res, 400, 'Invalid specialization (job title) id');
      }
      const jobExists = await JobTitles.exists({ _id: specialization, isActive: true });
      if (!jobExists) {
        return failure(res, 404, 'Job title not found', 'NOT_FOUND');
      }
      track('specialization', agent.specialization?.toString(), specialization);
      agent.specialization = specialization;
    }

    if (brokerLicenseNumber !== undefined) {
      track('brokerLicenseNumber', agent.brokerLicenseNumber, brokerLicenseNumber);
      agent.brokerLicenseNumber = String(brokerLicenseNumber || '').trim();
    }

    if (experience !== undefined) {
      track('experience', agent.experience, String(experience));
      agent.experience = String(experience);
    }

    if (nationality !== undefined) {
      if (nationality && !validateObjectId(nationality)) {
        return failure(res, 400, 'Invalid nationality id');
      }
      track('nationality', agent.nationality?.toString(), nationality || null);
      agent.nationality = nationality || undefined;
    }

    if (languages !== undefined) {
      const arr = Array.isArray(languages) ? languages : [languages];
      for (const langId of arr.filter(Boolean)) {
        if (!validateObjectId(langId)) {
          return failure(res, 400, 'Invalid language id in languages array');
        }
      }
      agent.languages = arr.filter(Boolean).map((langId) => new Types.ObjectId(langId));
      updatesApplied = true;
    }

    if (description !== undefined) {
      agent.description = description;
      updatesApplied = true;
    }
    if (aboutMe !== undefined) {
      agent.aboutMe = aboutMe;
      updatesApplied = true;
    }
    if (linkedinUrl !== undefined) {
      agent.socialLinks = { ...(agent.socialLinks || {}), linkedin: linkedinUrl };
      updatesApplied = true;
    }

    if (whatsappNumber !== undefined) {
      track('whatsappNumber', agent.whatsappNumber, String(whatsappNumber || '').trim());
      agent.whatsappNumber = String(whatsappNumber || '').trim() || undefined;
    }

    if (preferences && typeof preferences === 'object' && !Array.isArray(preferences)) {
      agent.preferences = agent.preferences || {};
      if (
        preferences.notificationSettings &&
        typeof preferences.notificationSettings === 'object' &&
        !Array.isArray(preferences.notificationSettings)
      ) {
        agent.preferences.notificationSettings = {
          ...(agent.preferences.notificationSettings || {}),
          ...preferences.notificationSettings,
        };
        updatesApplied = true;
      }
    }

    if (typeof isEmailVerifiedParsed.value !== 'undefined') {
      track('isEmailVerified', agent.isEmailVerified, isEmailVerifiedParsed.value);
      agent.isEmailVerified = isEmailVerifiedParsed.value;
    }

    if (typeof isPhoneVerifiedParsed.value !== 'undefined') {
      track('isPhoneVerified', agent.isPhoneVerified, isPhoneVerifiedParsed.value);
      agent.isPhoneVerified = isPhoneVerifiedParsed.value;
    }

    if (typeof isVerifiedParsed.value !== 'undefined') {
      track('isVerified', agent.isVerified, isVerifiedParsed.value);
      agent.isVerified = isVerifiedParsed.value;
      if (isVerifiedParsed.value) {
        agent.verifiedAt = new Date();
        agent.verifiedBy = adminId ? new Types.ObjectId(adminId) : undefined;
        agent.verifiedByModel = 'Admin';
      } else {
        agent.verifiedAt = undefined;
        agent.verifiedBy = undefined;
        agent.verifiedByModel = undefined;
      }
    }

    if (typeof isActiveParsed.value !== 'undefined') {
      track('isActive', agent.isActive, isActiveParsed.value);
      agent.isActive = isActiveParsed.value;
      if (!isActiveParsed.value) {
        agent.deactivatedAt = new Date();
        agent.deactivatedBy = adminId ? new Types.ObjectId(adminId) : undefined;
        if (deactivationReason && String(deactivationReason).trim()) {
          agent.deactivationReason = String(deactivationReason).trim().slice(0, 500);
        }
      } else {
        agent.deactivatedAt = undefined;
        agent.deactivatedBy = undefined;
        agent.deactivationReason = undefined;
      }
    }

    if (!updatesApplied) {
      return failure(res, 400, 'No valid fields provided for update');
    }

    await agent.save();
    await agent.populate([
      { path: 'agency', select: 'agencyName email' },
      { path: 'specialization', select: 'title' },
      { path: 'languages', select: 'name code' },
      { path: 'nationality', select: 'name code' },
    ]);

    if (adminId) {
      ActivityLog.create({
        actor: { actorType: 'admin', actorId: new Types.ObjectId(adminId) },
        action: 'update',
        resource: { resourceType: 'agent', resourceId: agent._id },
        description: 'Agent updated by admin',
        changes,
        requestDetails: {
          ipAddress: req.ip || req.connection?.remoteAddress,
          userAgent: req.get('user-agent'),
        },
        status: 'success',
        timestamp: new Date(),
      }).catch((err) => logger.warn('Activity log failed', { error: err.message }));
    }

    const safeAgent = buildSafeAgent(agent);
    safeAgent.profilePictureUrl = uploadService.getAgentProfileImageUrl(agent.profilePicture);

    return success(res, 'Agent updated successfully', { agent: safeAgent });
  } catch (error) {
    logger.error('Update agent failed', { error: error.message, stack: error.stack });
    return failure(res, 500, 'Failed to update agent', 'SERVER_ERROR', error.message);
  }
});

/**
 * @swagger
 * /agents/{id}/verify:
 *   post:
 *     summary: Admin approve or decline agent verification
 *     tags: [Admin - Agent Management]
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
 *             required: [action]
 *             properties:
 *               action:
 *                 type: string
 *                 enum: [approve, decline]
 *               specializationId:
 *                 type: string
 *               agentType:
 *                 type: string
 *                 enum: [agent, superagent]
 *               isActive:
 *                 type: boolean
 *               reason:
 *                 type: string
 *     responses:
 *       200:
 *         description: Agent verification updated
 */
const verifyAgent = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const adminId = getAdminId(req);
    const { action, specializationId, agentType, isActive, reason } = req.body || {};

    if (!validateObjectId(id)) {
      return failure(res, 400, 'Invalid agent ID format');
    }

    const normalizedAction = action != null ? String(action).toLowerCase() : '';
    if (!['approve', 'decline'].includes(normalizedAction)) {
      return failure(res, 400, 'action must be approve or decline');
    }

    const agent = await Agent.findById(id);
    if (!agent) {
      return failure(res, 404, 'Agent not found', 'NOT_FOUND');
    }

    if (normalizedAction === 'approve') {
      if (agent.isVerified) {
        return failure(res, 400, 'Agent is already verified');
      }
      if (agent.invitationStatus !== 'accepted') {
        return failure(res, 400, 'Agent must have accepted the invitation before admin approval');
      }
      if (!specializationId || !validateObjectId(specializationId)) {
        return failure(res, 400, 'Valid specializationId is required');
      }
      const jobExists = await JobTitles.exists({ _id: specializationId, isActive: true });
      if (!jobExists) {
        return failure(res, 404, 'Job title not found', 'NOT_FOUND');
      }
      const normalizedType = normalizeAgentType(agentType);
      if (!normalizedType) {
        return failure(res, 400, 'Valid agentType (agent or superagent) is required');
      }

      agent.specialization = specializationId;
      agent.agentType = normalizedType;
      agent.isVerified = true;
      agent.verifiedAt = new Date();
      agent.verifiedBy = adminId ? new Types.ObjectId(adminId) : undefined;
      agent.verifiedByModel = 'Admin';
      agent.isActive = typeof isActive === 'boolean' ? isActive : true;
      agent.deactivatedAt = undefined;
      agent.deactivatedBy = undefined;
      agent.deactivationReason = undefined;
    } else {
      if (agent.isVerified) {
        return failure(res, 400, 'Cannot decline a verified agent');
      }
      agent.invitationStatus = 'declined';
      agent.invitationToken = undefined;
      agent.isActive = false;
      agent.isVerified = false;
      if (reason && String(reason).trim()) {
        agent.deactivationReason = String(reason).trim().slice(0, 500);
      }
      agent.deactivatedAt = new Date();
      agent.deactivatedBy = adminId ? new Types.ObjectId(adminId) : undefined;
    }

    await agent.save();
    await agent.populate([
      { path: 'agency', select: 'agencyName email' },
      { path: 'specialization', select: 'title' },
    ]);

    const message =
      normalizedAction === 'approve'
        ? 'Agent verified successfully by admin'
        : 'Agent verification declined by admin';

    const safeAgent = buildSafeAgent(agent);
    safeAgent.profilePictureUrl = uploadService.getAgentProfileImageUrl(agent.profilePicture);

    return success(res, message, { agent: safeAgent });
  } catch (error) {
    logger.error('Verify agent failed', { error: error.message, stack: error.stack });
    return failure(res, 500, 'Failed to verify agent', 'SERVER_ERROR', error.message);
  }
});

/**
 * @swagger
 * /agents/{id}:
 *   delete:
 *     summary: Permanently delete an agent
 *     tags: [Admin - Agent Management]
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
 *         description: Agent deleted permanently
 *       404:
 *         description: Agent not found or already deleted
 */
const deleteAgent = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const adminId = getAdminId(req);

    if (!validateObjectId(id)) {
      return failure(res, 400, 'Invalid agent ID format', 'VALIDATION_ERROR');
    }

    const agent = await Agent.findById(id).lean();
    if (!agent) {
      return failure(res, 404, 'Agent not found', 'NOT_FOUND');
    }

    const deletedSnapshot = {
      _id: agent._id,
      fullName: agent.fullName,
      email: agent.email,
      agency: agent.agency,
    };

    const profilePath = resolveAgentProfilePicturePath(agent.profilePicture);
    const { deletedCount } = await Agent.deleteOne({ _id: agent._id });

    if (deletedCount === 0) {
      return failure(res, 404, 'Agent not found', 'NOT_FOUND');
    }

    setImmediate(() => {
      const tasks = [];
      if (profilePath) {
        tasks.push(
          runWithTimeout(uploadService.delete(profilePath), 2500).catch((error) => {
            logger.warn('Failed to delete agent profile picture', { error: error.message });
          })
        );
      }
      if (adminId) {
        tasks.push(
          ActivityLog.create({
            actor: { actorType: 'admin', actorId: new Types.ObjectId(adminId) },
            action: 'delete',
            resource: { resourceType: 'agent', resourceId: agent._id },
            description: 'Agent permanently deleted by admin',
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

    return success(res, 'Agent deleted permanently', { deleted: deletedSnapshot });
  } catch (error) {
    logger.error('Delete agent failed', { error: error.message, stack: error.stack });
    return failure(res, 500, 'Failed to delete agent', 'SERVER_ERROR', error.message);
  }
});

const updateAgentProfilePicture = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const removeRequested = toBoolean(req.body?.removeProfilePicture);

    if (!id || !validateObjectId(id)) {
      return failure(res, 400, 'Invalid agent ID format');
    }

    const agent = await Agent.findById(id);
    if (!agent) {
      return failure(res, 404, 'Agent not found', 'NOT_FOUND');
    }

    const previousPicture = agent.profilePicture;

    if (removeRequested && !req.file) {
      if (!isDefaultProfilePicture(previousPicture)) {
        const previousPicturePath = resolveAgentProfilePicturePath(previousPicture);
        if (previousPicturePath) {
          await uploadService.delete(previousPicturePath).catch((error) => {
            logger.warn('Failed to delete previous agent profile picture', { error: error.message });
          });
        }
      }

      agent.profilePicture = DEFAULT_PROFILE_PICTURE;
      await agent.save();

      const safeAgent = buildSafeAgent(agent);
      safeAgent.profilePictureUrl = uploadService.getAgentProfileImageUrl(agent.profilePicture);
      return success(res, 'Profile picture removed', { agent: safeAgent }, 200);
    }

    if (!req.file) {
      return failure(res, 400, 'No profile picture provided');
    }

    const uploaded = await uploadService.upload(req.file, 'agents', {
      generateThumbnail: false,
    });

    const storedFilename =
      uploadService.toStoredProfileFilename(uploaded.filename) ||
      uploadService.toStoredProfileFilename(uploaded.path);
    if (!storedFilename) {
      return failure(res, 500, 'Failed to resolve uploaded filename', 'SERVER_ERROR');
    }

    agent.profilePicture = storedFilename;
    await agent.save();

    const previousStored = uploadService.toStoredProfileFilename(previousPicture);
    if (
      previousStored &&
      previousStored !== storedFilename &&
      !isDefaultProfilePicture(previousPicture)
    ) {
      const previousPicturePath = resolveAgentProfilePicturePath(previousPicture);
      if (previousPicturePath) {
        await uploadService.delete(previousPicturePath).catch((error) => {
          logger.warn('Failed to delete previous agent profile picture', { error: error.message });
        });
      }
    }

    const safeAgent = buildSafeAgent(agent);
    safeAgent.profilePictureUrl = uploadService.getAgentProfileImageUrl(agent.profilePicture);
    const responseData = uploadService.buildStandardResponse(
      uploaded,
      { images: 'agents' },
      { agent: safeAgent }
    );
    return success(res, 'Profile picture updated', responseData, 200);
  } catch (error) {
    logger.error('Update agent profile picture failed', { error: error.message, stack: error.stack });
    return failure(res, 500, 'Failed to update profile picture', 'SERVER_ERROR', error.message);
  }
});

module.exports = {
  sendAgentInvitation,
  listAgentsForDropdown,
  listAgents,
  getAgentDetails,
  updateAgent,
  updateAgentProfilePicture,
  verifyAgent,
  deleteAgent,
};
