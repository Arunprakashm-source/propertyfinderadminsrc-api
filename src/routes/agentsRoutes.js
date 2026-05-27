const { Router } = require('express');
const router = Router();
const { authenticateAdmin } = require('../middlewares/auth');
const AgentsController = require('../controllers/agentsController');

router.get('/',  AgentsController.listAgents);
router.post('/:id/verify',  AgentsController.verifyAgent);
router.get('/:id',  AgentsController.getAgentDetails);
router.put('/:id',  AgentsController.updateAgent);
router.delete('/:id',  AgentsController.deleteAgent);

module.exports = router;
