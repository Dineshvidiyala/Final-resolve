require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const User = require('./models/User');
const Complaint = require('./models/Complaint');

const app = express();
const PORT = 3000;

// Multer setup for image uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});
const upload = multer({ storage });

// Middleware
app.use(express.json());
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('MongoDB connected ✅'))
  .catch(err => console.error('MongoDB connection error:', err));

// JWT Authentication Middleware
const authenticate = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'No token provided' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ message: 'Invalid token' });
  }
};

// ────────────────────────────────────────────────
// Login Route
app.post('/api/login', async (req, res) => {
  const { rollNumber, password } = req.body;
  try {
    const user = await User.findOne({ rollNumber });
    if (!user) return res.status(400).json({ message: 'User not found' });

    if (!user.isActive) {
      return res.status(403).json({ message: 'Account not activated. Set password on first login.', needsActivation: true });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ message: 'Invalid credentials' });

    const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '1h' });
    res.json({ token, role: user.role });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Activate account (first-time password set for students)
app.post('/api/activate', async (req, res) => {
  const { rollNumber, password } = req.body;
  try {
    const user = await User.findOne({ rollNumber, isActive: false });
    if (!user) return res.status(400).json({ message: 'Invalid or already activated' });

    user.password = password; // will be hashed by pre-save hook
    user.isActive = true;
    await user.save();

    res.json({ message: 'Account activated successfully. Now login.' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Submit complaint (student only)
app.post('/api/complaints', authenticate, upload.single('image'), async (req, res) => {
  if (req.user.role !== 'student') return res.status(403).json({ message: 'Only students can submit complaints' });

  const { title, category, description, roomNumber } = req.body;
  const imagePath = req.file ? req.file.path : null;

  try {
    const complaint = new Complaint({
      title,
      category,
      description,
      roomNumber,
      imagePath,
      studentId: req.user.id
    });
    await complaint.save();
    res.json({ message: 'Complaint submitted successfully' });
  } catch (err) {
    res.status(500).json({ message: 'Error submitting complaint' });
  }
});

// Get student's own complaints
app.get('/api/my-complaints', authenticate, async (req, res) => {
  if (req.user.role !== 'student') return res.status(403).json({ message: 'Only students can view their complaints' });

  try {
    const complaints = await Complaint.find({ studentId: req.user.id }).sort({ createdAt: -1 });
    res.json(complaints);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Get all active complaints (admin only)
app.get('/api/complaints', authenticate, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ message: 'Admin only' });

  const { category, roomNumber, status } = req.query;
  const filter = { status: { $ne: 'Resolved' } };

  if (category) filter.category = category;
  if (roomNumber) filter.roomNumber = roomNumber;
  if (status) filter.status = status;

  try {
    const complaints = await Complaint.find(filter)
      .populate('studentId', 'rollNumber roomNumber')
      .sort({ createdAt: -1 });
    res.json(complaints);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Get resolved history (admin only)
app.get('/api/complaints/history', authenticate, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ message: 'Admin only' });

  try {
    const history = await Complaint.find({ status: 'Resolved' })
      .populate('studentId', 'rollNumber roomNumber')
      .sort({ updatedAt: -1 });
    res.json(history);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Update complaint status (admin only)
app.put('/api/complaints/:id', authenticate, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ message: 'Admin only' });

  const { status } = req.body;
  try {
    const complaint = await Complaint.findById(req.params.id);
    if (!complaint) return res.status(404).json({ message: 'Complaint not found' });

    complaint.status = status;
    complaint.updatedAt = Date.now();
    await complaint.save();

    res.json({ message: 'Status updated' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ────────────────────────────────────────────────
// NEW: Delete resolved complaint (admin only)
// ────────────────────────────────────────────────
app.delete('/api/complaints/:id', authenticate, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ message: 'Admin only' });

  try {
    const complaint = await Complaint.findById(req.params.id);
    if (!complaint) return res.status(404).json({ message: 'Complaint not found' });

    if (complaint.status !== 'Resolved') {
      return res.status(400).json({ message: 'Only resolved complaints can be deleted' });
    }

    // Delete image file if exists
    if (complaint.imagePath) {
      const imageFullPath = path.join(__dirname, complaint.imagePath);
      if (fs.existsSync(imageFullPath)) {
        fs.unlinkSync(imageFullPath);
      }
    }

    await Complaint.findByIdAndDelete(req.params.id);

    res.json({ message: 'Complaint deleted successfully' });
  } catch (err) {
    console.error('Delete error:', err);
    res.status(500).json({ message: 'Server error while deleting' });
  }
});

// ────────────────────────────────────────────────
// TEMPORARY ADMIN SETUP - RUN ONCE, THEN COMMENT OUT OR DELETE THIS BLOCK
// ────────────────────────────────────────────────
(async () => {
  try {
    const roll = 'admin';                   // ← Change if you want different roll number
    const plainPassword = 'admin@2025';     // ← CHANGE THIS TO YOUR DESIRED STRONG PASSWORD

    let adminUser = await User.findOne({ rollNumber: roll });

    if (!adminUser) {
      adminUser = new User({
        rollNumber: roll,
        role: 'admin',
        password: plainPassword,            // hashed automatically
        isActive: true,
        roomNumber: null
      });
      await adminUser.save();
      console.log(`✅ Admin user CREATED successfully!`);
      console.log(`   Roll Number : ${roll}`);
      console.log(`   Password    : ${plainPassword}`);
      console.log(`   Login at: http://localhost:3000`);
    } else {
      adminUser.password = plainPassword;
      adminUser.isActive = true;
      await adminUser.save();
      console.log(`✅ Admin password UPDATED successfully!`);
      console.log(`   Roll Number : ${roll}`);
      console.log(`   New Password: ${plainPassword}`);
    }
  } catch (err) {
    console.error('Admin setup failed:', err.message);
  }
})();

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

// require('dotenv').config();
// const express = require('express');
// const mongoose = require('mongoose');
// const bcrypt = require('bcryptjs');
// const jwt = require('jsonwebtoken');
// const multer = require('multer');
// const path = require('path');

// const User = require('./models/User');
// const Complaint = require('./models/Complaint');

// const app = express();
// const PORT = 3000;

// // Multer setup for image uploads
// const storage = multer.diskStorage({
//   destination: (req, file, cb) => {
//     cb(null, 'uploads/');
//   },
//   filename: (req, file, cb) => {
//     cb(null, Date.now() + path.extname(file.originalname));
//   }
// });
// const upload = multer({ storage });

// // Middleware
// app.use(express.json());
// app.use(express.static('public'));
// app.use('/uploads', express.static('uploads'));

// // Connect to MongoDB
// mongoose.connect(process.env.MONGO_URI)
//   .then(() => console.log('MongoDB connected ✅'))
//   .catch(err => console.error('MongoDB connection error:', err));

// // JWT Authentication Middleware
// const authenticate = (req, res, next) => {
//   const token = req.headers.authorization?.split(' ')[1];
//   if (!token) return res.status(401).json({ message: 'No token provided' });

//   try {
//     const decoded = jwt.verify(token, process.env.JWT_SECRET);
//     req.user = decoded;
//     next();
//   } catch (err) {
//     res.status(401).json({ message: 'Invalid token' });
//   }
// };

// // ────────────────────────────────────────────────
// // Login Route
// app.post('/api/login', async (req, res) => {
//   const { rollNumber, password } = req.body;
//   try {
//     const user = await User.findOne({ rollNumber });
//     if (!user) return res.status(400).json({ message: 'User not found' });

//     if (!user.isActive) {
//       return res.status(403).json({ message: 'Account not activated. Set password on first login.', needsActivation: true });
//     }

//     const isMatch = await bcrypt.compare(password, user.password);
//     if (!isMatch) return res.status(400).json({ message: 'Invalid credentials' });

//     const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '1h' });
//     res.json({ token, role: user.role });
//   } catch (err) {
//     res.status(500).json({ message: 'Server error' });
//   }
// });

// // Activate account (first-time password set for students)
// app.post('/api/activate', async (req, res) => {
//   const { rollNumber, password } = req.body;
//   try {
//     const user = await User.findOne({ rollNumber, isActive: false });
//     if (!user) return res.status(400).json({ message: 'Invalid or already activated' });

//     user.password = password; // will be hashed by pre-save hook
//     user.isActive = true;
//     await user.save();

//     res.json({ message: 'Account activated successfully. Now login.' });
//   } catch (err) {
//     res.status(500).json({ message: 'Server error' });
//   }
// });

// // Submit complaint (student only)
// app.post('/api/complaints', authenticate, upload.single('image'), async (req, res) => {
//   if (req.user.role !== 'student') return res.status(403).json({ message: 'Only students can submit complaints' });

//   const { title, category, description, roomNumber } = req.body;
//   const imagePath = req.file ? req.file.path : null;

//   try {
//     const complaint = new Complaint({
//       title,
//       category,
//       description,
//       roomNumber,
//       imagePath,
//       studentId: req.user.id
//     });
//     await complaint.save();
//     res.json({ message: 'Complaint submitted successfully' });
//   } catch (err) {
//     res.status(500).json({ message: 'Error submitting complaint' });
//   }
// });

// // Get student's own complaints
// app.get('/api/my-complaints', authenticate, async (req, res) => {
//   if (req.user.role !== 'student') return res.status(403).json({ message: 'Only students can view their complaints' });

//   try {
//     const complaints = await Complaint.find({ studentId: req.user.id }).sort({ createdAt: -1 });
//     res.json(complaints);
//   } catch (err) {
//     res.status(500).json({ message: 'Server error' });
//   }
// });

// // Get all active complaints (admin only)
// app.get('/api/complaints', authenticate, async (req, res) => {
//   if (req.user.role !== 'admin') return res.status(403).json({ message: 'Admin only' });

//   const { category, roomNumber, status } = req.query;
//   const filter = { status: { $ne: 'Resolved' } };

//   if (category) filter.category = category;
//   if (roomNumber) filter.roomNumber = roomNumber;
//   if (status) filter.status = status;

//   try {
//     const complaints = await Complaint.find(filter)
//       .populate('studentId', 'rollNumber roomNumber')
//       .sort({ createdAt: -1 });
//     res.json(complaints);
//   } catch (err) {
//     res.status(500).json({ message: 'Server error' });
//   }
// });

// // Get resolved history (admin only)
// app.get('/api/complaints/history', authenticate, async (req, res) => {
//   if (req.user.role !== 'admin') return res.status(403).json({ message: 'Admin only' });

//   try {
//     const history = await Complaint.find({ status: 'Resolved' })
//       .populate('studentId', 'rollNumber roomNumber')
//       .sort({ updatedAt: -1 });
//     res.json(history);
//   } catch (err) {
//     res.status(500).json({ message: 'Server error' });
//   }
// });

// // Update complaint status (admin only)
// app.put('/api/complaints/:id', authenticate, async (req, res) => {
//   if (req.user.role !== 'admin') return res.status(403).json({ message: 'Admin only' });

//   const { status } = req.body;
//   try {
//     const complaint = await Complaint.findById(req.params.id);
//     if (!complaint) return res.status(404).json({ message: 'Complaint not found' });

//     complaint.status = status;
//     complaint.updatedAt = Date.now();
//     await complaint.save();

//     res.json({ message: 'Status updated' });
//   } catch (err) {
//     res.status(500).json({ message: 'Server error' });
//   }
// });

// // ────────────────────────────────────────────────
// // TEMPORARY ADMIN SETUP - RUN ONCE, THEN COMMENT OUT OR DELETE THIS BLOCK
// // ────────────────────────────────────────────────
// (async () => {
//   try {
//     const roll = 'admin';                   // ← Change if you want different roll number
//     const plainPassword = 'admin@2025';     // ← CHANGE THIS TO YOUR DESIRED STRONG PASSWORD

//     let adminUser = await User.findOne({ rollNumber: roll });

//     if (!adminUser) {
//       adminUser = new User({
//         rollNumber: roll,
//         role: 'admin',
//         password: plainPassword,            // hashed automatically
//         isActive: true,
//         roomNumber: null
//       });
//       await adminUser.save();
//       console.log(`✅ Admin user CREATED successfully!`);
//       console.log(`   Roll Number : ${roll}`);
//       console.log(`   Password    : ${plainPassword}`);
//       console.log(`   Login at: http://localhost:3000`);
//     } else {
//       adminUser.password = plainPassword;
//       adminUser.isActive = true;
//       await adminUser.save();
//       console.log(`✅ Admin password UPDATED successfully!`);
//       console.log(`   Roll Number : ${roll}`);
//       console.log(`   New Password: ${plainPassword}`);
//     }
//   } catch (err) {
//     console.error('Admin setup failed:', err.message);
//   }
// })();

// // Start server
// app.listen(PORT, () => {
//   console.log(`Server running on http://localhost:${PORT}`);
// });
