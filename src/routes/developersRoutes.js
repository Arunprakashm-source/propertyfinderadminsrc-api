const { Router } = require('express');
const router = Router();
const { authenticateAdmin } = require('../middlewares/auth');
const DevelopersController = require('../controllers/developersController');

router.get('/', DevelopersController.listDevelopers);
router.post('/:id/verify', DevelopersController.verifyDeveloper);
router.get('/:id', DevelopersController.getDeveloperDetails);
router.put('/:id', DevelopersController.updateDeveloper);
router.delete('/:id', DevelopersController.deleteDeveloper);

module.exports = router;
