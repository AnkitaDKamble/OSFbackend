import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import bcrypt from 'bcrypt';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';

const app = express();
dotenv.config();

// ==================== CORS ====================
// ✅ Allowed Origins
const allowedOrigins = '*';

// ✅ CORS Configuration (Improved)
app.use(cors({
  origin: function (origin, callback) {
    // Allow requests without an origin (e.g. Postman)
    if (!origin) return callback(null, true);
    
    // Check if origin is allowed
    if (
      allowedOrigins.includes(origin) ||
      origin.endsWith(".vercel.app") ||
      origin.includes("localhost")
    ) {
      return callback(null, true);
    }
    
    return callback(new Error("Not allowed by CORS"));
  },
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ==================== LOGGING MIDDLEWARE ====================
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  if (req.body && Object.keys(req.body).length > 0) {
    console.log("Body:", req.body);
  }
  next();
});

// ==================== MONGODB CONNECTION ====================
console.log('🔍 MONGO_URI:', process.env.MONGO_URI ? '✅ Set' : '❌ Not Set');

let isConnected = false;

// Define schema
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

// Get User model
const getUserModel = () => {
  if (mongoose.models.User) {
    return mongoose.models.User;
  }
  return mongoose.model('User', userSchema);
};

// Connect to MongoDB
const connectDB = async () => {
  try {
    if (!process.env.MONGO_URI) {
      console.error('❌ MONGO_URI is not set in environment variables');
      return;
    }
    
    await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
    });
    
    isConnected = true;
    console.log('✅ MongoDB connected successfully');
    console.log('📊 Database:', mongoose.connection.name);
  } catch (err) {
    console.error('❌ MongoDB connection error:', err.message);
    isConnected = false;
  }
};

// Call connection
connectDB();

// ==================== ROUTES ====================

// Health check
app.get('/', (req, res) => {
  res.json({
    message: 'OSF Backend Running on Vercel',
    status: 'OK',
    timestamp: new Date().toISOString(),
    database: {
      connected: isConnected,
      name: mongoose.connection?.name || 'Not connected'
    },
    cors: {
      allowedOrigins: allowedOrigins
    }
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
  res.json({ message: 'Signup route working. Use POST to register.' });
});

// POST signup
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

    const User = getUserModel();
    const { username, email, mobile, password, addr } = req.body;

    // ✅ Validation - Password minimum 1 character
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

    // Check existing user
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

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    console.log('✅ Password hashed');

    // Create user
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

    // Generate token
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

// ==================== EXPORT ====================
export default app;