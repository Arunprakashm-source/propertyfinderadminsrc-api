const { Router } = require('express');
const router = Router();

const {
  getMasterData,
  listJobTitles,
  createJobTitle,
  updateJobTitle,
  deleteJobTitle,
  listAmenities,
  getAmenityById,
  createAmenity,
  updateAmenity,
  deleteAmenity,
} = require('../controllers/masterDataController');
const { authenticateAdmin } = require('../middlewares/auth');
const { uploadSingleImage, multerErrorHandler } = require('../config/multer');

// GET /admin/master-data?type=countries | ?types=jobtitles,...
router.get('/', getMasterData);

// Job titles management (admin)
router.get('/job-titles', authenticateAdmin, listJobTitles);
router.post('/job-titles', authenticateAdmin, createJobTitle);
router.put('/job-titles/:id', authenticateAdmin, updateJobTitle);
router.delete('/job-titles/:id', authenticateAdmin, deleteJobTitle);

// Amenities management (admin)
router.get('/amenities', authenticateAdmin, listAmenities);
router.get('/amenities/:id', authenticateAdmin, getAmenityById);
router.post(
  '/amenities',
  authenticateAdmin,
  uploadSingleImage('image'),
  multerErrorHandler,
  createAmenity
);
router.put(
  '/amenities/:id',
  authenticateAdmin,
  uploadSingleImage('image'),
  multerErrorHandler,
  updateAmenity
);
router.delete('/amenities/:id', authenticateAdmin, deleteAmenity);

module.exports = router;
