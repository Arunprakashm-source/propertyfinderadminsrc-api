const asyncHandler = require('express-async-handler');
const mongoose = require('mongoose');
const UsersModel = require('../models/usersModel');
const ActivityLog = require('../models/activityLogModel');
const CountriesModel = require('../models/countriesModel');
const uploadService = require('../services/uploadService');
const { success, failure } = require('../utils/helpers');
const { logger } = require('../utils/logger');

// Helper to get admin ID from request
const getAdminId = (req) => {
  return req.admin?.id || req.admin?._id || req.user?.id || req.user?._id;
};

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
 *     summary: Update user status (activate/deactivate, ban/unban)
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
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               isActive:
 *                 type: boolean
 *               isBanned:
 *                 type: boolean
 *               bannedReason:
 *                 type: string
 *                 minLength: 10
 *     responses:
 *       200:
 *         description: User status updated successfully
 *       400:
 *         description: Validation error
 *       404:
 *         description: User not found
 */
const updateUserStatus = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const { isActive, isBanned, bannedReason } = req.body;
    const adminId = getAdminId(req);

    // Minimal validation
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return failure(res, 400, 'Invalid user ID format');
    }

    // At least one field must be provided
    if (typeof isActive === 'undefined' && typeof isBanned === 'undefined' && !bannedReason) {
      return failure(res, 400, 'At least one field (isActive, isBanned, or bannedReason) must be provided');
    }

    // Validate boolean types
    if (typeof isActive !== 'undefined' && typeof isActive !== 'boolean') {
      return failure(res, 400, 'isActive must be a boolean');
    }
    if (typeof isBanned !== 'undefined' && typeof isBanned !== 'boolean') {
      return failure(res, 400, 'isBanned must be a boolean');
    }

    const user = await UsersModel.findById(id);
    if (!user) {
      return failure(res, 404, 'User not found');
    }

    // Track changes for activity log
    const changes = {
      before: {},
      after: {},
    };

    // Handle ban/unban logic
    if (typeof isBanned !== 'undefined') {
      changes.before.isBanned = user.isBanned;
      changes.before.bannedReason = user.bannedReason;
      changes.before.bannedAt = user.bannedAt;
      changes.before.bannedBy = user.bannedBy;
      changes.before.isActive = user.isActive;

      if (isBanned === true) {
        // Banning user
        if (!bannedReason || typeof bannedReason !== 'string' || bannedReason.trim().length < 10) {
          return failure(res, 400, 'bannedReason is required and must be at least 10 characters when banning a user');
        }
        user.isBanned = true;
        user.bannedReason = bannedReason.trim();
        user.bannedAt = new Date();
        user.bannedBy = adminId ? new mongoose.Types.ObjectId(adminId) : null;
        user.isActive = false; // Automatically deactivate when banned

        changes.after.isBanned = true;
        changes.after.bannedReason = bannedReason.trim();
        changes.after.bannedAt = user.bannedAt;
        changes.after.bannedBy = user.bannedBy;
        changes.after.isActive = false;
      } else {
        // Unbanning user - automatically activate unless explicitly set to false
        user.isBanned = false;
        user.bannedReason = null;
        user.bannedAt = null;
        user.bannedBy = null;
        
        // Automatically activate when unbanning, unless isActive is explicitly set to false
        if (typeof isActive === 'undefined') {
          user.isActive = true;
        } else {
          user.isActive = isActive;
        }

        changes.after.isBanned = false;
        changes.after.bannedReason = null;
        changes.after.bannedAt = null;
        changes.after.bannedBy = null;
        changes.after.isActive = user.isActive;
      }
    }

    // Handle isActive separately (if not already set by ban/unban logic)
    if (typeof isActive !== 'undefined' && typeof isBanned === 'undefined') {
      changes.before.isActive = user.isActive;
      user.isActive = isActive;
      changes.after.isActive = isActive;
    }

    await user.save();

    // Populate bannedBy for response
    await user.populate('bannedBy', 'firstName lastName email');

    // Log to ActivityLog
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
        description: 'User status updated by admin',
        changes,
        requestDetails: {
          ipAddress: req.ip || req.connection.remoteAddress,
          userAgent: req.get('user-agent'),
        },
        status: 'success',
        timestamp: new Date(),
      });
    } catch (logError) {
      logger.warn('Failed to log user status update to ActivityLog', { error: logError.message });
    }

    return success(res, 'User status updated successfully', {
      user: {
        _id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        isActive: user.isActive,
        isBanned: user.isBanned,
        bannedReason: user.bannedReason,
        bannedAt: user.bannedAt,
        bannedBy: user.bannedBy,
        updatedAt: user.updatedAt,
      },
    });
  } catch (error) {
    logger.error('Update user status failed', { error: error.message, stack: error.stack });
    return failure(res, 500, 'Failed to update user status', 'ERROR', error.message);
  }
});

/**
 * @swagger
 * /users/{id}:
 *   delete:
 *     summary: Delete user account (soft delete)
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
 *         description: User account deleted successfully
 *       404:
 *         description: User not found
 */
const deleteUser = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const adminId = getAdminId(req);

    // Minimal validation
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return failure(res, 400, 'Invalid user ID format');
    }

    const user = await UsersModel.findById(id);
    if (!user) {
      return failure(res, 404, 'User not found');
    }

    // Soft delete: set isActive=false (deletedAt/deletedBy fields not in schema)
    user.isActive = false;

    await user.save();

    // Log to ActivityLog
    try {
      await ActivityLog.create({
        actor: {
          actorType: 'admin',
          actorId: adminId ? new mongoose.Types.ObjectId(adminId) : null,
        },
        action: 'delete',
        resource: {
          resourceType: 'user',
          resourceId: user._id,
        },
        description: 'User account deleted by admin',
        metadata: {
          userId: user._id.toString(),
          email: user.email,
        },
        requestDetails: {
          ipAddress: req.ip || req.connection.remoteAddress,
          userAgent: req.get('user-agent'),
        },
        status: 'success',
        timestamp: new Date(),
      });
    } catch (logError) {
      logger.warn('Failed to log user deletion to ActivityLog', { error: logError.message });
    }

    return success(res, 'User account deleted successfully', {});
  } catch (error) {
    logger.error('Delete user failed', { error: error.message, stack: error.stack });
    return failure(res, 500, 'Failed to delete user', 'ERROR', error.message);
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
  updateUserStatus,
  deleteUser,
  getUserActivityLog,
};
