const { Router } = require('express');
const router = Router();
const { authenticateAdmin } = require('../middlewares/auth');
const ProjectsController = require('../controllers/projectsController');
const { uploadProjectMedia, multerErrorHandler } = require('../config/multer');

router.get('/', authenticateAdmin, ProjectsController.listProjects);
router.post(
  '/upload-media',
  authenticateAdmin,
  uploadProjectMedia(),
  multerErrorHandler,
  ProjectsController.uploadProjectMedia
);
router.get('/:id', authenticateAdmin, ProjectsController.getProjectById);
router.put('/:id', authenticateAdmin, ProjectsController.updateProjectById);
router.delete('/:id', authenticateAdmin, ProjectsController.deleteProject);

module.exports = router;
