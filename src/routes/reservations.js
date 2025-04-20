// routes/reservations.js
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Reservation = require('../models/Reservation');
const Room = require('../models/Room');
const RoomType = require('../models/RoomType');
const BookingRule = require('../models/BookingRule');
const { protect, authorize } = require('../middleware/auth');

// Generate unique reservation number
const generateReservationNumber = async () => {
  const date = new Date();
  const year = date.getFullYear().toString().substr(-2);
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  const prefix = `R${year}${month}${day}`;
  
  // Find the latest reservation number with this prefix
  const latestReservation = await Reservation.findOne(
    { reservationNumber: new RegExp(`^${prefix}`) },
    { reservationNumber: 1 },
    { sort: { reservationNumber: -1 } }
  );
  
  let counter = 1;
  if (latestReservation) {
    // Extract the counter from the latest reservation and increment
    const latestCounter = parseInt(latestReservation.reservationNumber.slice(-4));
    counter = isNaN(latestCounter) ? 1 : latestCounter + 1;
  }
  
  // Format the counter as a 4-digit number
  const counterStr = counter.toString().padStart(4, '0');
  return `${prefix}-${counterStr}`;
};

// Check booking rules for a reservation request
const checkBookingRules = async (roomTypeId, checkInDate, checkOutDate) => {
  const checkIn = new Date(checkInDate);
  const checkOut = new Date(checkOutDate);
  
  // Calculate length of stay in days
  const stayDurationMs = checkOut.getTime() - checkIn.getTime();
  const stayDuration = Math.ceil(stayDurationMs / (1000 * 60 * 60 * 24));
  
  // Get all active booking rules for this room type
  const bookingRules = await BookingRule.find({
    $and: [
      { isActive: true },
      {
        $or: [
          { roomTypes: roomTypeId },
          { roomTypes: { $size: 0 } } // Rules that apply to all room types
        ]
      },
      {
        $or: [
          { 
            startDate: { $lte: checkOut },
            endDate: { $gte: checkIn }
          },
          {
            startDate: { $exists: false },
            endDate: { $exists: false }
          }
        ]
      }
    ]
  }).sort({ priority: -1 });
  
  const violations = [];
  
  // Check each rule
  for (const rule of bookingRules) {
    switch (rule.ruleType) {
      case 'min_stay':
        if (stayDuration < rule.value) {
          violations.push({
            rule: rule.name,
            message: `Minimum stay requirement not met. Required: ${rule.value} days, Requested: ${stayDuration} days.`
          });
        }
        break;
        
      case 'max_stay':
        if (stayDuration > rule.value) {
          violations.push({
            rule: rule.name,
            message: `Maximum stay requirement exceeded. Maximum: ${rule.value} days, Requested: ${stayDuration} days.`
          });
        }
        break;
        
      case 'blackout_date':
        // Check if any day in the stay range is a blackout date
        let currentDate = new Date(checkIn);
        while (currentDate < checkOut) {
          const blackoutDates = Array.isArray(rule.value) ? rule.value : [rule.value];
          
          for (const blackoutDate of blackoutDates) {
            const blackout = new Date(blackoutDate);
            if (currentDate.toDateString() === blackout.toDateString()) {
              violations.push({
                rule: rule.name,
                message: `The date ${blackout.toISOString().split('T')[0]} is a blackout date and not available for booking.`
              });
              break;
            }
          }
          
          // Move to next day
          currentDate.setDate(currentDate.getDate() + 1);
        }
        break;
        
      case 'cutoff_time':
        // Check if booking is made within cutoff time (value is hours before check-in)
        const now = new Date();
        const hoursBeforeCheckIn = (checkIn.getTime() - now.getTime()) / (1000 * 60 * 60);
        
        if (hoursBeforeCheckIn < rule.value) {
          violations.push({
            rule: rule.name,
            message: `Reservation cutoff time has passed. Requires at least ${rule.value} hours before check-in.`
          });
        }
        break;
        
      case 'advance_booking':
        // Check if booking is made within advance booking limit (value is days in advance)
        const daysInAdvance = (checkIn.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24);
        
        if (daysInAdvance > rule.value) {
          violations.push({
            rule: rule.name,
            message: `Advance booking limit exceeded. Maximum: ${rule.value} days in advance.`
          });
        }
        break;
    }
  }
  
  return violations;
};

// Check room availability for a date range
const checkRoomAvailability = async (roomTypeId, checkInDate, checkOutDate, excludeReservationId = null) => {
  const checkIn = new Date(checkInDate);
  const checkOut = new Date(checkOutDate);
  
  // Get count of rooms of this type
  const roomCount = await Room.countDocuments({ 
    roomType: roomTypeId,
    isActive: true
  });
  
  // Find conflicting reservations
  const conflictQuery = {
    roomType: roomTypeId,
    status: { $nin: ['cancelled', 'no-show'] },
    $or: [
      {
        checkInDate: { $lt: checkOut },
        checkOutDate: { $gt: checkIn }
      }
    ]
  };
  
  // Exclude the current reservation if we're updating
  if (excludeReservationId) {
    conflictQuery._id = { $ne: mongoose.Types.ObjectId(excludeReservationId) };
  }
  
  const conflictingReservations = await Reservation.countDocuments(conflictQuery);
  
  return {
    isAvailable: conflictingReservations < roomCount,
    roomCount,
    bookedCount: conflictingReservations,
    availableCount: roomCount - conflictingReservations
  };
};

// Calculate total amount for a reservation
const calculateReservationAmount = async (roomTypeId, checkInDate, checkOutDate) => {
  const checkIn = new Date(checkInDate);
  const checkOut = new Date(checkOutDate);
  
  // Get room type details
  const roomType = await RoomType.findById(roomTypeId);
  if (!roomType) {
    throw new Error('Room type not found');
  }
  
  let totalAmount = 0;
  let currentDate = new Date(checkIn);
  
  // Calculate for each day of the stay
  while (currentDate < checkOut) {
    const dateString = currentDate.toDateString();
    
    // Find the rate for this specific date if it exists
    const specialRate = roomType.rates.find(
      rate => new Date(rate.date).toDateString() === dateString
    );
    
    // Use special rate if exists, otherwise use base rate
    const dayRate = specialRate ? specialRate.price : roomType.baseRate;
    totalAmount += dayRate;
    
    // Move to next day
    currentDate.setDate(currentDate.getDate() + 1);
  }
  
  return totalAmount;
};

// @route   GET /api/reservations
// @desc    Get all reservations (with filters)
// @access  Private
router.get('/', protect, async (req, res) => {
  try {
    const {
      status,
      guest,
      checkInDate,
      checkOutDate,
      source,
      roomType,
      room
    } = req.query;
    
    // Build query object
    const query = {};
    
    if (status) query.status = status;
    if (guest) {
      query.$or = [
        { 'guest.firstName': new RegExp(guest, 'i') },
        { 'guest.lastName': new RegExp(guest, 'i') },
        { 'guest.email': new RegExp(guest, 'i') }
      ];
    }
    if (checkInDate) query.checkInDate = { $gte: new Date(checkInDate) };
    if (checkOutDate) query.checkOutDate = { $lte: new Date(checkOutDate) };
    if (source) query.source = source;
    if (roomType) query.roomType = roomType;
    if (room) query.room = room;
    
    // Execute query with pagination
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const startIndex = (page - 1) * limit;
    
    const reservations = await Reservation.find(query)
      .populate('roomType')
      .populate('room')
      .populate('createdBy', 'firstName lastName')
      .sort({ createdAt: -1 })
      .skip(startIndex)
      .limit(limit);
    
    const total = await Reservation.countDocuments(query);
    
    res.status(200).json({
      success: true,
      count: reservations.length,
      pagination: {
        total,
        page,
        pages: Math.ceil(total / limit)
      },
      data: reservations
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// @route   GET /api/reservations/:id
// @desc    Get single reservation
// @access  Private
router.get('/:id', protect, async (req, res) => {
  try {
    const reservation = await Reservation.findById(req.params.id)
      .populate('roomType')
      .populate('room')
      .populate('createdBy', 'firstName lastName');
    
    if (!reservation) {
      return res.status(404).json({
        success: false,
        error: 'Reservation not found'
      });
    }
    
    res.status(200).json({
      success: true,
      data: reservation
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

// @route   POST /api/reservations
// @desc    Create new reservation
// @access  Private
router.post('/', protect, async (req, res) => {
  try {
    const { roomTypeId, checkInDate, checkOutDate } = req.body;
    
    // Check booking rules
    const ruleViolations = await checkBookingRules(roomTypeId, checkInDate, checkOutDate);
    if (ruleViolations.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Booking rule violations',
        violations: ruleViolations
      });
    }
    
    // Check availability
    const availability = await checkRoomAvailability(roomTypeId, checkInDate, checkOutDate);
    if (!availability.isAvailable) {
      return res.status(400).json({
        success: false,
        error: 'No rooms available for the selected dates',
        availability
      });
    }
    
    // Calculate total amount
    const totalAmount = await calculateReservationAmount(roomTypeId, checkInDate, checkOutDate);
    
    // Generate reservation number
    const reservationNumber = await generateReservationNumber();
    
    // Create reservation
    const reservation = await Reservation.create({
      ...req.body,
      reservationNumber,
      roomType: roomTypeId,
      totalAmount,
      createdBy: req.user._id
    });
    
    // Populate related fields for response
    const populatedReservation = await Reservation.findById(reservation._id)
      .populate('roomType')
      .populate('createdBy', 'firstName lastName');
    
    res.status(201).json({
      success: true,
      data: populatedReservation
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// @route   PUT /api/reservations/:id
// @desc    Update reservation
// @access  Private
router.put('/:id', protect, async (req, res) => {
  try {
    let reservation = await Reservation.findById(req.params.id);
    
    if (!reservation) {
      return res.status(404).json({
        success: false,
        error: 'Reservation not found'
      });
    }
    
    // Check if status is being changed to checked-in
    if (req.body.status === 'checked-in' && reservation.status !== 'checked-in') {
      // Assign a room if not already assigned
      if (!req.body.room && !reservation.room) {
        // Find an available room of the requested type
        const availableRoom = await Room.findOne({ 
          roomType: reservation.roomType,
          status: 'available',
          isActive: true
        });
        
        if (availableRoom) {
          req.body.room = availableRoom._id;
          
          // Update room status to occupied
          await Room.findByIdAndUpdate(availableRoom._id, { 
            status: 'occupied',
            updatedAt: Date.now()
          });
        } else {
          return res.status(400).json({
            success: false,
            error: 'No available rooms of the requested type'
          });
        }
      }
    }
    
    // Check if status is being changed to checked-out
    if (req.body.status === 'checked-out' && reservation.status !== 'checked-out') {
      // If the reservation has a room assigned, update its status
      if (reservation.room) {
        await Room.findByIdAndUpdate(reservation.room, {
          status: 'cleaning',
          updatedAt: Date.now()
        });
      }
    }
    
    // Update reservation
    reservation = await Reservation.findByIdAndUpdate(
      req.params.id,
      { ...req.body, updatedAt: Date.now() },
      { new: true, runValidators: true }
    )
    .populate('roomType')
    .populate('room')
    .populate('createdBy', 'firstName lastName');
    
    res.status(200).json({
      success: true,
      data: reservation
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// @route   DELETE /api/reservations/:id
// @desc    Delete reservation
// @access  Private (admin & manager only)
router.delete('/:id', protect, authorize('admin', 'manager'), async (req, res) => {
  try {
    const reservation = await Reservation.findByIdAndDelete(req.params.id);
    
    if (!reservation) {
      return res.status(404).json({
        success: false,
        error: 'Reservation not found'
      });
    }
    
    res.status(200).json({
      success: true,
      data: {}
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// @route   POST /api/reservations/:id/payment
// @desc    Add payment to reservation
// @access  Private
router.post('/:id/payment', protect, async (req, res) => {
  try {
    const { amount, method, transactionId } = req.body;
    
    const reservation = await Reservation.findById(req.params.id);
    
    if (!reservation) {
      return res.status(404).json({
        success: false,
        error: 'Reservation not found'
      });
    }
    
    // Add payment to payment details array
    reservation.paymentDetails.push({
      amount,
      method,
      transactionId,
      date: Date.now()
    });
    
    // Calculate total paid
    const totalPaid = reservation.paymentDetails.reduce((acc, payment) => acc + payment.amount, 0);
    
    // Update payment status
    if (totalPaid >= reservation.totalAmount) {
      reservation.paymentStatus = 'paid';
    } else if (totalPaid > 0) {
      reservation.paymentStatus = 'partially_paid';
    }
    
    reservation.updatedAt = Date.now();
    await reservation.save();
    
    res.status(200).json({
      success: true,
      data: reservation
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// @route   GET /api/reservations/availability/:roomTypeId
// @desc    Check room availability for a date range
// @access  Private
router.get('/availability/:roomTypeId', protect, async (req, res) => {
  try {
    const { checkInDate, checkOutDate } = req.query;
    
    if (!checkInDate || !checkOutDate) {
      return res.status(400).json({
        success: false,
        error: 'Check-in and check-out dates are required'
      });
    }
    
    // Check booking rules
    const ruleViolations = await checkBookingRules(req.params.roomTypeId, checkInDate, checkOutDate);
    
    // Check availability
    const availability = await checkRoomAvailability(req.params.roomTypeId, checkInDate, checkOutDate);
    
    // Calculate total amount if dates are valid
    let totalAmount = 0;
    try {
      totalAmount = await calculateReservationAmount(req.params.roomTypeId, checkInDate, checkOutDate);
    } catch (error) {
      console.error('Error calculating amount:', error);
    }
    
    res.status(200).json({
      success: true,
      data: {
        isAvailable: availability.isAvailable && ruleViolations.length === 0,
        availability,
        ruleViolations,
        totalAmount
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;