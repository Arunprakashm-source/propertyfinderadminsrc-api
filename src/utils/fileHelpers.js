const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { randomUUID } = require('crypto');

const FILE_CATEGORIES = {
  IMAGE: 'image',
  DOCUMENT: 'document',
  VIDEO: 'video',
};

const ALLOWED_EXTENSIONS = {
  image: ['jpg', 'jpeg', 'png', 'webp'],
  document: ['pdf', 'doc', 'docx'],
  video: ['mp4', 'webm'],
};

const MIME_TYPES = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  mp4: 'video/mp4',
  webm: 'video/webm',
};

const MAX_FILE_SIZES = {
  image: Number(process.env.MAX_IMAGE_SIZE_BYTES || 5 * 1024 * 1024),
  document: Number(process.env.MAX_DOCUMENT_SIZE_BYTES || 10 * 1024 * 1024),
  video: Number(process.env.MAX_VIDEO_SIZE_BYTES || 1024 * 1024 * 1024), // 1GB default
};

const PUBLIC_URL = (process.env.PUBLIC_URL || '').replace(/\/$/, '') || '';

const normalizeMime = (value) => String(value || '').toLowerCase();

const getAllowedImageTypes = () =>
  ALLOWED_EXTENSIONS.image
    .map((ext) => MIME_TYPES[ext])
    .filter(Boolean);

const getAllowedDocumentTypes = () =>
  ALLOWED_EXTENSIONS.document
    .map((ext) => MIME_TYPES[ext])
    .filter(Boolean);

const isImage = (mimetype) => getAllowedImageTypes().includes(normalizeMime(mimetype));

const isDocument = (mimetype) => getAllowedDocumentTypes().includes(normalizeMime(mimetype));

const isVideo = (mimetype) => {
  const normalized = normalizeMime(mimetype);
  return normalized === 'video/mp4' || normalized === 'video/webm';
};

const getFileCategory = (mimetype) => {
  if (isImage(mimetype)) return FILE_CATEGORIES.IMAGE;
  if (isDocument(mimetype)) return FILE_CATEGORIES.DOCUMENT;
  if (isVideo(mimetype)) return FILE_CATEGORIES.VIDEO;
  return 'unknown';
};

const getFileExtension = (filename = '') => {
  const ext = path.extname(filename).replace(/^\./, '').toLowerCase();
  return ext || null;
};

const getMimeTypeFromExtension = (extension = '') => MIME_TYPES[String(extension || '').toLowerCase()];

const getExtensionFromMime = (mimetype = '') => {
  const normalized = normalizeMime(mimetype);
  const entry = Object.entries(MIME_TYPES).find(([, mime]) => mime === normalized);
  return entry ? entry[0] : null;
};

const sanitizeFilename = (filename = '') => {
  const parsed = path.parse(filename);
  const base = parsed.name || 'file';
  const cleanedBase = base.replace(/[^a-z0-9_-]/gi, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '');
  const ext = parsed.ext ? parsed.ext.replace(/^\./, '') : '';
  const safeExt = ext ? `.${ext}` : '';
  return `${cleanedBase || 'file'}${safeExt}`;
};

const generateUniqueFilename = (originalname = '', category) => {
  const parsed = path.parse(originalname);
  const extFromName = getFileExtension(parsed.base);
  const defaultExt = ALLOWED_EXTENSIONS[category]?.[0] || 'dat';
  const extension = extFromName && MIME_TYPES[extFromName] ? extFromName : defaultExt;
  const safeBase = sanitizeFilename(parsed.name || 'file').replace(/\.[^.]+$/, '');
  return `${safeBase}-${randomUUID()}.${extension}`;
};

const getMaxFileSize = (category) => {
  const normalized = (category || '').toLowerCase();
  return MAX_FILE_SIZES[normalized] || 0;
};

const validateImageFile = (file = {}) => {
  if (!file) throw new Error('File payload is required');
  if (!isImage(file.mimetype)) throw new Error('Invalid image type');
  const maxSize = getMaxFileSize(FILE_CATEGORIES.IMAGE);
  if (file.size && file.size > maxSize) {
    throw new Error(`Image exceeds maximum size of ${formatFileSize(maxSize)}`);
  }
  return true;
};

const validateDocumentFile = (file = {}) => {
  if (!file) throw new Error('File payload is required');
  if (!isDocument(file.mimetype)) throw new Error('Invalid document type');
  const maxSize = getMaxFileSize(FILE_CATEGORIES.DOCUMENT);
  if (file.size && file.size > maxSize) {
    throw new Error(`Document exceeds maximum size of ${formatFileSize(maxSize)}`);
  }
  return true;
};

const validateFile = (file, category) => {
  const normalized = (category || '').toLowerCase();
  if (normalized === FILE_CATEGORIES.IMAGE) return validateImageFile(file);
  if (normalized === FILE_CATEGORIES.DOCUMENT) return validateDocumentFile(file);
  throw new Error('Unsupported file category');
};

const formatFileSize = (bytes = 0) => {
  if (bytes === 0) return '0 Bytes';
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const value = bytes / 1024 ** i;
  return `${value.toFixed(value >= 10 || i === 0 ? 0 : 1)} ${sizes[i]}`;
};

const deleteLocalFile = async (filepath) => {
  if (!filepath) return false;
  try {
    await fs.promises.unlink(filepath);
    return true;
  } catch (err) {
    if (err.code === 'ENOENT') return false;
    throw err;
  }
};

const ensureDirectoryExists = async (dirPath) => fs.promises.mkdir(dirPath, { recursive: true });

const getPublicUrl = (filename, folder = '') => {
  const normalizedFolder = folder ? folder.replace(/^\/+|\/+$/g, '') : '';
  const pathPart = normalizedFolder ? `/${normalizedFolder}` : '';
  const base = PUBLIC_URL || '';
  if (!base) return `${pathPart}/${filename}`.replace(/\/+/g, '/');
  return `${base}${pathPart}/${filename}`.replace(/([^:]\/)\/+/g, '$1');
};

const extractS3Key = (s3Url) => {
  if (!s3Url) return null;
  try {
    const url = new URL(s3Url);
    const pathname = url.pathname.replace(/^\/+/, '');
    const host = url.hostname;

    if (/^[^.]+\.s3[.-][^/]+/.test(host)) {
      return pathname;
    }

    const segments = pathname.split('/');
    if (segments.length > 1) {
      segments.shift();
      return segments.join('/');
    }
    return pathname;
  } catch {
    return null;
  }
};

const constructS3Url = (bucket, region, key) => {
  if (!bucket || !region || !key) throw new Error('bucket, region and key are required');
  const normalizedKey = String(key).replace(/^\/+/, '');
  return `https://${bucket}.s3.${region}.amazonaws.com/${normalizedKey}`;
};

const optimizeImage = async (buffer, options = {}) => {
  const { width = 1920, quality = 80, format = 'webp' } = options;
  return sharp(buffer)
    .rotate()
    .resize({ width, fit: 'inside', withoutEnlargement: true })
    .toFormat(format, { quality })
    .toBuffer();
};

const generateThumbnail = async (buffer, size = 300) =>
  sharp(buffer)
    .rotate()
    .resize(size, size, { fit: 'cover' })
    .toFormat('webp', { quality: 80 })
    .toBuffer();

const getImageDimensions = async (buffer) => {
  const metadata = await sharp(buffer).metadata();
  return { width: metadata.width || 0, height: metadata.height || 0 };
};

const getDocumentInfo = async (buffer, mimetype) => {
  const extension = getExtensionFromMime(mimetype) || null;
  return {
    mimetype: normalizeMime(mimetype),
    extension,
    size: buffer?.length || 0,
    isPdf: mimetype ? normalizeMime(mimetype) === MIME_TYPES.pdf : false,
  };
};

const isValidPDF = (buffer) => {
  if (!buffer || buffer.length < 4) return false;
  const header = buffer.slice(0, 4).toString();
  return header === '%PDF';
};

const getDocumentPageCount = (buffer, mimetype) => {
  if (!buffer) return 0;
  const normalized = normalizeMime(mimetype);
  if (normalized === MIME_TYPES.pdf || isValidPDF(buffer)) {
    const text = buffer.toString('latin1');
    const matches = text.match(/\/Type\s*\/Page\b/gi);
    return matches ? matches.length : 0;
  }
  return 0;
};

module.exports = {
  FILE_CATEGORIES,
  ALLOWED_EXTENSIONS,
  MIME_TYPES,
  isImage,
  isDocument,
  isVideo,
  getAllowedImageTypes,
  getAllowedDocumentTypes,
  getFileCategory,
  validateImageFile,
  validateDocumentFile,
  validateFile,
  generateUniqueFilename,
  sanitizeFilename,
  getFileExtension,
  getMimeTypeFromExtension,
  formatFileSize,
  getMaxFileSize,
  deleteLocalFile,
  ensureDirectoryExists,
  getPublicUrl,
  extractS3Key,
  constructS3Url,
  optimizeImage,
  generateThumbnail,
  getImageDimensions,
  getDocumentInfo,
  isValidPDF,
  getDocumentPageCount,
};

