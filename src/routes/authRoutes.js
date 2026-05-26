const { Router } = require('express');
const router = Router();

const adminAuthController = require('../controllers/authController');
const { uploadSingleImage, multerErrorHandler } = require('../config/multer');
const { authenticateAdmin } = require('../middlewares/auth');

// Admin authentication routes
router.post('/login', adminAuthController.login);
router.post('/send-otp', adminAuthController.sendOTP);
router.post('/verify-otp', adminAuthController.verifyOTP);
router.post('/reset-password', adminAuthController.resetPassword);
router.post('/refresh', adminAuthController.refreshTokens);
router.post('/logout', adminAuthController.logout);
router.post(
  '/upload-profile-picture',
  authenticateAdmin,
  uploadSingleImage('profilePicture'),
  multerErrorHandler,
  adminAuthController.uploadProfilePicture
);

module.exports = router;
