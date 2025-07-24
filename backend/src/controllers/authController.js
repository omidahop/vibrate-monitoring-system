const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { validationResult } = require('express-validator');
const { databases, logAudit } = require('../config/database');
const { logger } = require('../config/logger');

// Generate JWT token
const generateToken = (userId, email) => {
  return jwt.sign(
    { userId, email },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
};

// Register new user
const register = async (req, res) => {
  try {
    // Check validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'اطلاعات وارد شده نامعتبر است',
        details: errors.array().map(err => err.msg)
      });
    }

    const { email, password, name, role = 'operator' } = req.body;

    // Check if user already exists
    const existingUser = await databases.users.find({
      selector: { email: email.toLowerCase() }
    });

    if (existingUser.docs.length > 0) {
      return res.status(400).json({
        error: 'کاربری با این ایمیل قبلاً ثبت‌نام کرده است'
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Create user
    const newUser = {
      _id: `user_${uuidv4()}`,
      email: email.toLowerCase(),
      password: hashedPassword,
      name: name.trim(),
      role: role,
      isApproved: false, // Must be approved by admin
      isActive: true,
      createdAt: new Date().toISOString(),
      lastLoginAt: null,
      profileImage: null
    };

    const result = await databases.users.put(newUser);

    // Log registration
    await logAudit(result.id, 'USER_REGISTERED', {
      email: newUser.email,
      name: newUser.name,
      role: newUser.role,
      ip: req.ip
    });

    logger.info(`New user registered: ${email}`);

    res.status(201).json({
      success: true,
      message: 'ثبت‌نام با موفقیت انجام شد. لطفاً منتظر تایید حساب کاربری توسط مدیر باشید.',
      user: {
        id: result.id,
        email: newUser.email,
        name: newUser.name,
        role: newUser.role,
        isApproved: false
      }
    });

  } catch (error) {
    logger.error('Registration error:', error);
    res.status(500).json({
      error: 'خطای داخلی سرور در فرآیند ثبت‌نام'
    });
  }
};

// Login user
const login = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'اطلاعات وارد شده نامعتبر است',
        details: errors.array().map(err => err.msg)
      });
    }

    const { email, password } = req.body;

    // Find user
    const userResult = await databases.users.find({
      selector: { email: email.toLowerCase() }
    });

    if (userResult.docs.length === 0) {
      return res.status(400).json({
        error: 'ایمیل یا رمز عبور اشتباه است'
      });
    }

    const user = userResult.docs[0];

    // Check if account is active
    if (!user.isActive) {
      return res.status(403).json({
        error: 'حساب کاربری شما غیرفعال شده است. با مدیر تماس بگیرید.'
      });
    }

    // Check password
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      // Log failed login attempt
      await logAudit(user._id, 'LOGIN_FAILED', {
        email: user.email,
        ip: req.ip,
        reason: 'Invalid password'
      });

      return res.status(400).json({
        error: 'ایمیل یا رمز عبور اشتباه است'
      });
    }

    // Check if user is approved
    if (!user.isApproved) {
      return res.status(403).json({
        error: 'حساب کاربری شما هنوز توسط مدیر تایید نشده است. لطفاً صبر کنید.',
        needsApproval: true
      });
    }

    // Generate token
    const token = generateToken(user._id, user.email);

    // Update last login time
    try {
      await databases.users.put({
        ...user,
        lastLoginAt: new Date().toISOString()
      });
    } catch (updateError) {
      logger.warn('Could not update last login time:', updateError);
    }

    // Log successful login
    await logAudit(user._id, 'LOGIN_SUCCESS', {
      email: user.email,
      ip: req.ip
    });

    logger.info(`User logged in: ${email}`);

    res.json({
      success: true,
      message: 'ورود با موفقیت انجام شد',
      token,
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        role: user.role,
        isApproved: user.isApproved,
        profileImage: user.profileImage
      }
    });

  } catch (error) {
    logger.error('Login error:', error);
    res.status(500).json({
      error: 'خطای داخلی سرور در فرآیند ورود'
    });
  }
};

// Get current user profile
const getProfile = async (req, res) => {
  try {
    const user = await databases.users.get(req.user.userId);
    
    res.json({
      success: true,
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        role: user.role,
        isApproved: user.isApproved,
        createdAt: user.createdAt,
        lastLoginAt: user.lastLoginAt,
        profileImage: user.profileImage
      }
    });
  } catch (error) {
    logger.error('Get profile error:', error);
    res.status(500).json({
      error: 'خطا در دریافت اطلاعات کاربر'
    });
  }
};

// Update user profile
const updateProfile = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'اطلاعات وارد شده نامعتبر است',
        details: errors.array().map(err => err.msg)
      });
    }

    const { name } = req.body;
    const user = await databases.users.get(req.user.userId);

    // Update user
    const updatedUser = {
      ...user,
      name: name.trim(),
      updatedAt: new Date().toISOString()
    };

    await databases.users.put(updatedUser);

    // Log profile update
    await logAudit(user._id, 'PROFILE_UPDATED', {
      changes: { name },
      ip: req.ip
    });

    res.json({
      success: true,
      message: 'پروفایل با موفقیت به‌روزرسانی شد',
      user: {
        id: updatedUser._id,
        email: updatedUser.email,
        name: updatedUser.name,
        role: updatedUser.role
      }
    });
  } catch (error) {
    logger.error('Update profile error:', error);
    res.status(500).json({
      error: 'خطا در به‌روزرسانی پروفایل'
    });
  }
};

// Change password
const changePassword = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'اطلاعات وارد شده نامعتبر است',
        details: errors.array().map(err => err.msg)
      });
    }

    const { currentPassword, newPassword } = req.body;
    const user = await databases.users.get(req.user.userId);

    // Check current password
    const isValidPassword = await bcrypt.compare(currentPassword, user.password);
    if (!isValidPassword) {
      return res.status(400).json({
        error: 'رمز عبور فعلی اشتباه است'
      });
    }

    // Hash new password
    const hashedNewPassword = await bcrypt.hash(newPassword, 12);

    // Update password
    const updatedUser = {
      ...user,
      password: hashedNewPassword,
      updatedAt: new Date().toISOString()
    };

    await databases.users.put(updatedUser);

    // Log password change
    await logAudit(user._id, 'PASSWORD_CHANGED', {
      ip: req.ip
    });

    res.json({
      success: true,
      message: 'رمز عبور با موفقیت تغییر یافت'
    });
  } catch (error) {
    logger.error('Change password error:', error);
    res.status(500).json({
      error: 'خطا در تغییر رمز عبور'
    });
  }
};

// Logout (mainly for logging purposes)
const logout = async (req, res) => {
  try {
    // Log logout
    await logAudit(req.user.userId, 'LOGOUT', {
      ip: req.ip
    });

    res.json({
      success: true,
      message: 'خروج با موفقیت انجام شد'
    });
  } catch (error) {
    logger.error('Logout error:', error);
    res.status(500).json({
      error: 'خطا در فرآیند خروج'
    });
  }
};

module.exports = {
  register,
  login,
  getProfile,
  updateProfile,
  changePassword,
  logout
};