const { Router } = require('express');
const router = Router();

const { getTestimonialAdmin, mutateTestimonialAdmin } = require('../controllers/testimonialController');
const { authenticateAdmin } = require('../middlewares/auth');
const { uploadSingleImage, multerErrorHandler } = require('../config/multer');

router.get('/', authenticateAdmin, getTestimonialAdmin);
router.post(
  '/',
  authenticateAdmin,
  uploadSingleImage('image'),
  multerErrorHandler,
  mutateTestimonialAdmin
);

module.exports = router;
