const { Router } = require('express');
const router = Router();
const { authenticateAdmin } = require('../middlewares/auth');
const AgentsController = require('../controllers/agentsController');
const { uploadSingleImage } = require('../config/multer');

router.post('/invite-agent', authenticateAdmin, AgentsController.sendAgentInvitation);
router.get('/list', authenticateAdmin, AgentsController.listAgentsForDropdown);
router.get('/', authenticateAdmin, AgentsController.listAgents);
router.post('/:id/verify', authenticateAdmin, AgentsController.verifyAgent);
router.get('/:id', authenticateAdmin, AgentsController.getAgentDetails);
router.put('/:id', authenticateAdmin, AgentsController.updateAgent);
router.put(
  '/:id/profile-picture',
  authenticateAdmin,
  uploadSingleImage('profilePicture'),
  AgentsController.updateAgentProfilePicture
);
router.delete('/:id', authenticateAdmin, AgentsController.deleteAgent);

module.exports = router;
