const asyncHandler = require('express-async-handler');
const { getDashboardOverview } = require('../services/dashboardService');
const { success, failure } = require('../utils/helpers');
const { logger } = require('../utils/logger');

/**
 * @swagger
 * /dashboard:
 *   get:
 *     summary: Get admin dashboard overview
 *     description: Aggregated stats and chart data for the admin dashboard (revenue is not included).
 *     tags: [Admin - Dashboard]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Dashboard overview fetched successfully
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
const getDashboard = asyncHandler(async (req, res) => {
  try {
    const overview = await getDashboardOverview();
    return success(res, 'Dashboard overview fetched successfully', overview);
  } catch (error) {
    logger.error('Get dashboard overview failed', { error: error.message, stack: error.stack });
    return failure(res, 500, 'Failed to fetch dashboard overview', 'SERVER_ERROR', error.message);
  }
});

module.exports = {
  getDashboard,
};
