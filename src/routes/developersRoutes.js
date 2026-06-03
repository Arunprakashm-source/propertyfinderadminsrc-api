const { Router } = require('express');
const router = Router();
const { authenticateAdmin } = require('../middlewares/auth');
const DevelopersController = require('../controllers/developersController');
const { uploadSingleImage } = require('../config/multer');

router.post('/invite-developer', authenticateAdmin, DevelopersController.sendDeveloperInvitation);
router.get('/list', authenticateAdmin, DevelopersController.listDevelopersForDropdown);
router.get('/', DevelopersController.listDevelopers);
router.post('/:id/verify', DevelopersController.verifyDeveloper);
router.get('/:id', DevelopersController.getDeveloperDetails);
router.put('/:id', DevelopersController.updateDeveloper);
router.put('/:id/profile-picture', uploadSingleImage('profilePicture'), DevelopersController.updateDeveloperProfilePicture);
router.delete('/:id', DevelopersController.deleteDeveloper);

module.exports = router;
