const { Router } = require('express');
const router = Router();

const {
  sendAgencyInvitation,
  sendDeveloperInvitation,
  getMasterData,
} = require('../controllers/adminController');
const { authenticateAdmin } = require('../middlewares/auth');



router.post('/invite-agency', authenticateAdmin, sendAgencyInvitation);
router.post('/invite-developer', authenticateAdmin, sendDeveloperInvitation);

// Master data route
// Example:
//   GET /admin/master-data?type=countries
//   GET /admin/master-data?type=amenities
//   GET /admin/master-data?types=countries,amenities
router.get('/master-data',  getMasterData);



module.exports = router;

