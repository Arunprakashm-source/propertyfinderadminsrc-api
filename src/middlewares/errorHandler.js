const { logger } = require('../utils/logger');

const isProd = process.env.NODE_ENV === 'production';

const formatErrorResponse = (res, status, message, code, details) => {
  const error = { code };

  if (!isProd && details !== undefined) {
    error.details = details;
  }

  const responseMessage = isProd && status >= 500 ? 'Something went wrong' : message;

  return res.status(status).json({
    success: false,
    message: responseMessage,
    error,
  });
};

const notFound = (req, res) =>
  formatErrorResponse(res, 404, 'Resource not found', 'NOT_FOUND', {
    method: req.method,
    path: req.originalUrl,
  });

const errorHandler = (err, req, res, next) => {
  if (!isProd) {
    logger.error('Request error', {
      message: err.message,
      stack: err.stack,
      path: req.originalUrl,
      method: req.method,
    });
  }

  if (err.name === 'ValidationError') {
    const errors = Object.values(err.errors || {}).map((e) => e.message);
    return formatErrorResponse(res, 400, 'Validation error', 'VALIDATION_ERROR', { errors });
  }

  if (err.name === 'JsonWebTokenError') {
    return formatErrorResponse(res, 401, 'Invalid token', 'JWT_ERROR', {
      reason: err.message,
    });
  }

  if (err.name === 'TokenExpiredError') {
    return formatErrorResponse(res, 401, 'Token expired', 'JWT_EXPIRED', {
      expiredAt: err.expiredAt,
    });
  }

  if (err.code === 11000) {
    const fields = Object.keys(err.keyValue || {});
    const message = fields.length ? `Duplicate value for ${fields.join(', ')}` : 'Duplicate key error';
    return formatErrorResponse(res, 409, message, 'DUPLICATE_KEY', {
      keyValue: err.keyValue,
    });
  }

  if (err.name === 'CastError') {
    return formatErrorResponse(res, 400, 'Invalid value provided', 'CAST_ERROR', {
      path: err.path,
      value: err.value,
      kind: err.kind,
    });
  }

  const status = err.statusCode || err.status || 500;
  const message = err.message || 'Internal server error';

  return formatErrorResponse(res, status, message, 'INTERNAL_ERROR', {
    stack: err.stack,
  });
};

module.exports = {
  notFound,
  errorHandler,
};

