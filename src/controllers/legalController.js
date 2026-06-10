const asyncHandler = require('express-async-handler');
const mongoose = require('mongoose');

const LegalDocument = require('../models/legalDocumentModel');
const {
  getLegalSettings,
  saveLegalSettings,
  listActiveCountries,
  listDocuments,
  mapLegalDocument,
} = require('../services/legalService');
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

const getLegalAdmin = asyncHandler(async (req, res) => {
  try {
    const { countryCode } = req.query;
    const [settings, countries, documents] = await Promise.all([
      getLegalSettings(),
      listActiveCountries(),
      listDocuments({
        countryCode: countryCode ? String(countryCode).trim().toUpperCase() : undefined,
      }),
    ]);

    return success(res, 'Legal CMS data fetched successfully', {
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
    logger.error('Get legal admin failed', { error: error.message, stack: error.stack });
    return failure(res, 500, 'Failed to fetch legal CMS data', 'SERVER_ERROR', error.message);
  }
});

const mutateLegalAdmin = asyncHandler(async (req, res) => {
  try {
    const action = String(req.body?.action || '').trim().toLowerCase();
    const adminId = req.admin?._id;

    if (action === 'save-settings') {
      const settings = await saveLegalSettings(req.body.settings || {}, adminId);
      return success(res, 'Legal settings saved successfully', { settings });
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
        doc = await LegalDocument.findById(docId);
        if (!doc) {
          return failure(res, 404, 'Legal document not found', 'NOT_FOUND');
        }
        Object.assign(doc, data);
        await doc.save();
      } else {
        doc = await LegalDocument.findOneAndUpdate(
          { countryCode: data.countryCode, slug: data.slug },
          data,
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );
      }

      return success(res, 'Legal document saved successfully', {
        document: mapLegalDocument(doc),
      });
    }

    if (action === 'delete-document') {
      const docId = req.body.documentId || req.body.id;
      if (!docId || !Types.ObjectId.isValid(docId)) {
        return failure(res, 400, 'documentId is required', 'VALIDATION_ERROR');
      }
      const deleted = await LegalDocument.findByIdAndDelete(docId);
      if (!deleted) {
        return failure(res, 404, 'Legal document not found', 'NOT_FOUND');
      }
      return success(res, 'Legal document deleted successfully', { id: String(docId) });
    }

    return failure(
      res,
      400,
      'Invalid action. Use save-settings, save-document, or delete-document',
      'VALIDATION_ERROR'
    );
  } catch (error) {
    logger.error('Mutate legal admin failed', { error: error.message, stack: error.stack });
    if (error.code === 11000) {
      return failure(
        res,
        409,
        'A category with this name already exists for this location',
        'DUPLICATE'
      );
    }
    return failure(res, 500, 'Failed to save legal data', 'SERVER_ERROR', error.message);
  }
});

module.exports = { getLegalAdmin, mutateLegalAdmin };
