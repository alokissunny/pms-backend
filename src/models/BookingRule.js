const mongoose = require('mongoose');

const BookingRuleSchema = new mongoose.Schema({
  name: { type: String, required: true },
  ruleType: { 
    type: String, 
    enum: ['min_stay', 'max_stay', 'blackout_date', 'cutoff_time', 'advance_booking'],
    required: true
  },
  roomTypes: [{ 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'RoomType' 
  }],
  value: { type: mongoose.Schema.Types.Mixed, required: true }, // For min_stay: number of days, for blackout_date: array of dates
  startDate: { type: Date },
  endDate: { type: Date },
  daysOfWeek: [{ type: Number }], // 0-6 for Sunday-Saturday
  isActive: { type: Boolean, default: true },
  priority: { type: Number, default: 0 },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('BookingRule', BookingRuleSchema);
