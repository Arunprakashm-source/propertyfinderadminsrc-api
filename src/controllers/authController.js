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
const DEFAULT_PROFILE_PICTURE = 'profileless.png';

const isUploadedProfilePicture = (path) =>
  Boolean(path) && path !== DEFAULT_PROFILE_PICTURE && !String(path).endsWith(`/${DEFAULT_PROFILE_PICTURE}`);

const normalizeEmail = (email = '') => email.toString().toLowerCase().trim();

const buildSafeAdmin = (admin) => {
  const safe = sanitizeUser(admin);
  // Remove internal-only fields if present
  delete safe.loginAttempts;
  delete safe.lockUntil;
  delete safe.resetPasswordToken;
  delete safe.resetPasswordExpires;
  delete safe.passwordResetOTPHash;
  delete safe.passwordResetOTPExpires;
  delete safe.access_token;
  delete safe.token_expires_at;
  delete safe.refresh_token;
  delete safe.refresh_token_expires_at;
  delete safe.avatar;
  if (!safe.profilePicture) {
    safe.profilePicture = DEFAULT_PROFILE_PICTURE;
  }
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
 * @swagger
 * /auth/login:
 *   post:
 *     summary: Admin login
 *     description: |
 *       Authenticates an admin with email and password. Returns a JWT access/refresh pair
 *       and a sanitized admin profile. Failed attempts are counted; the account is locked
 *       for 15 minutes after 5 failed attempts.
 *     tags: [Admin - Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: admin@example.com
 *               password:
 *                 type: string
 *                 format: password
 *                 example: secret123
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Login successful
 *                 data:
 *                   type: object
 *                   properties:
 *                     admin:
 *                       $ref: '#/components/schemas/AdminSafe'
 *                     tokens:
 *                       $ref: '#/components/schemas/AdminTokens'
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiFailure'
 *       401:
 *         description: Invalid credentials
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiFailure'
 *       403:
 *         description: Admin account disabled
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiFailure'
 *       423:
 *         description: Account temporarily locked
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiFailure'
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiFailure'
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
 * @swagger
 * /auth/send-otp:
 *   post:
 *     summary: Send password reset OTP
 *     description: |
 *       Generates a one-time password and emails it to the admin. Use before
 *       `POST /auth/verify-otp`. Email delivery failures are logged but still return 200
 *       when the OTP was stored successfully.
 *     tags: [Admin - Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: admin@example.com
 *     responses:
 *       200:
 *         description: OTP sent (or queued) to email
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: OTP sent successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     channel:
 *                       type: string
 *                       example: email
 *       400:
 *         description: Invalid email
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiFailure'
 *       404:
 *         description: Admin account not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiFailure'
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiFailure'
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
 * @swagger
 * /auth/verify-otp:
 *   post:
 *     summary: Verify password reset OTP
 *     description: |
 *       Validates the OTP sent to the admin email. On success, clears the OTP hash so
 *       `POST /auth/reset-password` can proceed for the same email.
 *     tags: [Admin - Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - otp
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: admin@example.com
 *               otp:
 *                 type: string
 *                 description: One-time code from email
 *                 example: "123456"
 *     responses:
 *       200:
 *         description: OTP verified
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: OTP verified successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     admin:
 *                       $ref: '#/components/schemas/AdminSafe'
 *       400:
 *         description: Missing fields, invalid OTP, expired OTP, or no OTP request
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiFailure'
 *       404:
 *         description: Admin account not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiFailure'
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiFailure'
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
 * @swagger
 * /auth/reset-password:
 *   post:
 *     summary: Reset admin password
 *     description: |
 *       Sets a new password after OTP verification (`POST /auth/verify-otp`).
 *       Fails with `OTP_NOT_VERIFIED` if an OTP hash is still stored on the account.
 *     tags: [Admin - Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - newPassword
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: admin@example.com
 *               newPassword:
 *                 type: string
 *                 format: password
 *                 minLength: 6
 *                 example: newSecret456
 *     responses:
 *       200:
 *         description: Password reset successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Password reset successful
 *                 data:
 *                   type: object
 *                   example: {}
 *       400:
 *         description: Validation error or OTP not verified
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiFailure'
 *       404:
 *         description: Admin account not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiFailure'
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiFailure'
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
 * @swagger
 * /auth/refresh:
 *   post:
 *     summary: Refresh JWT tokens
 *     description: |
 *       Issues a new access/refresh token pair when the provided refresh token is valid,
 *       matches the value stored on the admin document, and has not expired.
 *     tags: [Admin - Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - refreshToken
 *             properties:
 *               refreshToken:
 *                 type: string
 *                 description: Refresh token from login or previous refresh
 *     responses:
 *       200:
 *         description: Tokens refreshed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Tokens refreshed successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     admin:
 *                       $ref: '#/components/schemas/AdminSafe'
 *                     tokens:
 *                       $ref: '#/components/schemas/AdminTokens'
 *       400:
 *         description: Refresh token missing
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiFailure'
 *       401:
 *         description: Invalid, expired, or revoked refresh token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiFailure'
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiFailure'
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
 * @swagger
 * /auth/logout:
 *   post:
 *     summary: Admin logout
 *     description: |
 *       Clears stored access/refresh tokens on the admin record when the caller is
 *       authenticated (Bearer JWT). Returns success even without a token; token clearing
 *       only runs when a valid admin id is present on the request.
 *     tags: [Admin - Authentication]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Logged out successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Logged out successfully
 *                 data:
 *                   type: object
 *                   example: {}
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiFailure'
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
 * @swagger
 * /auth/upload-profile-picture:
 *   post:
 *     summary: Upload or remove admin profile picture
 *     description: |
 *       Uploads an image as the admin profile picture (optimized to WebP) or resets to the
 *       default placeholder when `removeProfilePicture` is true and no file is sent.
 *     tags: [Admin - Authentication]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               profilePicture:
 *                 type: string
 *                 format: binary
 *                 description: Image file (required unless removing only)
 *               removeProfilePicture:
 *                 type: boolean
 *                 description: Set to true to reset profile picture to the default placeholder
 *                 example: false
 *     responses:
 *       200:
 *         description: Profile picture updated or removed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Profile picture updated
 *                 data:
 *                   type: object
 *                   properties:
 *                     imageBaseUrl:
 *                       type: string
 *                       example: http://localhost:4000/uploads/
 *                     admin:
 *                       $ref: '#/components/schemas/AdminSafe'
 *       400:
 *         description: No file provided or validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiFailure'
 *       401:
 *         description: Authentication required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiFailure'
 *       404:
 *         description: Admin not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiFailure'
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiFailure'
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

    const previousPicture = admin.profilePicture;

    // Handle remove without new file
    if (removeRequested && !req.file) {
      if (isUploadedProfilePicture(previousPicture)) {
        await uploadService.delete(previousPicture).catch((error) => {
          logger.warn('Failed to delete previous admin profile picture', {
            error: error.message,
          });
        });
      }

      admin.profilePicture = DEFAULT_PROFILE_PICTURE;
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
    admin.profilePicture = storedPath;
    await admin.save();

    if (isUploadedProfilePicture(previousPicture) && previousPicture !== storedPath) {
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

