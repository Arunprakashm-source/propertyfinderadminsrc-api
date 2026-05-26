const asyncHandler = require('express-async-handler');
const { verifyAccessToken } = require('../services/jwtService');
const { logger } = require('../utils/logger');

const extractBearerToken = (authHeader) => {
  if (!authHeader || typeof authHeader !== 'string') {
    return null;
  }

  const [scheme, token] = authHeader.trim().split(' ');
  if (scheme !== 'Bearer' || !token) {
    return null;
  }

  return token;
};

const authenticate = asyncHandler(async (req, res, next) => {
  const token = extractBearerToken(req.headers.authorization);

  if (!token) {
    return res.status(401).json({ message: 'Authentication token missing or malformed' });
  }

  try {
    const decoded = verifyAccessToken(token);
    req.user = decoded;
    return next();
  } catch (error) {
    logger.error('Authentication failed', { error: error.message });
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
});

const authorizeRoles = (...roles) =>
  asyncHandler(async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    return next();
  });

const authenticateAdmin = [authenticate, authorizeRoles('admin')];

module.exports = {
  authenticate,
  authorizeRoles,
  authenticateAdmin,
};

