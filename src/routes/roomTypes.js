const express = require('express');
const router = express.Router();
const RoomType = require('../models/RoomType');
const { protect, authorize } = require('../middleware/auth');

// @route   GET /api/room-types
// @desc    Get all room types
// @access  Private
router.get('/', protect, async (req, res) => {
  try {
    const roomTypes = await RoomType.find();
    
    res.status(200).json({
      success: true,
      count: roomTypes.length,
      data: roomTypes
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// @route   GET /api/room-types/:id
// @desc    Get single room type
// @access  Private
router.get('/:id', protect, async (req, res) => {
  try {
    const roomType = await RoomType.findById(req.params.id);
    
    if (!roomType) {
      return res.status(404).json({
        success: false,
        error: 'Room type not found'
      });
    }
    
    res.status(200).json({
      success: true,
      data: roomType
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// @route   POST /api/room-types
// @desc    Create new room type
// @access  Private (admin & manager only)
router.post('/', protect, authorize('admin', 'manager'), async (req, res) => {
  try {
    const roomType = await RoomType.create(req.body);
    
    res.status(201).json({
      success: true,
      data: roomType
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// @route   PUT /api/room-types/:id
// @desc    Update room type
// @access  Private (admin & manager only)
router.put('/:id', protect, authorize('admin', 'manager'), async (req, res) => {
  try {
    const roomType = await RoomType.findByIdAndUpdate(
      req.params.id,
      { ...req.body, updatedAt: Date.now() },
      { new: true, runValidators: true }
    );
    
    if (!roomType) {
      return res.status(404).json({
        success: false,
        error: 'Room type not found'
      });
    }
    
    res.status(200).json({
      success: true,
      data: roomType
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// @route   DELETE /api/room-types/:id
// @desc    Delete room type
// @access  Private (admin only)
router.delete('/:id', protect, authorize('admin'), async (req, res) => {
  try {
    const roomType = await RoomType.findByIdAndDelete(req.params.id);
    
    if (!roomType) {
      return res.status(404).json({
        success: false,
        error: 'Room type not found'
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

// @route   PUT /api/room-types/:id/rates
// @desc    Update or add room rates
// @access  Private (admin & manager only)
router.put('/:id/rates', protect, authorize('admin', 'manager'), async (req, res) => {
  try {
    const { rates } = req.body;
    
    // Validate rates array
    if (!Array.isArray(rates)) {
      return res.status(400).json({
        success: false,
        error: 'Rates must be an array'
      });
    }
    
    const roomType = await RoomType.findById(req.params.id);
    
    if (!roomType) {
      return res.status(404).json({
        success: false,
        error: 'Room type not found'
      });
    }
    
    // Process each rate in the array
    rates.forEach(rate => {
      // Convert date string to Date object if necessary
      const rateDate = new Date(rate.date);
      
      // Find the existing rate for this date if it exists
      const existingRateIndex = roomType.rates.findIndex(
        r => new Date(r.date).toDateString() === rateDate.toDateString()
      );
      
      if (existingRateIndex >= 0) {
        // Update existing rate
        roomType.rates[existingRateIndex] = {
          ...roomType.rates[existingRateIndex].toObject(),
          ...rate,
          date: rateDate
        };
      } else {
        // Add new rate
        roomType.rates.push({
          ...rate,
          date: rateDate
        });
      }
    });
    
    // Sort rates by date
    roomType.rates.sort((a, b) => new Date(a.date) - new Date(b.date));
    
    // Update the room type
    roomType.updatedAt = Date.now();
    await roomType.save();
    
    res.status(200).json({
      success: true,
      data: roomType
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// @route   GET /api/room-types/:id/availability
// @desc    Get room type availability for date range
// @access  Private
router.get('/:id/availability', protect, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        error: 'Start date and end date are required'
      });
    }
    
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    // Validate dates
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({
        success: false,
        error: 'Invalid date format'
      });
    }
    
    // Get the room type
    const roomType = await RoomType.findById(req.params.id);
    
    if (!roomType) {
      return res.status(404).json({
        success: false,
        error: 'Room type not found'
      });
    }
    
    // Get room rates for the date range
    const dateRates = [];
    let currentDate = new Date(start);
    
    while (currentDate <= end) {
      // Find the rate for this date
      const dateString = currentDate.toDateString();
      const rate = roomType.rates.find(
        r => new Date(r.date).toDateString() === dateString
      );
      
      // If there's a special rate for this date, use it; otherwise use base rate
      const priceForDate = rate ? rate.price : roomType.baseRate;
      
      dateRates.push({
        date: new Date(currentDate),
        price: priceForDate,
        isSpecialRate: rate ? rate.specialRate : false,
        specialRateReason: rate ? rate.specialRateReason : null
      });
      
      // Move to next day
      currentDate.setDate(currentDate.getDate() + 1);
    }
    
    res.status(200).json({
      success: true,
      data: {
        roomType: {
          _id: roomType._id,
          name: roomType.name,
          baseRate: roomType.baseRate
        },
        dateRates
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
