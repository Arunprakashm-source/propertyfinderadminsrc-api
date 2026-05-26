const isProd = process.env.NODE_ENV === 'production';

function formatMessage(level, message, meta) {
  const base = { level, message, timestamp: new Date().toISOString() };
  return JSON.stringify(meta ? { ...base, ...meta } : base);
}

const logger = {
  info(message, meta) {
    // eslint-disable-next-line no-console
    console.log(formatMessage('INFO', message, meta));
  },
  error(message, meta) {
    // eslint-disable-next-line no-console
    console.error(formatMessage('ERROR', message, meta));
  },
  warn(message, meta) {
    // eslint-disable-next-line no-console
    console.warn(formatMessage('WARN', message, meta));
  },
  debug(message, meta) {
    if (!isProd) {
      // eslint-disable-next-line no-console
      console.debug(formatMessage('DEBUG', message, meta));
    }
  },
};

module.exports = { logger };