const multer = require('multer');
const path = require('path');
const fileHelpers = require('../utils/fileHelpers');

const {
  FILE_CATEGORIES,
  formatFileSize,
  getMaxFileSize,
  isImage,
  isDocument,
  isVideo: isVideoHelper,
  getFileCategory,
} = fileHelpers;

const isVideo = (mimetype) => isVideoHelper(mimetype);

// Parse env values that may be provided in bytes or with KB/MB/GB suffixes.
const parseSize = (value, fallback) => {
  if (value === undefined || value === null || value === '') return fallback;
  const numericValue = Number(value);
  if (!Number.isNaN(numericValue) && numericValue > 0) return numericValue;

  const match = String(value)
    .trim()
    .match(/^(\d+(?:\.\d+)?)\s*(kb|mb|gb)?$/i);

  if (!match) return fallback;

  const amount = Number(match[1]);
  const unit = (match[2] || 'bytes').toLowerCase();
  const multiplier =
    unit === 'gb' ? 1024 ** 3 : unit === 'mb' ? 1024 ** 2 : unit === 'kb' ? 1024 : 1;

  return Math.round(amount * multiplier);
};

const MAX_IMAGE_SIZE = parseSize(
  process.env.MAX_IMAGE_SIZE || process.env.MAX_IMAGE_SIZE_BYTES,
  getMaxFileSize(FILE_CATEGORIES.IMAGE)
);

const MAX_DOCUMENT_SIZE = parseSize(
  process.env.MAX_DOCUMENT_SIZE || process.env.MAX_DOCUMENT_SIZE_BYTES,
  getMaxFileSize(FILE_CATEGORIES.DOCUMENT)
);

const MAX_VIDEO_SIZE = parseSize(
  process.env.MAX_VIDEO_SIZE || process.env.MAX_VIDEO_SIZE_BYTES,
  1024 * 1024 * 1024 // 1GB default
);

// Memory storage keeps uploaded files in RAM buffers
const memoryStorage = multer.memoryStorage();

const createInvalidTypeError = (file, message) => {
  const err = new Error(message);
  err.code = 'INVALID_FILE_TYPE';
  err.field = file?.fieldname;
  err.extension = path.extname(file?.originalname || '');
  return err;
};

const imageFileFilter = (req, file, cb) => {
  if (isImage(file.mimetype)) return cb(null, true);
  return cb(createInvalidTypeError(file, 'Only image files are allowed'), false);
};

const documentFileFilter = (req, file, cb) => {
  if (isDocument(file.mimetype)) return cb(null, true);
  return cb(createInvalidTypeError(file, 'Only document files are allowed'), false);
};

const videoFileFilter = (req, file, cb) => {
  if (isVideo(file.mimetype)) return cb(null, true);
  return cb(createInvalidTypeError(file, 'Only video files (MP4, WebM) are allowed'), false);
};

const mixedFileFilter = (req, file, cb) => {
  const category = getFileCategory(file.mimetype);
  if (category === FILE_CATEGORIES.IMAGE || category === FILE_CATEGORIES.DOCUMENT) {
    return cb(null, true);
  }
  return cb(createInvalidTypeError(file, 'Only image or document files are allowed'), false);
};

const imageUpload = multer({
  storage: memoryStorage,
  fileFilter: imageFileFilter,
  limits: { fileSize: MAX_IMAGE_SIZE },
});

const documentUpload = multer({
  storage: memoryStorage,
  fileFilter: documentFileFilter,
  limits: { fileSize: MAX_DOCUMENT_SIZE },
});

const videoUpload = multer({
  storage: memoryStorage,
  fileFilter: videoFileFilter,
  limits: { fileSize: MAX_VIDEO_SIZE },
});

const mixedUpload = multer({
  storage: memoryStorage,
  fileFilter: mixedFileFilter,
  limits: { fileSize: MAX_DOCUMENT_SIZE }, // use larger document limit for mixed uploads
});

// Single file uploads
const uploadSingleImage = (fieldName = 'image') => imageUpload.single(fieldName);
const uploadSingleDocument = (fieldName = 'document') => documentUpload.single(fieldName);
const uploadSingleVideo = (fieldName = 'video') => videoUpload.single(fieldName);
const uploadSingleFile = (fieldName = 'file') => mixedUpload.single(fieldName);

// Multiple file uploads
const uploadMultipleImages = (fieldName = 'images', maxCount = 50) =>
  imageUpload.array(fieldName, maxCount);

const uploadMultipleDocuments = (fieldName = 'documents', maxCount = 10) =>
  documentUpload.array(fieldName, maxCount);

const uploadMultipleFiles = (fieldName = 'files', maxCount = 50) =>
  mixedUpload.array(fieldName, maxCount);

// Multiple fields - for property media (images + video)
const uploadPropertyMedia = () =>
  multer({
    storage: memoryStorage,
    fileFilter: (req, file, cb) => {
      if (isImage(file.mimetype) || isVideo(file.mimetype)) return cb(null, true);
      return cb(createInvalidTypeError(file, 'Only image or video files are allowed'), false);
    },
    limits: { fileSize: Math.max(MAX_IMAGE_SIZE, MAX_VIDEO_SIZE) },
  }).fields([
    { name: 'images', maxCount: 50 },
    { name: 'video', maxCount: 1 },
  ]);

// Multiple fields - for project media (images + masterPlan + brochure + video)
const uploadProjectMedia = () =>
  multer({
    storage: memoryStorage,
    fileFilter: (req, file, cb) => {
      // Allow images, documents (PDF), and videos
      if (isImage(file.mimetype) || isDocument(file.mimetype) || isVideo(file.mimetype)) {
        return cb(null, true);
      }
      return cb(createInvalidTypeError(file, 'Only image, document (PDF), or video files are allowed'), false);
    },
    limits: { fileSize: Math.max(MAX_IMAGE_SIZE, MAX_DOCUMENT_SIZE, MAX_VIDEO_SIZE) },
  }).fields([
    { name: 'images', maxCount: 50 },
    { name: 'masterPlan', maxCount: 1 },
    { name: 'brochure', maxCount: 1 },
    { name: 'video', maxCount: 1 },
  ]);

// Multiple fields
const uploadImageFields = (fieldsArray = []) => imageUpload.fields(fieldsArray);
const uploadDocumentFields = (fieldsArray = []) => documentUpload.fields(fieldsArray);
const uploadMixedFields = (fieldsArray = []) => mixedUpload.fields(fieldsArray);

const multerErrorHandler = (err, req, res, next) => {
  if (!err) return next();

  // Multer provides a limit property for size/count errors
  const limit = err.limit || undefined;
  let message = 'Upload error';

  switch (err.code) {
    case 'LIMIT_FILE_SIZE':
      message = `File too large. Max size: ${formatFileSize(limit || MAX_DOCUMENT_SIZE)}`;
      break;
    case 'LIMIT_FILE_COUNT':
      message = `Too many files. Max count: ${limit || 'not specified'}`;
      break;
    case 'LIMIT_UNEXPECTED_FILE':
      message = `Unexpected field: ${err.field || 'file'}`;
      break;
    case 'INVALID_FILE_TYPE':
      message = err.message || 'Invalid file type';
      break;
    default:
      if (err instanceof multer.MulterError) {
        message = err.message || 'Multer error';
      } else if (err.message) {
        message = err.message;
      }
  }

  return res.status(400).json({ success: false, message });
};

// Example usage:
// uploadSingleImage('profilePicture')
// uploadMultipleImages('propertyImages', 50)
// uploadSingleDocument('brochure')
// uploadMultipleDocuments('registrationDocuments', 5)
// uploadMixedFields([
//   { name: 'images', maxCount: 50 },
//   { name: 'documents', maxCount: 10 },
// ])

module.exports = {
  imageFileFilter,
  documentFileFilter,
  videoFileFilter,
  mixedFileFilter,
  imageUpload,
  documentUpload,
  videoUpload,
  mixedUpload,
  uploadSingleImage,
  uploadSingleDocument,
  uploadSingleVideo,
  uploadSingleFile,
  uploadMultipleImages,
  uploadMultipleDocuments,
  uploadMultipleFiles,
  uploadImageFields,
  uploadDocumentFields,
  uploadMixedFields,
  uploadPropertyMedia,
  uploadProjectMedia,
  multerErrorHandler,
  isVideo,
};

