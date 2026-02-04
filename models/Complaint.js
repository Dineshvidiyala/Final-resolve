const mongoose = require('mongoose');

const complaintSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  category: {
    type: String,
    enum: ['water', 'electricity', 'cleaning', 'internet', 'other'],
    required: true
  },
  description: {
    type: String,
    required: true
  },
  roomNumber: {
    type: String,
    required: true,
    trim: true
  },
  location: {  // ← NEW FIELD
    type: String,
    enum: ['Hostel', 'Mess', 'Class', 'Ground'],
    required: true,
    trim: true
  },
  imagePath: {
    type: String  // path to uploaded image in /uploads folder
  },
  status: {
    type: String,
    enum: ['Pending', 'In Progress', 'Resolved'],
    default: 'Pending'
  },
  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, { timestamps: true });

module.exports = mongoose.model('Complaint', complaintSchema);
