const CmsPage = require('../models/cmsPageModel');
const LegalDocument = require('../models/legalDocumentModel');
const Countries = require('../models/countriesModel');

const LEGAL_SETTINGS_SLUG = 'legal-overview';

const DEFAULT_LEGAL_SETTINGS = {
  termsPageTitle: 'Terms and conditions',
  privacyPageTitle: 'Privacy policy',
  breadcrumbHomeLabel: 'Home',
  defaultCountryCode: 'AE',
  contactBlock: {
    supportEmail: 'support@propertyfinder.ae',
    sectionTitle: 'Contact us',
  },
};

const mapLegalDocument = (doc) => {
  if (!doc) return doc;
  const plain = doc.toObject ? doc.toObject() : { ...doc };
  return {
    id: String(plain._id),
    countryCode: plain.countryCode,
    categoryName: plain.categoryName || '',
    slug: plain.slug || '',
    content: plain.content || '',
    isActive: plain.isActive !== false,
    displayOrder: plain.displayOrder || 0,
    updatedAt: plain.updatedAt,
    createdAt: plain.createdAt,
  };
};

const getLegalSettings = async () => {
  const page = await CmsPage.findOne({ slug: LEGAL_SETTINGS_SLUG }).lean();
  const custom = page?.customFields || {};
  return {
    ...DEFAULT_LEGAL_SETTINGS,
    ...custom,
    contactBlock: {
      ...DEFAULT_LEGAL_SETTINGS.contactBlock,
      ...(custom.contactBlock || {}),
    },
  };
};

const saveLegalSettings = async (settings, adminId) => {
  const payload = {
    ...DEFAULT_LEGAL_SETTINGS,
    ...settings,
    contactBlock: {
      ...DEFAULT_LEGAL_SETTINGS.contactBlock,
      ...(settings?.contactBlock || {}),
    },
  };

  await CmsPage.findOneAndUpdate(
    { slug: LEGAL_SETTINGS_SLUG },
    {
      title: 'Legal Overview',
      slug: LEGAL_SETTINGS_SLUG,
      content: 'Legal pages settings',
      pageType: 'other',
      isActive: true,
      isPublished: true,
      customFields: payload,
      lastModifiedBy: adminId || undefined,
      updatedAt: new Date(),
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  return payload;
};

const listActiveCountries = async () =>
  Countries.find({ isActive: true }).sort({ displayOrder: 1, name: 1 }).lean();

const listDocuments = async ({ countryCode, activeOnly = false } = {}) => {
  const filter = {};
  if (countryCode) filter.countryCode = String(countryCode).toUpperCase();
  if (activeOnly) filter.isActive = true;

  const docs = await LegalDocument.find(filter)
    .sort({ displayOrder: 1, categoryName: 1, createdAt: 1 })
    .lean();

  return docs.map(mapLegalDocument);
};

module.exports = {
  LEGAL_SETTINGS_SLUG,
  DEFAULT_LEGAL_SETTINGS,
  mapLegalDocument,
  getLegalSettings,
  saveLegalSettings,
  listActiveCountries,
  listDocuments,
};
