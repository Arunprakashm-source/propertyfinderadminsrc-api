const { Router } = require('express');
const router = Router();

const { getMasterData } = require('../controllers/adminController');

// Master data route
// Example:
//   GET /admin/master-data?type=countries
//   GET /admin/master-data?types=countries,amenities,supportedurls
//   GET /admin/master-data?types=agenttypes,jobtitles
router.get('/master-data', getMasterData);



module.exports = router;

