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

/** UI dropdown options for master-data agenttypes (matches main API). */
const AGENT_TYPE_OPTIONS = [
  { name: 'Agent', value: 'agent' },
  { name: 'Super Agent', value: 'superagent' },
];

/** Years of experience options for master-data agentexperience (matches main API). */
const AGENT_EXPERIENCE_OPTIONS = [
  { name: '0-1 years', value: '1' },
  { name: '2 years', value: '2' },
  { name: '3 years', value: '3' },
  { name: '4 years', value: '4' },
  { name: '5 years', value: '5' },
  { name: '6 years', value: '6' },
  { name: '7 years', value: '7' },
  { name: '8 years', value: '8' },
  { name: '9 years', value: '9' },
  { name: '10 years', value: '10' },
  { name: '10+ years', value: '10+' },
];

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
  AGENT_TYPE_OPTIONS,
  AGENT_EXPERIENCE_OPTIONS,
  SUBSCRIPTION_STATUS,
  INQUIRY_STATUS,
  ERROR_CODES,
  DOC_EXTENSIONS,
  IMAGE_EXTENSIONS,
};

