const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const swaggerUi = require('swagger-ui-express');
const routes = require('./routes');
const mongoose = require('mongoose');
const { notFound, errorHandler } = require('./middlewares/errorHandler');
const swaggerSpec = require('./config/swagger');


const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

// Serve uploaded files so they can be accessed via HTTP
app.use('/uploads', express.static(path.resolve(__dirname, '../uploads')));

app.use((req, res, next) => {
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Access-Control-Allow-Origin", "*");
  next();
});

// Swagger documentation
app.use('/admin/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.get('/admin/docs.json', (req, res) => res.json(swaggerSpec));

// health check endpoint 
/**
 * @swagger
 * /health:
 *   get:
 *     summary: API health check
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: API and database are reachable.
 *       503:
 *         description: Database is not ready.
 */
app.get('/admin/health', (req, res) => {
  const dbState = mongoose.connection.readyState;
  const dbStatus = {
    0: 'Disconnected',
    1: 'Connected',
    2: 'Connecting',
    3: 'Disconnecting',
  };

  const healthInfo = {
    server: 'Running',
    database: dbStatus[dbState] || 'Unknown',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  };

  if (dbState !== 1) {
    return res.status(503).json({ ...healthInfo, message: 'DB Not Ready' });
  }

  res.status(200).json(healthInfo);
});

app.use('/admin', routes);

// Handle 404s and errors consistently
app.use(notFound);
app.use(errorHandler);

module.exports = app;


