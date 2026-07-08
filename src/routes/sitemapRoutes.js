const { Router } = require('express');
const router = Router();

const { getSitemapAdmin, mutateSitemapAdmin } = require('../controllers/sitemapController');
const { authenticateAdmin } = require('../middlewares/auth');

router.get('/', authenticateAdmin, getSitemapAdmin);
router.post('/', authenticateAdmin, mutateSitemapAdmin);

module.exports = router;
