const { Router } = require('express');
const router = Router();
const { authenticateAdmin } = require('../middlewares/auth');
const UsersController = require('../controllers/usersController');
const { uploadSingleImage } = require('../config/multer');

router.get('/', UsersController.listUsers);
router.get('/:id', UsersController.getUserDetails);
router.put('/:id', UsersController.updateUser);
router.put('/:id/profile-picture', uploadSingleImage('profilePicture'), UsersController.updateUserProfilePicture);
router.delete('/:id', UsersController.deleteUser);
router.get('/:id/activity-log', UsersController.getUserActivityLog);

module.exports = router;
