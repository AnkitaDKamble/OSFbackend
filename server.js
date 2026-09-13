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

// ==================== ENV SETUP ====================
const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;
const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_key';
const IS_VERCEL = !!process.env.VERCEL;
const IS_PROD = process.env.NODE_ENV === 'production' || IS_VERCEL;

console.log('🚀 Environment Check:');
console.log('  MONGO_URI:', MONGO_URI ? 'Set ✅' : 'Not Set ❌');
console.log('  JWT_SECRET:', process.env.JWT_SECRET ? 'Set ✅' : 'Using fallback ⚠️');
console.log('  NODE_ENV:', process.env.NODE_ENV || 'development');
console.log('  Platform:', IS_VERCEL ? 'Vercel' : 'Local');

// Only log the start of URI in non-production
if (MONGO_URI && !IS_PROD) {
  console.log('  URI prefix:', MONGO_URI.substring(0, 30) + '...');
}

// ==================== CORS ====================
const allowedOrigins = [
  'http://localhost:5000',
  'http://localhost:5173',
  'http://localhost:3000',
  'http://127.0.0.1:5000',
  'http://127.0.0.1:5173',
  process.env.FRONTEND_URL,
].filter(Boolean);

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, Postman, same-origin)
    if (!origin) return callback(null, true);
    if (
      allowedOrigins.includes(origin) ||
      origin.includes('vercel.app') ||
      origin.includes('localhost') ||
      origin.includes('127.0.0.1')
    ) {
      return callback(null, true);
    }
    console.warn('⚠️ CORS blocked origin:', origin);
    return callback(new Error('Not allowed by CORS'));
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));

// Handle preflight for all routes
app.options('*', cors());

// ==================== MIDDLEWARE ====================
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logger
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// ==================== FILE UPLOAD CONFIG ====================
// Vercel: filesystem is read-only except /tmp
// Local: use ./uploads
const uploadDir = IS_VERCEL
  ? '/tmp/uploads'
  : path.join(__dirname, 'uploads');

try {
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
    console.log('📁 Uploads folder created:', uploadDir);
  } else {
    console.log('📁 Uploads folder exists:', uploadDir);
  }
} catch (err) {
  console.warn('⚠️ Uploads folder setup failed:', err.message);
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  },
});

const fileFilter = (req, file, cb) => {
  const allowed = /jpeg|jpg|png|gif|webp/;
  const ext = allowed.test(path.extname(file.originalname).toLowerCase());
  const mime = allowed.test(file.mimetype);
  if (mime && ext) return cb(null, true);
  cb(new Error('Only image files are allowed'), false);
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});

// ==================== MONGODB SCHEMAS ====================
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, trim: true },
  email: { type: String, default: '', trim: true, lowercase: true },
  mobile: { type: String, required: true, unique: true, trim: true },
  password: { type: String, required: true },
  role: { type: String, default: 'user', enum: ['user', 'admin'] },
  addr: { type: String, default: '', trim: true },
  lastLogin: { type: Date, default: Date.now },
}, { timestamps: true, collection: 'users' });

const serviceSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  imagePath: { type: String, default: '' },
  pricePerSquareFoot: { type: Number, required: true, min: 0 },
}, { timestamps: true });

const orderSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  orderAmount: { type: Number, required: true, min: 0 },
  title: { type: String, required: true, trim: true },
  length: { type: Number, required: true, min: 0 },
  width: { type: Number, required: true, min: 0 },
  status: {
    type: String,
    default: 'pending',
    enum: ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'accepted', 'rejected'],
  },
  feedback: { type: String, trim: true, default: '' },
}, { timestamps: true });

const enquirySchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, default: '', trim: true },
  mobile: { type: String, required: true, trim: true },
  subject: { type: String, required: true, trim: true },
  message: { type: String, required: true, trim: true },
}, { timestamps: true });

// Register models (idempotent — safe to import multiple times)
const User = mongoose.models.User || mongoose.model('User', userSchema);
const Service = mongoose.models.Service || mongoose.model('Service', serviceSchema);
const Order = mongoose.models.Order || mongoose.model('Order', orderSchema);
const Enquiry = mongoose.models.Enquiry || mongoose.model('Enquiry', enquirySchema);

// ==================== MONGODB CONNECTION (Vercel-safe) ====================
// Cache the connection on globalThis so it survives across function invocations
let cached = globalThis.__mongoose;
if (!cached) {
  cached = globalThis.__mongoose = { conn: null, promise: null };
}

async function connectDB() {
  // Return existing healthy connection
  if (cached.conn && mongoose.connection.readyState === 1) {
    return cached.conn;
  }

  // Start a new connection if none in-flight
  if (!cached.promise) {
    if (!MONGO_URI) {
      throw new Error('MONGO_URI is not set in environment variables');
    }

    console.log('🔌 Connecting to MongoDB...');

    cached.promise = mongoose
      .connect(MONGO_URI, {
        serverSelectionTimeoutMS: 10000,
        socketTimeoutMS: 45000,
        bufferCommands: false, // fail fast instead of buffering
        maxPoolSize: 10,
      })
      .then((m) => {
        console.log('✅ MongoDB connected to DB:', m.connection.name);
        return m;
      })
      .catch((err) => {
        console.error('❌ MongoDB connection failed:', err.message);
        cached.promise = null; // allow retry on next request
        cached.conn = null;
        throw err;
      });
  }

  cached.conn = await cached.promise;
  return cached.conn;
}

// Helper: is the DB connected right now?
const isDBConnected = () => mongoose.connection.readyState === 1;

// Connection event listeners (helpful for debugging)
mongoose.connection.on('error', (e) => console.error('Mongo error:', e.message));
mongoose.connection.on('disconnected', () => console.warn('⚠️ Mongo disconnected'));
mongoose.connection.on('reconnected', () => console.log('♻️ Mongo reconnected'));

// ==================== AUTH MIDDLEWARE ====================
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ success: false, message: 'Please log in.' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ success: false, message: 'Invalid token. Please log in again.' });
    }
    req.user = user;
    next();
  });
};

// ==================== ROOT / HEALTH ====================
app.get('/', async (req, res) => {
  let connected = isDBConnected();
  let dbName = mongoose.connection.name || null;
  let error = null;

  // On cold start, try to connect now
  if (!connected) {
    try {
      await connectDB();
      connected = isDBConnected();
      dbName = mongoose.connection.name;
    } catch (e) {
      error = e.message;
    }
  }

  res.status(connected ? 200 : 503).json({
    message: 'Omkar Steel Fabricators Backend',
    status: connected ? 'OK' : 'DEGRADED',
    timestamp: new Date().toISOString(),
    environment: {
      node_env: process.env.NODE_ENV || 'development',
      platform: IS_VERCEL ? 'vercel' : 'local',
      database: {
        connected,
        name: dbName,
        readyState: mongoose.connection.readyState,
        error,
      },
      cors: { allowedOrigins },
      env_vars: {
        MONGO_URI: MONGO_URI ? 'Set ✅' : 'Not Set ❌',
        JWT_SECRET: process.env.JWT_SECRET ? 'Set ✅' : 'Using fallback ⚠️',
      },
    },
  });
});

app.get('/api/test', (req, res) => {
  res.json({ success: true, message: 'API is working!' });
});

// ==================== SIGNUP ====================
app.post('/api/signup', async (req, res) => {
  try {
    await connectDB();

    const { username, email, mobile, password, addr } = req.body;

    if (!username || !mobile || !password) {
      return res.status(400).json({ success: false, message: 'Username, mobile, password required' });
    }
    if (!/^\d{10}$/.test(mobile)) {
      return res.status(400).json({ success: false, message: 'Mobile must be 10 digits' });
    }

    const existingMobile = await User.findOne({ mobile });
    if (existingMobile) {
      return res.status(400).json({ success: false, message: 'Mobile already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const userCount = await User.countDocuments();

    const newUser = new User({
      username: username.trim(),
      mobile: mobile.trim(),
      password: hashedPassword,
      email: email ? email.trim().toLowerCase() : '',
      addr: addr ? addr.trim() : '',
      role: userCount === 0 ? 'admin' : 'user',
    });

    await newUser.save();

    const token = jwt.sign(
      { id: newUser._id, username: newUser.username, role: newUser.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      token,
      user: { id: newUser._id, username: newUser.username, role: newUser.role },
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ success: false, message: 'User already exists' });
    }
    console.error('Signup error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ==================== LOGIN ====================
app.post('/api/login', async (req, res) => {
  try {
    await connectDB();

    const { mobile, password } = req.body;

    if (!mobile || !password) {
      return res.status(400).json({ success: false, message: 'Mobile and password required' });
    }

    const user = await User.findOne({ mobile: mobile.trim() });
    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    user.lastLogin = new Date();
    await user.save();

    const token = jwt.sign(
      { id: user._id, username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(200).json({
      success: true,
      message: 'Login successful',
      token,
      role: user.role,
      username: user.username,
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ==================== PROFILE ====================
app.get('/api/profile', authenticateToken, async (req, res) => {
  try {
    await connectDB();
    const user = await User.findById(req.user.id).select('-password');
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    res.status(200).json({
      success: true,
      username: user.username,
      email: user.email,
      mobile: user.mobile,
      addr: user.addr,
      role: user.role,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.put('/api/profile', authenticateToken, async (req, res) => {
  try {
    await connectDB();
    const { username, email, mobile, addr, password } = req.body;
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (username) user.username = username.trim();
    if (email !== undefined) user.email = email.trim();
    if (mobile) user.mobile = mobile.trim();
    if (addr !== undefined) user.addr = addr.trim();
    if (password && password.trim() !== '') {
      user.password = await bcrypt.hash(password, 10);
    }

    await user.save();
    res.status(200).json({
      success: true,
      message: 'Profile updated',
      username: user.username,
      email: user.email,
      mobile: user.mobile,
      addr: user.addr,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ==================== ENQUIRY ====================
app.post('/api/enquiries', async (req, res) => {
  try {
    await connectDB();

    const { name, email, mobile, subject, message } = req.body;

    if (!name || !mobile || !subject || !message) {
      return res.status(400).json({ success: false, message: 'All fields required' });
    }

    const newEnquiry = new Enquiry({
      name: name.trim(),
      email: email ? email.trim() : '',
      mobile: mobile.trim(),
      subject: subject.trim(),
      message: message.trim(),
    });

    await newEnquiry.save();
    res.status(201).json({ success: true, message: 'Enquiry submitted' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ==================== SERVICES ====================
app.get('/api/services', async (req, res) => {
  try {
    await connectDB();
    const services = await Service.find().sort({ createdAt: -1 });
    res.status(200).json({ success: true, services });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/services', authenticateToken, upload.single('image'), async (req, res) => {
  try {
    await connectDB();

    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Admin only' });
    }

    const { title, pricePerSquareFoot } = req.body;
    if (!title || !pricePerSquareFoot) {
      return res.status(400).json({ success: false, message: 'Title and price required' });
    }

    const imagePath = req.file ? `/uploads/${req.file.filename}` : '';
    const newService = new Service({
      title: title.trim(),
      pricePerSquareFoot: parseFloat(pricePerSquareFoot),
      imagePath,
    });

    await newService.save();
    res.status(201).json({ success: true, message: 'Service created', service: newService });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.put('/api/services/:id', authenticateToken, upload.single('image'), async (req, res) => {
  try {
    await connectDB();

    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Admin only' });
    }

    const { title, pricePerSquareFoot } = req.body;
    const service = await Service.findById(req.params.id);
    if (!service) {
      return res.status(404).json({ success: false, message: 'Service not found' });
    }

    if (title) service.title = title.trim();
    if (pricePerSquareFoot) service.pricePerSquareFoot = parseFloat(pricePerSquareFoot);
    if (req.file) service.imagePath = `/uploads/${req.file.filename}`;

    await service.save();
    res.status(200).json({ success: true, message: 'Service updated', service });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.delete('/api/services/:id', authenticateToken, async (req, res) => {
  try {
    await connectDB();

    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Admin only' });
    }

    await Service.findByIdAndDelete(req.params.id);
    res.status(200).json({ success: true, message: 'Service deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ==================== ORDERS ====================
app.post('/api/create-order', authenticateToken, async (req, res) => {
  try {
    await connectDB();

    const { title, length, width, orderAmount } = req.body;

    if (!title || !length || !width || !orderAmount) {
      return res.status(400).json({ success: false, message: 'All fields required' });
    }

    const newOrder = new Order({
      userId: req.user.id,
      orderAmount: parseFloat(orderAmount),
      title: title.trim(),
      length: parseFloat(length),
      width: parseFloat(width),
      status: 'pending',
    });

    await newOrder.save();
    res.status(201).json({ success: true, message: 'Order created', order: newOrder });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/api/my-orders', authenticateToken, async (req, res) => {
  try {
    await connectDB();
    const orders = await Order.find({ userId: req.user.id })
      .populate('userId', 'username')
      .sort({ createdAt: -1 });
    res.status(200).json({ success: true, orders });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/api/orders', authenticateToken, async (req, res) => {
  try {
    await connectDB();
    let orders;
    if (req.user.role === 'admin') {
      orders = await Order.find().populate('userId', 'username email mobile');
    } else {
      orders = await Order.find({ userId: req.user.id }).populate('userId', 'username');
    }
    res.status(200).json({ success: true, orders });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.put('/api/orders/:orderId/cancel', authenticateToken, async (req, res) => {
  try {
    await connectDB();
    const order = await Order.findById(req.params.orderId);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    if (order.status !== 'pending') {
      return res.status(400).json({ success: false, message: 'Cannot cancel this order' });
    }

    if (req.user.role !== 'admin' && order.userId.toString() !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    order.status = 'cancelled';
    await order.save();
    res.status(200).json({ success: true, message: 'Order cancelled', order });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.put('/api/orders/:orderId/review', authenticateToken, async (req, res) => {
  try {
    await connectDB();
    const { action, feedback } = req.body;
    const order = await Order.findById(req.params.orderId);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    if (order.status !== 'delivered') {
      return res.status(400).json({ success: false, message: 'Cannot review this order' });
    }

    if (action === 'accept') {
      order.status = 'accepted';
    } else if (action === 'reject') {
      order.status = 'rejected';
    } else {
      return res.status(400).json({ success: false, message: 'Invalid action' });
    }

    if (feedback) order.feedback = feedback;
    await order.save();
    res.status(200).json({ success: true, message: `Order ${action}ed`, order });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/orders/update-status', authenticateToken, async (req, res) => {
  try {
    await connectDB();

    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Admin only' });
    }

    const { statusUpdates } = req.body;
    const updatedOrders = [];

    for (const { orderId, status } of statusUpdates) {
      const order = await Order.findById(orderId);
      if (order) {
        order.status = status;
        await order.save();
        updatedOrders.push(order);
      }
    }

    res.status(200).json({ success: true, message: 'Statuses updated', updatedOrders });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ==================== STATIC FILES ====================
app.use('/uploads', express.static(uploadDir));

// ==================== START SERVER (LOCAL ONLY) ====================
const PORT = process.env.PORT || 5000;

if (!IS_VERCEL) {
  // Local dev: connect once, then listen
  connectDB()
    .then(() => {
      app.listen(PORT, () => {
        console.log(`🚀 Server running on http://localhost:${PORT}`);
      });
    })
    .catch((err) => {
      console.error('❌ Failed to connect to MongoDB on startup:', err.message);
      // Still start the server so you can debug via the / health route
      app.listen(PORT, () => {
        console.log(`⚠️ Server running on http://localhost:${PORT} (DB not connected)`);
      });
    });
}

// ✅ Export for Vercel serverless
export default app;