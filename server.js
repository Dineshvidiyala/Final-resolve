require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const exceljs = require('exceljs');
const cron = require('node-cron');

const User = require('./models/User');
const Complaint = require('./models/Complaint');

const app = express();
const PORT = 3000;

// Multer setup for image + excel uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
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
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch (err) {
    res.status(401).json({ message: 'Invalid token' });
  }
};

// Login Route - with debug logs
app.post('/api/login', async (req, res) => {
  const { rollNumber, password } = req.body;

  console.log('Login attempt:', {
    rollNumber,
    receivedPassword: password,
    receivedLength: password.length
  });

  try {
    const user = await User.findOne({ rollNumber });
    if (!user) {
      console.log('User not found for rollNumber:', rollNumber);
      return res.status(400).json({ message: 'User not found' });
    }

    console.log('Found user:', user.rollNumber, 'Stored hash starts with:', user.password.substring(0, 15) + '...');
    const isMatch = await bcrypt.compare(password, user.password);
    console.log('Password match result:', isMatch);

    if (!isMatch) {
      console.log('Password mismatch for:', rollNumber);
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '1h' });
    res.json({ token, role: user.role });
  } catch (err) {
    console.error('Login error:', err.message, err.stack);
    res.status(500).json({ message: 'Server error' });
  }
});

// Submit complaint (student only) - accepts location
app.post('/api/complaints', authenticate, upload.single('image'), async (req, res) => {
  if (req.user.role !== 'student') return res.status(403).json({ message: 'Student only' });

  const { title, category, description, roomNumber, location } = req.body;
  const imagePath = req.file ? req.file.path : null;

  if (!title || !category || !description || !roomNumber || !location) {
    return res.status(400).json({ message: 'Missing required fields' });
  }

  try {
    const complaint = new Complaint({
      title,
      category,
      description,
      roomNumber,
      location,
      imagePath,
      studentId: req.user.id
    });
    await complaint.save();
    res.json({ message: 'Complaint submitted successfully' });
  } catch (err) {
    console.error('Submit error:', err.message);
    res.status(500).json({ message: 'Error submitting: ' + err.message });
  }
});

// My complaints (student)
app.get('/api/my-complaints', authenticate, async (req, res) => {
  if (req.user.role !== 'student') return res.status(403).json({ message: 'Student only' });

  try {
    const complaints = await Complaint.find({ studentId: req.user.id }).sort({ createdAt: -1 });
    res.json(complaints);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Get active complaints (admin only)
app.get('/api/complaints', authenticate, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ message: 'Admin only' });

  const { category, roomNumber, status } = req.query;
  const filter = { status: { $ne: 'Resolved' } };

  if (category) filter.category = category;
  if (roomNumber) filter.roomNumber = roomNumber;
  if (status) filter.status = status;

  try {
    const complaints = await Complaint.find(filter)
      .populate('studentId', 'name rollNumber mobile roomNumber')
      .sort({ createdAt: -1 });
    res.json(complaints);
  } catch (err) {
    console.error('Active complaints error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get resolved history (admin only)
app.get('/api/complaints/history', authenticate, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ message: 'Admin only' });

  try {
    const history = await Complaint.find({ status: 'Resolved' })
      .populate('studentId', 'name rollNumber mobile roomNumber')
      .sort({ updatedAt: -1 });
    res.json(history);
  } catch (err) {
    console.error('History error:', err);
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
    console.error('Update status error:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete resolved complaint (admin only)
app.delete('/api/complaints/:id', authenticate, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ message: 'Admin only' });

  try {
    const complaint = await Complaint.findById(req.params.id);
    if (!complaint) return res.status(404).json({ message: 'Complaint not found' });

    if (complaint.status !== 'Resolved') {
      return res.status(400).json({ message: 'Only resolved complaints can be deleted' });
    }

    if (complaint.imagePath) {
      const imageFullPath = path.join(__dirname, complaint.imagePath);
      if (fs.existsSync(imageFullPath)) fs.unlinkSync(imageFullPath);
    }

    await Complaint.findByIdAndDelete(req.params.id);

    res.json({ message: 'Complaint deleted successfully' });
  } catch (err) {
    console.error('Delete error:', err);
    res.status(500).json({ message: 'Server error while deleting' });
  }
});

// Bulk upload students from Excel (admin only)
app.post('/api/upload-students', authenticate, upload.single('excel'), async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ message: 'Admin only' });

  if (!req.file) return res.status(400).json({ message: 'No file uploaded' });

  try {
    const workbook = new exceljs.Workbook();
    await workbook.xlsx.readFile(req.file.path);
    const ws = workbook.worksheets[0];

    await User.deleteMany({ role: 'student' });

    const students = [];
    ws.eachRow({ includeEmpty: false }, (row, rowNum) => {
      if (rowNum === 1) return; // skip header

      const name       = row.getCell(1).text.trim() || '';
      const rollNumber = row.getCell(2).text.trim() || '';
      const password   = row.getCell(3).text.trim() || '';
      const gender     = row.getCell(4).text.trim() || '';
      const roomNumber = row.getCell(5).text.trim() || '';
      const mobile     = row.getCell(6).text.trim() || '';

      if (rollNumber && password && roomNumber) {
        students.push({
          name,
          rollNumber,
          password,
          gender,
          roomNumber,
          mobile,
          role: 'student',
          isActive: true
        });
      }
    });

    if (students.length === 0) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ message: 'No valid student data found' });
    }

    // Manually hash passwords
    for (const s of students) {
      s.password = await bcrypt.hash(s.password, 10);
    }

    await User.insertMany(students);
    fs.unlinkSync(req.file.path);

    res.json({ 
      message: `Uploaded Successfully! ${students.length} students added.`,
      count: students.length 
    });

  } catch (err) {
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    console.error('Excel upload error:', err);
    res.status(500).json({ message: 'Error processing Excel: ' + err.message });
  }
});

// Auto-delete resolved complaints older than 10 days
cron.schedule('0 0 * * *', async () => {
  try {
    const tenDaysAgo = new Date();
    tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);

    const oldResolved = await Complaint.find({
      status: 'Resolved',
      updatedAt: { $lt: tenDaysAgo }
    });

    for (const c of oldResolved) {
      if (c.imagePath && fs.existsSync(path.join(__dirname, c.imagePath))) {
        fs.unlinkSync(path.join(__dirname, c.imagePath));
      }
      await Complaint.findByIdAndDelete(c._id);
    }

    console.log(`Auto-deleted ${oldResolved.length} resolved complaints older than 10 days`);
  } catch (err) {
    console.error('Auto-delete cron error:', err);
  }
});

console.log('Auto-delete cron scheduled: daily at midnight (deletes resolved > 10 days)');

// Temporary admin setup - run once then comment out
(async () => {
  try {
    const roll = 'admin';
    const plainPassword = 'admin@2025';

    let adminUser = await User.findOne({ rollNumber: roll });

    if (!adminUser) {
      adminUser = new User({
        rollNumber: roll,
        role: 'admin',
        password: plainPassword,
        isActive: true,
        roomNumber: null
      });
      await adminUser.save();
      console.log(`Admin created! Roll: ${roll} | Pass: ${plainPassword}`);
    }
  } catch (err) {
    console.error('Admin setup failed:', err.message);
  }
})();

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
