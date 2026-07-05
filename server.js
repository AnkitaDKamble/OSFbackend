import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import bcrypt from 'bcrypt';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';

const app = express();
dotenv.config();

// ==================== CORS ====================
app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:5000', 'https://*.vercel.app'],
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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
if (process.env.MONGO_URI) {
  mongoose.connect(process.env.MONGO_URI, {
    serverSelectionTimeoutMS: 10000,
    socketTimeoutMS: 45000,
  })
  .then(() => {
    isConnected = true;
    console.log('✅ MongoDB connected successfully');
    console.log('📊 Database:', mongoose.connection.name);
  })
  .catch(err => {
    console.error('❌ MongoDB connection error:', err.message);
    isConnected = false;
  });
}

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
        message: 'Database is not connected. Please try again later.',
        status: 'error'
      });
    }

    const User = getUserModel();
    const { username, email, mobile, password, addr } = req.body;

    // Validation
    if (!username || !username.trim()) {
      return res.status(400).json({ message: 'Username is required' });
    }
    if (!mobile || !mobile.trim()) {
      return res.status(400).json({ message: 'Mobile number is required' });
    }
    if (!/^\d{10}$/.test(mobile)) {
      return res.status(400).json({ message: 'Mobile must be exactly 10 digits' });
    }
    if (!password || password.length < 4) {
      return res.status(400).json({ message: 'Password must be at least 4 characters' });
    }

    console.log('✅ Validation passed');

    // Check existing user
    const existingMobile = await User.findOne({ mobile });
    if (existingMobile) {
      console.log('❌ User exists with mobile:', mobile);
      return res.status(400).json({ message: 'User already exists with this mobile number' });
    }

    if (email && email.trim()) {
      const existingEmail = await User.findOne({ email: email.trim().toLowerCase() });
      if (existingEmail) {
        console.log('❌ User exists with email:', email);
        return res.status(400).json({ message: 'User already exists with this email' });
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
        message: `${field} already exists. Please use a different ${field}.`
      });
    }

    res.status(500).json({
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

app.listen(5000, () => {
  console.log("Started");
});

// ==================== EXPORT ====================
export default app;