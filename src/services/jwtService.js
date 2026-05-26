const jwt = require('jsonwebtoken');
const { logger } = require('../utils/logger');

const {
  JWT_SECRET,
  JWT_EXPIRES_IN,
  JWT_REFRESH_SECRET,
  JWT_REFRESH_EXPIRE_IN,
} = process.env;

const ensureConfig = () => {
  if (!JWT_SECRET || !JWT_EXPIRES_IN || !JWT_REFRESH_SECRET || !JWT_REFRESH_EXPIRE_IN) {
    logger.error('JWT configuration is missing', {
      JWT_SECRET: Boolean(JWT_SECRET),
      JWT_EXPIRES_IN: Boolean(JWT_EXPIRES_IN),
      JWT_REFRESH_SECRET: Boolean(JWT_REFRESH_SECRET),
      JWT_REFRESH_EXPIRE_IN: Boolean(JWT_REFRESH_EXPIRE_IN),
    });
    throw new Error('JWT configuration not set');
  }
};

const generateAccessToken = (payload, expiresIn = JWT_EXPIRES_IN) => {
  ensureConfig();
  try {
    return jwt.sign(payload, JWT_SECRET, {
      expiresIn,
      algorithm: 'HS256',
    });
  } catch (error) {
    logger.error('Failed to generate access token', { error: error.message });
    throw new Error('Could not generate access token');
  }
};

const generateRefreshToken = (payload, expiresIn = JWT_REFRESH_EXPIRE_IN) => {
  ensureConfig();
  try {
    return jwt.sign(payload, JWT_REFRESH_SECRET, {
      expiresIn,
      algorithm: 'HS256',
    });
  } catch (error) {
    logger.error('Failed to generate refresh token', { error: error.message });
    throw new Error('Could not generate refresh token');
  }
};

const verifyAccessToken = (token) => {
  ensureConfig();
  if (!token) {
    throw new Error('Access token required');
  }
  try {
    return jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
  } catch (error) {
    logger.error('Failed to verify access token', { error: error.message });
    throw new Error('Invalid or expired access token');
  }
};

const verifyRefreshToken = (token) => {
  ensureConfig();
  if (!token) {
    throw new Error('Refresh token required');
  }
  try {
    return jwt.verify(token, JWT_REFRESH_SECRET, { algorithms: ['HS256'] });
  } catch (error) {
    logger.error('Failed to verify refresh token', { error: error.message });
    throw new Error('Invalid or expired refresh token');
  }
};

const generateTokenPair = (payload, options = {}) => {
  ensureConfig();
  const accessToken = generateAccessToken(payload, options.accessTokenExpiresIn);
  const refreshToken = generateRefreshToken(payload, options.refreshTokenExpiresIn);
  return { accessToken, refreshToken };
};

module.exports = {
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  generateTokenPair,
};
