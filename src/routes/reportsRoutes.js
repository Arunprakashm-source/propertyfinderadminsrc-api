const { Router } = require('express');
const router = Router();

const ReportsController = require('../controllers/reportsController');

router.get('/', ReportsController.listReports);
router.get('/:id', ReportsController.getReportById);
router.put('/:id', ReportsController.updateReport);
router.delete('/:id', ReportsController.deleteReport);
router.post('/:id/internal-notes', ReportsController.addInternalNote);

module.exports = router;

