import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import dotenv from 'dotenv';
import bcrypt from 'bcrypt';
import mongoose from 'mongoose';
import session from 'express-session';
import connectMongoDBSession from 'connect-mongodb-session';
import jwt from 'jsonwebtoken';
import multer from 'multer'; // For file uploads
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import path from 'path';

// Fix: Import the named 'sendOTP' function.
// This is the only place it should be "declared" in this file.
import { sendOTP } from './sendOTP.js';

// Get the current directory name using import.meta.url
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config();

const MongoDBStore = connectMongoDBSession(session);

const app = express();
const PORT = process.env.PORT || 5000;

// Configure CORS with credentials
app.use(cors({
  origin: 'http://localhost:3000', // Your frontend URL
  credentials: true, // Allow credentials to be included
}));

app.use(bodyParser.json());

// Connect to MongoDB
mongoose.connect('mongodb://127.0.0.1:27017/OSF', {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('Connection error:', err));

// Setup session store
const store = new MongoDBStore({
  uri: 'mongodb://127.0.0.1:27017/OSF',
  collection: 'sessions'
});

store.on('error', function (error) {
  console.log(error);
});

// Configure session middleware
app.use(session({
  secret: process.env.SESSION_SECRET || 'AnkitaDilipKamble',
  resave: false,
  saveUninitialized: false,
  store: store,
  cookie: {
    maxAge: 1000 * 60 * 60,
    sameSite: 'None',
    secure: false // Set to true if using HTTPS in production
  }
}));

// --- ALL Mongoose Schema Definitions (Consolidated) ---

// User schema
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  email: { type: String, required: false },
  mobile: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, default: 'user' },
  addr: { type: String, required: false },
  lastLogin: { type: Date }
});
const User = mongoose.model('User', userSchema);

// Order schema (NOW INCLUDES feedback field)
const orderSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  orderAmount: { type: Number, required: true },
  title: { type: String, required: true },
  length: { type: Number, required: true },
  width: { type: Number, required: true },
  status: { type: String, default: 'pending' },
  feedback: { type: String }, // Feedback field for delivered orders
  createdAt: { type: Date, default: Date.now }
});
const Order = mongoose.model('Order', orderSchema);


// OTP Schema
const otpSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  otp: { type: String, required: true },
  expiresAt: { type: Date, required: true },
  verified: { type: Boolean, default: false },
}, { timestamps: true });

const OTP = mongoose.model('OTP', otpSchema);


// Enquiry Schema
const enquirySchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: false },
  mobile: { type: String, required: true },
  subject: { type: String, required: true },
  message: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});
const Enquiry = mongoose.model('Enquiry', enquirySchema);

// Service Schema
const serviceSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
  },
  imagePath: {
    type: String,
    //required: true, // Path or URL to the service image
  },
  pricePerSquareFoot: {
    type: Number,
    required: true,
  },
}, { timestamps: true });

const Service = mongoose.model('Service', serviceSchema);


// --- Middleware for JWT Verification ---
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'Unauthorized: Missing token' });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      console.error("JWT Verification Error:", err);
      return res.status(403).json({ message: 'Forbidden: Invalid token' });
    }
    req.user = user; // Set req.user with decoded token payload (id, role)
    next();
  });
};

// Middleware for Admin Authorization
const authorizeAdmin = (req, res, next) => {
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    res.status(403).json({ message: 'Forbidden: Admin access required' });
  }
};


// --- Multer setup for file uploads (Consolidated) ---
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.join(__dirname, 'uploads'); // 'uploads' directory relative to server.js
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  },
});
const upload = multer({ storage });


// --- ALL API Routes (Consolidated) ---

// Enquiry Route
app.post('/api/enquiries', async (req, res) => {
  const { name, email, mobile, subject, message } = req.body;

  if (!name || !mobile || !subject || !message) {
    return res.status(400).json({ message: 'Name, mobile, subject, and message are required fields.' });
  }

  try {
    const newEnquiry = new Enquiry({
      name,
      email,
      mobile,
      subject,
      message
    });

    await newEnquiry.save();
    console.log('Enquiry saved successfully:', newEnquiry);
    res.status(201).json({ message: 'Enquiry submitted successfully!', enquiry: newEnquiry });
  } catch (error) {
    console.error('Error saving enquiry:', error.message || error);
    res.status(500).json({ message: 'Failed to submit enquiry. Please try again.', details: error.message });
  }
});


// Signup route
// This is the corrected signup route in server.js
app.post('/addr', async (req, res) => {
  const { username, email, mobile, password, addr } = req.body;

  if (!username || !mobile || !password) {
    console.error('Validation error: Missing required fields');
    return res.status(400).json({ message: 'Username, mobile, and password are required' });
  }

  try {
    console.log('Received data:', req.body);

    const existingUser = await User.findOne({ $or: [{ mobile }, { username }] });
    if (existingUser) {
      console.error('User already exists with this mobile number or username:', mobile, username);
      return res.status(400).json({ message: 'User already exists with this mobile number or username' });
    }

    const userCount = await User.countDocuments();
    const role = userCount === 0 ? 'admin' : 'user';

    const hashedPassword = await bcrypt.hash(password, 10);

    // FIX: Include the 'addr' field here.
    const newUser = new User({ username, email, mobile, password: hashedPassword, role, addr });

    await newUser.save();

    console.log('User registered successfully:', newUser);
    res.status(201).json({ message: 'User registered successfully' });
  } catch (error) {
    console.error('Signup error:', error.message || error);
    res.status(500).json({ message: 'Internal server error', details: error.message });
  }
});

app.post('/api/login', async (req, res) => {
  const { mobile, password } = req.body;

  if (!mobile || !password) {
    return res.status(400).json({ message: 'Mobile number and password are required' });
  }

  try {
    const user = await User.findOne({ mobile });
    if (!user) {
      return res.status(401).json({ message: 'Invalid mobile number or password' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid mobile number or password' });
    }

    const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '1h' });

    res.status(200).json({
      message: 'Login successful',
      token,
      role: user.role,
    });
  } catch (error) {
    console.error('Login error:', error.message || error);
    res.status(500).json({ message: 'Internal server error', details: error.message });
  }
});

app.post('/api/forgot-password', async (req, res) => {
  const { mobile } = req.body;

  if (!mobile) {
    return res.status(400).json({ message: 'Mobile number is required' });
  }

  try {
    const user = await User.findOne({ mobile });
    if (!user) return res.status(404).json({ message: 'User not found' });

    // Generate 6-digit OTP
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();

    const otpExpiry = new Date(Date.now() + 4 * 60 * 1000); // 4 minutes from now

    // Save OTP in DB
    const otpEntry = new OTP({
      userId: user._id,
      otp: otpCode,
      expiresAt: otpExpiry
    });

    await otpEntry.save();

    // Fix: Call the imported sendOTP function
    const otpSent = await sendOTP(mobile, otpCode);

    if (otpSent) {
      res.status(200).json({ message: 'OTP sent successfully' });
    } else {
      res.status(500).json({ message: 'Error sending OTP. Please try again.' });
    }

  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ message: 'Internal server error', details: error.message });
  }
});


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

    // Mark OTP as verified
    otpEntry.verified = true;
    await otpEntry.save();

    res.status(200).json({ message: 'OTP verified successfully', userId: user._id });
  } catch (error) {
    console.error('OTP verification error:', error);
    res.status(500).json({ message: 'Internal server error', details: error.message });
  }
});

// Logout route
app.post('/api/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Error during logout:', err);
      return res.status(500).json({ message: 'Could not log out' });
    }
    res.clearCookie('connect.sid');
    console.log('User logged out successfully');
    res.status(200).json({ message: 'Logout successful' });
  });
});


app.post('/api/reset-password', async (req, res) => {
  const { userId, newPassword } = req.body;

  if (!userId || !newPassword) {
    return res.status(400).json({ message: 'User ID and new password are required' });
  }

  try {
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    // Check if OTP is verified
    const otpEntry = await OTP.findOne({ userId, verified: true }).sort({ createdAt: -1 });
    if (!otpEntry) {
      return res.status(400).json({ message: 'OTP not verified' });
    }

    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();

    // Optional: Delete all OTPs for this user
    await OTP.deleteMany({ userId });

    res.status(200).json({ message: 'Password reset successfully' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ message: 'Internal server error', details: error.message });
  }
});

// Route to create an order
app.post('/api/create-order', authenticateToken, async (req, res) => {
  const { title, length, width, orderAmount } = req.body;

  if (!title || !length || !width || !orderAmount) {
    return res.status(400).json({ message: 'All fields are required' });
  }

  try {
    const userId = req.user.id; // User ID from authenticated token

    const newOrder = new Order({ // Use the directly defined Order model
      userId,
      orderAmount,
      title,
      length,
      width,
      status: 'pending',
    });

    await newOrder.save();

    res.status(201).json({
      message: 'Order created successfully',
      order: newOrder
    });

  } catch (error) {
    console.error('Error placing order:', error);
    res.status(500).json({ message: 'Error placing order. Please try again.' });
  }
});


// Get all orders (for admin or user's own orders)
// MODIFIED: Added .populate('userId', 'username')
app.get('/api/orders', authenticateToken, async (req, res) => {
  try {
    const user = req.user; // User from authenticated token

    if (user.role === 'admin') {
      // For admin, populate username for all orders
      const orders = await Order.find().populate('userId', 'username');
      return res.status(200).json({ orders });
    } else {
      // For regular user, fetch their orders and populate username
      const orders = await Order.find({ userId: user.id }).populate('userId', 'username');
      return res.status(200).json({ orders });
    }
  } catch (error) {
    console.error('Error fetching orders:', error);
    res.status(500).json({ message: 'Error fetching orders' });
  }
});

// Update order status (for admin dashboard)
app.post('/api/orders/update-status', authenticateToken, authorizeAdmin, async (req, res) => {
  const { statusUpdates } = req.body;

  try {
    const updatedOrders = [];

    for (const { orderId, status } of statusUpdates) {
      const order = await Order.findById(orderId);
      if (!order) {
        continue;
      }
      order.status = status;
      await order.save();
      updatedOrders.push(order);
    }

    res.status(200).json({ message: 'Order statuses updated successfully', updatedOrders });
  } catch (error) {
    console.error('Error updating order statuses:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Get logged-in user's orders (for MyOrders page)
// MODIFIED: Added .populate('userId', 'username')
app.get('/api/my-orders', authenticateToken, async (req, res) => {
  try {
    const user = req.user; // User from authenticated token
    const orders = await Order.find({ userId: user.id }).populate('userId', 'username'); // Populate username
    res.status(200).json({ orders });
  } catch (error) {
    console.error('Error fetching user orders:', error);
    res.status(500).json({ message: 'Error fetching user orders' });
  }
});

// Cancel order route
app.put('/api/orders/:orderId/cancel', authenticateToken, async (req, res) => {
  const { orderId } = req.params;

  try {
    const user = req.user; // User from authenticated token
    const order = await Order.findById(orderId);

    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    // Allow user to cancel their own pending order, or admin to cancel any pending order
    if (order.status !== 'pending') {
      return res.status(400).json({ message: `Order status is '${order.status}', cannot be cancelled.` });
    }

    if (user.role !== 'admin' && order.userId.toString() !== user.id) {
      return res.status(403).json({ message: 'Forbidden: You are not authorized to cancel this order' });
    }

    order.status = 'cancelled';
    await order.save();

    res.status(200).json({ message: 'Order cancelled successfully', order });
  } catch (error) {
    console.error('Error cancelling order:', error);
    res.status(500).json({ message: 'Internal server error during order cancellation.' });
  }
});

// ROUTE for customer review (Accept/Reject)
app.put('/api/orders/:orderId/review', authenticateToken, async (req, res) => {
  const { orderId } = req.params;
  const { action, feedback } = req.body;

  try {
    const user = req.user; // User from authenticated token
    const order = await Order.findById(orderId);

    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    // Ensure only the owner or an admin can review the order
    if (order.userId.toString() !== user.id && user.role !== 'admin') {
      return res.status(403).json({ message: 'Forbidden: You are not authorized to review this order.' });
    }

    // Only allow review for 'delivered' orders
    if (order.status !== 'delivered') {
      return res.status(400).json({ message: `Order status is '${order.status}', cannot be reviewed.` });
    }

    // Validate feedback based on action
    if (action === 'reject' && (!feedback || feedback.trim().length === 0)) {
      return res.status(400).json({ message: 'Feedback is mandatory when rejecting an order.' });
    }

    // Update status and feedback
    if (action === 'accept') {
      order.status = 'accepted'; // Corrected from 'accept' to 'accepted'
    } else if (action === 'reject') {
      order.status = 'rejected';
    } else {
      return res.status(400).json({ message: 'Invalid action specified. Must be "accept" or "reject".' });
    }

    order.feedback = feedback;

    await order.save();
    res.status(200).json({ message: `Order ${action}ed successfully!`, order });

  } catch (error) {
    console.error('Error reviewing order:', error);
    res.status(500).json({ message: 'Internal server error during order review.' });
  }
});


// Profile routes
app.get('/api/profile', authenticateToken, async (req, res) => {
  try {
    const user = req.user; // User from authenticated token

    const userData = await User.findById(user.id).select('-password');
    if (!userData) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.status(200).json(userData);
  } catch (error) {
    console.error('Error fetching profile:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

app.put('/api/profile', authenticateToken, async (req, res) => {
  try {
    const user = req.user; // User from authenticated token

    const updatedData = {
      username: req.body.username,
      email: req.body.email,
      mobile: req.body.mobile,
      addr: req.body.addr,
    };

    if (req.body.password) {
      updatedData.password = await bcrypt.hash(req.body.password, 10);
    }

    const updatedUser = await User.findByIdAndUpdate(user.id, updatedData, {
      new: true,
    }).select('-password');

    res.status(200).json(updatedUser);
  } catch (error) {
    console.error('Error updating profile:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});


// --- Service Routes (NEWLY ADDED AND CONSOLIDATED) ---

// Create a new service (Admin only)
app.post('/api/services', authenticateToken, authorizeAdmin, upload.single('image'), async (req, res) => {
  try {
    const { title, pricePerSquareFoot } = req.body;
    // Check if the image path is available from Multer
    const imagePath = req.file ? `/uploads/${req.file.filename}` : '';

    if (!title || !pricePerSquareFoot) {
      // If no file, and these are missing, return error
      return res.status(400).json({ message: 'Title and pricePerSquareFoot are required for a service.' });
    }

    const newService = new Service({
      title,
      imagePath, // Use the generated image path
      pricePerSquareFoot,
    });
    await newService.save();
    res.status(201).json({ message: 'Service created successfully!', service: newService });
  } catch (error) {
    console.error('Error creating service:', error);
    res.status(500).json({ message: 'Failed to create service. Please try again.' });
  }
});

// Get all services (Publicly accessible)
app.get('/api/services', async (req, res) => {
  try {
    const services = await Service.find();
    res.status(200).json({ services });
  } catch (error) {
    console.error('Error fetching services:', error);
    res.status(500).json({ message: 'Failed to fetch services.' });
  }
});

// Get a single service by ID
app.get('/api/services/:id', async (req, res) => {
  try {
    const service = await Service.findById(req.params.id);
    if (!service) {
      return res.status(404).json({ message: 'Service not found.' });
    }
    res.status(200).json({ service });
  } catch (error) {
    console.error('Error fetching service by ID:', error);
    res.status(500).json({ message: 'Failed to fetch service.' });
  }
});

// Update a service by ID (Admin only)
app.put('/api/services/:id', authenticateToken, authorizeAdmin, upload.single('image'), async (req, res) => {
  try {
    const { title, pricePerSquareFoot } = req.body;
    // Determine imagePath: if new file uploaded, use its path; otherwise, use existing path from body
    const imagePath = req.file ? `/uploads/${req.file.filename}` : req.body.imagePath;

    const updatedService = await Service.findByIdAndUpdate(
      req.params.id,
      { title, pricePerSquareFoot, imagePath }, // Update all fields, including imagePath
      { new: true, runValidators: true } // Return the updated document and run schema validators
    );

    if (!updatedService) {
      return res.status(404).json({ message: 'Service not found.' });
    }
    res.status(200).json({ message: 'Service updated successfully!', service: updatedService });
  } catch (error) {
    console.error('Error updating service:', error);
    res.status(500).json({ message: 'Failed to update service. Please try again.' });
  }
});

// Delete a service by ID (Admin only)
app.delete('/api/services/:id', authenticateToken, authorizeAdmin, async (req, res) => {
  try {
    const deletedService = await Service.findByIdAndDelete(req.params.id);

    if (!deletedService) {
      return res.status(404).json({ message: 'Service not found.' });
    }
    res.status(200).json({ message: 'Service deleted successfully!', service: deletedService });
  } catch (error) {
    console.error('Error deleting service:', error);
    res.status(500).json({ message: 'Failed to delete service. Please try again.' });
  }
});


// Serve static files from the 'uploads' directory
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});

mongoose.connection.on('error', console.error.bind(console, 'MongoDB connection error:'));
