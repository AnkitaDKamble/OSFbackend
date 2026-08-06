import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import bcrypt from 'bcrypt';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

// ✅ Get current directory (for ES modules)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ✅ Load environment variables
dotenv.config();

const app = express();

// ==================== VERIFY ENV VARIABLES ====================
const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;

console.log('🚀 Environment Variables Check:');
console.log('✅ MONGO_URI:', MONGO_URI ? 'Set ✅' : 'Not Set ❌');
console.log('✅ JWT_SECRET:', process.env.JWT_SECRET ? 'Set ✅' : 'Not Set ❌');
console.log('✅ PORT:', process.env.PORT || 5000);
console.log('✅ NODE_ENV:', process.env.NODE_ENV || 'development');

if (MONGO_URI) {
  const maskedURI = MONGO_URI.substring(0, 25) + '...';
  console.log('📝 MONGO_URI starts with:', maskedURI);
}

// ==================== CORS ====================
// ✅ Allow both localhost and Vercel
const allowedOrigins = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  process.env.FRONTEND_URL || 'https://omkar-steel-fabricators-frontend.vercel.app'
];

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.includes(origin) || origin.includes('vercel.app') || origin.includes('localhost')) {
      return callback(null, true);
    }
    
    console.log('❌ CORS blocked for origin:', origin);
    return callback(new Error('Not allowed by CORS'));
  },
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true
}));

app.options('*', cors());

// ==================== MIDDLEWARE ====================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ==================== FILE UPLOAD CONFIGURATION ====================
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
  console.log('📁 Uploads folder created');
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
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
    cb(new Error('Only image files are allowed'), false);
  }
};

const upload = multer({ 
  storage: storage,
  fileFilter: fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }
});

// ==================== LOGGING MIDDLEWARE ====================
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  if (req.body && Object.keys(req.body).length > 0) {
    console.log("📦 Body:", req.body);
  }
  if (req.file) {
    console.log("📸 File:", req.file.filename);
  }
  next();
});

// ==================== MONGODB CONNECTION ====================
let isConnected = false;

// Define User Schema
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, trim: true },
  email: { type: String, default: '', trim: true, lowercase: true },
  mobile: { type: String, required: true, unique: true, trim: true },
  password: { type: String, required: true },
  role: { type: String, default: 'user', enum: ['user', 'admin'] },
  addr: { type: String, default: '', trim: true },
  lastLogin: { type: Date, default: Date.now }
}, { 
  timestamps: true,
  collection: 'users'
});

// Define Service Schema
const serviceSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  imagePath: { type: String, default: '' },
  pricePerSquareFoot: { type: Number, required: true, min: 0 }
}, { timestamps: true });

// Define Order Schema
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

// Define Enquiry Schema
const enquirySchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, default: '', trim: true },
  mobile: { type: String, required: true, trim: true },
  subject: { type: String, required: true, trim: true },
  message: { type: String, required: true, trim: true }
}, { timestamps: true });

// ✅ REGISTER MODELS PROPERLY
let User, Service, Order, Enquiry;

const registerModels = () => {
  try {
    User = mongoose.model('User');
  } catch (error) {
    User = mongoose.model('User', userSchema);
  }
  
  try {
    Service = mongoose.model('Service');
  } catch (error) {
    Service = mongoose.model('Service', serviceSchema);
  }
  
  try {
    Order = mongoose.model('Order');
  } catch (error) {
    Order = mongoose.model('Order', orderSchema);
  }
  
  try {
    Enquiry = mongoose.model('Enquiry');
  } catch (error) {
    Enquiry = mongoose.model('Enquiry', enquirySchema);
  }
  
  console.log('✅ Models registered successfully');
};

// ✅ Connect to MongoDB
const connectDB = async () => {
  try {
    const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
    
    if (!uri) {
      console.error('❌ No MongoDB URI found in environment variables');
      console.log('💡 Please set MONGO_URI in .env file');
      console.log('💡 Example: MONGO_URI="mongodb://localhost:27017/OSF"');
      return;
    }
    
    console.log('🔄 Attempting to connect to MongoDB...');
    console.log('📡 URI:', uri.replace(/\/\/.*@/, '//<hidden>@'));
    
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
    });
    
    isConnected = true;
    console.log('✅ MongoDB connected successfully');
    console.log('📊 Database:', mongoose.connection.name);
    
    registerModels();
    
  } catch (err) {
    console.error('❌ MongoDB connection error:', err.message);
    console.error('💡 Make sure MongoDB is running on your system');
    isConnected = false;
  }
};

connectDB();

// ==================== AUTHENTICATION MIDDLEWARE ====================
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ 
      success: false,
      message: 'Authentication token not found. Please log in.' 
    });
  }

  jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret_key', (err, user) => {
    if (err) {
      console.error('❌ JWT Verification Error:', err.message);
      return res.status(403).json({ 
        success: false,
        message: 'Invalid or expired token. Please log in again.' 
      });
    }
    req.user = user;
    next();
  });
};

// ==================== ROUTES ====================

// Health check
app.get('/', (req, res) => {
  res.json({
    message: 'Omkar Steel Fabricators Backend',
    status: 'OK',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    database: {
      connected: isConnected,
      name: mongoose.connection?.name || 'Not connected'
    },
    environment: process.env.NODE_ENV || 'development'
  });
});

// Test Route
app.get('/api/test', (req, res) => {
  res.json({
    success: true,
    message: 'API is working!',
    timestamp: new Date().toISOString()
  });
});

// GET signup
app.get('/api/signup', (req, res) => {
  res.json({ 
    success: true,
    message: 'Signup route working. Use POST to register.' 
  });
});

// ==================== SIGNUP ROUTE ====================
app.post('/api/signup', async (req, res) => {
  console.log('📝 Signup request received');
  console.log('📦 Body:', JSON.stringify(req.body, null, 2));

  try {
    if (!isConnected) {
      console.log('❌ Database not connected');
      return res.status(503).json({
        success: false,
        message: 'Database is not connected. Please try again later.',
        status: 'error'
      });
    }

    const { username, email, mobile, password, addr } = req.body;

    if (!username || !username.trim()) {
      return res.status(400).json({ 
        success: false,
        message: 'Username is required' 
      });
    }
    if (!mobile || !mobile.trim()) {
      return res.status(400).json({ 
        success: false,
        message: 'Mobile number is required' 
      });
    }
    if (!/^\d{10}$/.test(mobile)) {
      return res.status(400).json({ 
        success: false,
        message: 'Mobile must be exactly 10 digits' 
      });
    }
    if (!password || password.length < 1) {
      return res.status(400).json({ 
        success: false,
        message: 'Password must be at least 1 character' 
      });
    }

    console.log('✅ Validation passed');

    const existingMobile = await User.findOne({ mobile });
    if (existingMobile) {
      console.log('❌ User exists with mobile:', mobile);
      return res.status(400).json({ 
        success: false,
        message: 'User already exists with this mobile number' 
      });
    }

    if (email && email.trim()) {
      const existingEmail = await User.findOne({ email: email.trim().toLowerCase() });
      if (existingEmail) {
        console.log('❌ User exists with email:', email);
        return res.status(400).json({ 
          success: false,
          message: 'User already exists with this email' 
        });
      }
    }

    console.log('✅ User does not exist');

    const hashedPassword = await bcrypt.hash(password, 10);
    console.log('✅ Password hashed');

    const userCount = await User.countDocuments();
    const newUser = new User({
      username: username.trim(),
      mobile: mobile.trim(),
      password: hashedPassword,
      email: email && email.trim() ? email.trim().toLowerCase() : '',
      addr: addr && addr.trim() ? addr.trim() : '',
      role: userCount === 0 ? 'admin' : 'user'
    });

    await newUser.save();
    console.log('✅ User saved:', newUser._id);

    const token = jwt.sign(
      { 
        id: newUser._id, 
        username: newUser.username,
        role: newUser.role 
      },
      process.env.JWT_SECRET || 'fallback_secret_key',
      { expiresIn: '7d' }
    );

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      token,
      user: {
        id: newUser._id,
        username: newUser.username,
        mobile: newUser.mobile,
        email: newUser.email,
        role: newUser.role
      }
    });

  } catch (error) {
    console.error('❌ Signup error:', error.message);
    console.error('📋 Stack:', error.stack);

    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      return res.status(400).json({ 
        success: false,
        message: `${field} already exists. Please use a different ${field}.`
      });
    }

    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// ==================== LOGIN ROUTE ====================
app.post('/api/login', async (req, res) => {
  console.log('📝 Login request received');
  console.log('📦 Body:', JSON.stringify(req.body, null, 2));

  try {
    if (!isConnected) {
      console.log('❌ Database not connected');
      return res.status(503).json({
        success: false,
        message: 'Database is not connected. Please try again later.'
      });
    }

    const { mobile, password } = req.body;

    if (!mobile || !mobile.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Mobile number is required'
      });
    }
    if (!password || password.length < 1) {
      return res.status(400).json({
        success: false,
        message: 'Password is required'
      });
    }

    const user = await User.findOne({ mobile: mobile.trim() });
    if (!user) {
      console.log('❌ User not found with mobile:', mobile);
      return res.status(401).json({
        success: false,
        message: 'Invalid mobile number or password'
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      console.log('❌ Password does not match for user:', mobile);
      return res.status(401).json({
        success: false,
        message: 'Invalid mobile number or password'
      });
    }

    console.log('✅ Login successful for:', user.username);

    user.lastLogin = new Date();
    await user.save();

    const token = jwt.sign(
      {
        id: user._id,
        username: user.username,
        role: user.role
      },
      process.env.JWT_SECRET || 'fallback_secret_key',
      { expiresIn: '7d' }
    );

    res.status(200).json({
      success: true,
      message: 'Login successful',
      token,
      role: user.role,
      username: user.username,
      user: {
        id: user._id,
        username: user.username,
        mobile: user.mobile,
        email: user.email,
        role: user.role
      }
    });

  } catch (error) {
    console.error('❌ Login error:', error.message);
    console.error('📋 Stack:', error.stack);

    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// ==================== PROFILE ROUTES ====================

// ✅ Get Profile (Authenticated)
app.get('/api/profile', authenticateToken, async (req, res) => {
  console.log('📝 Fetching profile for user ID:', req.user.id);
  
  try {
    const user = await User.findById(req.user.id).select('-password');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    res.status(200).json({
      success: true,
      username: user.username,
      email: user.email,
      mobile: user.mobile,
      addr: user.addr,
      role: user.role
    });
  } catch (error) {
    console.error('❌ Error fetching profile:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch profile: ' + error.message
    });
  }
});

// ✅ Update Profile (Authenticated)
app.put('/api/profile', authenticateToken, async (req, res) => {
  console.log('📝 Update profile for user ID:', req.user.id);
  console.log('📦 Body:', JSON.stringify(req.body, null, 2));
  
  try {
    const { username, email, mobile, addr, password } = req.body;
    
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    if (username) user.username = username.trim();
    if (email !== undefined) user.email = email.trim();
    if (mobile) user.mobile = mobile.trim();
    if (addr !== undefined) user.addr = addr.trim();
    
    if (password && password.trim() !== '') {
      user.password = await bcrypt.hash(password, 10);
    }
    
    await user.save();
    console.log('✅ Profile updated for user:', user.username);
    
    res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      username: user.username,
      email: user.email,
      mobile: user.mobile,
      addr: user.addr,
      role: user.role
    });
  } catch (error) {
    console.error('❌ Error updating profile:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to update profile: ' + error.message
    });
  }
});

// ==================== ENQUIRY ROUTES ====================

// ✅ Submit Enquiry (Public - No authentication needed)
app.post('/api/enquiries', async (req, res) => {
  console.log('📝 Enquiry request received');
  console.log('📦 Body:', JSON.stringify(req.body, null, 2));

  try {
    if (!isConnected) {
      console.log('❌ Database not connected');
      return res.status(503).json({
        success: false,
        message: 'Database is not connected. Please try again later.'
      });
    }

    const { name, email, mobile, subject, message } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Name is required'
      });
    }
    if (!mobile || !mobile.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Mobile number is required'
      });
    }
    if (!subject || !subject.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Subject is required'
      });
    }
    if (!message || !message.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Message is required'
      });
    }

    const newEnquiry = new Enquiry({
      name: name.trim(),
      email: email ? email.trim() : '',
      mobile: mobile.trim(),
      subject: subject.trim(),
      message: message.trim()
    });

    await newEnquiry.save();
    console.log('✅ Enquiry saved successfully:', newEnquiry._id);

    res.status(201).json({
      success: true,
      message: 'Enquiry submitted successfully',
      enquiry: newEnquiry
    });

  } catch (error) {
    console.error('❌ Error saving enquiry:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to submit enquiry: ' + error.message
    });
  }
});

// ✅ Get all enquiries (Admin only)
app.get('/api/enquiries', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin only.'
      });
    }

    const enquiries = await Enquiry.find().sort({ createdAt: -1 });
    
    res.status(200).json({
      success: true,
      enquiries: enquiries
    });
  } catch (error) {
    console.error('❌ Error fetching enquiries:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch enquiries'
    });
  }
});

// ==================== SERVICE ROUTES ====================

// ✅ Get all services (Public - No authentication needed)
app.get('/api/services', async (req, res) => {
  try {
    const services = await Service.find().sort({ createdAt: -1 });
    
    res.status(200).json({
      success: true,
      services: services
    });
  } catch (error) {
    console.error('❌ Error fetching services:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch services'
    });
  }
});

// ✅ Get single service (Public)
app.get('/api/services/:id', async (req, res) => {
  try {
    const service = await Service.findById(req.params.id);
    
    if (!service) {
      return res.status(404).json({
        success: false,
        message: 'Service not found'
      });
    }
    
    res.status(200).json({
      success: true,
      service: service
    });
  } catch (error) {
    console.error('❌ Error fetching service:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch service'
    });
  }
});

// ✅ Create service with image upload (Admin only)
app.post('/api/services', authenticateToken, upload.single('image'), async (req, res) => {
  console.log('📝 Create service request received');
  console.log('📦 Body:', JSON.stringify(req.body, null, 2));
  console.log('📸 File:', req.file);

  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin only.'
      });
    }

    const { title, pricePerSquareFoot } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Title is required'
      });
    }
    if (!pricePerSquareFoot || pricePerSquareFoot <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Price must be greater than 0'
      });
    }

    const imagePath = req.file ? `/uploads/${req.file.filename}` : '';

    const newService = new Service({
      title: title.trim(),
      pricePerSquareFoot: parseFloat(pricePerSquareFoot),
      imagePath: imagePath
    });

    await newService.save();
    console.log('✅ Service created:', newService._id);

    res.status(201).json({
      success: true,
      message: 'Service created successfully',
      service: newService
    });

  } catch (error) {
    console.error('❌ Error creating service:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to create service: ' + error.message
    });
  }
});

// ✅ Update service with image upload (Admin only)
app.put('/api/services/:id', authenticateToken, upload.single('image'), async (req, res) => {
  console.log('📝 Update service request received');
  console.log('📦 Body:', JSON.stringify(req.body, null, 2));
  console.log('📸 File:', req.file);

  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin only.'
      });
    }

    const { title, pricePerSquareFoot } = req.body;

    const service = await Service.findById(req.params.id);
    if (!service) {
      return res.status(404).json({
        success: false,
        message: 'Service not found'
      });
    }

    if (title && title.trim()) service.title = title.trim();
    if (pricePerSquareFoot && pricePerSquareFoot > 0) {
      service.pricePerSquareFoot = parseFloat(pricePerSquareFoot);
    }
    
    if (req.file) {
      service.imagePath = `/uploads/${req.file.filename}`;
    }

    await service.save();
    console.log('✅ Service updated:', service._id);

    res.status(200).json({
      success: true,
      message: 'Service updated successfully',
      service: service
    });

  } catch (error) {
    console.error('❌ Error updating service:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to update service: ' + error.message
    });
  }
});

// ✅ Delete service (Admin only)
app.delete('/api/services/:id', authenticateToken, async (req, res) => {
  console.log('📝 Delete service request received');

  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin only.'
      });
    }

    const service = await Service.findById(req.params.id);
    
    if (!service) {
      return res.status(404).json({
        success: false,
        message: 'Service not found'
      });
    }

    await Service.findByIdAndDelete(req.params.id);
    console.log('✅ Service deleted:', req.params.id);

    res.status(200).json({
      success: true,
      message: 'Service deleted successfully'
    });

  } catch (error) {
    console.error('❌ Error deleting service:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to delete service'
    });
  }
});

// ==================== ORDER ROUTES ====================

// ✅ Create Order (Authenticated)
app.post('/api/create-order', authenticateToken, async (req, res) => {
  console.log('📝 Create order request received');
  console.log('📦 Body:', JSON.stringify(req.body, null, 2));

  try {
    if (!isConnected) {
      console.log('❌ Database not connected');
      return res.status(503).json({
        success: false,
        message: 'Database is not connected. Please try again later.'
      });
    }

    const { title, length, width, orderAmount } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Title is required'
      });
    }
    if (!length || length <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Length must be greater than 0'
      });
    }
    if (!width || width <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Width must be greater than 0'
      });
    }
    if (!orderAmount || orderAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Order amount must be greater than 0'
      });
    }

    const newOrder = new Order({
      userId: req.user.id,
      orderAmount: parseFloat(orderAmount),
      title: title.trim(),
      length: parseFloat(length),
      width: parseFloat(width),
      status: 'pending'
    });

    await newOrder.save();
    console.log('✅ Order created:', newOrder._id);

    res.status(201).json({
      success: true,
      message: 'Order created successfully',
      order: newOrder
    });

  } catch (error) {
    console.error('❌ Error creating order:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to create order: ' + error.message
    });
  }
});

// ✅ Get all orders (Admin sees all, User sees own)
app.get('/api/orders', authenticateToken, async (req, res) => {
  try {
    let orders;

    if (req.user.role === 'admin') {
      orders = await Order.find().populate('userId', 'username email mobile');
    } else {
      orders = await Order.find({ userId: req.user.id }).populate('userId', 'username');
    }

    res.status(200).json({
      success: true,
      orders: orders
    });
  } catch (error) {
    console.error('❌ Error fetching orders:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch orders'
    });
  }
});

// ✅ Get logged-in user's orders
app.get('/api/my-orders', authenticateToken, async (req, res) => {
  console.log('📝 Fetching user orders for user ID:', req.user.id);
  
  try {
    const orders = await Order.find({ userId: req.user.id })
      .populate('userId', 'username')
      .sort({ createdAt: -1 });

    console.log(`✅ Found ${orders.length} orders for user`);

    res.status(200).json({
      success: true,
      orders: orders
    });
  } catch (error) {
    console.error('❌ Error fetching user orders:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch your orders: ' + error.message
    });
  }
});

// ✅ Cancel Order
app.put('/api/orders/:orderId/cancel', authenticateToken, async (req, res) => {
  const { orderId } = req.params;

  try {
    const order = await Order.findById(orderId);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    if (order.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: `Cannot cancel order with status '${order.status}'`
      });
    }

    if (req.user.role !== 'admin' && order.userId.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to cancel this order'
      });
    }

    order.status = 'cancelled';
    await order.save();

    res.status(200).json({
      success: true,
      message: 'Order cancelled successfully',
      order: order
    });
  } catch (error) {
    console.error('❌ Error cancelling order:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to cancel order'
    });
  }
});

// ✅ Review Order (Accept/Reject after delivery)
app.put('/api/orders/:orderId/review', authenticateToken, async (req, res) => {
  const { orderId } = req.params;
  const { action, feedback } = req.body;

  try {
    const order = await Order.findById(orderId);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    if (req.user.role !== 'admin' && order.userId.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to review this order'
      });
    }

    if (order.status !== 'delivered') {
      return res.status(400).json({
        success: false,
        message: `Cannot review order with status '${order.status}'`
      });
    }

    if (action === 'reject' && (!feedback || feedback.trim().length === 0)) {
      return res.status(400).json({
        success: false,
        message: 'Feedback is required when rejecting an order'
      });
    }

    if (action === 'accept') {
      order.status = 'accepted';
    } else if (action === 'reject') {
      order.status = 'rejected';
    } else {
      return res.status(400).json({
        success: false,
        message: 'Invalid action. Must be "accept" or "reject"'
      });
    }

    if (feedback) order.feedback = feedback;
    await order.save();

    res.status(200).json({
      success: true,
      message: `Order ${action}ed successfully`,
      order: order
    });
  } catch (error) {
    console.error('❌ Error reviewing order:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to review order'
    });
  }
});

// ✅ Update order status (Admin only)
app.post('/api/orders/update-status', authenticateToken, async (req, res) => {
  const { statusUpdates } = req.body;

  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin only.'
      });
    }

    const updatedOrders = [];

    for (const { orderId, status } of statusUpdates) {
      const order = await Order.findById(orderId);
      if (order) {
        order.status = status;
        await order.save();
        updatedOrders.push(order);
      }
    }

    res.status(200).json({
      success: true,
      message: 'Order statuses updated successfully',
      updatedOrders: updatedOrders
    });
  } catch (error) {
    console.error('❌ Error updating order statuses:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to update order statuses'
    });
  }
});

// ==================== STATIC FILES ====================
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ==================== ERROR HANDLING ====================

// 404 Handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found'
  });
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('❌ Global error:', err);
  res.status(500).json({
    success: false,
    message: 'Something went wrong!',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// ==================== START SERVER ====================
const PORT = process.env.PORT || 5000;

// ✅ Works on both localhost and Vercel
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`📡 Test API: http://localhost:${PORT}/api/test`);
    console.log(`📡 Signup API: http://localhost:${PORT}/api/signup`);
    console.log(`📡 Login API: http://localhost:${PORT}/api/login`);
    console.log(`📡 Profile API: http://localhost:${PORT}/api/profile`);
    console.log(`📡 Enquiry API: http://localhost:${PORT}/api/enquiries`);
    console.log(`📡 Services API: http://localhost:${PORT}/api/services`);
    console.log(`📡 Orders API: http://localhost:${PORT}/api/orders`);
    console.log(`📡 My Orders API: http://localhost:${PORT}/api/my-orders`);
    console.log(`📁 Uploads folder: ${uploadDir}`);
  });
}

// ✅ Export for Vercel
export default app;