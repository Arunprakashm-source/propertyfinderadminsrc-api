const { Types } = require('mongoose');
const CmsPage = require('../models/cmsPageModel');
const Testimonial = require('../models/testimonialsModel');

const TESTIMONIAL_SETTINGS_SLUG = 'home-testimonials-overview';

const DEFAULT_TESTIMONIAL_SETTINGS = {
  sectionTitle: "Don't take our word for it!",
  sectionSubtitle: 'Hear it from our customers',
};

const TESTIMONIAL_IMAGE_BASE =
  process.env.TESTIMONIAL_IMAGE_BASE_URL ||
  'https://d1dp1oh0ra5b0z.cloudfront.net/img/testimonial/';

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

const clampRating = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return undefined;
  return Math.min(5, Math.max(1, Math.round(n)));
};

const mapTestimonial = (doc) => ({
  id: String(doc._id),
  name: doc.name || '',
  title: doc.title || '',
  content: doc.content || '',
  image: normalizeImageFilename(doc.image),
  rating: doc.rating != null ? Number(doc.rating) : null,
  displayOrder: Number(doc.displayOrder) || 0,
  isActive: doc.isActive !== false,
});

const splitSettings = (custom = {}) => ({
  ...DEFAULT_TESTIMONIAL_SETTINGS,
  ...custom,
});

const getTestimonialSettings = async () => {
  const page = await CmsPage.findOne({ slug: TESTIMONIAL_SETTINGS_SLUG }).lean();
  return splitSettings(page?.customFields || {});
};

const buildFilter = (search = '') => {
  const term = String(search || '').trim();
  if (!term) return {};
  const regex = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  return {
    $or: [{ name: regex }, { title: regex }, { content: regex }, { company: regex }],
  };
};

const listTestimonials = async ({ search = '', page = 1, limit = 10, testimonialId } = {}) => {
  if (testimonialId && Types.ObjectId.isValid(testimonialId)) {
    const doc = await Testimonial.findById(testimonialId).lean();
    return {
      testimonials: doc ? [mapTestimonial(doc)] : [],
      testimonial: doc ? mapTestimonial(doc) : null,
      pagination: { page: 1, limit: 1, total: doc ? 1 : 0, pages: doc ? 1 : 0 },
    };
  }

  const safeLimit = Math.min(Math.max(Number(limit) || 10, 1), 50);
  const safePage = Math.max(Number(page) || 1, 1);
  const filter = buildFilter(search);
  const skip = (safePage - 1) * safeLimit;

  const [docs, total] = await Promise.all([
    Testimonial.find(filter)
      .sort({ displayOrder: 1, createdAt: -1 })
      .skip(skip)
      .limit(safeLimit)
      .lean(),
    Testimonial.countDocuments(filter),
  ]);

  const pages = Math.max(1, Math.ceil(total / safeLimit));

  return {
    testimonials: docs.map(mapTestimonial),
    testimonial: null,
    pagination: { page: safePage, limit: safeLimit, total, pages },
  };
};

const getTestimonialAdminBundle = async (query = {}) => {
  const [settings, listResult] = await Promise.all([
    getTestimonialSettings(),
    listTestimonials(query),
  ]);

  return {
    settings,
    ...listResult,
    mediaBaseUrl: { img: TESTIMONIAL_IMAGE_BASE },
  };
};

const saveTestimonialSettings = async (settings = {}, adminId) => {
  const payload = splitSettings(settings);

  await CmsPage.findOneAndUpdate(
    { slug: TESTIMONIAL_SETTINGS_SLUG },
    {
      title: 'Home Testimonials',
      slug: TESTIMONIAL_SETTINGS_SLUG,
      content: 'Home page customer testimonials section settings',
      pageType: 'home-testimonials',
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

const saveTestimonial = async (payload = {}, adminId) => {
  const testimonialId = payload.testimonialId || payload.id;
  const update = {
    name: String(payload.name || '').trim(),
    title: String(payload.title || '').trim(),
    content: String(payload.content || '').trim(),
    displayOrder: Number(payload.displayOrder) || 0,
    isActive: payload.isActive !== false && payload.isActive !== 'false',
    source: 'manual',
  };

  if (!update.name) throw new Error('name is required');
  if (!update.content) throw new Error('content is required');

  const rating = clampRating(payload.rating);
  if (rating != null) update.rating = rating;

  if (payload.removeImage === true || payload.removeImage === 'true') {
    update.image = '';
  } else if (payload.image) {
    update.image = normalizeImageFilename(payload.image);
  }

  let doc;
  if (testimonialId && Types.ObjectId.isValid(testimonialId)) {
    doc = await Testimonial.findByIdAndUpdate(testimonialId, update, { new: true }).lean();
    if (!doc) throw new Error('Testimonial not found');
  } else {
    doc = (
      await Testimonial.create({
        ...update,
        createdBy: adminId || undefined,
      })
    ).toObject();
  }

  return mapTestimonial(doc);
};

const deleteTestimonial = async (testimonialId) => {
  if (!testimonialId || !Types.ObjectId.isValid(testimonialId)) {
    throw new Error('Invalid testimonial id');
  }
  const doc = await Testimonial.findByIdAndDelete(testimonialId).lean();
  if (!doc) throw new Error('Testimonial not found');
  return { id: String(doc._id) };
};

module.exports = {
  TESTIMONIAL_SETTINGS_SLUG,
  DEFAULT_TESTIMONIAL_SETTINGS,
  TESTIMONIAL_IMAGE_BASE,
  normalizeImageFilename,
  mapTestimonial,
  getTestimonialSettings,
  getTestimonialAdminBundle,
  saveTestimonialSettings,
  saveTestimonial,
  deleteTestimonial,
};
