const asyncHandler = require('express-async-handler');
const uploadService = require('../services/uploadService');
const {
  getBannerAdminBundle,
  saveBannerSettings,
  saveBanner,
  deleteBanner,
  normalizeImageFilename,
} = require('../services/bannerService');
const { success, failure } = require('../utils/helpers');
const { logger } = require('../utils/logger');

/**
 * @swagger
 * /cms/banners:
 *   get:
 *     summary: Get Banner CMS data
 *     description: >
 *       Returns global carousel settings, placement options, paginated banners,
 *       and optional single banner when `bannerId` is provided.
 *     tags: [CMS Banners]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: bannerId
 *         schema:
 *           type: string
 *         description: Optional banner ObjectId for detail edit.
 *       - in: query
 *         name: placement
 *         schema:
 *           type: string
 *           enum: [home-page, search-page, listing-page, agent-page, agency-page, project-page]
 *         description: Filter banners by page placement.
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
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
 *         description: Banner CMS data fetched successfully
 *       500:
 *         description: Server error
 */
const getBannerAdmin = asyncHandler(async (req, res) => {
  try {
    const data = await getBannerAdminBundle({
      search: req.query.search,
      page: req.query.page,
      limit: req.query.limit,
      placement: req.query.placement,
      bannerId: req.query.bannerId,
    });
    return success(res, 'Banner CMS data fetched successfully', data);
  } catch (error) {
    logger.error('Get banner admin failed', { error: error.message, stack: error.stack });
    return failure(res, 500, 'Failed to fetch banner CMS data', 'SERVER_ERROR', error.message);
  }
});

const uploadBannerFile = async (file, fieldLabel) => {
  const uploaded = await uploadService.upload(file, 'banner', { generateThumbnail: false });
  return uploadService.toStoredProfileFilename(uploaded.filename) || uploaded.filename || '';
};

/**
 * @swagger
 * /cms/banners:
 *   post:
 *     summary: Banner CMS mutations
 *     description: >
 *       Consolidated admin write endpoint.
 *       Supported actions: `save-settings`, `save-banner`, `delete-banner`.
 *       For `save-banner`, send multipart/form-data with optional `image` and `mobileImage` files.
 *     tags: [CMS Banners]
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
 *                 enum: [save-settings, save-banner, delete-banner]
 *               settings:
 *                 type: object
 *                 description: Required for save-settings (defaultButtonText, autoSlideInterval).
 *               bannerId:
 *                 type: string
 *               title:
 *                 type: string
 *               description:
 *                 type: string
 *               link:
 *                 type: string
 *               linkText:
 *                 type: string
 *               placement:
 *                 type: string
 *                 enum: [home-page, search-page, listing-page, agent-page, agency-page, project-page]
 *               position:
 *                 type: string
 *                 enum: [top, middle, bottom, sidebar]
 *               displayOrder:
 *                 type: integer
 *               isActive:
 *                 type: boolean
 *               startDate:
 *                 type: string
 *                 format: date-time
 *               endDate:
 *                 type: string
 *                 format: date-time
 *               image:
 *                 type: string
 *               mobileImage:
 *                 type: string
 *               removeMobileImage:
 *                 type: boolean
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [action]
 *             properties:
 *               action:
 *                 type: string
 *                 enum: [save-settings, save-banner, delete-banner]
 *               image:
 *                 type: string
 *                 format: binary
 *               mobileImage:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Settings saved, banner saved, or banner deleted successfully
 *       400:
 *         description: Validation error
 *       404:
 *         description: Banner not found
 *       500:
 *         description: Server error
 */
const mutateBannerAdmin = asyncHandler(async (req, res) => {
  try {
    const action = String(req.body?.action || '').trim().toLowerCase();
    const adminId = req.admin?._id;

    if (action === 'save-settings') {
      await saveBannerSettings(req.body.settings || {}, adminId);
      const data = await getBannerAdminBundle({
        search: req.body.search,
        page: req.body.page,
        limit: req.body.limit,
        placement: req.body.placement,
      });
      return success(res, 'Banner settings saved successfully', data);
    }

    if (action === 'save-banner') {
      const payload = { ...req.body };
      const imageFile = req.files?.image?.[0];
      const mobileFile = req.files?.mobileImage?.[0];

      try {
        if (imageFile) {
          payload.image = await uploadBannerFile(imageFile, 'image');
        } else if (req.body?.image) {
          payload.image = normalizeImageFilename(req.body.image);
        }

        if (mobileFile) {
          payload.mobileImage = await uploadBannerFile(mobileFile, 'mobileImage');
        } else if (req.body?.mobileImage && typeof req.body.mobileImage === 'string') {
          payload.mobileImage = normalizeImageFilename(req.body.mobileImage);
        }
      } catch (error) {
        logger.error('Banner image upload failed', { error: error.message });
        return failure(res, 500, 'Failed to upload banner image', 'SERVER_ERROR');
      }

      const banner = await saveBanner(payload, adminId);
      return success(res, 'Banner saved successfully', { banner });
    }

    if (action === 'delete-banner') {
      const bannerId = req.body.bannerId || req.body.id;
      await deleteBanner(bannerId);
      const data = await getBannerAdminBundle({
        search: req.body.search,
        page: req.body.page,
        limit: req.body.limit,
        placement: req.body.placement,
      });
      return success(res, 'Banner deleted successfully', data);
    }

    return failure(
      res,
      400,
      'Invalid action. Use save-settings, save-banner, or delete-banner',
      'VALIDATION_ERROR'
    );
  } catch (error) {
    logger.error('Mutate banner admin failed', { error: error.message, stack: error.stack });
    const status = /not found/i.test(error.message) ? 404 : /required/i.test(error.message) ? 400 : 500;
    return failure(
      res,
      status,
      error.message || 'Failed to save banner data',
      status === 404 ? 'NOT_FOUND' : status === 400 ? 'VALIDATION_ERROR' : 'SERVER_ERROR',
      error.message
    );
  }
});

module.exports = { getBannerAdmin, mutateBannerAdmin };
