import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import bcrypt from "bcrypt";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import { fileURLToPath } from "url";
import { dirname } from "path";

dotenv.config();

const app = express();

// ---------- Middleware ----------
app.use(cors({
  origin: "*", // safe for now
  credentials: true,
}));
app.use(express.json());

// ---------- MongoDB ----------
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB connected"))
  .catch(err => console.error("❌ Mongo error:", err));

// ---------- Schema ----------
const userSchema = new mongoose.Schema({
  username: String,
  email: String,
  mobile: { type: String, unique: true },
  password: String,
  role: { type: String, default: "user" },
  addr: String,
}, { timestamps: true });

const User = mongoose.model("User", userSchema);

// ---------- JWT ----------
const authenticateToken = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ message: "No token" });

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ message: "Invalid token" });
    req.user = user;
    next();
  });
};

// ---------- Routes ----------
app.post("/api/signup", async (req, res) => {
  try {
    const { username, mobile, password, email, addr } = req.body;

    if (!username || !mobile || !password)
      return res.status(400).json({ message: "Missing fields" });

    const exists = await User.findOne({ mobile });
    if (exists)
      return res.status(400).json({ message: "User already exists" });

    const hashed = await bcrypt.hash(password, 10);
    const count = await User.countDocuments();

    await User.create({
      username,
      mobile,
      email,
      addr,
      password: hashed,
      role: count === 0 ? "admin" : "user",
    });

    res.status(201).json({ message: "Signup successful" });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

app.post("/api/login", async (req, res) => {
  const { mobile, password };

  const user = await User.findOne({ mobile });
  if (!user) return res.status(401).json({ message: "Invalid login" });

  const match = await bcrypt.compare(password, user.password);
  if (!match) return res.status(401).json({ message: "Invalid login" });

  const token = jwt.sign(
    { id: user._id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: "1h" }
  );

  res.json({ token, role: user.role });
});

app.get("/api/profile", authenticateToken, async (req, res) => {
  const user = await User.findById(req.user.id).select("-password");
  res.json(user);
});

app.get("/", (req, res) => {
  res.send("API running 🚀");
});

// ---------- START SERVER (LOCAL ONLY) ----------
if (process.env.NODE_ENV !== "production") {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () =>
    console.log(`🚀 Server running locally on port ${PORT}`)
  );
}

// ✅ REQUIRED for Vercel
export default app;
