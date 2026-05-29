const { Router } = require('express');
const router = Router();

const authRoutes = require('./authRoutes');
const adminRoutes = require('./adminRoutes');
const usersRoutes = require('./usersRoutes');
const amenitiesRoutes = require('./amenitiesRoutes');
const agentsRoutes = require('./agentsRoutes');
const agenciesRoutes = require('./agenciesRoutes');
const developersRoutes = require('./developersRoutes');

// Auth routes 
router.use('/auth', authRoutes);

// Admin routes
router.use('/', adminRoutes);

router.use('/users', usersRoutes);

router.use('/agents', agentsRoutes);

router.use('/agency', agenciesRoutes);

router.use('/developers', developersRoutes);

// Amenities management routes
router.use('/amenities', amenitiesRoutes);



module.exports = router;


