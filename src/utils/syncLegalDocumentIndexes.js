const LegalDocument = require('../models/legalDocumentModel');
const { logger } = require('./logger');

const LEGACY_INDEX_FIELDS = new Set(['documentKey', 'language', 'pageType', 'tabLabel']);

const isStaleLegalIndex = (index) => {
  if (!index?.name || index.name === '_id_') return false;
  const keys = Object.keys(index.key || {});
  return keys.some((field) => LEGACY_INDEX_FIELDS.has(field));
};

async function syncLegalDocumentIndexes() {
  try {
    const collection = LegalDocument.collection;
    const indexes = await collection.indexes();

    for (const index of indexes) {
      if (!isStaleLegalIndex(index)) continue;
      await collection.dropIndex(index.name);
      logger.info('Dropped stale LegalDocument index', { index: index.name });
    }

    await LegalDocument.syncIndexes();
    logger.info('LegalDocument indexes synced');
  } catch (error) {
    logger.warn('LegalDocument index sync failed', { error: error.message });
  }
}

module.exports = { syncLegalDocumentIndexes };
