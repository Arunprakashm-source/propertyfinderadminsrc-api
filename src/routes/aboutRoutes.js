const { Router } = require('express');
const router = Router();

const { getAboutAdmin, mutateAboutAdmin } = require('../controllers/aboutController');
const { authenticateAdmin } = require('../middlewares/auth');

router.get('/', authenticateAdmin, getAboutAdmin);
router.post('/', authenticateAdmin, mutateAboutAdmin);

module.exports = router;
