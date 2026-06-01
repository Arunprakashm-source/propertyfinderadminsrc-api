const { Router } = require('express');
const router = Router();
const { authenticateAdmin } = require('../middlewares/auth');
const PropertiesController = require('../controllers/propertiesController');

router.get('/', authenticateAdmin, PropertiesController.listProperties);
router.get('/:id', authenticateAdmin, PropertiesController.getPropertyById);
router.put('/:id', authenticateAdmin, PropertiesController.updateProperty);
router.delete('/:id', authenticateAdmin, PropertiesController.deleteProperty);

module.exports = router;
