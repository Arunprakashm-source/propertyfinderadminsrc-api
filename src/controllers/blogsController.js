const asyncHandler = require('express-async-handler');
const mongoose = require('mongoose');

const BlogPost = require('../models/blogPostModel');
const BlogCategory = require('../models/blogCategoryModel');
const {
  getBlogSettings,
  saveBlogSettings,
  listActiveCategories,
  mapBlogCard,
  uniqueTagsFromPosts,
  normalizeImageFilename,
} = require('../services/blogService');
const { success, failure, generateSlug } = require('../utils/helpers');
const uploadService = require('../services/uploadService');
const { logger } = require('../utils/logger');

const { Types } = mongoose;

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const mapAdminPost = (post) => ({
  id: String(post._id),
  title: post.title,
  slug: post.slug,
  excerpt: post.excerpt || '',
  content: post.content || '',
  coverImage: normalizeImageFilename(post.featuredImage),
  categorySlug: post.categorySlug || '',
  subcategorySlug: post.subcategorySlug || '',
  tagIds: [],
  tags: post.tags || [],
  authorName: post.authorName || 'Admin',
  readTime: `${post.readingTime || 5} min read`,
  readingTime: post.readingTime || 5,
  publishDate: post.publishedAt
    ? new Date(post.publishedAt).toISOString().slice(0, 10)
    : '',
  publishedAt: post.publishedAt,
  isFeatured: Boolean(post.isFeatured),
  isPublished: post.status === 'published',
  status: post.status,
  displayOrder: post.displayOrder || 0,
  allowComments: post.allowComments !== false,
  seo: {
    metaTitle: post.metaTitle || '',
    metaDescription: post.metaDescription || '',
    metaKeywords: post.metaKeywords || '',
  },
});

const parseBoolean = (value, fallback = false) => {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  const normalized = String(value).trim().toLowerCase();
  return ['true', '1', 'yes', 'on'].includes(normalized);
};

const parseTags = (raw) => {
  if (Array.isArray(raw)) return raw.map((t) => String(t).trim()).filter(Boolean);
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map((t) => String(t).trim()).filter(Boolean);
    } catch {
      return raw
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
    }
  }
  return [];
};

/**
 * @swagger
 * /cms/blogs:
 *   get:
 *     summary: Get blog CMS bundle (settings, categories, tags, posts)
 *     description: >
 *       Consolidated admin read endpoint. Returns page settings, taxonomy, tags,
 *       paginated posts, and optionally a single post when `postId` is provided.
 *     tags: [CMS Blogs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: postId
 *         schema:
 *           type: string
 *         description: Optional blog post ObjectId to include `post` in response.
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by title, slug, or excerpt.
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 50
 *           default: 10
 *     responses:
 *       200:
 *         description: Blog management data fetched successfully
 *       404:
 *         description: Blog post not found (when postId is provided)
 *       500:
 *         description: Server error
 */
const getBlogsAdmin = asyncHandler(async (req, res) => {
  const { postId, search = '', page = 1, limit = 10 } = req.query;
  const pageNum = Math.max(parseInt(page, 10) || 1, 1);
  const limitNum = Math.min(Math.max(parseInt(limit, 10) || 10, 1), 50);
  const skip = (pageNum - 1) * limitNum;

  const [settings, categories] = await Promise.all([getBlogSettings(), listActiveCategories()]);

  const filter = {};
  if (search && String(search).trim()) {
    const term = escapeRegex(search.trim());
    filter.$or = [
      { title: { $regex: term, $options: 'i' } },
      { slug: { $regex: term, $options: 'i' } },
      { excerpt: { $regex: term, $options: 'i' } },
    ];
  }

  const [posts, total, allTagsSource] = await Promise.all([
    BlogPost.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limitNum).lean(),
    BlogPost.countDocuments(filter),
    BlogPost.find({}).select('tags').lean(),
  ]);

  const payload = {
    settings,
    categories,
    tags: uniqueTagsFromPosts(allTagsSource),
    posts: posts.map(mapAdminPost),
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      pages: Math.ceil(total / limitNum) || 1,
    },
  };

  if (postId && Types.ObjectId.isValid(postId)) {
    const post = await BlogPost.findById(postId).lean();
    if (!post) {
      return failure(res, 404, 'Blog post not found', 'NOT_FOUND');
    }
    payload.post = mapAdminPost(post);
  }

  return success(res, 'Blog management data fetched successfully', payload);
});

/**
 * @swagger
 * /cms/blogs:
 *   post:
 *     summary: Blog CMS mutations (settings, save post, delete post)
 *     description: >
 *       Consolidated admin write endpoint.
 *       Supported actions: `save-settings`, `save-post`, `delete-post`.
 *       For `save-post`, send multipart/form-data with optional `coverImage` file.
 *     tags: [CMS Blogs]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [action]
 *             properties:
 *               action:
 *                 type: string
 *                 enum: [save-settings, save-post, delete-post]
 *               settings:
 *                 type: object
 *                 description: Required for save-settings.
 *               postId:
 *                 type: string
 *                 description: Required for delete-post; optional for save-post (update).
 *               title:
 *                 type: string
 *               slug:
 *                 type: string
 *               excerpt:
 *                 type: string
 *               content:
 *                 type: string
 *               categorySlug:
 *                 type: string
 *               subcategorySlug:
 *                 type: string
 *               tags:
 *                 type: array
 *                 items:
 *                   type: string
 *               authorName:
 *                 type: string
 *               readingTime:
 *                 type: integer
 *               publishDate:
 *                 type: string
 *                 format: date
 *               displayOrder:
 *                 type: integer
 *               isFeatured:
 *                 type: boolean
 *               isPublished:
 *                 type: boolean
 *               allowComments:
 *                 type: boolean
 *               coverImage:
 *                 type: string
 *               removeImage:
 *                 type: boolean
 *               metaTitle:
 *                 type: string
 *               metaDescription:
 *                 type: string
 *               metaKeywords:
 *                 type: string
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [action]
 *             properties:
 *               action:
 *                 type: string
 *                 enum: [save-settings, save-post, delete-post]
 *               coverImage:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Settings saved, post saved, or post deleted successfully
 *       400:
 *         description: Validation error
 *       404:
 *         description: Blog post not found
 *       500:
 *         description: Server error (including cover upload failure)
 */
const mutateBlogsAdmin = asyncHandler(async (req, res) => {
  const action = String(req.body?.action || '').trim().toLowerCase();
  const adminId = req.admin?._id;

  if (!action) {
    return failure(res, 400, 'action is required', 'VALIDATION_ERROR');
  }

  if (action === 'save-settings') {
    let settingsPayload = req.body?.settings;
    if (typeof settingsPayload === 'string') {
      try {
        settingsPayload = JSON.parse(settingsPayload);
      } catch {
        return failure(res, 400, 'Invalid settings JSON', 'VALIDATION_ERROR');
      }
    }
    const saved = await saveBlogSettings(settingsPayload || {}, adminId);
    return success(res, 'Blog settings saved successfully', { settings: saved });
  }

  if (action === 'delete-post') {
    const postId = req.body?.postId || req.body?.id;
    if (!postId || !Types.ObjectId.isValid(postId)) {
      return failure(res, 400, 'postId is required', 'VALIDATION_ERROR');
    }
    const deleted = await BlogPost.findByIdAndDelete(postId);
    if (!deleted) {
      return failure(res, 404, 'Blog post not found', 'NOT_FOUND');
    }
    return success(res, 'Blog post deleted successfully', { postId: String(postId) });
  }

  if (action === 'save-post') {
    const postId = req.body?.postId || req.body?.id;
    const title = String(req.body?.title || '').trim();
    const content = String(req.body?.content || '').trim();

    if (!title) return failure(res, 400, 'title is required', 'VALIDATION_ERROR');
    if (!content) return failure(res, 400, 'content is required', 'VALIDATION_ERROR');

    let slug = String(req.body?.slug || '').trim().toLowerCase() || generateSlug(title);
    const duplicateSlug = await BlogPost.findOne({
      slug,
      ...(postId && Types.ObjectId.isValid(postId) ? { _id: { $ne: postId } } : {}),
    }).lean();
    if (duplicateSlug) {
      slug = `${slug}-${Date.now()}`;
    }

    const isPublished = parseBoolean(req.body?.isPublished, false);
    const publishedAtRaw = req.body?.publishDate || req.body?.publishedAt;
    const publishedAt = publishedAtRaw ? new Date(publishedAtRaw) : isPublished ? new Date() : null;

    const update = {
      title,
      slug,
      excerpt: String(req.body?.excerpt || '').trim(),
      content,
      categorySlug: String(req.body?.categorySlug || req.body?.categoryId || '').trim().toLowerCase(),
      subcategorySlug: String(req.body?.subcategorySlug || '').trim().toLowerCase(),
      tags: parseTags(req.body?.tags ?? req.body?.tagIds),
      authorName: String(req.body?.authorName || 'Admin').trim() || 'Admin',
      readingTime: Math.max(parseInt(req.body?.readingTime, 10) || 5, 1),
      isFeatured: parseBoolean(req.body?.isFeatured, false),
      displayOrder: parseInt(req.body?.displayOrder, 10) || 0,
      status: isPublished ? 'published' : 'draft',
      publishedAt: isPublished ? publishedAt || new Date() : null,
      allowComments: parseBoolean(req.body?.allowComments, true),
      metaTitle: String(req.body?.metaTitle || req.body?.seoMetaTitle || '').trim(),
      metaDescription: String(req.body?.metaDescription || req.body?.seoMetaDescription || '').trim(),
      metaKeywords: String(req.body?.metaKeywords || req.body?.seoMetaKeywords || '').trim(),
      createdBy: adminId,
    };

    if (req.body?.removeImage === true || req.body?.removeImage === 'true') {
      update.featuredImage = '';
    } else if (req.file) {
      try {
        const uploaded = await uploadService.upload(req.file, 'blog', { generateThumbnail: false });
        update.featuredImage =
          uploadService.toStoredProfileFilename(uploaded.filename) || uploaded.filename || '';
      } catch (error) {
        logger.error('Blog cover upload failed', { error: error.message });
        return failure(res, 500, 'Failed to upload cover image', 'SERVER_ERROR');
      }
    } else if (req.body?.coverImage) {
      update.featuredImage = normalizeImageFilename(req.body.coverImage);
    }

    let post;
    if (postId && Types.ObjectId.isValid(postId)) {
      post = await BlogPost.findByIdAndUpdate(postId, update, { new: true }).lean();
      if (!post) {
        return failure(res, 404, 'Blog post not found', 'NOT_FOUND');
      }
    } else {
      post = (await BlogPost.create(update)).toObject();
    }

    return success(res, 'Blog post saved successfully', { post: mapAdminPost(post) });
  }

  return failure(res, 400, 'Invalid action', 'VALIDATION_ERROR');
});

module.exports = {
  getBlogsAdmin,
  mutateBlogsAdmin,
};
