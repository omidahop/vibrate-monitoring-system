const jwt = require('jsonwebtoken');
const { databases, logAudit } = require('../config/database');
const { logger } = require('../config/logger');

// Authenticate user middleware
const authenticateUser = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'دسترسی مجاز نیست. توکن احراز هویت ارسال نشده.'
      });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      // Get user from database
      const user = await databases.users.get(decoded.userId);
      
      if (!user) {
        return res.status(401).json({
          error: 'کاربر یافت نشد'
        });
      }

      if (!user.isActive) {
        return res.status(403).json({
          error: 'حساب کاربری غیرفعال است'
        });
      }

      if (!user.isApproved) {
        return res.status(403).json({
          error: 'حساب کاربری هنوز تایید نشده است. لطفاً صبر کنید تا مدیر حساب شما را تایید کند.'
        });
      }

      // Add user info to request
      req.user = {
        userId: user._id,
        email: user.email,
        name: user.name,
        role: user.role,
        isApproved: user.isApproved,
        isActive: user.isActive
      };

      next();
    } catch (jwtError) {
      logger.warn(`Invalid JWT token: ${jwtError.message}`);
      return res.status(401).json({
        error: 'توکن نامعتبر است'
      });
    }
  } catch (error) {
    logger.error('Auth middleware error:', error);
    return res.status(500).json({
      error: 'خطا در احراز هویت'
    });
  }
};

// Check if user is approved
const requireApproval = (req, res, next) => {
  if (!req.user.isApproved) {
    return res.status(403).json({
      error: 'حساب کاربری شما هنوز تایید نشده است. لطفاً منتظر تایید مدیر باشید.'
    });
  }
  next();
};

// Check if user has specific role
const requireRole = (roles) => {
  return (req, res, next) => {
    if (!Array.isArray(roles)) {
      roles = [roles];
    }

    if (!roles.includes(req.user.role)) {
      // Log unauthorized access attempt
      logAudit(req.user.userId, 'UNAUTHORIZED_ACCESS_ATTEMPT', {
        requiredRoles: roles,
        userRole: req.user.role,
        endpoint: req.path,
        ip: req.ip
      });

      return res.status(403).json({
        error: 'شما مجوز دسترسی به این بخش را ندارید'
      });
    }
    next();
  };
};

module.exports = {
  authenticateUser,
  requireApproval,
  requireRole
};