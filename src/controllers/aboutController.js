const asyncHandler = require('express-async-handler');
const { getAboutPage, saveAboutPage } = require('../services/aboutService');
const { success, failure } = require('../utils/helpers');
const { logger } = require('../utils/logger');

const getAboutAdmin = asyncHandler(async (req, res) => {
  try {
    const data = await getAboutPage();
    return success(res, 'About CMS data fetched successfully', data);
  } catch (error) {
    logger.error('Get about admin failed', { error: error.message, stack: error.stack });
    return failure(res, 500, 'Failed to fetch about CMS data', 'SERVER_ERROR', error.message);
  }
});

const mutateAboutAdmin = asyncHandler(async (req, res) => {
  try {
    const action = String(req.body?.action || '').trim().toLowerCase();
    const adminId = req.admin?._id;

    if (action === 'save') {
      const data = await saveAboutPage(
        {
          settings: req.body.settings || {},
          timeline: req.body.timeline || [],
        },
        adminId
      );
      return success(res, 'About page saved successfully', data);
    }

    return failure(res, 400, 'Invalid action. Use save', 'VALIDATION_ERROR');
  } catch (error) {
    logger.error('Mutate about admin failed', { error: error.message, stack: error.stack });
    return failure(res, 500, 'Failed to save about page', 'SERVER_ERROR', error.message);
  }
});

module.exports = { getAboutAdmin, mutateAboutAdmin };
