import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import dotenv from 'dotenv';
import bcrypt from 'bcrypt';
import mongoose from 'mongoose';
import session from 'express-session';
import connectMongoDBSession from 'connect-mongodb-session';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import path from 'path';

// Import sendOTP function
import { sendOTP } from './sendOTP.js';

// Get current directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config();

const MongoDBStore = connectMongoDBSession(session);
const app = express();
const PORT = process.env.PORT || 5000;

// ==================== MIDDLEWARE ====================

// CORS Configuration
app.use(cors({
  origin: ['http://localhost:3000', 'http://127.0.0.1:3000'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// ==================== MONGODB CONNECTION ====================
mongoose.connect('mongodb://127.0.0.1:27017/OSF')
  .then(() => console.log('✅ MongoDB connected successfully'))
  .catch(err => console.error('❌ MongoDB connection error:', err));

// ==================== SESSION CONFIGURATION ====================
const store = new MongoDBStore({
  uri: 'mongodb://127.0.0.1:27017/OSF',
  collection: 'sessions'
});

store.on('error', (error) => {
  console.log('Session store error:', error);
});

app.use(session({
  secret: process.env.SESSION_SECRET || 'AnkitaDilipKamble',
  resave: false,
  saveUninitialized: false,
  store: store,
  cookie: {
    maxAge: 1000 * 60 * 60 * 24,
    httpOnly: true,
    sameSite: 'lax',
    secure: false
  }
}));

// ==================== SCHEMA DEFINITIONS ====================

// User Schema - Password is optional
// ==================== SCHEMA DEFINITIONS ====================

// User Schema
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, trim: true },
  email: { type: String, required: false, trim: true, lowercase: true, default: '' },
  mobile: { type: String, required: true, unique: true, match: /^\d{10}$/ },
  password: { type: String, required: false, default: '' },
  role: { type: String, default: 'user', enum: ['user', 'admin'] },
  addr: { type: String, required: false, trim: true, default: '' },
  lastLogin: { type: Date, default: Date.now }
}, { timestamps: true });

const User = mongoose.model('User', userSchema);

// FIX: Remove old unique index on username
User.collection.getIndexes()
  .then(indexes => {
    if (indexes.username_1) {
      return User.collection.dropIndex('username_1');
    }
  })
  .then(() => console.log('✅ Username index fixed'))
  .catch(err => {
    if (err.code !== 27) { // 27 = index not found
      console.log('Username index fix:', err.message);
    }
  });

// Order Schema
const orderSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  orderAmount: { type: Number, required: true, min: 0 },
  title: { type: String, required: true, trim: true },
  length: { type: Number, required: true, min: 0 },
  width: { type: Number, required: true, min: 0 },
  status: { 
    type: String, 
    default: 'pending',
    enum: ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'accepted', 'rejected']
  },
  feedback: { type: String, trim: true, default: '' }
}, { timestamps: true });

const Order = mongoose.model('Order', orderSchema);

// OTP Schema
const otpSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  otp: { type: String, required: true },
  expiresAt: { type: Date, required: true },
  verified: { type: Boolean, default: false }
}, { timestamps: true });

const OTP = mongoose.model('OTP', otpSchema);

// Enquiry Schema
const enquirySchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: false, trim: true, default: '' },
  mobile: { type: String, required: true, match: /^\d{10}$/ },
  subject: { type: String, required: true, trim: true },
  message: { type: String, required: true, trim: true }
}, { timestamps: true });

const Enquiry = mongoose.model('Enquiry', enquirySchema);

// Service Schema
const serviceSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  imagePath: { type: String, default: '' },
  pricePerSquareFoot: { type: Number, required: true, min: 0 }
}, { timestamps: true });

const Service = mongoose.model('Service', serviceSchema);

// ==================== MIDDLEWARE FUNCTIONS ====================

// JWT Authentication Middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'Unauthorized: Missing token' });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      console.error("JWT Verification Error:", err.message);
      return res.status(403).json({ message: 'Forbidden: Invalid or expired token' });
    }
    req.user = user;
    next();
  });
};

// Admin Authorization Middleware
const authorizeAdmin = (req, res, next) => {
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    res.status(403).json({ message: 'Forbidden: Admin access required' });
  }
};

// ==================== MULTER CONFIGURATION ====================
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.join(__dirname, 'uploads');
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  }
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|gif|webp/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);
  
  if (mimetype && extname) {
    return cb(null, true);
  } else {
    cb(new Error('Only image files are allowed'));
  }
};

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: fileFilter
});

// ==================== API ROUTES ====================

// ========== AUTHENTICATION ROUTES ==========

// Signup Route - FIXED
app.post('/addr', async (req, res) => {
  try {
    const { username, email, mobile, password, addr } = req.body;

    console.log('📝 Signup attempt:', { username, mobile, email: email || 'not provided' });

    // Validation
    if (!username || !username.trim()) {
      return res.status(400).json({ message: 'Username is required' });
    }

    if (!mobile || !mobile.trim()) {
      return res.status(400).json({ message: 'Mobile number is required' });
    }

    if (!/^\d{10}$/.test(mobile)) {
      return res.status(400).json({ message: 'Mobile number must be exactly 10 digits' });
    }

    // Check if mobile already exists
    const existingMobile = await User.findOne({ mobile });
    if (existingMobile) {
      return res.status(400).json({ message: 'User already exists with this mobile number' });
    }

    // Check if email already exists (if provided)
    if (email && email.trim() !== '') {
      const existingEmail = await User.findOne({ email: email.trim().toLowerCase() });
      if (existingEmail) {
        return res.status(400).json({ message: 'User already exists with this email address' });
      }
    }

    const userCount = await User.countDocuments();
    const role = userCount === 0 ? 'admin' : 'user';
    
    // Hash password only if provided and not empty
    let hashedPassword = '';
    if (password && password.trim() !== '') {
      hashedPassword = await bcrypt.hash(password, 10);
    }

    // Create user object
    const newUser = new User({
      username: username.trim(),
      mobile: mobile.trim(),
      password: hashedPassword,
      role: role,
      addr: addr && addr.trim() ? addr.trim() : '',
      email: email && email.trim() ? email.trim().toLowerCase() : ''
    });

    await newUser.save();

    console.log('✅ User registered successfully:', newUser.username, 'Role:', role);
    res.status(201).json({ 
      message: 'User registered successfully', 
      userId: newUser._id,
      role: role 
    });
    
  } catch (error) {
    console.error('❌ Signup error details:', error);
    
    // Handle MongoDB duplicate key error
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      return res.status(400).json({ message: `${field} already exists` });
    }
    
    res.status(500).json({ 
      message: 'Internal server error', 
      error: error.message 
    });
  }
});

// Login Route
app.post('/api/login', async (req, res) => {
  const { mobile, password } = req.body;

  if (!mobile) {
    return res.status(400).json({ message: 'Mobile number is required' });
  }

  try {
    const user = await User.findOne({ mobile });
    if (!user) {
      return res.status(401).json({ message: 'Invalid mobile number' });
    }

    // Check password if user has one
    if (user.password && user.password !== '') {
      if (!password) {
        return res.status(401).json({ message: 'Password is required' });
      }
      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        return res.status(401).json({ message: 'Invalid password' });
      }
    }

    user.lastLogin = new Date();
    await user.save();

    const token = jwt.sign(
      { id: user._id, role: user.role, username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.status(200).json({
      message: 'Login successful',
      token,
      role: user.role,
      username: user.username
    });
  } catch (error) {
    console.error('Login error:', error.message);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Logout Route
app.post('/api/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Logout error:', err);
      return res.status(500).json({ message: 'Could not log out' });
    }
    res.clearCookie('connect.sid');
    res.status(200).json({ message: 'Logout successful' });
  });
});

// ========== PASSWORD RESET ROUTES ==========

// Forgot Password - Send OTP
app.post('/api/forgot-password', async (req, res) => {
  const { mobile } = req.body;

  if (!mobile) {
    return res.status(400).json({ message: 'Mobile number is required' });
  }

  try {
    const user = await User.findOne({ mobile });
    if (!user) return res.status(404).json({ message: 'User not found' });

    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpiry = new Date(Date.now() + 4 * 60 * 1000);

    await OTP.deleteMany({ userId: user._id, verified: false });
    
    const otpEntry = new OTP({
      userId: user._id,
      otp: otpCode,
      expiresAt: otpExpiry
    });
    await otpEntry.save();

    const otpSent = await sendOTP(mobile, otpCode);
    
    if (otpSent) {
      res.status(200).json({ message: 'OTP sent successfully' });
    } else {
      res.status(500).json({ message: 'Error sending OTP. Please try again.' });
    }
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Verify OTP
app.post('/api/verify-otp', async (req, res) => {
  const { mobile, otp } = req.body;

  if (!mobile || !otp) {
    return res.status(400).json({ message: 'Mobile and OTP are required' });
  }

  try {
    const user = await User.findOne({ mobile });
    if (!user) return res.status(404).json({ message: 'User not found' });

    const otpEntry = await OTP.findOne({ userId: user._id, otp, verified: false });
    if (!otpEntry) {
      return res.status(400).json({ message: 'Invalid OTP' });
    }

    if (otpEntry.expiresAt < new Date()) {
      return res.status(400).json({ message: 'OTP expired' });
    }

    otpEntry.verified = true;
    await otpEntry.save();

    res.status(200).json({ message: 'OTP verified successfully', userId: user._id });
  } catch (error) {
    console.error('OTP verification error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Reset Password
app.post('/api/reset-password', async (req, res) => {
  const { userId, newPassword } = req.body;

  if (!userId || !newPassword) {
    return res.status(400).json({ message: 'User ID and new password are required' });
  }

  try {
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const otpEntry = await OTP.findOne({ userId, verified: true }).sort({ createdAt: -1 });
    if (!otpEntry) {
      return res.status(400).json({ message: 'OTP not verified' });
    }

    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();

    await OTP.deleteMany({ userId });

    res.status(200).json({ message: 'Password reset successfully' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ========== PROFILE ROUTES ==========

// Get Profile
app.get('/api/profile', authenticateToken, async (req, res) => {
  try {
    const userData = await User.findById(req.user.id).select('-password');
    if (!userData) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.status(200).json(userData);
  } catch (error) {
    console.error('Profile fetch error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Update Profile
app.put('/api/profile', authenticateToken, async (req, res) => {
  try {
    const { username, email, mobile, addr, password } = req.body;
    
    const updateData = { username, email, mobile, addr };
    
    if (password && password.trim() !== '') {
      updateData.password = await bcrypt.hash(password, 10);
    }

    const updatedUser = await User.findByIdAndUpdate(
      req.user.id,
      updateData,
      { new: true, runValidators: true }
    ).select('-password');

    res.status(200).json(updatedUser);
  } catch (error) {
    console.error('Profile update error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ========== ORDER ROUTES ==========

// Create Order
app.post('/api/create-order', authenticateToken, async (req, res) => {
  const { title, length, width, orderAmount } = req.body;

  if (!title || !length || !width || !orderAmount) {
    return res.status(400).json({ message: 'All fields are required' });
  }

  if (orderAmount <= 0) {
    return res.status(400).json({ message: 'Order amount must be greater than 0' });
  }

  try {
    const newOrder = new Order({
      userId: req.user.id,
      orderAmount,
      title,
      length,
      width,
      status: 'pending'
    });

    await newOrder.save();
    res.status(201).json({ message: 'Order created successfully', order: newOrder });
  } catch (error) {
    console.error('Order creation error:', error);
    res.status(500).json({ message: 'Error placing order. Please try again.' });
  }
});

// Get Orders
app.get('/api/orders', authenticateToken, async (req, res) => {
  try {
    let orders;
    if (req.user.role === 'admin') {
      orders = await Order.find().populate('userId', 'username email mobile');
    } else {
      orders = await Order.find({ userId: req.user.id }).populate('userId', 'username');
    }
    res.status(200).json({ orders });
  } catch (error) {
    console.error('Fetch orders error:', error);
    res.status(500).json({ message: 'Error fetching orders' });
  }
});

// Get My Orders
app.get('/api/my-orders', authenticateToken, async (req, res) => {
  try {
    const orders = await Order.find({ userId: req.user.id })
      .populate('userId', 'username')
      .sort({ createdAt: -1 });
    res.status(200).json({ orders });
  } catch (error) {
    console.error('Fetch my orders error:', error);
    res.status(500).json({ message: 'Error fetching your orders' });
  }
});

// Update Order Status (Admin only)
app.post('/api/orders/update-status', authenticateToken, authorizeAdmin, async (req, res) => {
  const { statusUpdates } = req.body;

  if (!Array.isArray(statusUpdates) || statusUpdates.length === 0) {
    return res.status(400).json({ message: 'Invalid status updates data' });
  }

  try {
    const updatedOrders = [];
    for (const { orderId, status } of statusUpdates) {
      const order = await Order.findById(orderId);
      if (order) {
        order.status = status;
        await order.save();
        updatedOrders.push(order);
      }
    }
    res.status(200).json({ message: 'Order statuses updated', updatedOrders });
  } catch (error) {
    console.error('Update status error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Cancel Order
app.put('/api/orders/:orderId/cancel', authenticateToken, async (req, res) => {
  const { orderId } = req.params;

  try {
    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    if (order.status !== 'pending') {
      return res.status(400).json({ message: `Cannot cancel order with status '${order.status}'` });
    }

    if (req.user.role !== 'admin' && order.userId.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Not authorized to cancel this order' });
    }

    order.status = 'cancelled';
    await order.save();

    res.status(200).json({ message: 'Order cancelled successfully', order });
  } catch (error) {
    console.error('Cancel order error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Review Order
app.put('/api/orders/:orderId/review', authenticateToken, async (req, res) => {
  const { orderId } = req.params;
  const { action, feedback } = req.body;

  if (!action || (action !== 'accept' && action !== 'reject')) {
    return res.status(400).json({ message: 'Invalid action. Must be "accept" or "reject"' });
  }

  if (action === 'reject' && (!feedback || feedback.trim().length === 0)) {
    return res.status(400).json({ message: 'Feedback is required when rejecting an order' });
  }

  try {
    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    if (req.user.role !== 'admin' && order.userId.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Not authorized to review this order' });
    }

    if (order.status !== 'delivered') {
      return res.status(400).json({ message: `Cannot review order with status '${order.status}'` });
    }

    order.status = action === 'accept' ? 'accepted' : 'rejected';
    if (feedback) order.feedback = feedback;
    await order.save();

    res.status(200).json({ message: `Order ${action}ed successfully`, order });
  } catch (error) {
    console.error('Review order error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ========== SERVICE ROUTES ==========

// Get all services
app.get('/api/services', async (req, res) => {
  try {
    const services = await Service.find().sort({ createdAt: -1 });
    res.status(200).json({ services });
  } catch (error) {
    console.error('Fetch services error:', error);
    res.status(500).json({ message: 'Failed to fetch services' });
  }
});

// Get single service
app.get('/api/services/:id', async (req, res) => {
  try {
    const service = await Service.findById(req.params.id);
    if (!service) {
      return res.status(404).json({ message: 'Service not found' });
    }
    res.status(200).json({ service });
  } catch (error) {
    console.error('Fetch service error:', error);
    res.status(500).json({ message: 'Failed to fetch service' });
  }
});

// Create service (Admin only)
app.post('/api/services', authenticateToken, authorizeAdmin, upload.single('image'), async (req, res) => {
  try {
    const { title, pricePerSquareFoot } = req.body;
    const imagePath = req.file ? `/uploads/${req.file.filename}` : '';

    if (!title || !pricePerSquareFoot) {
      return res.status(400).json({ message: 'Title and price are required' });
    }

    const newService = new Service({ title, imagePath, pricePerSquareFoot });
    await newService.save();
    res.status(201).json({ message: 'Service created', service: newService });
  } catch (error) {
    console.error('Create service error:', error);
    res.status(500).json({ message: 'Failed to create service' });
  }
});

// Update service (Admin only)
app.put('/api/services/:id', authenticateToken, authorizeAdmin, upload.single('image'), async (req, res) => {
  try {
    const { title, pricePerSquareFoot } = req.body;
    const imagePath = req.file ? `/uploads/${req.file.filename}` : req.body.imagePath;

    const updatedService = await Service.findByIdAndUpdate(
      req.params.id,
      { title, pricePerSquareFoot, imagePath },
      { new: true, runValidators: true }
    );

    if (!updatedService) {
      return res.status(404).json({ message: 'Service not found' });
    }
    res.status(200).json({ message: 'Service updated', service: updatedService });
  } catch (error) {
    console.error('Update service error:', error);
    res.status(500).json({ message: 'Failed to update service' });
  }
});

// Delete service (Admin only)
app.delete('/api/services/:id', authenticateToken, authorizeAdmin, async (req, res) => {
  try {
    const deletedService = await Service.findByIdAndDelete(req.params.id);
    if (!deletedService) {
      return res.status(404).json({ message: 'Service not found' });
    }
    res.status(200).json({ message: 'Service deleted', service: deletedService });
  } catch (error) {
    console.error('Delete service error:', error);
    res.status(500).json({ message: 'Failed to delete service' });
  }
});

// ========== ENQUIRY ROUTE ==========

app.post('/api/enquiries', async (req, res) => {
  const { name, email, mobile, subject, message } = req.body;

  if (!name || !mobile || !subject || !message) {
    return res.status(400).json({ message: 'Name, mobile, subject, and message are required' });
  }

  try {
    const newEnquiry = new Enquiry({ name, email, mobile, subject, message });
    await newEnquiry.save();
    res.status(201).json({ message: 'Enquiry submitted successfully' });
  } catch (error) {
    console.error('Enquiry error:', error);
    res.status(500).json({ message: 'Failed to submit enquiry' });
  }
});

// ==================== STATIC FILES ====================
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ==================== ERROR HANDLING ====================

// 404 Handler
app.use('*', (req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('Global error:', err);
  res.status(500).json({ 
    message: 'Something went wrong!',
    ...(process.env.NODE_ENV === 'development' && { error: err.message })
  });
});

// ==================== START SERVER ====================
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📁 Uploads directory: ${path.join(__dirname, 'uploads')}`);
  console.log(`✅ CORS enabled for http://localhost:3000`);
});

mongoose.connection.on('error', (err) => {
  console.error('MongoDB connection error:', err);
});