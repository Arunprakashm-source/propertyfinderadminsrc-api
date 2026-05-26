const { Router } = require('express');
const router = Router();

const authRoutes = require('./authRoutes');
const adminRoutes = require('./adminRoutes');
const usersRoutes = require('./usersRoutes');
const amenitiesRoutes = require('./amenitiesRoutes');

// Auth routes 
router.use('/auth', authRoutes);

// Admin routes
router.use('/', adminRoutes);

router.use('/users', usersRoutes);

// Amenities management routes
router.use('/amenities', amenitiesRoutes);



module.exports = router;


