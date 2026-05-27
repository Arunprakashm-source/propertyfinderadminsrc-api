const path = require('path');
const swaggerJsdoc = require('swagger-jsdoc');

const port = process.env.PORT || 4000;

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Molumulk Admin API',
      version: '1.0.0',
      description: 'API documentation for the Molumulk Admin API.',
    },
    servers: [
      {
        url: process.env.SWAGGER_SERVER_URL || `http://localhost:${port}/admin`,
        description: 'Current environment',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
      schemas: {
        ApiFailure: {
          type: 'object',
          properties: {
            status: { type: 'boolean', example: false },
            message: { type: 'string' },
            code: { type: 'string' },
            details: { type: 'object' },
          },
        },
        AdminTokens: {
          type: 'object',
          properties: {
            accessToken: { type: 'string' },
            refreshToken: { type: 'string' },
          },
        },
        AdminSafe: {
          type: 'object',
          properties: {
            _id: { type: 'string' },
            firstName: { type: 'string' },
            lastName: { type: 'string' },
            email: { type: 'string', format: 'email' },
            phoneNumber: { type: 'string' },
            profilePicture: {
              type: 'string',
              example: 'profileless.png',
              description: 'Stored path or default placeholder filename',
            },
            isActive: { type: 'boolean' },
            isSuperAdmin: { type: 'boolean' },
            lastLogin: { type: 'string', format: 'date-time', nullable: true },
            lastActiveAt: { type: 'string', format: 'date-time', nullable: true },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
      },
    },
  },
  apis: [
    path.join(__dirname, '../controllers/**/*.js'),
    path.join(__dirname, '../routes/**/*.js'),
    path.join(__dirname, '../app.js'),
  ],
};

const swaggerSpec = swaggerJsdoc(options);

module.exports = swaggerSpec;

