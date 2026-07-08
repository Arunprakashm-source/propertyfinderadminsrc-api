const asyncHandler = require('express-async-handler');
const { getAboutPage, saveAboutPage } = require('../services/aboutService');
const { success, failure } = require('../utils/helpers');
const { logger } = require('../utils/logger');

/**
 * @swagger
 * /cms/about:
 *   get:
 *     summary: Get About Us CMS data
 *     description: Returns page settings and success timeline entries for the About Us admin editor.
 *     tags: [CMS About]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: About CMS data fetched successfully
 *       500:
 *         description: Server error
 */
const getAboutAdmin = asyncHandler(async (req, res) => {
  try {
    const data = await getAboutPage();
    return success(res, 'About CMS data fetched successfully', data);
  } catch (error) {
    logger.error('Get about admin failed', { error: error.message, stack: error.stack });
    return failure(res, 500, 'Failed to fetch about CMS data', 'SERVER_ERROR', error.message);
  }
});

/**
 * @swagger
 * /cms/about:
 *   post:
 *     summary: Save About Us CMS content
 *     description: >
 *       Consolidated admin write endpoint. Supported action: `save`.
 *       Persists hero, business section, stats, CTA, SEO, and timeline entries.
 *     tags: [CMS About]
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
 *                 description: About page settings (hero, business, stats, CTA, SEO).
 *               timeline:
 *                 type: array
 *                 description: Success timeline entries.
 *                 items:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     month:
 *                       type: string
 *                     day:
 *                       type: string
 *                     year:
 *                       type: string
 *                     title:
 *                       type: string
 *                     description:
 *                       type: string
 *                     displayOrder:
 *                       type: integer
 *     responses:
 *       200:
 *         description: About page saved successfully
 *       400:
 *         description: Invalid action
 *       500:
 *         description: Server error
 */
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
