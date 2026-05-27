const { Router } = require('express');
const router = Router();
const { authenticateAdmin } = require('../middlewares/auth');
const AgenciesController = require('../controllers/agenciesController');

router.get('/', AgenciesController.listAgencies);
router.post('/:id/verify', AgenciesController.verifyAgency);
router.get('/:id', AgenciesController.getAgencyDetails);
router.put('/:id', AgenciesController.updateAgency);
router.delete('/:id', AgenciesController.deleteAgency);

module.exports = router;
