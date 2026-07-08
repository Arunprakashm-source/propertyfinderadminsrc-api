const asyncHandler = require('express-async-handler');
const uploadService = require('../services/uploadService');
const {
  getTestimonialAdminBundle,
  saveTestimonialSettings,
  saveTestimonial,
  deleteTestimonial,
  normalizeImageFilename,
} = require('../services/testimonialService');
const { success, failure } = require('../utils/helpers');
const { logger } = require('../utils/logger');

/**
 * @swagger
 * /cms/testimonials:
 *   get:
 *     summary: Get Testimonials CMS data
 *     description: >
 *       Returns home testimonials section settings, paginated testimonials,
 *       and optional single testimonial when `testimonialId` is provided.
 *     tags: [CMS Testimonials]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: testimonialId
 *         schema:
 *           type: string
 *         description: Optional testimonial ObjectId for detail edit.
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by name, role, quote, or company.
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 50
 *           default: 10
 *     responses:
 *       200:
 *         description: Testimonials CMS data fetched successfully
 *       500:
 *         description: Server error
 */
const getTestimonialAdmin = asyncHandler(async (req, res) => {
  try {
    const data = await getTestimonialAdminBundle({
      search: req.query.search,
      page: req.query.page,
      limit: req.query.limit,
      testimonialId: req.query.testimonialId,
    });
    return success(res, 'Testimonials CMS data fetched successfully', data);
  } catch (error) {
    logger.error('Get testimonials admin failed', { error: error.message, stack: error.stack });
    return failure(res, 500, 'Failed to fetch testimonials CMS data', 'SERVER_ERROR', error.message);
  }
});

/**
 * @swagger
 * /cms/testimonials:
 *   post:
 *     summary: Testimonials CMS mutations
 *     description: >
 *       Consolidated admin write endpoint.
 *       Supported actions: `save-settings`, `save-testimonial`, `delete-testimonial`.
 *       For `save-testimonial`, send multipart/form-data with optional `image` file.
 *     tags: [CMS Testimonials]
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
 *                 enum: [save-settings, save-testimonial, delete-testimonial]
 *               settings:
 *                 type: object
 *                 description: Required for save-settings (sectionTitle, sectionSubtitle).
 *               testimonialId:
 *                 type: string
 *                 description: Required for delete-testimonial; optional for save-testimonial (update).
 *               name:
 *                 type: string
 *                 description: Customer name.
 *               title:
 *                 type: string
 *                 description: Role or designation (e.g. Customer).
 *               content:
 *                 type: string
 *                 description: Testimonial quote text.
 *               rating:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 5
 *               displayOrder:
 *                 type: integer
 *               isActive:
 *                 type: boolean
 *               image:
 *                 type: string
 *                 description: Existing stored filename when not uploading a new file.
 *               removeImage:
 *                 type: boolean
 *               search:
 *                 type: string
 *               page:
 *                 type: integer
 *               limit:
 *                 type: integer
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [action]
 *             properties:
 *               action:
 *                 type: string
 *                 enum: [save-settings, save-testimonial, delete-testimonial]
 *               testimonialId:
 *                 type: string
 *               name:
 *                 type: string
 *               title:
 *                 type: string
 *               content:
 *                 type: string
 *               rating:
 *                 type: integer
 *               displayOrder:
 *                 type: integer
 *               isActive:
 *                 type: boolean
 *               image:
 *                 type: string
 *                 format: binary
 *               removeImage:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Settings saved, testimonial saved, or testimonial deleted successfully
 *       400:
 *         description: Validation error
 *       404:
 *         description: Testimonial not found
 *       500:
 *         description: Server error (including image upload failure)
 */
const mutateTestimonialAdmin = asyncHandler(async (req, res) => {
  try {
    const action = String(req.body?.action || '').trim().toLowerCase();
    const adminId = req.admin?._id;

    if (action === 'save-settings') {
      await saveTestimonialSettings(req.body.settings || {}, adminId);
      const data = await getTestimonialAdminBundle({
        search: req.body.search,
        page: req.body.page,
        limit: req.body.limit,
      });
      return success(res, 'Testimonial section settings saved successfully', data);
    }

    if (action === 'save-testimonial') {
      const payload = { ...req.body };

      if (req.body?.removeImage === true || req.body?.removeImage === 'true') {
        payload.removeImage = true;
      } else if (req.file) {
        try {
          const uploaded = await uploadService.upload(req.file, 'testimonial', {
            generateThumbnail: false,
          });
          payload.image =
            uploadService.toStoredProfileFilename(uploaded.filename) || uploaded.filename || '';
        } catch (error) {
          logger.error('Testimonial image upload failed', { error: error.message });
          return failure(res, 500, 'Failed to upload profile image', 'SERVER_ERROR');
        }
      } else if (req.body?.image) {
        payload.image = normalizeImageFilename(req.body.image);
      }

      const testimonial = await saveTestimonial(payload, adminId);
      return success(res, 'Testimonial saved successfully', { testimonial });
    }

    if (action === 'delete-testimonial') {
      const testimonialId = req.body.testimonialId || req.body.id;
      await deleteTestimonial(testimonialId);
      const data = await getTestimonialAdminBundle({
        search: req.body.search,
        page: req.body.page,
        limit: req.body.limit,
      });
      return success(res, 'Testimonial deleted successfully', data);
    }

    return failure(
      res,
      400,
      'Invalid action. Use save-settings, save-testimonial, or delete-testimonial',
      'VALIDATION_ERROR'
    );
  } catch (error) {
    logger.error('Mutate testimonials admin failed', { error: error.message, stack: error.stack });
    const status = /not found/i.test(error.message) ? 404 : 500;
    return failure(
      res,
      status,
      error.message || 'Failed to save testimonial data',
      status === 404 ? 'NOT_FOUND' : 'SERVER_ERROR',
      error.message
    );
  }
});

module.exports = { getTestimonialAdmin, mutateTestimonialAdmin };
