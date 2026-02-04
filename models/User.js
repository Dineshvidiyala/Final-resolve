const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    trim: true
  },
  rollNumber: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    uppercase: true // Optional: force uppercase for consistency
  },
  roomNumber: {
    type: String,
    trim: true
  },
  mobile: {
    type: String,
    trim: true
  },
  gender: {
    type: String,
    trim: true
    // Removed enum to avoid validation errors from Excel
  },
  password: {
    type: String,
    required: function() { return this.role === 'student'; } // Required for students
  },
  role: {
    type: String,
    enum: ['student', 'admin'],
    required: true
  },
  isActive: {
    type: Boolean,
    default: true  // Students from Excel are active immediately
  }
}, { timestamps: true });

// Auto-hash password before save (only if modified and exists)
userSchema.pre('save', async function(next) {
  if (!this.isModified('password') || !this.password) return next();

  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (err) {
    next(err);
  }
});

// Compare password for login
userSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('User', userSchema);
