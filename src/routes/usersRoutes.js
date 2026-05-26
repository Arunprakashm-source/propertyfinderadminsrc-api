const { Router } = require('express');
const router = Router();
const { authenticateAdmin } = require('../middlewares/auth');
const UsersController = require('../controllers/usersController');

router.get('/', UsersController.listUsers);
router.get('/:id', authenticateAdmin, UsersController.getUserDetails);
router.put('/:id', authenticateAdmin, UsersController.updateUserStatus);
router.delete('/:id', authenticateAdmin, UsersController.deleteUser);
router.get('/:id/activity-log', authenticateAdmin, UsersController.getUserActivityLog);

module.exports = router;
