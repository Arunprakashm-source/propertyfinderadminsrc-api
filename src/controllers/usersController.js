const asyncHandler = require('express-async-handler');
const mongoose = require('mongoose');
const UsersModel = require('../models/usersModel');
const ActivityLog = require('../models/activityLogModel');
const CountriesModel = require('../models/countriesModel');
const uploadService = require('../services/uploadService');
const {
  success,
  failure,
  sanitizeUser,
  formatPhoneNumber,
  isPhone,
  isEmail,
} = require('../utils/helpers');
const { logger } = require('../utils/logger');

const DEFAULT_PROFILE_PICTURE = 'profileless.png';

const getAdminId = (req) =>
  req.admin?.id || req.admin?._id || req.user?.id || req.user?._id;

const resolveUserProfilePicturePath = (profilePicture) => {
  if (!profilePicture || profilePicture === DEFAULT_PROFILE_PICTURE) {
    return null;
  }
  return profilePicture.includes('/') ? profilePicture : `img/user/${profilePicture}`;
};

const runWithTimeout = (promise, timeoutMs = 2500) =>
  Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Operation timed out')), timeoutMs);
    }),
  ]);

const cleanupDeletedUser = async ({ user, profilePath, adminId, deletedSnapshot, req }) => {
  if (profilePath) {
    await runWithTimeout(uploadService.delete(profilePath), 2500).catch((error) => {
      logger.warn('Failed to delete user profile picture', {
        error: error.message,
        profilePath,
      });
    });
  }

  if (!adminId) {
    return;
  }

  await ActivityLog.create({
    actor: {
      actorType: 'admin',
      actorId: new mongoose.Types.ObjectId(adminId),
    },
    action: 'delete',
    resource: {
      resourceType: 'user',
      resourceId: user._id,
    },
    description: 'User permanently deleted by admin',
    metadata: deletedSnapshot,
    requestDetails: {
      ipAddress: req.ip || req.connection?.remoteAddress,
      userAgent: req.get('user-agent'),
    },
    status: 'success',
    timestamp: new Date(),
  }).catch((logError) => {
    logger.warn('Failed to log user deletion to ActivityLog', { error: logError.message });
  });
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

const normalizePreferences = (preferences) => {
  if (!preferences || typeof preferences !== 'object' || Array.isArray(preferences)) {
    return preferences || {};
  }
  return {
    ...preferences,
    notificationSettings:
      preferences.notificationSettings
      && typeof preferences.notificationSettings === 'object'
      && !Array.isArray(preferences.notificationSettings)
        ? { ...preferences.notificationSettings }
        : preferences.notificationSettings,
  };
};

const buildSafeUser = (user) => {
  const safeUser = sanitizeUser(user);
  delete safeUser.access_token;
  delete safeUser.refresh_token;
  delete safeUser.refresh_token_expires_at;
  delete safeUser.token_expires_at;
  delete safeUser.passwordResetOTPHash;
  delete safeUser.passwordResetOTPExpires;
  safeUser.phoneCode = safeUser.phoneCode || null;
  safeUser.phoneNumberWithoutCode = safeUser.phoneNumberWithoutCode || null;
  safeUser.preferences = normalizePreferences(safeUser.preferences);
  return safeUser;
};

const applyStatusUpdates = (user, { isActive, isBanned, bannedReason }, adminId, changes) => {
  let updated = false;

  if (typeof isBanned !== 'undefined') {
    Object.assign(changes.before, pickStatusBefore(user));
    if (isBanned === true) {
      if (!bannedReason || typeof bannedReason !== 'string' || bannedReason.trim().length < 10) {
        return {
          updated: false,
          error: 'bannedReason is required and must be at least 10 characters when banning a user',
        };
      }
      user.isBanned = true;
      user.bannedReason = bannedReason.trim();
      user.bannedAt = new Date();
      user.bannedBy = adminId ? new mongoose.Types.ObjectId(adminId) : null;
      user.isActive = false;
    } else {
      user.isBanned = false;
      user.bannedReason = null;
      user.bannedAt = null;
      user.bannedBy = null;
      user.isActive = typeof isActive === 'undefined' ? true : isActive;
    }
    Object.assign(changes.after, pickStatusAfter(user));
    updated = true;
  } else if (typeof isActive !== 'undefined') {
    changes.before.isActive = user.isActive;
    user.isActive = isActive;
    changes.after.isActive = isActive;
    updated = true;
  }

  return { updated };
};

const pickStatusBefore = (user) => ({
  isBanned: user.isBanned,
  bannedReason: user.bannedReason,
  bannedAt: user.bannedAt,
  isActive: user.isActive,
});

const pickStatusAfter = (user) => ({
  isBanned: user.isBanned,
  bannedReason: user.bannedReason,
  bannedAt: user.bannedAt,
  isActive: user.isActive,
});

/**
 * @swagger
 * /users:
 *   get:
 *     summary: List all users with filters and pagination
 *     tags: [Admin - User Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search across firstName, lastName, email, phoneNumber
 *       - in: query
 *         name: isActive
 *         schema:
 *           type: boolean
 *         description: Filter by active status
 *       - in: query
 *         name: isBanned
 *         schema:
 *           type: boolean
 *         description: Filter by banned status
 *       - in: query
 *         name: country
 *         schema:
 *           type: string
 *         description: Filter by country ObjectId
 *       - in: query
 *         name: registrationDate
 *         schema:
 *           type: string
 *         description: Filter by registration date (YYYY-MM-DD or YYYY-MM-DD,YYYY-MM-DD)
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *           maximum: 100
 *         description: Items per page
 *     responses:
 *       200:
 *         description: Users fetched successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 */
const listUsers = asyncHandler(async (req, res) => {
  try {
    const {
      search,
      isActive,
      isBanned,
      country,
      registrationDate,
      page = 1,
      limit = 20,
    } = req.query;

    // Minimal validation
    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    if (isNaN(pageNum) || pageNum < 1) {
      return failure(res, 400, 'Page must be a positive integer');
    }
    if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
      return failure(res, 400, 'Limit must be between 1 and 100');
    }
    if (search && typeof search === 'string' && search.length > 200) {
      return failure(res, 400, 'Search query must be less than 200 characters');
    }
    if (country && !mongoose.Types.ObjectId.isValid(country)) {
      return failure(res, 400, 'Invalid country ID format');
    }

    // Build query
    const query = {};

    // Search filter (case-insensitive regex across firstName, lastName, email, phoneNumber)
    if (search) {
      const searchRegex = new RegExp(search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      query.$or = [
        { firstName: searchRegex },
        { lastName: searchRegex },
        { email: searchRegex },
        { phoneNumber: searchRegex },
      ];
    }

    // Status filters
    if (typeof isActive !== 'undefined') {
      query.isActive = isActive === true || isActive === 'true';
    }
    if (typeof isBanned !== 'undefined') {
      query.isBanned = isBanned === true || isBanned === 'true';
    }

    // Country filter
    if (country && mongoose.Types.ObjectId.isValid(country)) {
      query.country = new mongoose.Types.ObjectId(country);
    }

    // Registration date filter
    if (registrationDate) {
      const datePattern = /^\d{4}-\d{2}-\d{2}(,\d{4}-\d{2}-\d{2})?$/;
      if (!datePattern.test(registrationDate)) {
        return failure(res, 400, 'Invalid date format. Use YYYY-MM-DD or YYYY-MM-DD,YYYY-MM-DD');
      }
      const dates = registrationDate.split(',');
      if (dates.length === 2) {
        // Date range
        const startDate = new Date(dates[0].trim());
        const endDate = new Date(dates[1].trim());
        if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
          return failure(res, 400, 'Invalid date values');
        }
        endDate.setHours(23, 59, 59, 999); // End of day
        query.createdAt = { $gte: startDate, $lte: endDate };
      } else if (dates.length === 1) {
        // Single date (that day)
        const date = new Date(dates[0].trim());
        if (isNaN(date.getTime())) {
          return failure(res, 400, 'Invalid date value');
        }
        const startDate = new Date(date);
        startDate.setHours(0, 0, 0, 0);
        const endDate = new Date(date);
        endDate.setHours(23, 59, 59, 999);
        query.createdAt = { $gte: startDate, $lte: endDate };
      }
    }

    // Pagination
    const skip = (pageNum - 1) * limitNum;

    // Get total counts for statistics and users
    const [
      totalUsers,
      activeUsers,
      bannedUsers,
      verifiedEmails,
      verifiedPhones,
      filteredCount,
      users,
    ] = await Promise.all([
      UsersModel.countDocuments({}),
      UsersModel.countDocuments({ isActive: true }),
      UsersModel.countDocuments({ isBanned: true }),
      UsersModel.countDocuments({ isEmailVerified: true }),
      UsersModel.countDocuments({ isPhoneVerified: true }),
      UsersModel.countDocuments(query),
      UsersModel.find(query)
        .populate('country', 'name code')
        .select('_id firstName lastName email phoneNumber profilePicture country isActive isBanned authProvider isEmailVerified isPhoneVerified savedProperties searchAlerts contactedProperties lastLogin createdAt')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
    ]);

    // Format users with counts; attach full profile image URL (local or CloudFront)
    const formattedUsers = users.map((user) => ({
      _id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      phoneNumber: user.phoneNumber,
      profilePicture: user.profilePicture,
      profilePictureUrl: uploadService.getUserProfileImageUrl(user.profilePicture),
      country: user.country,
      isActive: user.isActive,
      isBanned: user.isBanned,
      authProvider: user.authProvider,
      isEmailVerified: user.isEmailVerified,
      isPhoneVerified: user.isPhoneVerified,
      savedPropertiesCount: user.savedProperties?.length || 0,
      searchAlertsCount: user.searchAlerts?.length || 0,
      contactedPropertiesCount: user.contactedProperties?.length || 0,
      lastLogin: user.lastLogin,
      createdAt: user.createdAt,
    }));

    // Calculate pagination
    const totalPages = Math.ceil(filteredCount / limitNum);
    const hasNextPage = pageNum < totalPages;
    const hasPrevPage = pageNum > 1;

    return success(res, 'Users fetched successfully', {
      users: formattedUsers,
      pagination: {
        currentPage: pageNum,
        totalPages,
        totalUsers: filteredCount,
        limit: limitNum,
        hasNextPage,
        hasPrevPage,
      },
      counts: {
        totalUsers,
        activeUsers,
        bannedUsers,
        verifiedEmails,
        verifiedPhones,
      },
    });
  } catch (error) {
    logger.error('List users failed', { error: error.message, stack: error.stack });
    return failure(res, 500, 'Failed to fetch users', 'ERROR', error.message);
  }
});

/**
 * @swagger
 * /users/{id}:
 *   get:
 *     summary: Get full user details with activity summary
 *     tags: [Admin - User Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: User ObjectId
 *     responses:
 *       200:
 *         description: User details fetched successfully
 *       404:
 *         description: User not found
 */
const getUserDetails = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;

    // Minimal validation
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return failure(res, 400, 'Invalid user ID format');
    }

    const user = await UsersModel.findById(id)
      .populate('country', 'name code phoneCode flag isActive')
      .populate('savedProperties.property', 'title listingType price images')
      .populate('searchAlerts.alertType', 'name')
      .populate('contactedProperties.property', 'title listingType price images')
      .populate('contactedProperties.agent', 'firstName lastName email phoneNumber')
      .populate('bannedBy', 'firstName lastName email')
      .lean();

    if (!user) {
      return failure(res, 404, 'User not found');
    }

    // Calculate activity summary
    const totalSavedProperties = user.savedProperties?.length || 0;
    const totalSearchAlerts = user.searchAlerts?.length || 0;
    const activeSearchAlerts = user.searchAlerts?.filter((alert) => alert.isActive !== false).length || 0;
    const totalContactedProperties = user.contactedProperties?.length || 0;
    const totalReports = user.contactedProperties?.filter((cp) => cp.isReported === true).length || 0;

    // Get recent search history (last 10)
    const recentSearchHistory = (user.searchHistory || [])
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, 10)
      .map((search) => ({
        searchQuery: search.searchQuery,
        searchType: search.searchType,
        filters: search.filters,
        resultsCount: search.resultsCount,
        timestamp: search.timestamp,
      }));

    // Calculate account age
    const accountAge = user.createdAt
      ? Math.floor((Date.now() - new Date(user.createdAt).getTime()) / (1000 * 60 * 60 * 24))
      : 0;

    // Get last activity date
    let lastActivityDate = user.createdAt;
    if (user.lastLogin && new Date(user.lastLogin) > new Date(lastActivityDate)) {
      lastActivityDate = user.lastLogin;
    }
    if (user.searchHistory && user.searchHistory.length > 0) {
      const latestSearch = user.searchHistory
        .map((s) => s.timestamp)
        .sort((a, b) => new Date(b) - new Date(a))[0];
      if (latestSearch && new Date(latestSearch) > new Date(lastActivityDate)) {
        lastActivityDate = latestSearch;
      }
    }
    if (user.contactedProperties && user.contactedProperties.length > 0) {
      const latestContact = user.contactedProperties
        .map((cp) => cp.contactedAt)
        .sort((a, b) => new Date(b) - new Date(a))[0];
      if (latestContact && new Date(latestContact) > new Date(lastActivityDate)) {
        lastActivityDate = latestContact;
      }
    }

    const profilePictureUrl = uploadService.getUserProfileImageUrl(user.profilePicture);
    return success(res, 'User details fetched successfully', {
      user: {
        ...user,
        profilePictureUrl: profilePictureUrl || null,
        savedProperties: user.savedProperties || [],
        searchAlerts: user.searchAlerts || [],
        contactedProperties: user.contactedProperties || [],
        preferences: user.preferences || {},
        location: user.location || {},
      },
      activity: {
        totalSavedProperties,
        totalSearchAlerts,
        activeSearchAlerts,
        totalContactedProperties,
        totalReports,
        recentSearchHistory,
        accountAge,
        lastActivityDate,
      },
    });
  } catch (error) {
    logger.error('Get user details failed', { error: error.message, stack: error.stack });
    return failure(res, 500, 'Failed to fetch user details', 'ERROR', error.message);
  }
});

/**
 * @swagger
 * /users/{id}:
 *   put:
 *     summary: Update user profile and account status (admin)
 *     tags: [Admin - User Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: User ObjectId
 *     description: |
 *       Updates profile fields (same as consumer profile API) and moderation status.
 *       Send only fields to change. Banning requires bannedReason (min 10 chars).
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               firstName:
 *                 type: string
 *               lastName:
 *                 type: string
 *               email:
 *                 type: string
 *                 format: email
 *               phoneNumber:
 *                 type: string
 *               phoneCode:
 *                 type: string
 *                 example: "+971"
 *               countryId:
 *                 type: string
 *               preferences:
 *                 type: object
 *               location:
 *                 type: object
 *               isEmailVerified:
 *                 type: boolean
 *               isPhoneVerified:
 *                 type: boolean
 *               isActive:
 *                 type: boolean
 *               isBanned:
 *                 type: boolean
 *               bannedReason:
 *                 type: string
 *                 minLength: 10
 *     responses:
 *       200:
 *         description: User updated successfully
 *       400:
 *         description: Validation error
 *       404:
 *         description: User or country not found
 *       409:
 *         description: Email already in use
 */
const updateUser = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const adminId = getAdminId(req);
    const body = req.body || {};

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return failure(res, 400, 'Invalid user ID format');
    }

    const {
      firstName,
      lastName,
      email,
      phoneNumber,
      countryId,
      phoneCode,
      preferences,
      location,
      bannedReason,
    } = body;

    const isActiveParsed = parseOptionalBoolean(body.isActive, 'isActive');
    if (isActiveParsed.error) return failure(res, 400, isActiveParsed.error);
    const isBannedParsed = parseOptionalBoolean(body.isBanned, 'isBanned');
    if (isBannedParsed.error) return failure(res, 400, isBannedParsed.error);
    const isEmailVerifiedParsed = parseOptionalBoolean(body.isEmailVerified, 'isEmailVerified');
    if (isEmailVerifiedParsed.error) return failure(res, 400, isEmailVerifiedParsed.error);
    const isPhoneVerifiedParsed = parseOptionalBoolean(body.isPhoneVerified, 'isPhoneVerified');
    if (isPhoneVerifiedParsed.error) return failure(res, 400, isPhoneVerifiedParsed.error);

    const isActive = isActiveParsed.value;
    const isBanned = isBannedParsed.value;

    const user = await UsersModel.findById(id);
    if (!user) {
      return failure(res, 404, 'User not found');
    }

    const changes = { before: {}, after: {} };
    let updatesApplied = false;
    let country;

    const trackChange = (field, beforeVal, afterVal) => {
      if (JSON.stringify(beforeVal) !== JSON.stringify(afterVal)) {
        changes.before[field] = beforeVal;
        changes.after[field] = afterVal;
      }
    };

    if (typeof firstName !== 'undefined') {
      const normalizedFirstName = typeof firstName === 'string' ? firstName.trim() : firstName;
      if (!normalizedFirstName) {
        return failure(res, 400, 'Invalid first name provided');
      }
      trackChange('firstName', user.firstName, normalizedFirstName);
      user.firstName = normalizedFirstName;
      updatesApplied = true;
    }

    if (typeof lastName !== 'undefined') {
      const normalizedLastName = typeof lastName === 'string' ? lastName.trim() : lastName;
      if (!normalizedLastName) {
        return failure(res, 400, 'Invalid last name provided');
      }
      trackChange('lastName', user.lastName, normalizedLastName);
      user.lastName = normalizedLastName;
      updatesApplied = true;
    }

    if (typeof email !== 'undefined') {
      const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
      if (!isEmail(normalizedEmail)) {
        return failure(res, 400, 'A valid email is required');
      }
      const duplicate = await UsersModel.findOne({
        email: normalizedEmail,
        _id: { $ne: user._id },
      }).select('_id');
      if (duplicate) {
        return failure(res, 409, 'Email is already in use', 'CONFLICT');
      }
      trackChange('email', user.email, normalizedEmail);
      user.email = normalizedEmail;
      updatesApplied = true;
    }

    if (countryId) {
      if (!mongoose.Types.ObjectId.isValid(countryId)) {
        return failure(res, 400, 'Invalid country ID format');
      }
      country = await CountriesModel.findById(countryId);
      if (!country) {
        return failure(res, 404, 'Selected country not found');
      }
      trackChange('country', user.country?.toString(), country._id.toString());
      user.country = country._id;
      updatesApplied = true;
    }

    let resolvedPhoneCode = (phoneCode || '').trim();
    if (!resolvedPhoneCode && country?.phoneCode) {
      resolvedPhoneCode = country.phoneCode;
    }

    if (typeof phoneNumber !== 'undefined') {
      const normalizedPhoneNumber = `${phoneNumber || ''}`.trim();
      if (!normalizedPhoneNumber) {
        return failure(res, 400, 'Invalid phone number provided');
      }
      if (!/^[\d\s()+-]+$/.test(normalizedPhoneNumber)) {
        return failure(res, 400, 'Phone number can contain only digits and +, -, (, )');
      }

      const localPhoneDigits = normalizedPhoneNumber.replace(/\D/g, '');
      if (localPhoneDigits.length < 6 || localPhoneDigits.length > 12) {
        return failure(res, 400, 'Phone number must be between 6 and 12 digits');
      }

      if (!resolvedPhoneCode) {
        const fallbackCountryId = country ? country._id : user.country;
        if (fallbackCountryId) {
          const fallbackCountry = await CountriesModel.findById(fallbackCountryId).select(
            'phoneCode'
          );
          if (fallbackCountry?.phoneCode) {
            resolvedPhoneCode = fallbackCountry.phoneCode;
          }
        }
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

      trackChange('phoneNumber', user.phoneNumber, normalizedPhone);
      user.phoneNumber = normalizedPhone;
      user.phoneCode = normalizedResolvedPhoneCode || null;
      user.phoneNumberWithoutCode = localPhoneDigits || null;
      updatesApplied = true;
    }

    if (preferences && typeof preferences === 'object' && !Array.isArray(preferences)) {
      user.preferences = normalizePreferences(user.preferences) || {};

      if (typeof preferences.currency !== 'undefined') {
        user.preferences.currency =
          String(preferences.currency || '').trim() || user.preferences.currency;
        updatesApplied = true;
      }
      if (typeof preferences.language !== 'undefined') {
        user.preferences.language =
          String(preferences.language || '').trim() || user.preferences.language;
        updatesApplied = true;
      }
      if (typeof preferences.savedSearches !== 'undefined') {
        user.preferences.savedSearches = toBoolean(preferences.savedSearches);
        updatesApplied = true;
      }
      if (
        preferences.notificationSettings
        && typeof preferences.notificationSettings === 'object'
        && !Array.isArray(preferences.notificationSettings)
      ) {
        const ns = preferences.notificationSettings;
        if (
          !user.preferences.notificationSettings
          || typeof user.preferences.notificationSettings !== 'object'
        ) {
          user.preferences.notificationSettings = {};
        }
        if (typeof ns.email !== 'undefined') {
          user.preferences.notificationSettings.email = toBoolean(ns.email);
          updatesApplied = true;
        }
        if (typeof ns.sms !== 'undefined') {
          user.preferences.notificationSettings.sms = toBoolean(ns.sms);
          updatesApplied = true;
        }
        if (typeof ns.push !== 'undefined') {
          user.preferences.notificationSettings.push = toBoolean(ns.push);
          updatesApplied = true;
        }
      }
    }

    if (location && typeof location === 'object' && !Array.isArray(location)) {
      user.location = user.location || {};
      if (typeof location.city !== 'undefined') {
        user.location.city = String(location.city || '').trim();
        updatesApplied = true;
      }
      if (typeof location.state !== 'undefined') {
        user.location.state = String(location.state || '').trim();
        updatesApplied = true;
      }
      if (typeof location.country !== 'undefined') {
        user.location.country = String(location.country || '').trim();
        updatesApplied = true;
      }
    }

    if (typeof isEmailVerifiedParsed.value !== 'undefined') {
      trackChange('isEmailVerified', user.isEmailVerified, isEmailVerifiedParsed.value);
      user.isEmailVerified = isEmailVerifiedParsed.value;
      updatesApplied = true;
    }

    if (typeof isPhoneVerifiedParsed.value !== 'undefined') {
      trackChange('isPhoneVerified', user.isPhoneVerified, isPhoneVerifiedParsed.value);
      user.isPhoneVerified = isPhoneVerifiedParsed.value;
      updatesApplied = true;
    }

    const statusResult = applyStatusUpdates(
      user,
      { isActive, isBanned, bannedReason },
      adminId,
      changes
    );
    if (statusResult.error) {
      return failure(res, 400, statusResult.error);
    }
    if (statusResult.updated) {
      updatesApplied = true;
    }

    if (!updatesApplied) {
      return failure(res, 400, 'No valid fields provided for update');
    }

    await user.save();
    await user.populate('country', 'name code phoneCode flag isActive');
    await user.populate('bannedBy', 'firstName lastName email');

    try {
      await ActivityLog.create({
        actor: {
          actorType: 'admin',
          actorId: adminId ? new mongoose.Types.ObjectId(adminId) : null,
        },
        action: 'update',
        resource: {
          resourceType: 'user',
          resourceId: user._id,
        },
        description: 'User updated by admin',
        changes,
        requestDetails: {
          ipAddress: req.ip || req.connection.remoteAddress,
          userAgent: req.get('user-agent'),
        },
        status: 'success',
        timestamp: new Date(),
      });
    } catch (logError) {
      logger.warn('Failed to log user update to ActivityLog', { error: logError.message });
    }

    const safeUser = buildSafeUser(user);
    const profilePictureUrl = uploadService.getUserProfileImageUrl(user.profilePicture);

    return success(res, 'User updated successfully', {
      user: {
        ...safeUser,
        profilePictureUrl: profilePictureUrl || null,
      },
    });
  } catch (error) {
    logger.error('Update user failed', { error: error.message, stack: error.stack });
    return failure(res, 500, 'Failed to update user', 'ERROR', error.message);
  }
});

/**
 * @swagger
 * /users/{id}:
 *   delete:
 *     summary: Permanently delete a user
 *     description: |
 *       Removes the user document from MongoDB (not a soft delete). Revokes tokens and
 *       removes the profile image from storage when applicable. Activity is logged before
 *       deletion. Use `PUT /users/{id}` with `isActive: false` if you only need to deactivate.
 *     tags: [Admin - User Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: User ObjectId
 *     responses:
 *       200:
 *         description: User permanently deleted
 *       401:
 *         description: Admin authentication required
 *       404:
 *         description: User not found or already deleted
 */
const deleteUser = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const adminId = getAdminId(req);

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return failure(res, 400, 'Invalid user ID format', 'VALIDATION_ERROR');
    }

    const user = await UsersModel.findById(id).lean();
    if (!user) {
      return failure(res, 404, 'User not found', 'NOT_FOUND');
    }

    const deletedSnapshot = {
      _id: user._id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      phoneNumber: user.phoneNumber,
    };

    const profilePath = resolveUserProfilePicturePath(user.profilePicture);
    const { deletedCount } = await UsersModel.deleteOne({ _id: user._id });

    if (deletedCount === 0) {
      return failure(res, 404, 'User not found', 'NOT_FOUND');
    }

    setImmediate(() => {
      cleanupDeletedUser({ user, profilePath, adminId, deletedSnapshot, req }).catch((error) => {
        logger.warn('Post-delete cleanup failed', { error: error.message, userId: user._id });
      });
    });

    return success(res, 'User deleted permanently', { deleted: deletedSnapshot });
  } catch (error) {
    logger.error('Delete user failed', { error: error.message, stack: error.stack });
    return failure(res, 500, 'Failed to delete user', 'SERVER_ERROR', error.message);
  }
});

/**
 * @swagger
 * /users/{id}/activity-log:
 *   get:
 *     summary: Get paginated user activity history
 *     tags: [Admin - User Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: User ObjectId
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *           maximum: 200
 *         description: Items per page
 *     responses:
 *       200:
 *         description: Activity log fetched successfully
 *       404:
 *         description: User not found
 */
const getUserActivityLog = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const { page = 1, limit = 50 } = req.query;

    // Minimal validation
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return failure(res, 400, 'Invalid user ID format');
    }

    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    if (isNaN(pageNum) || pageNum < 1) {
      return failure(res, 400, 'Page must be a positive integer');
    }
    if (isNaN(limitNum) || limitNum < 1 || limitNum > 200) {
      return failure(res, 400, 'Limit must be between 1 and 200');
    }

    const user = await UsersModel.findById(id).lean();
    if (!user) {
      return failure(res, 404, 'User not found');
    }

    // Pagination
    const skip = (pageNum - 1) * limitNum;

    let activities = [];
    let totalActivities = 0;

    // Try to get from ActivityLog first
    const activityLogs = await ActivityLog.find({
      $or: [
        { 'actor.actorId': new mongoose.Types.ObjectId(id), 'actor.actorType': 'user' },
        { 'resource.resourceId': new mongoose.Types.ObjectId(id), 'resource.resourceType': 'user' },
      ],
    })
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean();

    totalActivities = await ActivityLog.countDocuments({
      $or: [
        { 'actor.actorId': new mongoose.Types.ObjectId(id), 'actor.actorType': 'user' },
        { 'resource.resourceId': new mongoose.Types.ObjectId(id), 'resource.resourceType': 'user' },
      ],
    });

    if (activityLogs.length > 0) {
      // Use ActivityLog entries
      activities = activityLogs.map((log) => ({
        _id: log._id,
        action: log.action,
        description: log.description,
        details: {
          ...log.metadata,
          propertyId: log.resource?.resourceType === 'property' ? log.resource.resourceId : null,
          agentId: log.resource?.resourceType === 'agent' ? log.resource.resourceId : null,
          ipAddress: log.requestDetails?.ipAddress,
          ...log.requestDetails,
        },
        timestamp: log.timestamp,
      }));
    } else {
      // Synthesize from user data
      const synthesizedActivities = [];

      // Login activities
      if (user.lastLogin) {
        synthesizedActivities.push({
          _id: new mongoose.Types.ObjectId(),
          action: 'login',
          description: 'User logged in',
          details: {},
          timestamp: user.lastLogin,
        });
      }

      // Property saved activities
      if (user.savedProperties && user.savedProperties.length > 0) {
        user.savedProperties.forEach((saved) => {
          synthesizedActivities.push({
            _id: new mongoose.Types.ObjectId(),
            action: 'property_saved',
            description: 'Property saved to favorites',
            details: {
              propertyId: saved.property,
            },
            timestamp: saved.savedAt || user.createdAt,
          });
        });
      }

      // Property contacted activities
      if (user.contactedProperties && user.contactedProperties.length > 0) {
        user.contactedProperties.forEach((contacted) => {
          synthesizedActivities.push({
            _id: new mongoose.Types.ObjectId(),
            action: 'property_contacted',
            description: 'User contacted property/agent',
            details: {
              propertyId: contacted.property,
              agentId: contacted.agent,
              contactMethod: contacted.contactMethod,
            },
            timestamp: contacted.contactedAt || user.createdAt,
          });
        });
      }

      // Search performed activities
      if (user.searchHistory && user.searchHistory.length > 0) {
        user.searchHistory.forEach((search) => {
          synthesizedActivities.push({
            _id: new mongoose.Types.ObjectId(),
            action: 'search_performed',
            description: 'Search performed',
            details: {
              searchQuery: search.searchQuery,
              searchType: search.searchType,
              resultsCount: search.resultsCount,
            },
            timestamp: search.timestamp || user.createdAt,
          });
        });
      }

      // Alert created activities
      if (user.searchAlerts && user.searchAlerts.length > 0) {
        user.searchAlerts.forEach((alert) => {
          synthesizedActivities.push({
            _id: new mongoose.Types.ObjectId(),
            action: 'alert_created',
            description: 'Search alert created',
            details: {
              alertName: alert.alertName,
              alertType: alert.alertType,
            },
            timestamp: alert.createdAt || user.createdAt,
          });
        });
      }

      // Sort by timestamp desc and paginate
      synthesizedActivities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      totalActivities = synthesizedActivities.length;
      activities = synthesizedActivities.slice(skip, skip + limitNum);
    }

    // Calculate pagination
    const totalPages = Math.ceil(totalActivities / limitNum);
    const hasNextPage = pageNum < totalPages;
    const hasPrevPage = pageNum > 1;

    return success(res, 'Activity log fetched successfully', {
      activities,
      pagination: {
        currentPage: pageNum,
        totalPages,
        totalActivities,
        limit: limitNum,
        hasNextPage,
        hasPrevPage,
      },
    });
  } catch (error) {
    logger.error('Get user activity log failed', { error: error.message, stack: error.stack });
    return failure(res, 500, 'Failed to fetch activity log', 'ERROR', error.message);
  }
});

module.exports = {
  listUsers,
  getUserDetails,
  updateUser,
  deleteUser,
  getUserActivityLog,
};
