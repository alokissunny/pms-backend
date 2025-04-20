const mongoose = require('mongoose');

const ReservationSchema = new mongoose.Schema({
  reservationNumber: { type: String, required: true, unique: true },
  guest: {
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    email: { type: String, required: true },
    phone: { type: String },
    address: {
      street: { type: String },
      city: { type: String },
      state: { type: String },
      postalCode: { type: String },
      country: { type: String }
    }
  },
  room: { type: mongoose.Schema.Types.ObjectId, ref: 'Room' },
  roomType: { type: mongoose.Schema.Types.ObjectId, ref: 'RoomType' },
  checkInDate: { type: Date, required: true },
  checkOutDate: { type: Date, required: true },
  status: { 
    type: String, 
    enum: ['confirmed', 'checked-in', 'checked-out', 'cancelled', 'no-show'], 
    default: 'confirmed' 
  },
  totalAmount: { type: Number, required: true },
  paymentStatus: { 
    type: String, 
    enum: ['pending', 'partially_paid', 'paid', 'refunded'], 
    default: 'pending' 
  },
  paymentDetails: [{
    amount: { type: Number },
    method: { type: String },
    transactionId: { type: String },
    date: { type: Date }
  }],
  source: { 
    type: String, 
    enum: ['direct', 'booking.com', 'expedia', 'airbnb', 'other'], 
    default: 'direct' 
  },
  sourceId: { type: String },
  specialRequests: { type: String },
  notes: { type: String },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Reservation', ReservationSchema);
