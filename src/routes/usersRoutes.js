const { Router } = require('express');
const router = Router();
const { authenticateAdmin } = require('../middlewares/auth');
const UsersController = require('../controllers/usersController');

router.get('/', UsersController.listUsers);
router.get('/:id', UsersController.getUserDetails);
router.put('/:id', UsersController.updateUser);
router.delete('/:id', UsersController.deleteUser);
router.get('/:id/activity-log', UsersController.getUserActivityLog);

module.exports = router;
