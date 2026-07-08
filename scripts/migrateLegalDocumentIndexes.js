/**
 * One-time fix: drop legacy LegalDocument indexes from the old schema.
 * Usage: node scripts/migrateLegalDocumentIndexes.js
 */
require('dotenv').config();

const mongoose = require('mongoose');
const { connectToDatabase } = require('../src/config/db');
const { syncLegalDocumentIndexes } = require('../src/utils/syncLegalDocumentIndexes');
const LegalDocument = require('../src/models/legalDocumentModel');
const { resolveDocumentPageType } = require('../src/services/legalService');

async function backfillPageTypes() {
  const docs = await LegalDocument.find({}).lean();
  let updated = 0;

  for (const doc of docs) {
    const pageType = resolveDocumentPageType(doc);
    if (doc.pageType === pageType) continue;
    await LegalDocument.updateOne({ _id: doc._id }, { $set: { pageType } });
    updated += 1;
  }

  console.log(`Backfilled pageType on ${updated} document(s).`);
}

async function main() {
  await connectToDatabase();

  await backfillPageTypes();

  const before = await LegalDocument.collection.indexes();
  console.log('Indexes before:', before.map((i) => i.name).join(', '));

  await syncLegalDocumentIndexes();

  const after = await LegalDocument.collection.indexes();
  console.log('Indexes after:', after.map((i) => i.name).join(', '));

  await mongoose.disconnect();
  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
