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
  listPropertyTypes,
  createPropertyType,
  updatePropertyType,
  deletePropertyType,
  listListingTypes,
  createListingType,
  updateListingType,
  deleteListingType,
  listLanguages,
  createLanguage,
  updateLanguage,
  deleteLanguage,
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

// Property types management (admin)
router.get('/property-types', authenticateAdmin, listPropertyTypes);
router.post('/property-types', authenticateAdmin, createPropertyType);
router.put('/property-types/:id', authenticateAdmin, updatePropertyType);
router.delete('/property-types/:id', authenticateAdmin, deletePropertyType);

// Listing types management (admin)
router.get('/listing-types', authenticateAdmin, listListingTypes);
router.post('/listing-types', authenticateAdmin, createListingType);
router.put('/listing-types/:id', authenticateAdmin, updateListingType);
router.delete('/listing-types/:id', authenticateAdmin, deleteListingType);

// Languages management (admin)
router.get('/languages', authenticateAdmin, listLanguages);
router.post('/languages', authenticateAdmin, createLanguage);
router.put('/languages/:id', authenticateAdmin, updateLanguage);
router.delete('/languages/:id', authenticateAdmin, deleteLanguage);

module.exports = router;
