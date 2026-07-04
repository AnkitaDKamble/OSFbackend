import React, { useState } from "react";
import { Modal, Button } from "react-bootstrap";
import { Link, useNavigate } from "react-router-dom";
import axios from "axios";
import "./Signup.css";

// API URL - This will use the environment variable or fallback to localhost
const API_URL = process.env.REACT_APP_API_URL || "http://localhost:5000";

const SignUp = () => {
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [mobile, setMobile] = useState("");
  const [addr, setAddr] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [errors, setErrors] = useState({});
  const [showSuccess, setShowSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // ---------- Validation ----------
  const validate = () => {
    const errs = {};

    if (!name.trim()) errs.name = "Name is required";

    if (email && !/\S+@\S+\.\S+/.test(email)) {
      errs.email = "Email is invalid";
    }

    if (!/^\d{10}$/.test(mobile)) {
      errs.mobile = "Mobile number must be 10 digits";
    }

    if (!addr.trim()) errs.addr = "Address is required";

    if (!password) {
      errs.password = "Password is required";
    } else if (password.length < 1) {
      errs.password = "Password must be at least 1 character";
    } else if (password.length > 20) {
      errs.password = "Password must not exceed 20 characters";
    }

    if (!confirmPassword) {
      errs.confirmPassword = "Confirm password is required";
    } else if (password !== confirmPassword) {
      errs.confirmPassword = "Passwords do not match";
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  // ---------- Submit ----------
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    setIsLoading(true);
    setErrors({});

    const payload = {
      username: name.trim(),
      mobile: mobile.trim(),
      addr: addr.trim(),
      password: password,
    };

    if (email && email.trim()) {
      payload.email = email.trim();
    }

    console.log("API_URL:", API_URL);
    console.log("Sending payload:", payload);

    try {
      const response = await axios.post(`${API_URL}/api/signup`, payload, {
        headers: {
          "Content-Type": "application/json",
        },
        timeout: 30000,
      });

      console.log("Signup success:", response.data);

      setShowSuccess(true);
      setName("");
      setEmail("");
      setMobile("");
      setAddr("");
      setPassword("");
      setConfirmPassword("");
    } catch (error) {
      console.error("Signup error full:", error);
      console.error("Error response:", error.response);
      console.error("Error request:", error.request);
      console.error("Error message:", error.message);

      if (error.response) {
        setErrors({
          general:
            error.response.data?.message ||
            `Signup failed: ${error.response.status}`,
        });
      } else if (error.request) {
        setErrors({
          general: `Cannot connect to server. Please check your internet connection or try again later. (${error.message})`,
        });
      } else {
        setErrors({
          general: error.message || "An error occurred. Please try again.",
        });
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    setShowSuccess(false);
    navigate("/login");
  };

  // ---------- Input handlers ----------
  const handleMobileChange = (e) => {
    const value = e.target.value.replace(/[^0-9]/g, "");
    if (value.length <= 10) {
      setMobile(value);
    }
  };

  const handleNameChange = (e) => {
    const value = e.target.value.replace(/[^a-zA-Z\s]/g, "");
    setName(value);
  };

  return (
    <div className="signup-container">
      <div className="signup-card">
        <div className="signup-header">
          <i className="bi bi-person-plus-fill signup-icon"></i>
          <h2 className="signup-title">Create Account</h2>
          <p className="signup-subtitle">Join us to get started</p>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Name Field */}
          <div className="form-group">
            <label className="form-label">
              <i className="bi bi-person-fill me-2"></i>Full Name
            </label>
            <input
              type="text"
              className={`form-control signup-input ${
                errors.name ? "is-invalid" : ""
              }`}
              value={name}
              onChange={handleNameChange}
              placeholder="Enter your full name"
              maxLength={40}
              required
            />
            {errors.name && <div className="error-message">{errors.name}</div>}
          </div>

          {/* Email Field */}
          <div className="form-group">
            <label className="form-label">
              <i className="bi bi-envelope-fill me-2"></i>Email Address
              <span className="optional-badge">Optional</span>
            </label>
            <input
              type="email"
              className={`form-control signup-input ${
                errors.email ? "is-invalid" : ""
              }`}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your email"
              maxLength={30}
            />
            {errors.email && <div className="error-message">{errors.email}</div>}
          </div>

          {/* Mobile Field */}
          <div className="form-group">
            <label className="form-label">
              <i className="bi bi-phone-fill me-2"></i>Mobile Number
            </label>
            <input
              type="tel"
              className={`form-control signup-input ${
                errors.mobile ? "is-invalid" : ""
              }`}
              value={mobile}
              onChange={handleMobileChange}
              placeholder="Enter 10 digit mobile number"
              maxLength={10}
              required
            />
            {errors.mobile && (
              <div className="error-message">{errors.mobile}</div>
            )}
          </div>

          {/* Address Field */}
          <div className="form-group">
            <label className="form-label">
              <i className="bi bi-geo-alt-fill me-2"></i>Address
            </label>
            <textarea
              className={`form-control signup-textarea ${
                errors.addr ? "is-invalid" : ""
              }`}
              value={addr}
              onChange={(e) => setAddr(e.target.value)}
              placeholder="Enter your full address"
              rows="2"
              maxLength={100}
              required
            />
            {errors.addr && <div className="error-message">{errors.addr}</div>}
          </div>

          {/* Password Field */}
          <div className="form-group">
            <label className="form-label">
              <i className="bi bi-lock-fill me-2"></i>Password
            </label>
            <input
              type="password"
              className={`form-control signup-input ${
                errors.password ? "is-invalid" : ""
              }`}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              maxLength={20}
              required
            />
            {errors.password && (
              <div className="error-message">{errors.password}</div>
            )}
          </div>

          {/* Confirm Password Field */}
          <div className="form-group">
            <label className="form-label">
              <i className="bi bi-shield-lock-fill me-2"></i>Confirm Password
            </label>
            <input
              type="password"
              className={`form-control signup-input ${
                errors.confirmPassword ? "is-invalid" : ""
              }`}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm your password"
              maxLength={20}
              required
            />
            {errors.confirmPassword && (
              <div className="error-message">{errors.confirmPassword}</div>
            )}
          </div>

          {errors.general && (
            <div className="alert-general">
              <i className="bi bi-exclamation-triangle-fill me-2"></i>
              {errors.general}
            </div>
          )}

          <button type="submit" className="signup-btn" disabled={isLoading}>
            {isLoading ? (
              <>
                <span className="spinner-border spinner-border-sm me-2"></span>
                Creating Account...
              </>
            ) : (
              <>
                <i className="bi bi-person-plus-fill me-2"></i>
                Sign Up
              </>
            )}
          </button>

          <div className="signup-footer">
            Already have an account?{" "}
            <Link to="/login" className="login-link">
              Login here
            </Link>
          </div>
        </form>
      </div>

      {/* Success Modal */}
      <Modal
        show={showSuccess}
        onHide={handleClose}
        centered
        className="success-modal"
      >
        <Modal.Header closeButton className="success-modal-header">
          <Modal.Title>
            <i className="bi bi-check-circle-fill me-2"></i>
            Registration Successful!
          </Modal.Title>
        </Modal.Header>
        <Modal.Body className="success-modal-body">
          <div className="success-icon">
            <i className="bi bi-emoji-smile-fill"></i>
          </div>
          <p>Your account has been created successfully!</p>
          <p className="text-muted small">Please login to continue.</p>
        </Modal.Body>
        <Modal.Footer className="success-modal-footer">
          <Button className="success-btn" onClick={handleClose}>
            <i className="bi bi-box-arrow-in-right me-2"></i>
            Go to Login
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
};

export default SignUp;