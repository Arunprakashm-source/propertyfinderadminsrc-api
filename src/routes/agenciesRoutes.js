const { Router } = require('express');
const router = Router();
const { authenticateAdmin } = require('../middlewares/auth');
const AgenciesController = require('../controllers/agenciesController');
const { uploadSingleImage } = require('../config/multer');

router.post('/invite-agency', authenticateAdmin, AgenciesController.sendAgencyInvitation);
router.get('/', authenticateAdmin, AgenciesController.listAgencies);
router.post('/:id/verify', authenticateAdmin, AgenciesController.verifyAgency);
router.get('/:id', authenticateAdmin, AgenciesController.getAgencyDetails);
router.put('/:id', authenticateAdmin, AgenciesController.updateAgency);
router.put('/:id/profile-picture', authenticateAdmin, uploadSingleImage('profilePicture'), AgenciesController.updateAgencyProfilePicture);
router.delete('/:id', authenticateAdmin, AgenciesController.deleteAgency);

module.exports = router;
