const CmsPage = require('../models/cmsPageModel');
const BlogCategory = require('../models/blogCategoryModel');
const { generateSlug } = require('../utils/helpers');

const BLOG_SETTINGS_SLUG = 'blog-overview';

const DEFAULT_BLOG_SETTINGS = {
  pageTitle: 'Browse our blogs',
  pageSubtitle: 'We provide tips and resources from industries and market standards',
  featuredSectionTitle: 'Top stories',
  featuredSectionSubtitle: '',
  itemsPerPage: 9,
  showSearch: true,
  showCategoryFilters: true,
  showRecentPostsSidebar: true,
  enableComments: true,
  seo: {
    metaTitle: 'Blogs | Property Finder',
    metaDescription: 'Read the latest property insights and updates.',
    metaKeywords: 'blog, property, insights',
  },
};

const DEFAULT_CATEGORIES = [
  {
    name: 'The Guide',
    slug: 'the-guide',
    displayOrder: 1,
    subcategories: [
      { name: "Buyer's Guide", slug: 'buyers-guide', displayOrder: 1 },
      { name: "Renter's Guide", slug: 'renters-guide', displayOrder: 2 },
      { name: 'Service', slug: 'service', displayOrder: 3 },
    ],
  },
  {
    name: 'Where To Live',
    slug: 'where-to-live',
    displayOrder: 2,
    subcategories: [{ name: 'Dubai', slug: 'dubai', displayOrder: 1 }],
  },
  {
    name: 'Latest Projects',
    slug: 'latest-projects',
    displayOrder: 3,
    subcategories: [{ name: 'Dubai', slug: 'dubai', displayOrder: 1 }],
  },
  {
    name: 'Laws',
    slug: 'laws',
    displayOrder: 4,
    subcategories: [{ name: 'Dubai', slug: 'dubai', displayOrder: 1 }],
  },
  {
    name: 'Top Picks',
    slug: 'top-picks',
    displayOrder: 5,
    subcategories: [{ name: 'Dubai', slug: 'dubai', displayOrder: 1 }],
  },
  {
    name: 'Lifestyle',
    slug: 'lifestyle',
    displayOrder: 6,
    subcategories: [{ name: 'Dubai', slug: 'dubai', displayOrder: 1 }],
  },
  {
    name: 'Inside PF',
    slug: 'inside-pf',
    displayOrder: 7,
    subcategories: [{ name: 'Dubai', slug: 'dubai', displayOrder: 1 }],
  },
];

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

const formatReadTime = (minutes) => {
  const n = Number(minutes) || 5;
  return `${n} min read`;
};

const formatDisplayDate = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

const mapBlogCard = (post) => ({
  id: String(post._id),
  slug: post.slug,
  title: post.title,
  excerpt: post.excerpt || '',
  text: post.excerpt || '',
  tag: post.tags?.[0] || 'New Article',
  image: normalizeImageFilename(post.featuredImage),
  authorName: post.authorName || 'Admin',
  authorAvatar: normalizeImageFilename(post.authorAvatar),
  categorySlug: post.categorySlug || '',
  subcategorySlug: post.subcategorySlug || '',
  publishedAt: post.publishedAt || post.createdAt,
  publishedDate: formatDisplayDate(post.publishedAt || post.createdAt),
  readTime: formatReadTime(post.readingTime),
  isFeatured: Boolean(post.isFeatured),
  views: post.views || 0,
  commentsCount: post.commentsCount || 0,
});

const mapBlogDetail = (post) => ({
  ...mapBlogCard(post),
  content: post.content || '',
  tags: post.tags || [],
  allowComments: post.allowComments !== false,
  metaTitle: post.metaTitle || '',
  metaDescription: post.metaDescription || '',
  metaKeywords: post.metaKeywords || '',
});

const mapComment = (comment) => ({
  id: String(comment._id),
  author: comment.authorName,
  date: formatDisplayDate(comment.createdAt),
  text: comment.text,
  likes: comment.likes || 0,
  dislikes: comment.dislikes || 0,
  replies: [],
});

const getBlogSettings = async () => {
  const page = await CmsPage.findOne({ slug: BLOG_SETTINGS_SLUG }).lean();
  const custom = page?.customFields || {};
  return {
    ...DEFAULT_BLOG_SETTINGS,
    ...custom,
    seo: {
      ...DEFAULT_BLOG_SETTINGS.seo,
      ...(custom.seo || {}),
    },
  };
};

const saveBlogSettings = async (settings, adminId) => {
  const payload = {
    ...DEFAULT_BLOG_SETTINGS,
    ...settings,
    seo: {
      ...DEFAULT_BLOG_SETTINGS.seo,
      ...(settings?.seo || {}),
    },
  };

  await CmsPage.findOneAndUpdate(
    { slug: BLOG_SETTINGS_SLUG },
    {
      title: 'Blog Overview',
      slug: BLOG_SETTINGS_SLUG,
      content: 'Blog overview page settings',
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

const ensureBlogCategories = async () => {
  const count = await BlogCategory.countDocuments({});
  if (count > 0) return BlogCategory.find({ isActive: true }).sort({ displayOrder: 1 }).lean();

  await BlogCategory.insertMany(DEFAULT_CATEGORIES);
  return BlogCategory.find({ isActive: true }).sort({ displayOrder: 1 }).lean();
};

const listActiveCategories = async () => {
  const categories = await BlogCategory.find({ isActive: true }).sort({ displayOrder: 1 }).lean();
  if (categories.length) return categories;
  return ensureBlogCategories();
};

const buildPublishedFilter = (extra = {}) => ({
  status: 'published',
  ...extra,
});

const buildSort = (sortBy) => {
  const normalized = String(sortBy || 'newest').trim().toLowerCase();
  if (normalized === 'oldest') return { publishedAt: 1, createdAt: 1 };
  if (normalized === 'popular') return { views: -1, publishedAt: -1 };
  return { publishedAt: -1, createdAt: -1 };
};

const uniqueTagsFromPosts = (posts) => {
  const set = new Set();
  posts.forEach((post) => {
    (post.tags || []).forEach((tag) => {
      if (tag?.trim()) set.add(tag.trim());
    });
  });
  return Array.from(set)
    .sort((a, b) => a.localeCompare(b))
    .map((name, index) => ({
      id: index + 1,
      name,
      slug: generateSlug(name),
    }));
};

module.exports = {
  BLOG_SETTINGS_SLUG,
  DEFAULT_BLOG_SETTINGS,
  normalizeImageFilename,
  formatReadTime,
  formatDisplayDate,
  mapBlogCard,
  mapBlogDetail,
  mapComment,
  getBlogSettings,
  saveBlogSettings,
  ensureBlogCategories,
  listActiveCategories,
  buildPublishedFilter,
  buildSort,
  uniqueTagsFromPosts,
};
