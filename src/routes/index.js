const express = require('express');
const router = express.Router();

const authRoutes = require('./auth');
const roomRoutes = require('./rooms');
const roomTypeRoutes = require('./roomTypes');
const reservationRoutes = require('./reservations');
const bookingRuleRoutes = require('./bookingrules');
const taskRoutes = require('./tasks');
const propertyRoutes = require('./properties');

router.use('/auth', authRoutes);
router.use('/rooms', roomRoutes);
router.use('/room-types', roomTypeRoutes);
router.use('/reservations', reservationRoutes);
router.use('/booking-rules', bookingRuleRoutes);
router.use('/tasks', taskRoutes);
router.use('/properties', propertyRoutes);

module.exports = router; 