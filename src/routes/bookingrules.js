// routes/bookingRules.js
const express = require('express');
const router = express.Router();
const BookingRule = require('../models/BookingRule');
const { protect, authorize } = require('../middleware/auth');

// @route   GET /api/booking-rules
// @desc    Get all booking rules
// @access  Private
router.get('/', protect, async (req, res) => {
  try {
    const { active, ruleType, roomType } = req.query;
    
    // Build query object
    const query = {};
    
    if (active === 'true') query.isActive = true;
    if (active === 'false') query.isActive = false;
    if (ruleType) query.ruleType = ruleType;
    if (roomType) query.roomTypes = roomType;
    
    const bookingRules = await BookingRule.find(query)
      .populate('roomTypes', 'name')
      .populate('createdBy', 'firstName lastName')
      .sort({ createdAt: -1 });
    
    res.status(200).json({
      success: true,
      count: bookingRules.length,
      data: bookingRules
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// @route   GET /api/booking-rules/:id
// @desc    Get single booking rule
// @access  Private
router.get('/:id', protect, async (req, res) => {
  try {
    const bookingRule = await BookingRule.findById(req.params.id)
      .populate('roomTypes', 'name')
      .populate('createdBy', 'firstName lastName');
    
    if (!bookingRule) {
      return res.status(404).json({
        success: false,
        error: 'Booking rule not found'
      });
    }
    
    res.status(200).json({
      success: true,
      data: bookingRule
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// @route   POST /api/booking-rules
// @desc    Create new booking rule
// @access  Private (admin & manager only)
router.post('/', protect, authorize('admin', 'manager'), async (req, res) => {
  try {
    // Validate rule type and value
    const { ruleType, value } = req.body;
    
    // Value validation based on rule type
    switch (ruleType) {
      case 'min_stay':
      case 'max_stay':
      case 'cutoff_time':
      case 'advance_booking':
        if (typeof value !== 'number' || value <= 0) {
          return res.status(400).json({
            success: false,
            error: `Value for ${ruleType} must be a positive number`
          });
        }
        break;
        
      case 'blackout_date':
        // Validate blackout date(s)
        if (!Array.isArray(value) && !Date.parse(value)) {
          return res.status(400).json({
            success: false,
            error: 'Blackout dates must be valid date strings or array of dates'
          });
        }
        
        // If array, check each date
        if (Array.isArray(value)) {
          for (const date of value) {
            if (!Date.parse(date)) {
              return res.status(400).json({
                success: false,
                error: 'All blackout dates must be valid date strings'
              });
            }
          }
        }
        break;
        
      default:
        return res.status(400).json({
          success: false,
          error: 'Invalid rule type'
        });
    }
    
    // Create the booking rule
    const bookingRule = await BookingRule.create({
      ...req.body,
      createdBy: req.user._id
    });
    
    // Populate for response
    const populatedRule = await BookingRule.findById(bookingRule._id)
      .populate('roomTypes', 'name')
      .populate('createdBy', 'firstName lastName');
    
    res.status(201).json({
      success: true,
      data: populatedRule
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// @route   PUT /api/booking-rules/:id
// @desc    Update booking rule
// @access  Private (admin & manager only)
router.put('/:id', protect, authorize('admin', 'manager'), async (req, res) => {
  try {
    // Find booking rule
    let bookingRule = await BookingRule.findById(req.params.id);
    
    if (!bookingRule) {
      return res.status(404).json({
        success: false,
        error: 'Booking rule not found'
      });
    }
    
    // Validate rule type and value if they're being updated
    if (req.body.ruleType || req.body.value !== undefined) {
      const ruleType = req.body.ruleType || bookingRule.ruleType;
      const value = req.body.value !== undefined ? req.body.value : bookingRule.value;
      
      // Value validation based on rule type
      switch (ruleType) {
        case 'min_stay':
        case 'max_stay':
        case 'cutoff_time':
        case 'advance_booking':
          if (typeof value !== 'number' || value <= 0) {
            return res.status(400).json({
              success: false,
              error: `Value for ${ruleType} must be a positive number`
            });
          }
          break;
          
        case 'blackout_date':
          // Validate blackout date(s)
          if (!Array.isArray(value) && !Date.parse(value)) {
            return res.status(400).json({
              success: false,
              error: 'Blackout dates must be valid date strings or array of dates'
            });
          }
          
          // If array, check each date
          if (Array.isArray(value)) {
            for (const date of value) {
              if (!Date.parse(date)) {
                return res.status(400).json({
                  success: false,
                  error: 'All blackout dates must be valid date strings'
                });
              }
            }
          }
          break;
      }
    }
    
    // Update booking rule
    bookingRule = await BookingRule.findByIdAndUpdate(
      req.params.id,
      { ...req.body, updatedAt: Date.now() },
      { new: true, runValidators: true }
    )
    .populate('roomTypes', 'name')
    .populate('createdBy', 'firstName lastName');
    
    res.status(200).json({
      success: true,
      data: bookingRule
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// @route   DELETE /api/booking-rules/:id
// @desc    Delete booking rule
// @access  Private (admin only)
router.delete('/:id', protect, authorize('admin'), async (req, res) => {
  try {
    const bookingRule = await BookingRule.findById(req.params.id);
    
    if (!bookingRule) {
      return res.status(404).json({
        success: false,
        error: 'Booking rule not found'
      });
    }
    
    await bookingRule.remove();
    
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

// @route   GET /api/booking-rules/check
// @desc    Check if a reservation meets all booking rules
// @access  Private
router.get('/check', protect, async (req, res) => {
  try {
    const { roomTypeId, checkInDate, checkOutDate } = req.query;
    
    if (!roomTypeId || !checkInDate || !checkOutDate) {
      return res.status(400).json({
        success: false,
        error: 'Room type ID, check-in date, and check-out date are required'
      });
    }
    
    const checkIn = new Date(checkInDate);
    const checkOut = new Date(checkOutDate);
    
    // Calculate length of stay in days
    const stayDurationMs = checkOut.getTime() - checkIn.getTime();
    const stayDuration = Math.ceil(stayDurationMs / (1000 * 60 * 60 * 24));
    
    // Get all active booking rules for this room type
    const bookingRules = await BookingRule.find({
      $or: [
        { roomTypes: roomTypeId },
        { roomTypes: { $size: 0 } } // Rules that apply to all room types
      ],
      isActive: true,
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
    }).sort({ priority: -1 });
    
    const violations = [];
    
    // Check each rule
    for (const rule of bookingRules) {
      let violated = false;
      let message = '';
      
      switch (rule.ruleType) {
        case 'min_stay':
          if (stayDuration < rule.value) {
            violated = true;
            message = `Minimum stay requirement not met. Required: ${rule.value} days, Requested: ${stayDuration} days.`;
          }
          break;
          
        case 'max_stay':
          if (stayDuration > rule.value) {
            violated = true;
            message = `Maximum stay requirement exceeded. Maximum: ${rule.value} days, Requested: ${stayDuration} days.`;
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
                violated = true;
                message = `The date ${blackout.toISOString().split('T')[0]} is a blackout date and not available for booking.`;
                break;
              }
            }
            
            if (violated) break;
            
            // Move to next day
            currentDate.setDate(currentDate.getDate() + 1);
          }
          break;
          
        case 'cutoff_time':
          // Check if booking is made within cutoff time (value is hours before check-in)
          const now = new Date();
          const hoursBeforeCheckIn = (checkIn.getTime() - now.getTime()) / (1000 * 60 * 60);
          
          if (hoursBeforeCheckIn < rule.value) {
            violated = true;
            message = `Reservation cutoff time has passed. Requires at least ${rule.value} hours before check-in.`;
          }
          break;
          
        case 'advance_booking':
          // Check if booking is made within advance booking limit (value is days in advance)
          const daysInAdvance = (checkIn.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24);
          
          if (daysInAdvance > rule.value) {
            violated = true;
            message = `Advance booking limit exceeded. Maximum: ${rule.value} days in advance.`;
          }
          break;
      }
      
      if (violated) {
        violations.push({
          rule: rule.name,
          ruleType: rule.ruleType,
          value: rule.value,
          message
        });
      }
    }
    
    res.status(200).json({
      success: true,
      data: {
        isValid: violations.length === 0,
        violations
      }
    });
  } catch (error) {
    res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });
  
  // @route   PUT /api/booking-rules/:id/toggle-status
  // @desc    Toggle active status of a booking rule
  // @access  Private (admin & manager only)
  router.put('/:id/toggle-status', protect, authorize('admin', 'manager'), async (req, res) => {
    try {
      const bookingRule = await BookingRule.findById(req.params.id);
      
      if (!bookingRule) {
        return res.status(404).json({
          success: false,
          error: 'Booking rule not found'
        });
      }
      
      // Toggle isActive status
      bookingRule.isActive = !bookingRule.isActive;
      bookingRule.updatedAt = Date.now();
      
      await bookingRule.save();
      
      res.status(200).json({
        success: true,
        data: bookingRule
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });
  
  module.exports = router;
  