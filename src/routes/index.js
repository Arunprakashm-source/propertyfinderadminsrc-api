const { Router } = require('express');
const router = Router();

const authRoutes = require('./authRoutes');
const masterDataRoutes = require('./masterDataRoutes');
const usersRoutes = require('./usersRoutes');
const agentsRoutes = require('./agentsRoutes');
const agenciesRoutes = require('./agenciesRoutes');
const developersRoutes = require('./developersRoutes');
const propertiesRoutes = require('./propertiesRoutes');
const reportsRoutes = require('./reportsRoutes');
const projectsRoutes = require('./projectsRoutes');

// Auth routes 
router.use('/auth', authRoutes);

// Master data (lookup + job titles + amenities CRUD)
router.use('/master-data', masterDataRoutes);

router.use('/users', usersRoutes);

router.use('/agents', agentsRoutes);

router.use('/agency', agenciesRoutes);

router.use('/developers', developersRoutes);

router.use('/properties', propertiesRoutes);

router.use('/reports', reportsRoutes);

router.use('/projects', projectsRoutes);



module.exports = router;


