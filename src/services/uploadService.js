const { S3Client, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const sharp = require('sharp');
const fs = require('fs-extra');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const MAX_FILE_SIZE = Number(process.env.MAX_UPLOAD_SIZE_BYTES || 5 * 1024 * 1024);
const MAX_VIDEO_SIZE = Number(process.env.MAX_VIDEO_SIZE_BYTES || 1024 * 1024 * 1024); // 1GB default
const LOCAL_UPLOAD_PATH = process.env.LOCAL_UPLOAD_PATH || path.join(process.cwd(), 'uploads');
const PUBLIC_BASE_URL = (process.env.PUBLIC_URL || '').replace(/\/$/, '') || 'http://localhost:5000';
const UPLOADS_BASE_URL = `${PUBLIC_BASE_URL}/uploads`;
const THUMB_WIDTH = 300;
const THUMB_HEIGHT = 300;
const MAIN_MAX_WIDTH = 1920;
const QUALITY = 80;

const isImage = (mimetype = '') => mimetype.startsWith('image/');
const isVideo = (mimetype = '') => mimetype.startsWith('video/');
const isDocument = (mimetype = '') => {
  const normalized = mimetype.toLowerCase();
  return (
    normalized === 'application/pdf' ||
    normalized === 'application/msword' ||
    normalized === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  );
};

const getFileBuffer = async (file) => {
  if (file?.buffer) return file.buffer;
  if (file?.path) return fs.readFile(file.path);
  throw new Error('Invalid file payload: missing buffer or path');
};

// Helper to get file type keyword (img, vid, doc)
const getFileTypeKeyword = (mimetype = '') => {
  if (isImage(mimetype)) return 'img';
  if (isVideo(mimetype)) return 'vid';
  if (isDocument(mimetype)) return 'doc';
  return 'img'; // default
};

// Helper to build folder path in format: {type}/{entity}
const buildFolderPath = (type, entity) => {
  return `${type}/${entity}`;
};

// Generate minimized unique filename (just UUID + extension)
const buildFilename = (originalname = '', mimetype = '') => {
  const ext = isImage(mimetype) ? '.webp' : path.extname(originalname).toLowerCase() || '.webp';
  return `${uuidv4()}${ext}`;
};

const buildVideoFilename = (originalname = '') => {
  const ext = path.extname(originalname).toLowerCase() || '.mp4';
  return `${uuidv4()}${ext}`;
};

const buildDocumentFilename = (originalname = '') => {
  const ext = path.extname(originalname).toLowerCase() || '.pdf';
  return `${uuidv4()}${ext}`;
};

const optimizeImage = async (buffer, { width = MAIN_MAX_WIDTH, quality = QUALITY } = {}) =>
  sharp(buffer)
    .rotate()
    .resize({ width, fit: 'inside', withoutEnlargement: true })
    .webp({ quality })
    .toBuffer();

const createThumbnail = async (buffer) =>
  sharp(buffer)
    .rotate()
    .resize(THUMB_WIDTH, THUMB_HEIGHT, { fit: 'cover' })
    .webp({ quality: QUALITY })
    .toBuffer();

class UploadStrategy {
  async upload() {
    throw new Error('upload() not implemented');
  }

  async delete() {
    throw new Error('delete() not implemented');
  }

  async uploadMultiple(files, folder, options = {}) {
    if (!Array.isArray(files)) throw new Error('files must be an array');
    return Promise.all(files.map((file) => this.upload(file, folder, options)));
  }
}

const buildPublicFileUrl = (relativePath = '') => {
  const cleanPath = `${relativePath}`.replace(/^\/+/, '').replace(/\\/g, '/');
  if (!cleanPath) return null;
  return `${UPLOADS_BASE_URL}/${cleanPath}`;
};

const resolveLocalStoragePath = (identifier) => {
  if (!identifier) throw new Error('File identifier is required for deletion');
  let targetPath = `${identifier}`;

  try {
    const parsed = new URL(targetPath);
    targetPath = parsed.pathname;
  } catch {
    // Input is not a full URL, keep as-is
  }

  targetPath = targetPath.replace(/^\/+/, '');
  if (targetPath.startsWith('uploads/')) {
    targetPath = targetPath.replace(/^uploads\//, '');
  }

  return targetPath;
};

const resolveS3ObjectKey = (identifier) => {
  if (!identifier) throw new Error('File identifier is required for deletion');
  let key = `${identifier}`;
  try {
    const parsed = new URL(key);
    key = parsed.pathname;
  } catch {
    // Input is not a full URL
  }
  return key.replace(/^\/+/, '');
};

class LocalStorageStrategy extends UploadStrategy {
  constructor() {
    super();
    this.baseDir = LOCAL_UPLOAD_PATH;
  }

  async ensureFolder(folder) {
    const target = path.join(this.baseDir, folder || '');
    await fs.ensureDir(target);
    return target;
  }

  async validateFile(file, allowVideo = false) {
    if (!file) throw new Error('No file provided');
    const isValid = allowVideo ? (isImage(file.mimetype) || isVideo(file.mimetype)) : isImage(file.mimetype);
    if (!isValid) {
      const msg = allowVideo
        ? 'File type not allowed. Only images and videos are supported.'
        : 'File type not allowed. Only images are supported.';
      throw new Error(msg);
    }
    const maxSize = allowVideo && isVideo(file.mimetype) ? MAX_VIDEO_SIZE : MAX_FILE_SIZE;
    if (file.size > maxSize) {
      const sizeMB = Math.round(maxSize / (1024 * 1024));
      throw new Error(`File exceeds maximum size of ${sizeMB}MB`);
    }
  }

  async upload(file, entity = '', options = {}) {
    const allowVideo = options.allowVideo || false;
    const allowDocument = options.allowDocument || false;
    await this.validateFile(file, allowVideo, allowDocument);
    const buffer = await getFileBuffer(file);
    const isVideoFile = isVideo(file.mimetype);
    const isDocumentFile = isDocument(file.mimetype);
    
    // Build folder path: {type}/{entity}
    const fileType = getFileTypeKeyword(file.mimetype);
    const folder = buildFolderPath(fileType, entity);

    // Handle video uploads (no optimization)
    if (isVideoFile) {
      const filename = buildVideoFilename(file.originalname);
      const targetDir = await this.ensureFolder(folder);
      const filePath = path.join(targetDir, filename);
      await fs.writeFile(filePath, buffer);
      const relativePath = `${folder}/${filename}`;
      return {
        url: buildPublicFileUrl(relativePath),
        filename,
        size: buffer.length,
        mimetype: file.mimetype,
        path: relativePath,
      };
    }

    // Handle document uploads (no optimization)
    if (isDocumentFile) {
      const filename = buildDocumentFilename(file.originalname);
      const targetDir = await this.ensureFolder(folder);
      const filePath = path.join(targetDir, filename);
      await fs.writeFile(filePath, buffer);
      const relativePath = `${folder}/${filename}`;
      return {
        url: buildPublicFileUrl(relativePath),
        filename,
        size: buffer.length,
        mimetype: file.mimetype,
        path: relativePath,
      };
    }

    // Handle image uploads (with optimization)
    const optimized = await optimizeImage(buffer, options);
    const filename = buildFilename(file.originalname, file.mimetype);
    const targetDir = await this.ensureFolder(folder);
    const filePath = path.join(targetDir, filename);

    let thumbnailUrl = null;
    try {
      await fs.writeFile(filePath, optimized);

      if (options.generateThumbnail) {
        const thumbBuffer = await createThumbnail(buffer);
        const thumbName = `thumb-${filename}`;
        const thumbPath = path.join(targetDir, thumbName);
        await fs.writeFile(thumbPath, thumbBuffer);
        const thumbRelativePath = `${folder ? `${folder}/` : ''}${thumbName}`;
        thumbnailUrl = buildPublicFileUrl(thumbRelativePath);
      }

      const relativePath = `${folder ? `${folder}/` : ''}${filename}`;
      return {
        url: buildPublicFileUrl(relativePath),
        filename,
        size: optimized.length,
        mimetype: 'image/webp',
        thumbnail: thumbnailUrl,
        path: relativePath,
      };
    } catch (err) {
      // Clean up any partially written files
      await fs.remove(filePath).catch(() => {});
      throw err;
    }
  }

  async delete(fileUrl) {
    if (!fileUrl) throw new Error('File URL is required for deletion');
    try {
      const relativePath = resolveLocalStoragePath(fileUrl);
      const absolutePath = path.join(this.baseDir, relativePath);
      await fs.remove(absolutePath);
      const thumbPath = path.join(path.dirname(absolutePath), `thumb-${path.basename(absolutePath)}`);
      await fs.remove(thumbPath).catch(() => {});
      return true;
    } catch (err) {
      throw new Error(`Failed to delete local file: ${err.message}`);
    }
  }
}

class S3StorageStrategy extends UploadStrategy {
  constructor() {
    super();
    const region = process.env.AWS_REGION;
    const bucket = process.env.AWS_S3_BUCKET;
    const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
    const cloudfrontUrl = process.env.AWS_CLOUDFRONT_URL || process.env.CLOUDFRONT_URL;

    if (!region || !bucket || !accessKeyId || !secretAccessKey) {
      throw new Error('Invalid S3 credentials or configuration');
    }

    this.region = region;
    this.bucket = bucket;
    this.cloudfrontUrl = cloudfrontUrl ? cloudfrontUrl.replace(/\/$/, '') : null;
    this.client = new S3Client({
      region,
      credentials: { accessKeyId, secretAccessKey },
    });
  }

  buildFileUrl(key) {
    // Use CloudFront URL if available, otherwise use direct S3 URL
    if (this.cloudfrontUrl) {
      return `${this.cloudfrontUrl}/${key}`;
    }
    return `https://${this.bucket}.s3.${this.region}.amazonaws.com/${key}`;
  }

  getBaseUrl() {
    // Return base URL without trailing slash for S3/CloudFront
    if (this.cloudfrontUrl) {
      return this.cloudfrontUrl;
    }
    return `https://${this.bucket}.s3.${this.region}.amazonaws.com`;
  }

  async validateFile(file, allowVideo = false, allowDocument = false) {
    if (!file) throw new Error('No file provided');
    let isValid = false;
    if (allowDocument) {
      isValid = isImage(file.mimetype) || isVideo(file.mimetype) || isDocument(file.mimetype);
    } else if (allowVideo) {
      isValid = isImage(file.mimetype) || isVideo(file.mimetype);
    } else {
      isValid = isImage(file.mimetype);
    }
    
    if (!isValid) {
      let msg = 'File type not allowed. Only images are supported.';
      if (allowVideo && allowDocument) {
        msg = 'File type not allowed. Only images, videos, and documents are supported.';
      } else if (allowVideo) {
        msg = 'File type not allowed. Only images and videos are supported.';
      } else if (allowDocument) {
        msg = 'File type not allowed. Only images and documents are supported.';
      }
      throw new Error(msg);
    }
    
    let maxSize = MAX_FILE_SIZE;
    if (isVideo(file.mimetype)) {
      maxSize = MAX_VIDEO_SIZE;
    } else if (isDocument(file.mimetype)) {
      maxSize = Number(process.env.MAX_DOCUMENT_SIZE_BYTES || 10 * 1024 * 1024); // 10MB default
    }
    
    if (file.size > maxSize) {
      const sizeMB = Math.round(maxSize / (1024 * 1024));
      throw new Error(`File exceeds maximum size of ${sizeMB}MB`);
    }
  }

  async upload(file, entity = '', options = {}) {
    const allowVideo = options.allowVideo || false;
    const allowDocument = options.allowDocument || false;
    await this.validateFile(file, allowVideo, allowDocument);
    const buffer = await getFileBuffer(file);
    const isVideoFile = isVideo(file.mimetype);
    const isDocumentFile = isDocument(file.mimetype);
    
    // Build folder path: {type}/{entity}
    const fileType = getFileTypeKeyword(file.mimetype);
    const folder = buildFolderPath(fileType, entity);

    // Handle video uploads (no optimization)
    if (isVideoFile) {
      const filename = buildVideoFilename(file.originalname);
      const key = `${folder}/${filename}`;
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: buffer,
          ContentType: file.mimetype,
        })
      );
      return {
        url: this.buildFileUrl(key),
        filename,
        size: buffer.length,
        mimetype: file.mimetype,
        path: key,
      };
    }

    // Handle document uploads (no optimization)
    if (isDocumentFile) {
      const filename = buildDocumentFilename(file.originalname);
      const key = `${folder}/${filename}`;
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: buffer,
          ContentType: file.mimetype,
        })
      );
      return {
        url: this.buildFileUrl(key),
        filename,
        size: buffer.length,
        mimetype: file.mimetype,
        path: key,
      };
    }

    // Handle image uploads (with optimization)
    const optimized = await optimizeImage(buffer, options);
    const filename = buildFilename(file.originalname, file.mimetype);
    const key = `${folder}/${filename}`;

    let thumbnailUrl = null;
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: optimized,
          ContentType: 'image/webp',
        })
      );

      if (options.generateThumbnail) {
        const thumbBuffer = await createThumbnail(buffer);
        const thumbKey = `${folder}/thumb-${filename}`;
        await this.client.send(
          new PutObjectCommand({
            Bucket: this.bucket,
            Key: thumbKey,
            Body: thumbBuffer,
            ContentType: 'image/webp',
          })
        );
        thumbnailUrl = this.buildFileUrl(thumbKey);
      }

      const relativePath = key;
      return {
        url: this.buildFileUrl(relativePath),
        filename,
        size: optimized.length,
        mimetype: 'image/webp',
        thumbnail: thumbnailUrl,
        path: relativePath,
      };
    } catch (err) {
      throw new Error(`Failed to upload to S3: ${err.message}`);
    }
  }

  async delete(fileUrl) {
    if (!fileUrl) throw new Error('File URL is required for deletion');
    try {
      const key = resolveS3ObjectKey(fileUrl);
      await this.client.send(
        new DeleteObjectCommand({
          Bucket: this.bucket,
          Key: key,
        })
      );
      const thumbKey = path.join(path.dirname(key), `thumb-${path.basename(key)}`).replace(/\\/g, '/');
      await this.client
        .send(
          new DeleteObjectCommand({
            Bucket: this.bucket,
            Key: thumbKey,
          })
        )
        .catch(() => {});
      return true;
    } catch (err) {
      throw new Error(`Failed to delete from S3: ${err.message}`);
    }
  }
}

class CloudinaryStorageStrategy extends UploadStrategy {
  // Placeholder for future implementation
  async upload() {
    throw new Error('Cloudinary storage not yet implemented');
  }

  async delete() {
    throw new Error('Cloudinary storage not yet implemented');
  }
}

class UploadService {
  constructor() {
    const storage = (process.env.UPLOAD_STORAGE || 'local').toLowerCase();
    try {
      if (storage === 's3') {
        this.strategy = new S3StorageStrategy();
        console.info('Using S3 storage strategy');
        // Set uploadsBaseUrl to S3/CloudFront base URL
        this.uploadsBaseUrl = this.strategy.getBaseUrl();
      } else if (storage === 'cloudinary') {
        this.strategy = new CloudinaryStorageStrategy();
        console.info('Using Cloudinary storage strategy');
        this.uploadsBaseUrl = UPLOADS_BASE_URL;
      } else {
        this.strategy = new LocalStorageStrategy();
        console.info('Using local storage strategy');
        this.uploadsBaseUrl = UPLOADS_BASE_URL;
      }
    } catch (err) {
      // Fallback to local on configuration issues
      this.strategy = new LocalStorageStrategy();
      console.warn(`Falling back to local storage: ${err.message}`);
      this.uploadsBaseUrl = UPLOADS_BASE_URL;
    }
  }

  async upload(file, entity, options) {
    return this.strategy.upload(file, entity, options);
  }

  async uploadVideo(file, entity) {
    return this.strategy.upload(file, entity, { allowVideo: true });
  }

  async uploadDocument(file, entity) {
    return this.strategy.upload(file, entity, { allowDocument: true });
  }

  async uploadMultipleDocuments(files, entity) {
    if (!Array.isArray(files)) throw new Error('files must be an array');
    return Promise.all(files.map((file) => this.uploadDocument(file, entity)));
  }

  async delete(fileUrl) {
    return this.strategy.delete(fileUrl);
  }

  async uploadMultiple(files, entity, options) {
    return this.strategy.uploadMultiple(files, entity, options);
  }
}

const uploadService = new UploadService();

// Enhanced getUploadUrl that works with both local and S3 storage
uploadService.getUploadUrl = (relativePath = '') => {
  const cleanPath = `${relativePath}`.replace(/^\/+/, '').replace(/\\/g, '/');
  if (!cleanPath) return null;
  
  // If using S3 strategy, use S3/CloudFront URL
  if (uploadService.strategy && uploadService.strategy.buildFileUrl) {
    return uploadService.strategy.buildFileUrl(cleanPath);
  }
  
  // Fallback to local storage URL
  return buildPublicFileUrl(cleanPath);
};

// Helper function to build standardized upload response
uploadService.buildStandardResponse = (uploads, folders = {}, additionalData = {}) => {
  const baseUrl = uploadService.uploadsBaseUrl || UPLOADS_BASE_URL;
  const cleanBaseUrl = baseUrl.replace(/\/$/, '');
  
  const response = {
    baseUrl: cleanBaseUrl,
    uploads: {
      images: [],
      videos: [],
      documents: []
    },
    baseUrls: {}
  };
  
  // Categorize uploads
  if (Array.isArray(uploads)) {
    uploads.forEach(upload => {
      const item = {
        url: upload.url || uploadService.getUploadUrl(upload.path),
        path: upload.path || upload.filename,
        filename: upload.filename,
        size: upload.size || 0,
        mimetype: upload.mimetype || 'application/octet-stream'
      };
      
      if (upload.thumbnail) {
        item.thumbnail = upload.thumbnail;
      }
      
      // Categorize by mimetype or folder
      if (upload.mimetype && upload.mimetype.startsWith('image/')) {
        response.uploads.images.push(item);
      } else if (upload.mimetype && upload.mimetype.startsWith('video/')) {
        response.uploads.videos.push(item);
      } else {
        response.uploads.documents.push(item);
      }
    });
  } else if (uploads) {
    // Single upload object
    const item = {
      url: uploads.url || uploadService.getUploadUrl(uploads.path),
      path: uploads.path || uploads.filename,
      filename: uploads.filename,
      size: uploads.size || 0,
      mimetype: uploads.mimetype || 'application/octet-stream'
    };
    
    if (uploads.thumbnail) {
      item.thumbnail = uploads.thumbnail;
    }
    
    if (uploads.mimetype && uploads.mimetype.startsWith('image/')) {
      response.uploads.images.push(item);
    } else if (uploads.mimetype && uploads.mimetype.startsWith('video/')) {
      response.uploads.videos.push(item);
    } else {
      response.uploads.documents.push(item);
    }
  }
  
  // Build baseUrls from entities (new structure: {type}/{entity})
  if (folders.images) {
    // folders.images is now the entity name (e.g., 'user', 'property')
    response.baseUrls.images = `${cleanBaseUrl}/img/${folders.images}/`;
  }
  if (folders.videos) {
    // folders.videos is now the entity name (e.g., 'property', 'project')
    response.baseUrls.videos = `${cleanBaseUrl}/vid/${folders.videos}/`;
  }
  if (folders.documents) {
    // folders.documents is now the entity name (e.g., 'agency', 'developer')
    response.baseUrls.documents = `${cleanBaseUrl}/doc/${folders.documents}/`;
  }
  
  // Add any additional data
  Object.assign(response, additionalData);
  
  return response;
};

// uploadsBaseUrl is now set in constructor based on storage strategy
// Only set if not already set (fallback for edge cases)
if (!uploadService.uploadsBaseUrl) {
  uploadService.uploadsBaseUrl = UPLOADS_BASE_URL;
}

/** Get full URL for user profile image. DB stores filename only. */
uploadService.getUserProfileImageUrl = (filename) => {
  if (!filename || typeof filename !== 'string') return null;
  const name = String(filename).trim().replace(/^\/+/, '').replace(/^.*\//, '');
  if (!name) return null;
  const isLocal = (process.env.UPLOAD_STORAGE || '').toLowerCase() === 'local';
  if (isLocal) {
    return `${UPLOADS_BASE_URL}/img/user/${name}`;
  }
  const cloud = (process.env.AWS_CLOUDFRONT_URL || '').replace(/\/$/, '');
  return cloud ? `${cloud}/img/user/${name}` : null;
};

module.exports = uploadService;

