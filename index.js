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
  origin: true,
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ==================== MONGODB CONNECTION ====================
const MONGODB_URI = process.env.MONGO_URI || "mongodb+srv://osf_user:j8bOADeAs2vKCA1c@cluster0.xxxxx.mongodb.net/OSF?retryWrites=true&w=majority&appName=Cluster0";

console.log('🔍 Attempting to connect to MongoDB...');

let User = null;
let isConnected = false;

// Connect with proper options for serverless
mongoose.connect(MONGODB_URI, {
  serverSelectionTimeoutMS: 10000,
  socketTimeoutMS: 45000,
  family: 4 // Use IPv4
})
.then(() => {
  isConnected = true;
  console.log('✅ MongoDB connected successfully');
  console.log('📊 Database:', mongoose.connection.name);
})
.catch(err => {
  console.error('❌ MongoDB connection error:', err.message);
  console.error('📋 Please check:');
  console.error('   1. Network connectivity');
  console.error('   2. IP whitelist (add 0.0.0.0/0)');
  console.error('   3. Username/password correctness');
  isConnected = false;
});

// ==================== USER SCHEMA ====================
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

// Only create model if not already created
User = mongoose.models.User || mongoose.model('User', userSchema);

// ==================== HEALTH CHECK ====================
app.get('/', (req, res) => {
  res.json({
    message: 'OSF Backend Running',
    status: 'OK',
    timestamp: new Date().toISOString(),
    database: {
      connected: isConnected,
      name: mongoose.connection.name || 'Not connected'
    },
    environment: {
      nodeVersion: process.version,
      mongoURI: process.env.MONGO_URI ? 'Set' : 'Not Set'
    }
  });
});

// ==================== SIGNUP ROUTE ====================
app.post('/api/signup', async (req, res) => {
  console.log('📝 Signup request received');
  console.log('📦 Body:', JSON.stringify(req.body, null, 2));

  try {
    // Check database connection
    if (!isConnected) {
      console.log('❌ Database not connected');
      return res.status(503).json({
        message: 'Database is not connected. Please try again later.',
        status: 'error'
      });
    }

    const { username, email, mobile, password, addr } = req.body;

    // ===== VALIDATION =====
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

    // ===== CHECK EXISTING USER =====
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

    // ===== HASH PASSWORD =====
    const hashedPassword = await bcrypt.hash(password, 10);
    console.log('✅ Password hashed');

    // ===== CREATE USER =====
    const newUser = new User({
      username: username.trim(),
      mobile: mobile.trim(),
      password: hashedPassword,
      email: email && email.trim() ? email.trim().toLowerCase() : '',
      addr: addr && addr.trim() ? addr.trim() : '',
      role: await User.countDocuments() === 0 ? 'admin' : 'user'
    });

    await newUser.save();
    console.log('✅ User saved:', newUser._id);

    // ===== GENERATE TOKEN =====
    const token = jwt.sign(
      { 
        id: newUser._id, 
        username: newUser.username,
        role: newUser.role 
      },
      process.env.JWT_SECRET || 'fallback_secret_key',
      { expiresIn: '7d' }
    );

    // ===== SUCCESS RESPONSE =====
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

    // Handle duplicate key error
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      return res.status(400).json({ 
        message: `${field} already exists. Please use a different ${field}.`
      });
    }

    // Handle validation errors
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(e => e.message);
      return res.status(400).json({ 
        message: 'Validation error',
        errors: messages 
      });
    }

    res.status(500).json({
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// ==================== TEST ROUTE ====================
app.post('/api/test', (req, res) => {
  res.json({
    message: 'Test route works!',
    body: req.body,
    dbConnected: isConnected,
    hasUserModel: !!User
  });
});

// ==================== 404 HANDLER ====================
app.use((req, res) => {
  res.status(404).json({ 
    message: 'Route not found',
    path: req.path 
  });
});

// ==================== ERROR HANDLER ====================
app.use((err, req, res, next) => {
  console.error('💥 Global error:', err.message);
  res.status(500).json({
    message: 'Something went wrong!',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

export default app;