const { Router } = require('express');
const router = Router();

const { getContactAdmin, mutateContactAdmin } = require('../controllers/contactController');
const { authenticateAdmin } = require('../middlewares/auth');

router.get('/', authenticateAdmin, getContactAdmin);
router.post('/', authenticateAdmin, mutateContactAdmin);

module.exports = router;
