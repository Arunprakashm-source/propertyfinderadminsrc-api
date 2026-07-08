const { Router } = require('express');
const router = Router();

const { getDashboard } = require('../controllers/dashboardController');
const { authenticateAdmin } = require('../middlewares/auth');

router.get('/', authenticateAdmin, getDashboard);

module.exports = router;
