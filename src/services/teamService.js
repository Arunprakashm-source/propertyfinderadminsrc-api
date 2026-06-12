const { Types } = require('mongoose');
const CmsPage = require('../models/cmsPageModel');
const TeamMember = require('../models/teamMemberModel');

const TEAM_SETTINGS_SLUG = 'team-overview';

const DEFAULT_TEAM_SETTINGS = {
  pageTitle: 'Our Team',
  pageSubtitle: 'Meet the people behind Property Finder',
  itemsPerPage: 24,
  seo: {
    metaTitle: 'Our Team | Property Finder',
    metaDescription: 'Meet our team',
    metaKeywords: 'team, property finder',
  },
};

const TEAM_IMAGE_BASE =
  process.env.TEAM_IMAGE_BASE_URL ||
  'https://d1dp1oh0ra5b0z.cloudfront.net/img/team/';

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

const mapMember = (doc) => ({
  id: String(doc._id),
  fullName: doc.fullName || '',
  jobTitle: doc.jobTitle || '',
  email: doc.email || '',
  phone: doc.phone || '',
  profileImage: normalizeImageFilename(doc.profileImage),
  displayOrder: Number(doc.displayOrder) || 0,
  isActive: doc.isActive !== false,
});

const splitSettings = (custom = {}) => ({
  ...DEFAULT_TEAM_SETTINGS,
  ...custom,
  seo: {
    ...DEFAULT_TEAM_SETTINGS.seo,
    ...(custom.seo || {}),
  },
});

const getTeamSettings = async () => {
  const page = await CmsPage.findOne({ slug: TEAM_SETTINGS_SLUG }).lean();
  return splitSettings(page?.customFields || {});
};

const buildMemberFilter = (search = '') => {
  const term = String(search || '').trim();
  if (!term) return {};
  const regex = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  return {
    $or: [{ fullName: regex }, { jobTitle: regex }, { email: regex }, { phone: regex }],
  };
};

const listMembers = async ({ search = '', page = 1, limit = 10, memberId } = {}) => {
  if (memberId && Types.ObjectId.isValid(memberId)) {
    const doc = await TeamMember.findById(memberId).lean();
    return {
      members: doc ? [mapMember(doc)] : [],
      member: doc ? mapMember(doc) : null,
      pagination: { page: 1, limit: 1, total: doc ? 1 : 0, pages: doc ? 1 : 0 },
    };
  }

  const safeLimit = Math.min(Math.max(Number(limit) || 10, 1), 50);
  const safePage = Math.max(Number(page) || 1, 1);
  const filter = buildMemberFilter(search);
  const skip = (safePage - 1) * safeLimit;

  const [docs, total] = await Promise.all([
    TeamMember.find(filter)
      .sort({ displayOrder: 1, createdAt: -1 })
      .skip(skip)
      .limit(safeLimit)
      .lean(),
    TeamMember.countDocuments(filter),
  ]);

  const pages = Math.max(1, Math.ceil(total / safeLimit));

  return {
    members: docs.map(mapMember),
    member: null,
    pagination: { page: safePage, limit: safeLimit, total, pages },
  };
};

const getTeamAdminBundle = async (query = {}) => {
  const [settings, listResult] = await Promise.all([
    getTeamSettings(),
    listMembers(query),
  ]);

  return {
    settings,
    ...listResult,
    mediaBaseUrl: { img: TEAM_IMAGE_BASE },
  };
};

const saveTeamSettings = async (settings = {}, adminId) => {
  const payload = splitSettings(settings);

  await CmsPage.findOneAndUpdate(
    { slug: TEAM_SETTINGS_SLUG },
    {
      title: 'Our Team',
      slug: TEAM_SETTINGS_SLUG,
      content: 'Team page settings',
      pageType: 'team',
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

const saveTeamMember = async (payload = {}) => {
  const memberId = payload.memberId || payload.id;
  const update = {
    fullName: String(payload.fullName || '').trim(),
    jobTitle: String(payload.jobTitle || '').trim(),
    email: String(payload.email || '').trim().toLowerCase(),
    phone: String(payload.phone || '').trim(),
    displayOrder: Number(payload.displayOrder) || 0,
    isActive: payload.isActive !== false && payload.isActive !== 'false',
  };

  if (!update.fullName) throw new Error('fullName is required');
  if (!update.jobTitle) throw new Error('jobTitle is required');

  if (payload.removeImage === true || payload.removeImage === 'true') {
    update.profileImage = '';
  } else if (payload.profileImage) {
    update.profileImage = normalizeImageFilename(payload.profileImage);
  }

  let doc;
  if (memberId && Types.ObjectId.isValid(memberId)) {
    doc = await TeamMember.findByIdAndUpdate(memberId, update, { new: true }).lean();
    if (!doc) throw new Error('Team member not found');
  } else {
    doc = (await TeamMember.create(update)).toObject();
  }

  return mapMember(doc);
};

const deleteTeamMember = async (memberId) => {
  if (!memberId || !Types.ObjectId.isValid(memberId)) {
    throw new Error('Invalid team member id');
  }
  const doc = await TeamMember.findByIdAndDelete(memberId).lean();
  if (!doc) throw new Error('Team member not found');
  return { id: String(doc._id) };
};

module.exports = {
  TEAM_SETTINGS_SLUG,
  DEFAULT_TEAM_SETTINGS,
  TEAM_IMAGE_BASE,
  normalizeImageFilename,
  mapMember,
  getTeamSettings,
  getTeamAdminBundle,
  saveTeamSettings,
  saveTeamMember,
  deleteTeamMember,
};
