// vcpBackend/src/controllers/userController.js
const User = require("../models/userModel");
const BusinessOwner = require("../models/businessOwnersModel"); // Corrected the import path
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");
const { validationResult } = require('express-validator');
require("dotenv").config();

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Register a new user
const register = async (req, res) => {
  const { email, password } = req.body;
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const verificationToken = jwt.sign(
      { userId: email },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    const user = await User.create({
      email,
      password: hashedPassword,
      verification_token: verificationToken,
    });

    // const verificationUrl = `http://localhost:${process.env.PORT || 3000}/api/users/verify/${verificationToken}`;
    const verificationUrl = `${process.env.BASE_URL}/api/users/verify-email/${verificationToken}`; // Ensure this matches your backend route

    // const verificationUrl = `${process.env.FRONTEND_BASE_URL}/verify-email/${verificationToken}`;


    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: user.email,
      subject: "Verify your email",
      text: `Click this link to verify your email: ${verificationUrl}`,
    };

    await transporter.sendMail(mailOptions);

    res
      .status(201)
      .json({
        message:
          "User registered, please check your email to verify your account",
      });
  } catch (error) {
    console.error("Registration error:", error); // Added logging
    res.status(400).json({ error: error.message });
  }
};

// Login a user
const login = async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await User.findOne({ where: { email } });
    if (user && (await bcrypt.compare(password, user.password))) {
      if (user.email_verified === 0) {
        return res
          .status(401)
          .json({ error: "Please verify your email before logging in" });
      }
      const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, {
        expiresIn: "1h",
      });

      // Check if the BusinessOwner already exists
      const businessOwner = await BusinessOwner.findOne({
        where: { user_id: user.id },
      });
      if (!businessOwner) {
        // Automatically create a BusinessOwner linked to this user
        await BusinessOwner.create({
          email: user.email,
          name: "", // you can set an empty name or a default name
          user_id: user.id,
        });
      }

      res.json({ message: "Login successful", token });
    } else {
      res.status(401).json({ error: "Invalid credentials" });
    }
  } catch (error) {
    console.error("Login error:", error); // Added logging
    res.status(500).json({ error: error.message });
  }
};

// Verify email
const verifyEmail = async (req, res) => {
  const { token } = req.params;
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findOne({ where: { email: decoded.userId } });

    if (user) {
      if (user.email_verified) {
        return res.status(200).json({ message: 'Email already verified' });
      }
      user.email_verified = 1;
      user.verification_token = null; // Clear the verification token
      await user.save();
      res.status(200).json({ message: 'Email verification successful' });
    } else {
      res.status(400).json({ error: 'Invalid token' });
    }
  } catch (error) {
    console.error('Email verification error:', error); // Added logging
    res.status(500).json({ error: error.message });
  }
};

// Request password reset
const requestPasswordReset = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { email } = req.body;

  try {
    // Check if email format is valid
    if (!validateEmail(email)) {
      return res.status(400).json({ error: "Invalid email format" });
    }

    // Check if user exists with this email
    const user = await User.findOne({ where: { email } });

    if (!user) {
      return res.status(404).json({ error: "No user found with this email" });
    }

    // Check if this email is verified or not
    if (!user.email_verified) {
      return res.status(400).json({ error: "Email is not verified" });
    }

    const resetToken = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, {
      expiresIn: "1h",
    });
    user.reset_password_token = resetToken;
    user.reset_password_token_expires = new Date(Date.now() + 3600000); // 1 hour from now
    await user.save();

    const resetUrl = `${process.env.FRONTEND_BASE_URL}/reset-password/${resetToken}`;


    const transporter = nodemailer.createTransport({
      service: 'Gmail', // or any other email service you use
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: user.email,
      subject: "Password Reset",
      text: `Click this link to reset your password: ${resetUrl}`,
    };

    await transporter.sendMail(mailOptions);

    res.json({ message: "Password reset email sent" });
  } catch (error) {
    console.error("Password reset request error:", error);
    res.status(500).json({ error: error.message });
  }
};

// Validate email format function
function validateEmail(email) {
  // Regular expression for basic email format validation
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(String(email).toLowerCase());
}

// Reset password
const resetPassword = async (req, res) => {
  const { token } = req.params;
  const { newPassword } = req.body;

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findOne({
      where: { id: decoded.userId, reset_password_token: token },
    });

    if (!user || user.reset_password_token_expires < new Date()) {
      return res.status(400).json({ error: "Invalid or expired token" });
    }

    user.password = await bcrypt.hash(newPassword, 10);
    user.reset_password_token = null;
    user.reset_password_token_expires = null;
    await user.save();

    res.json({ message: "Password reset successful" });
  } catch (error) {
    console.error("Password reset error:", error);
    res.status(500).json({ error: error.message });
  }
};

// Get all users
const getAllUsers = async (req, res) => {
  try {
    const users = await User.findAll();
    res.status(200).json(users);
  } catch (error) {
    console.error("Get all users error:", error); // Added logging
    res.status(500).json({ error: error.message });
  }
};

// Get user by ID
const getUserById = async (req, res) => {
  const { id } = req.params;
  try {
    const user = await User.findByPk(id);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    res.status(200).json(user);
  } catch (error) {
    console.error("Get user by ID error:", error); // Added logging
    res.status(500).json({ error: error.message });
  }
};

// Delete user and associated business owner
const deleteUser = async (req, res) => {
  const { id } = req.params;
  try {
    const user = await User.findByPk(id);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const businessOwner = await BusinessOwner.findOne({
      where: { user_id: id },
    });

    if (businessOwner) {
      await businessOwner.destroy();
    }

    await user.destroy();

    res
      .status(200)
      .json({
        message: "User and associated business owner deleted successfully",
      });
  } catch (error) {
    console.error("Delete user error:", error); // Added logging
    res.status(500).json({ error: error.message });
  }
};

// Get user by email
const getUserByEmail = async (req, res) => {
  const { email } = req.params;
  try {
    const user = await User.findOne({ where: { email } });
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    res.status(200).json(user);
  } catch (error) {
    console.error("Get user by email error:", error); // Added logging
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  register,
  login,
  verifyEmail,
  requestPasswordReset,
  resetPassword,
  getAllUsers,
  getUserById,
  deleteUser,
  getUserByEmail,
};
