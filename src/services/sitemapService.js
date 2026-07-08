const CmsPage = require('../models/cmsPageModel');
const SitemapDocument = require('../models/sitemapDocumentModel');
const Countries = require('../models/countriesModel');

const SITEMAP_SETTINGS_SLUG = 'sitemap-overview';

const DEFAULT_SITEMAP_SETTINGS = {
  breadcrumbHomeLabel: 'Home',
  breadcrumbLabel: 'Site map',
  pageTitle: 'Sitemap',
  defaultCountryCode: 'AE',
  locationNames: {
    AE: 'Umm Al Quwain',
  },
};

const mapSitemapDocument = (doc) => {
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

const getSitemapSettings = async () => {
  const page = await CmsPage.findOne({ slug: SITEMAP_SETTINGS_SLUG }).lean();
  const custom = page?.customFields || {};
  return {
    ...DEFAULT_SITEMAP_SETTINGS,
    ...custom,
    locationNames: {
      ...DEFAULT_SITEMAP_SETTINGS.locationNames,
      ...(custom.locationNames || {}),
    },
  };
};

const saveSitemapSettings = async (settings, adminId) => {
  const payload = {
    ...DEFAULT_SITEMAP_SETTINGS,
    ...settings,
    locationNames: {
      ...DEFAULT_SITEMAP_SETTINGS.locationNames,
      ...(settings?.locationNames || {}),
    },
  };

  await CmsPage.findOneAndUpdate(
    { slug: SITEMAP_SETTINGS_SLUG },
    {
      title: 'Sitemap Overview',
      slug: SITEMAP_SETTINGS_SLUG,
      content: 'Sitemap page settings',
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

  const docs = await SitemapDocument.find(filter)
    .sort({ displayOrder: 1, categoryName: 1, createdAt: 1 })
    .lean();

  return docs.map(mapSitemapDocument);
};

module.exports = {
  SITEMAP_SETTINGS_SLUG,
  DEFAULT_SITEMAP_SETTINGS,
  mapSitemapDocument,
  getSitemapSettings,
  saveSitemapSettings,
  listActiveCountries,
  listDocuments,
};
