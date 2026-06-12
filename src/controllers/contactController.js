const asyncHandler = require('express-async-handler');
const { getContactAdminBundle, saveContactPage } = require('../services/contactService');
const { success, failure } = require('../utils/helpers');
const { logger } = require('../utils/logger');

const getContactAdmin = asyncHandler(async (req, res) => {
  try {
    const data = await getContactAdminBundle();
    return success(res, 'Contact CMS data fetched successfully', data);
  } catch (error) {
    logger.error('Get contact admin failed', { error: error.message, stack: error.stack });
    return failure(res, 500, 'Failed to fetch contact CMS data', 'SERVER_ERROR', error.message);
  }
});

const mutateContactAdmin = asyncHandler(async (req, res) => {
  try {
    const action = String(req.body?.action || '').trim().toLowerCase();
    const adminId = req.admin?._id;

    if (action === 'save') {
      await saveContactPage(
        {
          settings: req.body.settings || {},
          formSubjects: req.body.formSubjects || [],
          locations: req.body.locations || [],
        },
        adminId
      );
      const data = await getContactAdminBundle();
      return success(res, 'Contact page saved successfully', data);
    }

    return failure(res, 400, 'Invalid action. Use save', 'VALIDATION_ERROR');
  } catch (error) {
    logger.error('Mutate contact admin failed', { error: error.message, stack: error.stack });
    return failure(res, 500, 'Failed to save contact page', 'SERVER_ERROR', error.message);
  }
});

module.exports = { getContactAdmin, mutateContactAdmin };
