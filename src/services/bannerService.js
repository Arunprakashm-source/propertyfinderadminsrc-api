const { Types } = require('mongoose');
const CmsPage = require('../models/cmsPageModel');
const Banner = require('../models/bannersModel');
const { PLACEMENTS } = require('../models/bannersModel');

const BANNER_SETTINGS_SLUG = 'banner-overview';

const DEFAULT_BANNER_SETTINGS = {
  defaultButtonText: 'Explore more',
  autoSlideInterval: 5000,
};

const BANNER_IMAGE_BASE =
  process.env.BANNER_IMAGE_BASE_URL ||
  'https://d1dp1oh0ra5b0z.cloudfront.net/img/banner/';

const normalizeImageFilename = (value) => {
  if (!value || typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) {
    const parts = trimmed.split('/');
    return parts[parts.length - 1] || '';
  }
  return trimmed.replace(/^\/+/, '');
};

const normalizePlacement = (value) => {
  const normalized = String(value || 'listing-page').trim().toLowerCase();
  return PLACEMENTS.includes(normalized) ? normalized : 'listing-page';
};

const mapBanner = (doc) => ({
  id: String(doc._id),
  title: doc.title || '',
  description: doc.description || '',
  image: normalizeImageFilename(doc.image),
  mobileImage: normalizeImageFilename(doc.mobileImage),
  link: doc.link || '',
  linkText: doc.linkText || DEFAULT_BANNER_SETTINGS.defaultButtonText,
  placement: doc.placement || 'listing-page',
  position: doc.position || 'top',
  displayOrder: Number(doc.displayOrder) || 0,
  startDate: doc.startDate || null,
  endDate: doc.endDate || null,
  isActive: doc.isActive !== false,
});

const splitSettings = (custom = {}) => ({
  ...DEFAULT_BANNER_SETTINGS,
  ...custom,
  autoSlideInterval: Math.max(
    Number(custom.autoSlideInterval) || DEFAULT_BANNER_SETTINGS.autoSlideInterval,
    1000
  ),
});

const getBannerSettings = async () => {
  const page = await CmsPage.findOne({ slug: BANNER_SETTINGS_SLUG }).lean();
  return splitSettings(page?.customFields || {});
};

const buildFilter = (search = '', placement) => {
  const filter = {};
  if (placement) filter.placement = normalizePlacement(placement);

  const term = String(search || '').trim();
  if (term) {
    const regex = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ title: regex }, { description: regex }, { linkText: regex }];
  }

  return filter;
};

const listBanners = async ({ search = '', page = 1, limit = 10, placement, bannerId } = {}) => {
  if (bannerId && Types.ObjectId.isValid(bannerId)) {
    const doc = await Banner.findById(bannerId).lean();
    return {
      banners: doc ? [mapBanner(doc)] : [],
      banner: doc ? mapBanner(doc) : null,
      pagination: { page: 1, limit: 1, total: doc ? 1 : 0, pages: doc ? 1 : 0 },
    };
  }

  const safeLimit = Math.min(Math.max(Number(limit) || 10, 1), 50);
  const safePage = Math.max(Number(page) || 1, 1);
  const filter = buildFilter(search, placement);
  const skip = (safePage - 1) * safeLimit;

  const [docs, total] = await Promise.all([
    Banner.find(filter)
      .sort({ displayOrder: 1, createdAt: -1 })
      .skip(skip)
      .limit(safeLimit)
      .lean(),
    Banner.countDocuments(filter),
  ]);

  return {
    banners: docs.map(mapBanner),
    banner: null,
    pagination: { page: safePage, limit: safeLimit, total, pages: Math.max(1, Math.ceil(total / safeLimit)) },
  };
};

const getBannerAdminBundle = async (query = {}) => {
  const [settings, listResult, placements] = await Promise.all([
    getBannerSettings(),
    listBanners(query),
    Promise.resolve(PLACEMENTS),
  ]);

  return {
    settings,
    placements,
    ...listResult,
    mediaBaseUrl: { img: BANNER_IMAGE_BASE },
  };
};

const saveBannerSettings = async (settings = {}, adminId) => {
  const payload = splitSettings(settings);

  await CmsPage.findOneAndUpdate(
    { slug: BANNER_SETTINGS_SLUG },
    {
      title: 'Banner Management',
      slug: BANNER_SETTINGS_SLUG,
      content: 'Banner carousel global settings',
      pageType: 'banner',
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

const saveBanner = async (payload = {}, adminId) => {
  const bannerId = payload.bannerId || payload.id;
  const update = {
    title: String(payload.title || '').trim(),
    description: String(payload.description || '').trim(),
    link: String(payload.link || '').trim(),
    linkText: String(payload.linkText || DEFAULT_BANNER_SETTINGS.defaultButtonText).trim(),
    placement: normalizePlacement(payload.placement),
    position: ['top', 'middle', 'bottom', 'sidebar'].includes(String(payload.position))
      ? payload.position
      : 'top',
    displayOrder: Number(payload.displayOrder) || 0,
    isActive: payload.isActive !== false && payload.isActive !== 'false',
    startDate: payload.startDate ? new Date(payload.startDate) : null,
    endDate: payload.endDate ? new Date(payload.endDate) : null,
  };

  if (!update.title) throw new Error('title is required');

  if (payload.image) {
    update.image = normalizeImageFilename(payload.image);
  }

  if (payload.removeMobileImage === true || payload.removeMobileImage === 'true') {
    update.mobileImage = '';
  } else if (payload.mobileImage) {
    update.mobileImage = normalizeImageFilename(payload.mobileImage);
  }

  let doc;
  if (bannerId && Types.ObjectId.isValid(bannerId)) {
    if (!update.image) {
      const existing = await Banner.findById(bannerId).lean();
      if (!existing?.image) throw new Error('Banner image is required');
    } else {
      // image provided in update
    }
    const updatePayload = { ...update };
    if (!payload.image) delete updatePayload.image;
    doc = await Banner.findByIdAndUpdate(bannerId, updatePayload, { new: true }).lean();
    if (!doc) throw new Error('Banner not found');
  } else {
    if (!update.image) throw new Error('Banner image is required');
    doc = (
      await Banner.create({
        ...update,
        createdBy: adminId || undefined,
      })
    ).toObject();
  }

  return mapBanner(doc);
};

const deleteBanner = async (bannerId) => {
  if (!bannerId || !Types.ObjectId.isValid(bannerId)) {
    throw new Error('Invalid banner id');
  }
  const doc = await Banner.findByIdAndDelete(bannerId).lean();
  if (!doc) throw new Error('Banner not found');
  return { id: String(doc._id) };
};

module.exports = {
  BANNER_SETTINGS_SLUG,
  DEFAULT_BANNER_SETTINGS,
  BANNER_IMAGE_BASE,
  PLACEMENTS,
  normalizeImageFilename,
  mapBanner,
  getBannerSettings,
  getBannerAdminBundle,
  saveBannerSettings,
  saveBanner,
  deleteBanner,
};
