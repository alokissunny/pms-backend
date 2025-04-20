const mongoose = require('mongoose');

const PropertySchema = new mongoose.Schema({
  name: { 
    type: String, 
    required: [true, 'Property name is required'],
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Property owner is required']
  },
  images: [{
    url: { type: String, required: true },
    caption: { type: String },
    isPrimary: { type: Boolean, default: false }
  }],
  address: {
    street: { type: String, required: true },
    city: { type: String, required: true },
    state: { type: String, required: true },
    zipCode: { type: String, required: true },
    country: { type: String, required: true }
  },
  location: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point'
    },
    coordinates: {
      type: [Number], // [longitude, latitude]
      required: true
    }
  },
  nearbyAmenities: [{
    name: { type: String, required: true },
    type: { 
      type: String, 
      enum: ['restaurant', 'shopping', 'transportation', 'entertainment', 'healthcare', 'other'],
      default: 'other'
    },
    distance: { type: Number }, // in meters
    description: { type: String }
  }],
  contactNumbers: [{
    type: { 
      type: String, 
      enum: ['main', 'reservation', 'emergency', 'maintenance', 'other'],
      default: 'main'
    },
    number: { type: String, required: true },
    isPrimary: { type: Boolean, default: false }
  }],
  email: {
    type: String,
    match: [
      /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
      'Please add a valid email'
    ]
  },
  website: {
    type: String
  },
  checkInTime: {
    type: String,
    default: '15:00'
  },
  checkOutTime: {
    type: String,
    default: '11:00'
  },
  policies: {
    cancellation: { type: String },
    checkIn: { type: String },
    checkOut: { type: String },
    children: { type: String },
    pets: { type: String }
  },
  isActive: {
    type: Boolean,
    default: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Create a geospatial index for location-based queries
PropertySchema.index({ location: '2dsphere' });

// Update the updatedAt field before saving
PropertySchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('Property', PropertySchema); 