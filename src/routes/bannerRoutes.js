const { Router } = require('express');
const router = Router();

const { getBannerAdmin, mutateBannerAdmin } = require('../controllers/bannerController');
const { authenticateAdmin } = require('../middlewares/auth');
const { uploadImageFields, multerErrorHandler } = require('../config/multer');

router.get('/', authenticateAdmin, getBannerAdmin);
router.post(
  '/',
  authenticateAdmin,
  uploadImageFields([
    { name: 'image', maxCount: 1 },
    { name: 'mobileImage', maxCount: 1 },
  ]),
  multerErrorHandler,
  mutateBannerAdmin
);

module.exports = router;
