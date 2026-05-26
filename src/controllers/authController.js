const asyncHandler = require('express-async-handler');
const jwt = require('jsonwebtoken');

const Admin = require('../models/adminModel');
const uploadService = require('../services/uploadService');
const {
  success,
  failure,
  isEmail,
  sanitizeUser,
  hashPassword,
  comparePassword,
} = require('../utils/helpers');
const { generateTokenPair, verifyRefreshToken } = require('../services/jwtService');
const { logger } = require('../utils/logger');
const {
  generateOTP,
  hashOTP,
  verifyOTP: verifyStoredOtp,
  getOTPExpiry,
} = require('../services/otpService');
const { sendVerificationEmail } = require('../services/emailService');

const MAX_LOGIN_ATTEMPTS = 5;
const LOCK_TIME_MS = 15 * 60 * 1000; // 15 minutes
const PROFILE_PICTURE_FOLDER = 'admin-profile-pictures';

const normalizeEmail = (email = '') => email.toString().toLowerCase().trim();

const buildSafeAdmin = (admin) => {
  const safe = sanitizeUser(admin);
  // Remove internal-only fields if present
  delete safe.loginAttempts;
  delete safe.lockUntil;
  delete safe.resetPasswordToken;
  delete safe.resetPasswordExpires;
  delete safe.access_token;
  delete safe.token_expires_at;
  delete safe.refresh_token;
  delete safe.refresh_token_expires_at;
  return safe;
};

const getAuthAdminId = (req = {}) =>
  req?.admin?.id || req?.admin?._id || req?.user?.id || req?.user?._id;

const toBoolean = (value) => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return ['true', '1', 'yes', 'on'].includes(normalized);
  }
  return false;
};

const getProfileImageBaseUrl = () => {
  const base = `${uploadService.uploadsBaseUrl}/`;
  return base.endsWith('/') ? base : `${base}/`;
};

const isAccountLocked = (admin) => {
  if (!admin || !admin.lockUntil) return false;
  return admin.lockUntil.getTime() > Date.now();
};

const registerFailedLoginAttempt = async (admin) => {
  if (!admin) return;

  admin.loginAttempts = (admin.loginAttempts || 0) + 1;

  if (admin.loginAttempts >= MAX_LOGIN_ATTEMPTS) {
    admin.lockUntil = new Date(Date.now() + LOCK_TIME_MS);
    admin.loginAttempts = 0; // reset counter after lock
  }

  await admin.save();
};

const resetLoginAttempts = async (admin) => {
  if (!admin) return;
  admin.loginAttempts = 0;
  admin.lockUntil = undefined;
  admin.lastLogin = new Date();
  admin.lastActiveAt = new Date();
  await admin.save();
};

/**
 * Admin login
 * Body: { email, password }
 */
const login = asyncHandler(async (req, res) => {
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return failure(res, 400, 'Email and password are required', 'VALIDATION_ERROR');
    }

    if (!isEmail(email)) {
      return failure(res, 400, 'A valid email is required', 'VALIDATION_ERROR');
    }

    const normalizedEmail = normalizeEmail(email);
    const admin = await Admin.findOne({ email: normalizedEmail });

    if (!admin) {
      return failure(res, 401, 'Invalid email or password', 'INVALID_CREDENTIALS');
    }

    if (!admin.isActive) {
      return failure(res, 403, 'Admin account is disabled', 'ACCOUNT_DISABLED');
    }

    if (isAccountLocked(admin)) {
      return failure(
        res,
        423,
        'Account temporarily locked due to multiple failed login attempts. Please try again later.',
        'ACCOUNT_LOCKED'
      );
    }

    const isMatch = await comparePassword(password, admin.password);
    if (!isMatch) {
      await registerFailedLoginAttempt(admin);
      return failure(res, 401, 'Invalid email or password', 'INVALID_CREDENTIALS');
    }

    await resetLoginAttempts(admin);

    const payload = {
      id: admin._id,
      role: 'admin',
      email: admin.email,
      isSuperAdmin: admin.isSuperAdmin || false,
    };

    const tokens = generateTokenPair(payload);

    // Decode tokens to get expiry dates
    let accessExpiry;
    let refreshExpiry;
    try {
      const accessDecoded = jwt.decode(tokens.accessToken);
      if (accessDecoded?.exp) {
        accessExpiry = new Date(accessDecoded.exp * 1000);
      }
      const refreshDecoded = jwt.decode(tokens.refreshToken);
      if (refreshDecoded?.exp) {
        refreshExpiry = new Date(refreshDecoded.exp * 1000);
      }
    } catch (decodeError) {
      logger.warn('Failed to decode token expiry', { error: decodeError.message });
    }

    // Store tokens and expiry dates in admin model
    admin.access_token = tokens.accessToken;
    admin.token_expires_at = accessExpiry;
    admin.refresh_token = tokens.refreshToken;
    admin.refresh_token_expires_at = refreshExpiry;
    await admin.save();

    const safeAdmin = buildSafeAdmin(admin);

    return success(res, 'Login successful', { admin: safeAdmin, tokens });
  } catch (error) {
    logger.error('Admin login failed', { error: error.message });
    return failure(res, 500, 'Failed to login', 'SERVER_ERROR');
  }
});

/**
 * Send OTP to admin email for password reset
 * Body: { email }
 */
const sendOTP = asyncHandler(async (req, res) => {
  try {
    const { email } = req.body || {};

    if (!email || !isEmail(email)) {
      return failure(res, 400, 'Valid email is required', 'VALIDATION_ERROR');
    }

    const normalizedEmail = normalizeEmail(email);
    const admin = await Admin.findOne({ email: normalizedEmail });

    if (!admin) {
      return failure(res, 404, 'Admin account not found', 'NOT_FOUND');
    }

    const otp = generateOTP();
    const otpHash = await hashOTP(otp);
    const otpExpiry = getOTPExpiry();

    admin.passwordResetOTPHash = otpHash;
    admin.passwordResetOTPExpires = otpExpiry;
    admin.resetPasswordToken = undefined;
    admin.resetPasswordExpires = undefined;
    await admin.save();

    try {
      await sendVerificationEmail(normalizedEmail, otp, admin.firstName || 'Admin');
    } catch (emailError) {
      logger.warn('Failed to send admin password reset OTP email', {
        error: emailError.message,
        email: admin.email,
      });
      // Do not expose internal email errors to client
    }

    return success(res, 'OTP sent successfully', { channel: 'email' }, 200);
  } catch (error) {
    logger.error('Admin send OTP failed', { error: error.message });
    return failure(res, 500, 'Failed to send OTP', 'SERVER_ERROR');
  }
});

/**
 * Verify OTP for admin password reset (email-only)
 * Body: { email, otp }
 */
const verifyOTP = asyncHandler(async (req, res) => {
  try {
    const { email, otp } = req.body || {};

    if (!email || !isEmail(email) || !otp) {
      return failure(res, 400, 'Email and OTP are required', 'VALIDATION_ERROR');
    }

    const normalizedEmail = normalizeEmail(email);
    const admin = await Admin.findOne({ email: normalizedEmail });

    if (!admin) {
      return failure(res, 404, 'Admin account not found', 'NOT_FOUND');
    }

    if (!admin.passwordResetOTPHash || !admin.passwordResetOTPExpires) {
      return failure(res, 400, 'No OTP request found', 'INVALID_OTP');
    }

    if (admin.passwordResetOTPExpires < new Date()) {
      return failure(res, 400, 'OTP has expired', 'OTP_EXPIRED');
    }

    const isValid = await verifyStoredOtp(otp, admin.passwordResetOTPHash);
    if (!isValid) {
      return failure(res, 400, 'Invalid OTP', 'INVALID_OTP');
    }

    admin.passwordResetOTPHash = undefined;
    admin.passwordResetOTPExpires = undefined;
    await admin.save();

    const safeAdmin = buildSafeAdmin(admin);
    return success(res, 'OTP verified successfully', { admin: safeAdmin }, 200);
  } catch (error) {
    logger.error('Admin verify OTP failed', { error: error.message });
    return failure(res, 500, 'Failed to verify OTP', 'SERVER_ERROR');
  }
});

/**
 * Reset password after OTP verification
 * Body: { email, newPassword }
 */
const resetPassword = asyncHandler(async (req, res) => {
  try {
    const { email, newPassword } = req.body || {};

    if (!email || !isEmail(email) || !newPassword) {
      return failure(res, 400, 'Email and new password are required', 'VALIDATION_ERROR');
    }

    const normalizedEmail = normalizeEmail(email);
    const admin = await Admin.findOne({ email: normalizedEmail });

    if (!admin) {
      return failure(res, 404, 'Admin account not found', 'NOT_FOUND');
    }

    // If an OTP hash is still stored, OTP has not been verified yet
    if (admin.passwordResetOTPHash) {
      return failure(
        res,
        400,
        'Please verify the OTP before resetting password',
        'OTP_NOT_VERIFIED'
      );
    }

    if (typeof newPassword !== 'string' || newPassword.length < 6) {
      return failure(
        res,
        400,
        'New password must be at least 6 characters long',
        'VALIDATION_ERROR'
      );
    }

    admin.password = await hashPassword(newPassword);
    admin.passwordResetOTPHash = undefined;
    admin.passwordResetOTPExpires = undefined;
    admin.resetPasswordToken = undefined;
    admin.resetPasswordExpires = undefined;
    admin.loginAttempts = 0;
    admin.lockUntil = undefined;
    await admin.save();

    return success(res, 'Password reset successful', {}, 200);
  } catch (error) {
    logger.error('Admin reset password failed', { error: error.message });
    return failure(res, 500, 'Failed to reset password', 'SERVER_ERROR');
  }
});

/**
 * Refresh access & refresh tokens
 * Body: { refreshToken }
 */
const refreshTokens = asyncHandler(async (req, res) => {
  try {
    const { refreshToken } = req.body || {};

    if (!refreshToken) {
      return failure(res, 400, 'Refresh token is required', 'VALIDATION_ERROR');
    }

    let decoded;
    try {
      decoded = verifyRefreshToken(refreshToken);
    } catch (error) {
      return failure(res, 401, 'Invalid or expired refresh token', 'INVALID_TOKEN');
    }

    if (!decoded?.id || decoded.role !== 'admin') {
      return failure(res, 401, 'Invalid token payload', 'INVALID_TOKEN');
    }

    // Verify refresh token matches stored token
    const admin = await Admin.findOne({ refresh_token: refreshToken });
    if (!admin || !admin.isActive) {
      return failure(res, 401, 'Admin account not found or inactive', 'UNAUTHORIZED');
    }

    // Check if refresh token has expired
    if (admin.refresh_token_expires_at && admin.refresh_token_expires_at < new Date()) {
      return failure(res, 401, 'Refresh token expired', 'TOKEN_EXPIRED');
    }

    const payload = {
      id: admin._id,
      role: 'admin',
      email: admin.email,
      isSuperAdmin: admin.isSuperAdmin || false,
    };

    const tokens = generateTokenPair(payload);

    // Decode tokens to get expiry dates
    let accessExpiry;
    let refreshExpiry;
    try {
      const accessDecoded = jwt.decode(tokens.accessToken);
      if (accessDecoded?.exp) {
        accessExpiry = new Date(accessDecoded.exp * 1000);
      }
      const refreshDecoded = jwt.decode(tokens.refreshToken);
      if (refreshDecoded?.exp) {
        refreshExpiry = new Date(refreshDecoded.exp * 1000);
      }
    } catch (decodeError) {
      logger.warn('Failed to decode token expiry', { error: decodeError.message });
    }

    // Update stored tokens and expiry dates
    admin.access_token = tokens.accessToken;
    admin.token_expires_at = accessExpiry;
    admin.refresh_token = tokens.refreshToken;
    admin.refresh_token_expires_at = refreshExpiry;
    admin.lastActiveAt = new Date();
    await admin.save();

    const safeAdmin = buildSafeAdmin(admin);

    return success(res, 'Tokens refreshed successfully', { admin: safeAdmin, tokens }, 200);
  } catch (error) {
    logger.error('Admin refresh tokens failed', { error: error.message });
    return failure(res, 500, 'Failed to refresh tokens', 'SERVER_ERROR');
  }
});

/**
 * Admin logout
 * Clears stored tokens from admin model
 */
const logout = asyncHandler(async (req, res) => {
  try {
    const adminId = getAuthAdminId(req);

    if (adminId) {
      const admin = await Admin.findById(adminId);
      if (admin) {
        admin.access_token = undefined;
        admin.token_expires_at = undefined;
        admin.refresh_token = undefined;
        admin.refresh_token_expires_at = undefined;
        await admin.save();
      }
    }

    logger.info('Admin logged out', { adminId });
    return success(res, 'Logged out successfully', {}, 200);
  } catch (error) {
    logger.error('Admin logout failed', { error: error.message });
    return failure(res, 500, 'Failed to logout', 'SERVER_ERROR');
  }
});

/**
 * Upload or remove admin profile picture
 * Uses multipart/form-data with field "profilePicture"
 */
const uploadProfilePicture = asyncHandler(async (req, res) => {
  try {
    const adminId = getAuthAdminId(req);

    if (!adminId) {
      return failure(res, 401, 'Authentication required', 'UNAUTHORIZED');
    }

    const removeRequested = toBoolean(req.body?.removeProfilePicture);
    const admin = await Admin.findById(adminId);

    if (!admin) {
      return failure(res, 404, 'Admin not found', 'NOT_FOUND');
    }

    const previousPicture = admin.avatar;

    // Handle remove without new file
    if (removeRequested && !req.file) {
      if (previousPicture) {
        await uploadService.delete(previousPicture).catch((error) => {
          logger.warn('Failed to delete previous admin profile picture', {
            error: error.message,
          });
        });
      }

      admin.avatar = undefined;
      await admin.save();

      const safeAdmin = buildSafeAdmin(admin);
      return success(res, 'Profile picture removed', { admin: safeAdmin }, 200);
    }

    if (!req.file) {
      return failure(res, 400, 'No profile picture provided', 'VALIDATION_ERROR');
    }

    const uploaded = await uploadService.upload(req.file, PROFILE_PICTURE_FOLDER, {
      generateThumbnail: false,
    });

    const storedPath = uploaded.path || `${PROFILE_PICTURE_FOLDER}/${uploaded.filename}`;
    admin.avatar = storedPath;
    await admin.save();

    if (previousPicture && previousPicture !== storedPath) {
      await uploadService.delete(previousPicture).catch((error) => {
        logger.warn('Failed to delete previous admin profile picture', {
          error: error.message,
        });
      });
    }

    const safeAdmin = buildSafeAdmin(admin);

    return success(
      res,
      'Profile picture updated',
      {
        imageBaseUrl: getProfileImageBaseUrl(),
        admin: safeAdmin,
      },
      200
    );
  } catch (error) {
    logger.error('Admin upload profile picture failed', { error: error.message });
    return failure(res, 500, 'Failed to upload profile picture', 'SERVER_ERROR');
  }
});

module.exports = {
  login,
  sendOTP,
  verifyOTP,
  resetPassword,
  refreshTokens,
  logout,
  uploadProfilePicture,
};

