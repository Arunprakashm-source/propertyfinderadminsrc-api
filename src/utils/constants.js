const ADMIN_ROLES = {
  ADMIN: 'admin',
};

const AUTH_PROVIDERS = {
  EMAIL: 'email',
  GOOGLE: 'google',
  APPLE: 'apple',
  PHONE: 'phone',
};

const LISTING_TYPES = {
  BUY: 'buy',
  RENT: 'rent',
  COMMERCIAL_BUY: 'commercial-buy',
  COMMERCIAL_RENT: 'commercial-rent',
};

const AGENT_TYPES = {
  AGENT: 'agent',
  SUPER_AGENT: 'superagent',
};

const SUBSCRIPTION_STATUS = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  EXPIRED: 'expired',
};

const INQUIRY_STATUS = {
  NEW: 'new',
  ATTENDED: 'attended',
  CLOSED: 'closed',
};

const ERROR_CODES = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  AUTHENTICATION_FAILED: 'AUTHENTICATION_FAILED',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  RATE_LIMITED: 'RATE_LIMITED',
  SERVER_ERROR: 'SERVER_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  TIMEOUT: 'TIMEOUT',
  UNKNOWN_ERROR: 'UNKNOWN_ERROR',
};

const DOC_EXTENSIONS = ['pdf', 'doc', 'docx'];
const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp'];

module.exports = {
  ADMIN_ROLES,
  AUTH_PROVIDERS,
  LISTING_TYPES,
  AGENT_TYPES,
  SUBSCRIPTION_STATUS,
  INQUIRY_STATUS,
  ERROR_CODES,
  DOC_EXTENSIONS,
  IMAGE_EXTENSIONS,
};

