const asyncHandler = require('express-async-handler');
const mongoose = require('mongoose');

const SitemapDocument = require('../models/sitemapDocumentModel');
const {
  getSitemapSettings,
  saveSitemapSettings,
  listActiveCountries,
  listDocuments,
  mapSitemapDocument,
} = require('../services/sitemapService');
const { success, failure, generateSlug } = require('../utils/helpers');
const { logger } = require('../utils/logger');

const { Types } = mongoose;

const parseBoolean = (value, fallback = false) => {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  const normalized = String(value).trim().toLowerCase();
  return ['true', '1', 'yes', 'on'].includes(normalized);
};

const parseDocumentBody = (body = {}) => {
  const countryCode = String(body.countryCode || body.country || 'AE').trim().toUpperCase();
  const categoryName = String(body.categoryName || body.tabLabel || '').trim();
  if (!categoryName) {
    return { error: 'categoryName is required' };
  }

  const slug = body.slug
    ? String(body.slug).trim().toLowerCase()
    : generateSlug(categoryName);

  const displayOrder =
    body.displayOrder !== undefined && body.displayOrder !== ''
      ? parseInt(body.displayOrder, 10)
      : 0;

  return {
    data: {
      countryCode,
      categoryName,
      slug,
      content: String(body.content || ''),
      isActive: parseBoolean(body.isActive, true),
      displayOrder: Number.isNaN(displayOrder) ? 0 : displayOrder,
    },
  };
};

/**
 * @swagger
 * /cms/sitemap:
 *   get:
 *     summary: Get Sitemap CMS data
 *     description: Returns sitemap settings, active countries, and sitemap documents.
 *     tags: [CMS Sitemap]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: countryCode
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Sitemap CMS data fetched successfully
 *       500:
 *         description: Server error
 */
const getSitemapAdmin = asyncHandler(async (req, res) => {
  try {
    const { countryCode } = req.query;
    const [settings, countries, documents] = await Promise.all([
      getSitemapSettings(),
      listActiveCountries(),
      listDocuments({
        countryCode: countryCode ? String(countryCode).trim().toUpperCase() : undefined,
      }),
    ]);

    return success(res, 'Sitemap CMS data fetched successfully', {
      settings,
      countries: countries.map((c) => ({
        _id: c._id,
        name: c.name,
        code: c.code,
        flag: c.flag,
        isActive: c.isActive !== false,
        displayOrder: c.displayOrder,
      })),
      documents,
    });
  } catch (error) {
    logger.error('Get sitemap admin failed', { error: error.message, stack: error.stack });
    return failure(res, 500, 'Failed to fetch sitemap CMS data', 'SERVER_ERROR', error.message);
  }
});

/**
 * @swagger
 * /cms/sitemap:
 *   post:
 *     summary: Sitemap CMS mutations
 *     description: >
 *       Supported actions: `save-settings`, `save-document`, `delete-document`.
 *     tags: [CMS Sitemap]
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
 *                 enum: [save-settings, save-document, delete-document]
 *     responses:
 *       200:
 *         description: Mutation successful
 *       400:
 *         description: Validation error
 *       404:
 *         description: Document not found
 *       409:
 *         description: Duplicate category for location
 *       500:
 *         description: Server error
 */
const mutateSitemapAdmin = asyncHandler(async (req, res) => {
  try {
    const action = String(req.body?.action || '').trim().toLowerCase();
    const adminId = req.admin?._id;

    if (action === 'save-settings') {
      const settings = await saveSitemapSettings(req.body.settings || {}, adminId);
      return success(res, 'Sitemap settings saved successfully', { settings });
    }

    if (action === 'save-document') {
      const parsed = parseDocumentBody(req.body);
      if (parsed.error) {
        return failure(res, 400, parsed.error, 'VALIDATION_ERROR');
      }

      const { data } = parsed;
      let doc;
      const docId = req.body.documentId || req.body.id;

      if (docId && Types.ObjectId.isValid(docId)) {
        doc = await SitemapDocument.findById(docId);
        if (!doc) {
          return failure(res, 404, 'Sitemap document not found', 'NOT_FOUND');
        }
        Object.assign(doc, data);
        await doc.save();
      } else {
        doc = await SitemapDocument.findOneAndUpdate(
          { countryCode: data.countryCode, slug: data.slug },
          data,
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );
      }

      return success(res, 'Sitemap document saved successfully', {
        document: mapSitemapDocument(doc),
      });
    }

    if (action === 'delete-document') {
      const docId = req.body.documentId || req.body.id;
      if (!docId || !Types.ObjectId.isValid(docId)) {
        return failure(res, 400, 'documentId is required', 'VALIDATION_ERROR');
      }
      const deleted = await SitemapDocument.findByIdAndDelete(docId);
      if (!deleted) {
        return failure(res, 404, 'Sitemap document not found', 'NOT_FOUND');
      }
      return success(res, 'Sitemap document deleted successfully', { id: String(docId) });
    }

    return failure(
      res,
      400,
      'Invalid action. Use save-settings, save-document, or delete-document',
      'VALIDATION_ERROR'
    );
  } catch (error) {
    logger.error('Mutate sitemap admin failed', { error: error.message, stack: error.stack });
    if (error.code === 11000) {
      return failure(
        res,
        409,
        'A category with this name already exists for this location',
        'DUPLICATE'
      );
    }
    return failure(res, 500, 'Failed to save sitemap data', 'SERVER_ERROR', error.message);
  }
});

module.exports = { getSitemapAdmin, mutateSitemapAdmin };
