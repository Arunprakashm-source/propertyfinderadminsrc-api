const { Router } = require('express');
const router = Router();

const {
  listAmenities,
  createAmenity,
  updateAmenity,
  deleteAmenity,
} = require('../controllers/amenitiesController');

const { authenticateAdmin } = require('../middlewares/auth');

// GET /api/admin/amenities - List all amenities with filters & pagination
router.get('/', authenticateAdmin, listAmenities);

// POST /api/admin/amenities/create - Create new amenity
router.post('/create', authenticateAdmin, createAmenity);

// PUT /api/admin/amenities/:id - Update existing amenity
router.put('/:id', authenticateAdmin, updateAmenity);

// DELETE /api/admin/amenities/:id - Delete amenity
router.delete('/:id', authenticateAdmin, deleteAmenity);

module.exports = router;

