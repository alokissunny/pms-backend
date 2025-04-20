const mongoose = require('mongoose');

const RoomSchema = new mongoose.Schema({
  roomNumber: { type: String, required: true, unique: true },
  propertyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Property',
    required: [true, 'Property ID is required']
  },
  roomType: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'RoomType',
    required: true 
  },
  floor: { type: Number, required: true },
  status: { 
    type: String, 
    enum: ['available', 'occupied', 'maintenance', 'cleaning'], 
    default: 'available' 
  },
  bedType: {
    type: String,
    enum: ['king', 'queen', 'double', 'single', 'twin', 'twin_xl', 'california_king'],
    required: true
  },
  description: {
    type: String,
    trim: true
  },
  images: [{
    url: { type: String, required: true },
    caption: { type: String },
    isPrimary: { type: Boolean, default: false }
  }],
  isActive: { type: Boolean, default: true },
  notes: { type: String },
  amenities: [{ type: String }],
  lastCleaned: { type: Date },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Update the updatedAt field before saving
RoomSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('Room', RoomSchema);
