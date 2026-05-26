const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const success = (res, message, data = {}, status = 200) =>
  res.status(status).json({
    status: true,
    message,
    data,
  });

const failure = (res, status, message, code = 'ERROR', details) =>
  res.status(status).json({
    status: false,
    message,
    code,
    ...(details ? { details } : {}),
  });

const generateSlug = (text = '') =>
  text
    .toString()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');

const generateRandomString = (length = 16) => {
  const size = Math.max(1, Number(length) || 0);
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = crypto.randomBytes(size);

  let result = '';
  for (let i = 0; i < size; i += 1) {
    result += charset[bytes[i] % charset.length];
  }

  return result;
};

const formatPhoneNumber = (phone = '') => {
  const raw = `${phone}`.trim();
  const digits = raw.replace(/[^\d+]/g, '');
  if (!digits) return '';

  const withoutPlus = digits.startsWith('+') ? digits.slice(1) : digits;
  const normalized = withoutPlus.replace(/^0+/, '');

  return normalized ? `+${normalized}` : '';
};

const isEmail = (value = '') => {
  const email = value.toString().trim();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

const isPhone = (value = '') => {
  const normalized = formatPhoneNumber(value);
  const phoneRegex = /^\+[1-9]\d{7,14}$/;
  return phoneRegex.test(normalized);
};

const hasAllowedExtension = (value = '', allowed = []) => {
  const rawSegment = `${value || ''}`.split('?')[0].trim();
  if (!rawSegment || !allowed.length) return false;
  const lower = rawSegment.toLowerCase();
  return allowed.some((ext) => lower.endsWith(`.${ext}`));
};

const sanitizeUser = (user) => {
  if (!user) return null;

  const source =
    typeof user.toObject === 'function'
      ? user.toObject({ getters: true, virtuals: true })
      : user._doc
        ? { ...user._doc }
        : { ...user };

  const {
    password,
    salt,
    otp,
    otpCode,
    otpExpiresAt,
    otpExpiry,
    resetPasswordToken,
    resetPasswordExpires,
    verificationToken,
    verificationCode,
    firebaseToken,
    refreshToken,
    tokens,
    access_token,
    refresh_token,
    ...safeUser
  } = source;

  if (!Object.prototype.hasOwnProperty.call(safeUser, 'profilePicture') || safeUser.profilePicture == null) {
    safeUser.profilePicture = null;
  }

  return safeUser;
};

const sanitizeAgency = (agency) => {
  if (!agency) return null;

  const source =
    typeof agency.toObject === 'function'
      ? agency.toObject({ getters: true, virtuals: true })
      : agency._doc
        ? { ...agency._doc }
        : { ...agency };

  const {
    password,
    emailVerificationToken,
    emailVerificationExpires,
    phoneVerificationOTP,
    phoneVerificationExpires,
    resetPasswordToken,
    resetPasswordExpires,
    invitationToken,
    access_token,
    token_expires_at,
    refresh_token,
    refresh_token_expires_at,
    ...safeAgency
  } = source;

  if (!Object.prototype.hasOwnProperty.call(safeAgency, 'profilePicture') || safeAgency.profilePicture == null) {
    safeAgency.profilePicture = null;
  }

  return safeAgency;
};

const sanitizeAgent = (agent) => {
  if (!agent) return null;

  const source =
    typeof agent.toObject === 'function'
      ? agent.toObject({ getters: true, virtuals: true })
      : agent._doc
        ? { ...agent._doc }
        : { ...agent };

  const {
    password,
    emailVerificationToken,
    emailVerificationExpires,
    phoneVerificationOTP,
    phoneVerificationExpires,
    resetPasswordToken,
    resetPasswordExpires,
    invitationToken,
    access_token,
    token_expires_at,
    refresh_token,
    refresh_token_expires_at,
    ...safeAgent
  } = source;

  if (!Object.prototype.hasOwnProperty.call(safeAgent, 'profilePicture') || safeAgent.profilePicture == null) {
    safeAgent.profilePicture = null;
  }

  return safeAgent;
};

const generateInvitationToken = () => crypto.randomBytes(32).toString('hex');

const hashPassword = async (password) => {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
};

const comparePassword = async (password, hashedPassword) => {
  if (!password || !hashedPassword) return false;
  return bcrypt.compare(password, hashedPassword);
};

module.exports = {
  generateSlug,
  generateRandomString,
  formatPhoneNumber,
  isEmail,
  isPhone,
  success,
  failure,
  sanitizeUser,
  sanitizeAgency,
  sanitizeAgent,
  generateInvitationToken,
  hashPassword,
  comparePassword,
  hasAllowedExtension,
};
