const crypto = require('crypto');
const asyncHandler = require('express-async-handler');

const Agency = require('../models/agenciesModel');
const Developer = require('../models/developersModel');
const Agent = require('../models/agentsModel');
const Countries = require('../models/countriesModel');
const Amenities = require('../models/amenitiesModel');
const PropertyType = require('../models/propertyTypeModel');
const ListingType = require('../models/listingTypeModel');
const { sendInvitationEmail } = require('../services/emailService');
const { success, failure, isEmail } = require('../utils/helpers');
const { logger } = require('../utils/logger');

const FRONTEND_URL = process.env.FRONTEND_URL || '';
const INVITATION_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

const normalizeEmail = (email = '') => email.toString().toLowerCase().trim();

// Check email across PF expert roles to avoid duplicates during invitation
const findExistingExpertByEmail = async (email) => {
  const normalizedEmail = normalizeEmail(email);

  const existingAgency = await Agency.findOne({ email: normalizedEmail });
  if (existingAgency) return { role: 'agency', entity: existingAgency };

  const existingDeveloper = await Developer.findOne({ email: normalizedEmail });
  if (existingDeveloper) return { role: 'developer', entity: existingDeveloper };

  const existingAgent = await Agent.findOne({ email: normalizedEmail });
  if (existingAgent) return { role: 'agent', entity: existingAgent };

  return null;
};

const sendAgencyInvitation = asyncHandler(async (req, res) => {
  try {
    const adminId = req.admin?.id || req.admin?._id || req.user?.id || req.user?._id;
    const { email, agencyName } = req.body || {};

    // if (!adminId) {
    //   return failure(res, 401, 'Unauthorized', 'UNAUTHORIZED');
    // }

    if (!email || !isEmail(email)) {
      return failure(res, 400, 'Valid email is required', 'VALIDATION_ERROR');
    }

    const existingExpert = await findExistingExpertByEmail(email);
    if (existingExpert) {
      return failure(
        res,
        409,
        `Email already used by ${existingExpert.role}`,
        'CONFLICT'
      );
    }

    const normalizedEmail = normalizeEmail(email);
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + INVITATION_EXPIRY_MS);
    const invitationLink = `${FRONTEND_URL}/agency/accept-invitation?token=${token}`;

    const agency = await Agency.create({
      email: normalizedEmail,
      agencyName: agencyName || undefined,
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
        agencyName || 'Agency',
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
    logger.error('Send agency invitation failed', { error: error.message });
    return failure(res, 500, 'Failed to send invitation', 'SERVER_ERROR');
  }
});

const sendDeveloperInvitation = asyncHandler(async (req, res) => {
  try {
    const adminId = req.admin?.id || req.admin?._id || req.user?.id || req.user?._id;
    const { email, name } = req.body || {};

    // if (!adminId) {
    //   return failure(res, 401, 'Unauthorized', 'UNAUTHORIZED');
    // }

    if (!email || !isEmail(email)) {
      return failure(res, 400, 'Valid email is required', 'VALIDATION_ERROR');
    }

    const existingExpert = await findExistingExpertByEmail(email);
    if (existingExpert) {
      return failure(
        res,
        409,
        `Email already used by ${existingExpert.role}`,
        'CONFLICT'
      );
    }

    const normalizedEmail = normalizeEmail(email);
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + INVITATION_EXPIRY_MS);
    const invitationLink = `${FRONTEND_URL}/developer/accept-invitation?token=${token}`;

    const developer = await Developer.create({
      email: normalizedEmail,
      name: name || undefined,
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
        name || 'Developer',
        invitationLink,
        'Admin Team',
        'Developer Partner'
      );
    } catch (emailError) {
      logger.warn('Failed to send developer invitation email', { error: emailError.message });
    }

    return success(res, 'Invitation sent successfully', {
      email: developer.email,
      invitationToken: token,
      expiresAt,
    });
  } catch (error) {
    logger.error('Send developer invitation failed', { error: error.message });
    return failure(res, 500, 'Failed to send invitation', 'SERVER_ERROR');
  }
});

// Master data API
// GET /admin/master-data?type=countries
// GET /admin/master-data?type=amenities
// GET /admin/master-data?type=propertytypes
// GET /admin/master-data?type=listingtypes
// or GET /admin/master-data?types=countries,amenities,propertytypes,listingtypes
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

    const supportedTypes = ['countries', 'amenities', 'propertytypes', 'listingtypes'];
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

    return success(res, 'Master data fetched successfully', data);
  } catch (error) {
    logger.error('Get master data failed', { error: error.message });
    return failure(res, 500, 'Failed to fetch master data', 'SERVER_ERROR');
  }
});

module.exports = {
  sendAgencyInvitation,
  sendDeveloperInvitation,
  getMasterData,
};

