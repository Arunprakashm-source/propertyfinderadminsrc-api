const asyncHandler = require('express-async-handler');
const { getContactAdminBundle, saveContactPage } = require('../services/contactService');
const { success, failure } = require('../utils/helpers');
const { logger } = require('../utils/logger');

/**
 * @swagger
 * /cms/contact:
 *   get:
 *     summary: Get Contact Us CMS data
 *     description: >
 *       Returns contact page settings, form subject options, office locations,
 *       and recent contact form submissions for the admin editor.
 *     tags: [CMS Contact]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Contact CMS data fetched successfully
 *       500:
 *         description: Server error
 */
const getContactAdmin = asyncHandler(async (req, res) => {
  try {
    const data = await getContactAdminBundle();
    return success(res, 'Contact CMS data fetched successfully', data);
  } catch (error) {
    logger.error('Get contact admin failed', { error: error.message, stack: error.stack });
    return failure(res, 500, 'Failed to fetch contact CMS data', 'SERVER_ERROR', error.message);
  }
});

/**
 * @swagger
 * /cms/contact:
 *   post:
 *     summary: Save Contact Us CMS content
 *     description: >
 *       Consolidated admin write endpoint. Supported action: `save`.
 *       Persists hero, contact info, social links, form subjects, and office locations.
 *     tags: [CMS Contact]
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
 *                 enum: [save]
 *               settings:
 *                 type: object
 *                 description: Contact page settings (hero, email, phone, social, SEO).
 *               formSubjects:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Dropdown options for the public contact form.
 *               locations:
 *                 type: array
 *                 description: Office location cards.
 *                 items:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     city:
 *                       type: string
 *                     country:
 *                       type: string
 *                     locationType:
 *                       type: string
 *                     address:
 *                       type: string
 *                     mapUrl:
 *                       type: string
 *                     phone:
 *                       type: string
 *                     email:
 *                       type: string
 *                     displayOrder:
 *                       type: integer
 *                     isActive:
 *                       type: boolean
 *     responses:
 *       200:
 *         description: Contact page saved successfully
 *       400:
 *         description: Invalid action
 *       500:
 *         description: Server error
 */
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
