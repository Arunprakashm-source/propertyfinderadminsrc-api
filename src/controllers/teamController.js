const asyncHandler = require('express-async-handler');
const uploadService = require('../services/uploadService');
const {
  getTeamAdminBundle,
  saveTeamSettings,
  saveTeamMember,
  deleteTeamMember,
  normalizeImageFilename,
} = require('../services/teamService');
const { success, failure } = require('../utils/helpers');
const { logger } = require('../utils/logger');

const getTeamAdmin = asyncHandler(async (req, res) => {
  try {
    const data = await getTeamAdminBundle({
      search: req.query.search,
      page: req.query.page,
      limit: req.query.limit,
      memberId: req.query.memberId,
    });
    return success(res, 'Team CMS data fetched successfully', data);
  } catch (error) {
    logger.error('Get team admin failed', { error: error.message, stack: error.stack });
    return failure(res, 500, 'Failed to fetch team CMS data', 'SERVER_ERROR', error.message);
  }
});

const mutateTeamAdmin = asyncHandler(async (req, res) => {
  try {
    const action = String(req.body?.action || '').trim().toLowerCase();
    const adminId = req.admin?._id;

    if (action === 'save-settings') {
      await saveTeamSettings(req.body.settings || {}, adminId);
      const data = await getTeamAdminBundle({
        search: req.body.search,
        page: req.body.page,
        limit: req.body.limit,
      });
      return success(res, 'Team page settings saved successfully', data);
    }

    if (action === 'save-member') {
      const payload = { ...req.body };

      if (req.body?.removeImage === true || req.body?.removeImage === 'true') {
        payload.removeImage = true;
      } else if (req.file) {
        try {
          const uploaded = await uploadService.upload(req.file, 'team', {
            generateThumbnail: false,
          });
          payload.profileImage =
            uploadService.toStoredProfileFilename(uploaded.filename) || uploaded.filename || '';
        } catch (error) {
          logger.error('Team member image upload failed', { error: error.message });
          return failure(res, 500, 'Failed to upload profile image', 'SERVER_ERROR');
        }
      } else if (req.body?.profileImage) {
        payload.profileImage = normalizeImageFilename(req.body.profileImage);
      }

      const member = await saveTeamMember(payload);
      return success(res, 'Team member saved successfully', { member });
    }

    if (action === 'delete-member') {
      const memberId = req.body.memberId || req.body.id;
      await deleteTeamMember(memberId);
      const data = await getTeamAdminBundle({
        search: req.body.search,
        page: req.body.page,
        limit: req.body.limit,
      });
      return success(res, 'Team member deleted successfully', data);
    }

    return failure(
      res,
      400,
      'Invalid action. Use save-settings, save-member, or delete-member',
      'VALIDATION_ERROR'
    );
  } catch (error) {
    logger.error('Mutate team admin failed', { error: error.message, stack: error.stack });
    const status = /not found/i.test(error.message) ? 404 : 500;
    return failure(
      res,
      status,
      error.message || 'Failed to save team data',
      status === 404 ? 'NOT_FOUND' : 'SERVER_ERROR',
      error.message
    );
  }
});

module.exports = { getTeamAdmin, mutateTeamAdmin };
