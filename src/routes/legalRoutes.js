const { Router } = require('express');
const router = Router();

const { getLegalAdmin, mutateLegalAdmin } = require('../controllers/legalController');
const { authenticateAdmin } = require('../middlewares/auth');

router.get('/', authenticateAdmin, getLegalAdmin);
router.post('/', authenticateAdmin, mutateLegalAdmin);

module.exports = router;
