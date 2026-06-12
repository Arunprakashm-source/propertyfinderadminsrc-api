const CmsPage = require('../models/cmsPageModel');

const ABOUT_SETTINGS_SLUG = 'about-overview';

const DEFAULT_ABOUT_SETTINGS = {
  heroEyebrow: 'ABOUT US',
  heroHeadline: 'To motivate and inspire people to get living the life they deserve.',
  heroSubheadline:
    "When you look for a property, it's not just a better home you seek, it's a better future.",
  heroBannerImage: '',
  heroGalleryImages: ['', '', ''],
  bannerText: 'Unlock your potential',
  businessSectionTitle: 'How can we help for your business?',
  businessParagraph1:
    'We help businesses connect with the right audience through property listings and insights.',
  businessParagraph2:
    'Our platform supports agents, developers, and agencies to grow their reach.',
  businessCtaPrimaryLabel: 'Meet our team',
  businessCtaPrimaryUrl: '/teams',
  businessCtaSecondaryLabel: 'Find properties',
  businessCtaSecondaryUrl: '/searchlisting',
  stat1Value: '100%',
  stat1Description:
    'Trust worthy for real estate business growth and individual property selling',
  stat2Value: '90%',
  stat2Description: 'Dubai properties listed here are verified and ready for you to own and use.',
  stat3Value: '10k+',
  stat3Description: 'Real estate companies and Agents are registered here for there growth',
  successSectionTitle: 'Our Success',
  ctaBackgroundImage: '',
  ctaHeadline: 'Ready to Invest or Move?',
  ctaSubheadline:
    'Verified listings, trusted agents, and real opportunities — all in one place.',
  ctaButtonLabel: 'Discover Properties',
  ctaButtonUrl: '/searchlisting',
  seo: {
    metaTitle: 'About Us | Property Finder',
    metaDescription: 'Learn about Property Finder',
    metaKeywords: 'about, property finder',
  },
};

const DEFAULT_TIMELINE = [
  {
    id: '1',
    month: 'MAY',
    day: '22',
    year: '2024',
    title: 'New milestone reached across the region',
    description: 'Property Finder surpasses record engagement and marketplace growth.',
    displayOrder: 1,
  },
  {
    id: '2',
    month: 'MAY',
    day: '20',
    year: '2024',
    title: 'Announcing one of the largest investment rounds for a tech',
    description: 'Permira leads an investment of $525m, with participation from Blackstone Growth.',
    displayOrder: 2,
  },
  {
    id: '3',
    month: 'MAY',
    day: '12',
    year: '2024',
    title: 'Unveiling the first owned White Paper',
    description: 'PF Connect event in Dubai revealed first white paper.',
    displayOrder: 3,
  },
  {
    id: '4',
    month: 'MAY',
    day: '05',
    year: '2024',
    title: 'Buyback of Shares from BECO Capital',
    description: 'Property Finder raised US$90 million debt financing.',
    displayOrder: 4,
  },
  {
    id: '5',
    month: 'MAY',
    day: '02',
    year: '2024',
    title: 'Expanding product capabilities',
    description: 'New tools launched to help home-seekers make faster decisions.',
    displayOrder: 5,
  },
];

const normalizeGalleryImages = (value) => {
  const list = Array.isArray(value) ? value : [];
  const normalized = list.map((item) => String(item || '').trim()).slice(0, 6);
  while (normalized.length < 3) normalized.push('');
  return normalized;
};

const normalizeTimeline = (entries) => {
  if (!Array.isArray(entries) || !entries.length) return DEFAULT_TIMELINE;

  return entries
    .map((entry, index) => ({
      id: String(entry.id || entry._id || index + 1),
      month: String(entry.month || '').trim().toUpperCase(),
      day: String(entry.day || '').trim(),
      year: String(entry.year || '').trim(),
      title: String(entry.title || '').trim(),
      description: String(entry.description || entry.desc || '').trim(),
      displayOrder:
        entry.displayOrder !== undefined && entry.displayOrder !== ''
          ? Number(entry.displayOrder)
          : index + 1,
    }))
    .sort((a, b) => a.displayOrder - b.displayOrder);
};

const splitCustomFields = (custom = {}) => {
  const { timeline, ...settings } = custom;
  return {
    settings: {
      ...DEFAULT_ABOUT_SETTINGS,
      ...settings,
      heroGalleryImages: normalizeGalleryImages(
        settings.heroGalleryImages ?? DEFAULT_ABOUT_SETTINGS.heroGalleryImages
      ),
      seo: {
        ...DEFAULT_ABOUT_SETTINGS.seo,
        ...(settings.seo || {}),
      },
    },
    timeline: normalizeTimeline(timeline),
  };
};

const getAboutPage = async () => {
  const page = await CmsPage.findOne({ slug: ABOUT_SETTINGS_SLUG }).lean();
  return splitCustomFields(page?.customFields || {});
};

const saveAboutPage = async ({ settings = {}, timeline = [] }, adminId) => {
  const payload = {
    ...DEFAULT_ABOUT_SETTINGS,
    ...settings,
    heroGalleryImages: normalizeGalleryImages(
      settings.heroGalleryImages ?? DEFAULT_ABOUT_SETTINGS.heroGalleryImages
    ),
    seo: {
      ...DEFAULT_ABOUT_SETTINGS.seo,
      ...(settings.seo || {}),
    },
    timeline: normalizeTimeline(timeline),
  };

  await CmsPage.findOneAndUpdate(
    { slug: ABOUT_SETTINGS_SLUG },
    {
      title: 'About Us',
      slug: ABOUT_SETTINGS_SLUG,
      content: 'About us page settings',
      pageType: 'about',
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
  ABOUT_SETTINGS_SLUG,
  DEFAULT_ABOUT_SETTINGS,
  DEFAULT_TIMELINE,
  normalizeGalleryImages,
  normalizeTimeline,
  getAboutPage,
  saveAboutPage,
};
