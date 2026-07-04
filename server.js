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
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config();

const MongoDBStore = connectMongoDBSession(session);
const app = express();

// ==================== CORS ====================
const allowedOrigins = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "https://os-ffrontend.vercel.app",
  "https://os-ffrontend-git-main-ankitas-projects-060f1bcd.vercel.app",
  "https://os-ffrontend-cqs0tep7w-ankitas-projects-060f1bcd.vercel.app",
  "https://os-ffrontend-aljsp2drq-ankitas-projects-060f1bcd.vercel.app"
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);

    if (
      allowedOrigins.includes(origin) ||
      origin.includes("os-ffrontend") ||
      origin.endsWith(".vercel.app") ||
      origin.includes("localhost")
    ) {
      return callback(null, true);
    }

    console.log('Blocked origin:', origin);
    return callback(new Error("Not allowed by CORS"));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

app.options('*', cors());

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ==================== MONGODB CONNECTION ====================
const mongoURI = process.env.MONGO_URI;
let isMongoConnected = false;

console.log('🔍 Checking MongoDB connection...');

if (!mongoURI) {
  console.error('❌ MONGO_URI is missing in environment variables');
} else {
  mongoose.connect(mongoURI, {
    serverSelectionTimeoutMS: 10000,
    socketTimeoutMS: 45000,
  })
    .then(() => {
      isMongoConnected = true;
      console.log('✅ MongoDB connected successfully');
      console.log('📊 Database:', mongoose.connection.name);
      console.log('🏷️ Models:', Object.keys(mongoose.models));
    })
    .catch(err => {
      console.error('❌ MongoDB connection error:', err.message);
      console.error('📋 Please check your MONGO_URI and network connectivity');
      isMongoConnected = false;
    });
}

// ==================== SESSION ====================
if (mongoURI && isMongoConnected) {
  const store = new MongoDBStore({
    uri: mongoURI,
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
      secure: process.env.NODE_ENV === 'production'
    }
  }));
}

// ==================== SCHEMAS ====================

// User Schema - Simplified for debugging
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, trim: true },
  email: { type: String, required: false, trim: true, lowercase: true, default: '' },
  mobile: { type: String, required: true, unique: true, match: /^\d{10}$/ },
  password: { type: String, required: true, default: '' },
  role: { type: String, default: 'user', enum: ['user', 'admin'] },
  addr: { type: String, required: false, trim: true, default: '' },
  lastLogin: { type: Date, default: Date.now }
}, { 
  timestamps: true,
  collection: 'users' // Explicit collection name
});

const User = mongoose.models.User || mongoose.model('User', userSchema);

// ==================== ROUTES ====================

// Health route
app.get('/', (req, res) => {
  res.json({ 
    message: 'OSF Backend Running on Vercel',
    status: 'OK',
    timestamp: new Date().toISOString(),
    environment: {
      nodeVersion: process.version,
      mongoURI: process.env.MONGO_URI ? 'Set' : 'Not Set',
      mongoConnected: isMongoConnected,
      jwtSecret: process.env.JWT_SECRET ? 'Set' : 'Not Set'
    }
  });
});

// ==================== SIGNUP ====================
app.get('/api/signup', (req, res) => {
  res.json({ message: 'Signup route working. Use POST to register.' });
});

app.post('/api/signup', async (req, res) => {
  console.log('📝 Signup request received');
  console.log('📦 Request body:', JSON.stringify(req.body, null, 2));
  
  try {
    const { username, email, mobile, password, addr } = req.body;

    // Step 1: Validate input
    console.log('✅ Step 1: Validating input...');
    
    if (!username || !username.trim()) {
      console.log('❌ Username missing');
      return res.status(400).json({ message: 'Username is required' });
    }

    if (!mobile || !mobile.trim()) {
      console.log('❌ Mobile missing');
      return res.status(400).json({ message: 'Mobile number is required' });
    }

    if (!/^\d{10}$/.test(mobile)) {
      console.log('❌ Invalid mobile format:', mobile);
      return res.status(400).json({ message: 'Mobile number must be exactly 10 digits' });
    }

    if (!password || password.trim().length < 1) {
      console.log('❌ Password missing or too short');
      return res.status(400).json({ message: 'Password is required' });
    }

    console.log('✅ Input validation passed');

    // Step 2: Check if user exists
    console.log('🔍 Step 2: Checking if user exists...');
    try {
      const existingMobile = await User.findOne({ mobile });
      if (existingMobile) {
        console.log('❌ User already exists with mobile:', mobile);
        return res.status(400).json({ message: 'User already exists with this mobile number' });
      }

      if (email && email.trim() !== '') {
        const existingEmail = await User.findOne({ email: email.trim().toLowerCase() });
        if (existingEmail) {
          console.log('❌ User already exists with email:', email);
          return res.status(400).json({ message: 'User already exists with this email address' });
        }
      }
      console.log('✅ User does not exist, proceeding...');
    } catch (dbError) {
      console.error('❌ Database query error:', dbError.message);
      return res.status(500).json({ 
        message: 'Database error while checking user existence',
        error: dbError.message 
      });
    }

    // Step 3: Hash password
    console.log('🔐 Step 3: Hashing password...');
    let hashedPassword;
    try {
      hashedPassword = await bcrypt.hash(password, 10);
      console.log('✅ Password hashed successfully');
    } catch (hashError) {
      console.error('❌ Password hashing error:', hashError.message);
      return res.status(500).json({ 
        message: 'Error hashing password',
        error: hashError.message 
      });
    }

    // Step 4: Create user
    console.log('📝 Step 4: Creating user...');
    const userCount = await User.countDocuments();
    const role = userCount === 0 ? 'admin' : 'user';
    
    console.log(`👤 User will be ${role} (${userCount} existing users)`);

    const newUser = new User({
      username: username.trim(),
      mobile: mobile.trim(),
      password: hashedPassword,
      role,
      addr: addr && addr.trim() ? addr.trim() : '',
      email: email && email.trim() ? email.trim().toLowerCase() : ''
    });

    console.log('📄 User object created:', JSON.stringify(newUser, null, 2));

    // Step 5: Save user
    console.log('💾 Step 5: Saving user to database...');
    try {
      await newUser.save();
      console.log('✅ User saved successfully!');
      console.log('🆔 User ID:', newUser._id);
    } catch (saveError) {
      console.error('❌ Save error:', saveError);
      
      if (saveError.code === 11000) {
        const field = Object.keys(saveError.keyPattern)[0];
        console.log(`❌ Duplicate key error on field: ${field}`);
        return res.status(400).json({ message: `${field} already exists` });
      }
      
      console.error('❌ Database save error:', saveError.message);
      return res.status(500).json({ 
        message: 'Error saving user to database',
        error: saveError.message 
      });
    }

    // Success!
    console.log('🎉 Signup successful!');
    res.status(201).json({
      message: 'User registered successfully',
      userId: newUser._id,
      role: newUser.role
    });

  } catch (error) {
    console.error('💥 UNEXPECTED ERROR:', error);
    console.error('📋 Error stack:', error.stack);
    
    res.status(500).json({
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// ==================== SIMPLE TEST ROUTE ====================
app.post('/api/test-signup', async (req, res) => {
  try {
    const { username, mobile } = req.body;
    res.json({ 
      message: 'Test route works!',
      received: { username, mobile },
      dbConnected: isMongoConnected
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== 404 ====================
app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

// ==================== ERROR HANDLER ====================
app.use((err, req, res, next) => {
  console.error('💥 Global error handler:', err);
  res.status(500).json({
    message: 'Something went wrong!',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// ==================== EXPORT ====================
export default app;