const mongoose = require('mongoose');

const RateSchema = new mongoose.Schema({
  date: { type: Date, required: true },
  price: { type: Number, required: true },
  specialRate: { type: Boolean, default: false },
  specialRateReason: { type: String }
});

const RoomTypeSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  description: { type: String },
  capacity: { type: Number, required: true },
  baseRate: { type: Number, required: true },
  rates: [RateSchema],
  amenities: [{ type: String }],
  images: [{ type: String }],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('RoomType', RoomTypeSchema);
