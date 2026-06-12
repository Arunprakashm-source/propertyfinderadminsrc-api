const CmsPage = require('../models/cmsPageModel');
const ContactSubmission = require('../models/contactSubmissionModel');

const CONTACT_SETTINGS_SLUG = 'contact-overview';

const DEFAULT_CONTACT_SETTINGS = {
  heroTitle: 'We want to hear from you',
  heroSubtitle: 'Send us a message, give us a call, or better still visit us.',
  heroBackgroundImage: '',
  sectionTitle: "Let's get in touch",
  sectionSubtext: 'Contact if you have any queries',
  email: 'info@propertyfinder.ae',
  phone: '+971 4 558 0000',
  officeAddress: 'Media City, Shatha Tower, 1505, Dubai, UAE',
  mapUrl: 'https://maps.google.com',
  facebookUrl: 'https://facebook.com',
  instagramUrl: 'https://instagram.com',
  twitterUrl: 'https://twitter.com',
  linkedinUrl: 'https://linkedin.com',
  seo: {
    metaTitle: 'Contact Us | Property Finder',
    metaDescription: 'Get in touch with Property Finder',
    metaKeywords: 'contact, property finder',
  },
};

const DEFAULT_FORM_SUBJECTS = [
  'General inquiry',
  'Property support',
  'Advertising',
  'Careers',
  'Other',
];

const DEFAULT_LOCATIONS = [
  {
    id: 'istanbul-tech',
    city: 'Istanbul',
    country: 'Turkey',
    locationType: 'Tech hub',
    address:
      'Maslak, Maslak Mah., Ahi Evran Cd. No:6 D:3, 42, D:B Blok, 34398 Sarıyer/İstanbul',
    mapUrl: 'https://maps.google.com',
    phone: '+90 212 924 10 24',
    email: 'info@propertyfinder.com.tr',
    displayOrder: 1,
    isActive: true,
  },
  {
    id: 'dubai-hq',
    city: 'Dubai',
    country: 'UAE',
    locationType: 'Head office',
    address: 'Media City, Shatha Tower, 1506, Dubai, UAE',
    mapUrl: 'https://maps.google.com',
    phone: '+971 4 558 0000',
    email: 'info@propertyfinder.ae',
    displayOrder: 2,
    isActive: true,
  },
];

const normalizeSubjects = (subjects) => {
  if (!Array.isArray(subjects)) return DEFAULT_FORM_SUBJECTS;
  const list = subjects.map((s) => String(s || '').trim()).filter(Boolean);
  return list.length ? list : DEFAULT_FORM_SUBJECTS;
};

const normalizeLocations = (locations) => {
  if (!Array.isArray(locations) || !locations.length) return DEFAULT_LOCATIONS;

  return locations
    .map((loc, index) => ({
      id: String(loc.id || loc._id || `loc-${index + 1}`),
      city: String(loc.city || '').trim(),
      country: String(loc.country || '').trim(),
      locationType: String(loc.locationType || '').trim(),
      address: String(loc.address || '').trim(),
      mapUrl: String(loc.mapUrl || '').trim(),
      phone: String(loc.phone || '').trim(),
      email: String(loc.email || '').trim(),
      displayOrder:
        loc.displayOrder !== undefined && loc.displayOrder !== ''
          ? Number(loc.displayOrder)
          : index + 1,
      isActive: loc.isActive !== false,
    }))
    .sort((a, b) => a.displayOrder - b.displayOrder);
};

const splitCustomFields = (custom = {}) => {
  const { formSubjects, locations, ...settings } = custom;
  return {
    settings: {
      ...DEFAULT_CONTACT_SETTINGS,
      ...settings,
      seo: {
        ...DEFAULT_CONTACT_SETTINGS.seo,
        ...(settings.seo || {}),
      },
    },
    formSubjects: normalizeSubjects(formSubjects),
    locations: normalizeLocations(locations),
  };
};

const mapSubmission = (doc) => ({
  id: String(doc._id),
  name: doc.name || '',
  email: doc.email || '',
  phone: doc.phone || '',
  subject: doc.subject || '',
  comments: doc.comments || '',
  submittedAt: doc.submittedAt || doc.createdAt,
});

const getContactPage = async () => {
  const page = await CmsPage.findOne({ slug: CONTACT_SETTINGS_SLUG }).lean();
  return splitCustomFields(page?.customFields || {});
};

const listSubmissions = async ({ limit = 100 } = {}) => {
  const docs = await ContactSubmission.find({})
    .sort({ submittedAt: -1, createdAt: -1 })
    .limit(Math.min(Number(limit) || 100, 200))
    .lean();
  return docs.map(mapSubmission);
};

const getContactAdminBundle = async () => {
  const [pageData, submissions] = await Promise.all([
    getContactPage(),
    listSubmissions(),
  ]);
  return { ...pageData, submissions };
};

const saveContactPage = async ({ settings = {}, formSubjects = [], locations = [] }, adminId) => {
  const payload = {
    ...DEFAULT_CONTACT_SETTINGS,
    ...settings,
    seo: {
      ...DEFAULT_CONTACT_SETTINGS.seo,
      ...(settings.seo || {}),
    },
    formSubjects: normalizeSubjects(formSubjects),
    locations: normalizeLocations(locations),
  };

  await CmsPage.findOneAndUpdate(
    { slug: CONTACT_SETTINGS_SLUG },
    {
      title: 'Contact Us',
      slug: CONTACT_SETTINGS_SLUG,
      content: 'Contact us page settings',
      pageType: 'contact',
      isActive: true,
      isPublished: true,
      customFields: payload,
      lastModifiedBy: adminId || undefined,
      updatedAt: new Date(),
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  return splitCustomFields(payload);
};

module.exports = {
  CONTACT_SETTINGS_SLUG,
  DEFAULT_CONTACT_SETTINGS,
  DEFAULT_FORM_SUBJECTS,
  DEFAULT_LOCATIONS,
  getContactPage,
  getContactAdminBundle,
  saveContactPage,
  listSubmissions,
  mapSubmission,
};
