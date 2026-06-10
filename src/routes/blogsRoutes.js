const { Router } = require('express');
const router = Router();

const { getBlogsAdmin, mutateBlogsAdmin } = require('../controllers/blogsController');
const { authenticateAdmin } = require('../middlewares/auth');
const { uploadSingleImage, multerErrorHandler } = require('../config/multer');

router.get('/', authenticateAdmin, getBlogsAdmin);
router.post(
  '/',
  authenticateAdmin,
  uploadSingleImage('coverImage'),
  multerErrorHandler,
  mutateBlogsAdmin
);

module.exports = router;
