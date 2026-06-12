const { Router } = require('express');
const router = Router();

const { getTeamAdmin, mutateTeamAdmin } = require('../controllers/teamController');
const { authenticateAdmin } = require('../middlewares/auth');
const { uploadSingleImage, multerErrorHandler } = require('../config/multer');

router.get('/', authenticateAdmin, getTeamAdmin);
router.post(
  '/',
  authenticateAdmin,
  uploadSingleImage('profileImage'),
  multerErrorHandler,
  mutateTeamAdmin
);

module.exports = router;
