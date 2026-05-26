const dotenv = require('dotenv');
dotenv.config();

const fs = require('fs');
const http = require('http');
const https = require('https');
const app = require('./src/app');
const { connectToDatabase } = require('./src/config/db');
const { logger } = require('./src/utils/logger');


const sslPath = '/etc/letsencrypt/live/api.molumulk.tj';

const port = process.env.PORT || 4000;

async function startServer() {
  try {
    await connectToDatabase();

    let server;

    // Check if SSL certs exist (for server env)
    if (fs.existsSync(`${sslPath}/privkey.pem`) && fs.existsSync(`${sslPath}/fullchain.pem`)) {
      const options = {
        key: fs.readFileSync(`${sslPath}/privkey.pem`),
        cert: fs.readFileSync(`${sslPath}/fullchain.pem`)
      };
      server = https.createServer(options, app);
      logger.info(`Running with HTTPS on port ${port}`);
    } else {
      // Fallback for local dev
      server = http.createServer(app);
      logger.info(`Running with HTTP (no SSL found) on port ${port}`);
    }

    server.listen(port, () => {
      logger.info(`API server listening on port ${port}`);
    });

    process.on('SIGINT', async () => {
      logger.info('SIGINT received. Shutting down gracefully...');
      server.close(() => {
        logger.info('Server closed');
        process.exit(0);
      });
    });
  } catch (error) {
    logger.error('Failed to start server', { error: error.message });
    process.exit(1);
  }
}

startServer();
