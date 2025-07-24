const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { validationResult } = require('express-validator');
const { databases, logAudit } = require('../config/database');
const { logger } = require('../config/logger');

// Get all users (for admin management)
const getAllUsers = async (req, res) => {
  try {
    const { page = 1, limit = 10, role, status } = req.query;
    
    let selector = {};
    
    if (role && role !== 'all') {
      selector.role = role;
    }
    
    if (status === 'approved') {
      selector.isApproved = true;
    } else if (status === 'pending') {
      selector.isApproved = false;
    } else if (status === 'inactive') {
      selector.isActive = false;
    }

    const result = await databases.users.find({
      selector,
      sort: [{ createdAt: 'desc' }],
      limit: parseInt(limit),
      skip: (parseInt(page) - 1) * parseInt(limit)
    });

    // Remove passwords from response
    const users = result.docs.map(user => {
      const { password, ...userWithoutPassword } = user;
      return userWithoutPassword;
    });

    // Get total count
    const totalResult = await databases.users.find({
      selector,
      fields: ['_id']
    });

    res.json({
      success: true,
      users,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: totalResult.docs.length,
        pages: Math.ceil(totalResult.docs.length / parseInt(limit))
      }
    });
  } catch (error) {
    logger.error('Get all users error:', error);
    res.status(500).json({
      error: 'خطا در دریافت لیست کاربران'
    });
  }
};

// Get pending users (waiting for approval)
const getPendingUsers = async (req, res) => {
  try {
    const result = await databases.users.find({
      selector: { 
        isApproved: false,
        isActive: true 
      },
      sort: [{ createdAt: 'desc' }]
    });

    const pendingUsers = result.docs.map(user => {
      const { password, ...userWithoutPassword } = user;
      return userWithoutPassword;
    });

    res.json({
      success: true,
      users: pendingUsers,
      count: pendingUsers.length
    });
  } catch (error) {
    logger.error('Get pending users error:', error);
    res.status(500).json({
      error: 'خطا در دریافت کاربران در انتظار تایید'
    });
  }
};

// Approve user
const approveUser = async (req, res) => {
  try {
    const { userId } = req.params;
    
    const user = await databases.users.get(userId);
    
    if (!user) {
      return res.status(404).json({
        error: 'کاربر یافت نشد'
      });
    }

    if (user.isApproved) {
      return res.status(400).json({
        error: 'این کاربر قبلاً تایید شده است'
      });
    }

    // Update user
    const updatedUser = {
      ...user,
      isApproved: true,
      approvedAt: new Date().toISOString(),
      approvedBy: req.user.userId
    };

    await databases.users.put(updatedUser);

    // Log approval
    await logAudit(req.user.userId, 'USER_APPROVED', {
      targetUserId: userId,
      targetUserEmail: user.email,
      ip: req.ip
    });

    logger.info(`User approved: ${user.email} by ${req.user.email}`);

    res.json({
      success: true,
      message: 'کاربر با موفقیت تایید شد',
      user: {
        id: updatedUser._id,
        email: updatedUser.email,
        name: updatedUser.name,
        role: updatedUser.role,
        isApproved: true
      }
    });
  } catch (error) {
    logger.error('Approve user error:', error);
    res.status(500).json({
      error: 'خطا در تایید کاربر'
    });
  }
};

// Reject/Deactivate user
const deactivateUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const { reason } = req.body;
    
    const user = await databases.users.get(userId);
    
    if (!user) {
      return res.status(404).json({
        error: 'کاربر یافت نشد'
      });
    }

    // Prevent deactivating super admin
    if (user.role === 'super_admin') {
      return res.status(403).json({
        error: 'نمی‌توان مدیر کل را غیرفعال کرد'
      });
    }

    // Update user
    const updatedUser = {
      ...user,
      isActive: false,
      isApproved: false,
      deactivatedAt: new Date().toISOString(),
      deactivatedBy: req.user.userId,
      deactivationReason: reason || 'No reason provided'
    };

    await databases.users.put(updatedUser);

    // Log deactivation
    await logAudit(req.user.userId, 'USER_DEACTIVATED', {
      targetUserId: userId,
      targetUserEmail: user.email,
      reason,
      ip: req.ip
    });

    logger.info(`User deactivated: ${user.email} by ${req.user.email}`);

    res.json({
      success: true,
      message: 'کاربر غیرفعال شد'
    });
  } catch (error) {
    logger.error('Deactivate user error:', error);
    res.status(500).json({
      error: 'خطا در غیرفعال کردن کاربر'
    });
  }
};

// Change user role
const changeUserRole = async (req, res) => {
  try {
    const { userId } = req.params;
    const { role } = req.body;

    if (!['operator', 'technician', 'engineer', 'supervisor', 'admin'].includes(role)) {
      return res.status(400).json({
        error: 'نقش کاربری نامعتبر است'
      });
    }
    
    const user = await databases.users.get(userId);
    
    if (!user) {
      return res.status(404).json({
        error: 'کاربر یافت نشد'
      });
    }

    // Prevent changing super admin role
    if (user.role === 'super_admin') {
      return res.status(403).json({
        error: 'نمی‌توان نقش مدیر کل را تغییر داد'
      });
    }

    // Only super admin can create new admins
    if (role === 'admin' && req.user.role !== 'super_admin') {
      return res.status(403).json({
        error: 'تنها مدیر کل می‌تواند ادمین جدید تعیین کند'
      });
    }

    const oldRole = user.role;

    // Update user
    const updatedUser = {
      ...user,
      role,
      roleChangedAt: new Date().toISOString(),
      roleChangedBy: req.user.userId
    };

    await databases.users.put(updatedUser);

    // Log role change
    await logAudit(req.user.userId, 'USER_ROLE_CHANGED', {
      targetUserId: userId,
      targetUserEmail: user.email,
      oldRole,
      newRole: role,
      ip: req.ip
    });

    logger.info(`User role changed: ${user.email} from ${oldRole} to ${role} by ${req.user.email}`);

    res.json({
      success: true,
      message: 'نقش کاربر با موفقیت تغییر یافت',
      user: {
        id: updatedUser._id,
        email: updatedUser.email,
        name: updatedUser.name,
        role: updatedUser.role
      }
    });
  } catch (error) {
    logger.error('Change user role error:', error);
    res.status(500).json({
      error: 'خطا در تغییر نقش کاربر'
    });
  }
};

// Get system statistics
const getSystemStats = async (req, res) => {
  try {
    // Users statistics
    const allUsersResult = await databases.users.find({ selector: {} });
    const allUsers = allUsersResult.docs;

    const activeUsers = allUsers.filter(u => u.isActive);
    const approvedUsers = allUsers.filter(u => u.isApproved);
    const pendingUsers = allUsers.filter(u => !u.isApproved && u.isActive);

    const roleStats = allUsers.reduce((acc, user) => {
      acc[user.role] = (acc[user.role] || 0) + 1;
      return acc;
    }, {});

    // Data statistics
    const allDataResult = await databases.vibrateData.find({ selector: {} });
    const allData = allDataResult.docs;

    const today = new Date().toISOString().split('T')[0];
    const todayData = allData.filter(d => d.date === today);

    // Recent activity
    const recentLogsResult = await databases.auditLogs.find({
      selector: {},
      sort: [{ timestamp: 'desc' }],
      limit: 10
    });

    res.json({
      success: true,
      stats: {
        users: {
          total: allUsers.length,
          active: activeUsers.length,
          approved: approvedUsers.length,
          pending: pendingUsers.length,
          byRole: roleStats
        },
        data: {
          totalRecords: allData.length,
          todayRecords: todayData.length,
          uniqueDates: [...new Set(allData.map(d => d.date))].length
        },
        recentActivity: recentLogsResult.docs
      }
    });
  } catch (error) {
    logger.error('Get system stats error:', error);
    res.status(500).json({
      error: 'خطا در دریافت آمار سیستم'
    });
  }
};

// Get audit logs
const getAuditLogs = async (req, res) => {
  try {
    const { page = 1, limit = 20, action, userId, dateFrom, dateTo } = req.query;
    
    let selector = {};
    
    if (action) {
      selector.action = action;
    }
    
    if (userId) {
      selector.userId = userId;
    }

    const result = await databases.auditLogs.find({
      selector,
      sort: [{ timestamp: 'desc' }],
      limit: parseInt(limit),
      skip: (parseInt(page) - 1) * parseInt(limit)
    });

    // Filter by date range if provided
    let logs = result.docs;
    if (dateFrom || dateTo) {
      logs = logs.filter(log => {
        const logDate = log.timestamp.split('T')[0];
        if (dateFrom && logDate < dateFrom) return false;
        if (dateTo && logDate > dateTo) return false;
        return true;
      });
    }

    // Get user names for logs
    const userIds = [...new Set(logs.map(log => log.userId))];
    const usersResult = await databases.users.find({
      selector: { _id: { $in: userIds } }
    });
    
    const userMap = usersResult.docs.reduce((map, user) => {
      map[user._id] = user.name;
      return map;
    }, {});

    // Add user names to logs
    const logsWithUserNames = logs.map(log => ({
      ...log,
      userName: userMap[log.userId] || 'نامشخص'
    }));

    res.json({
      success: true,
      logs: logsWithUserNames,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: logs.length
      }
    });
  } catch (error) {
    logger.error('Get audit logs error:', error);
    res.status(500).json({
      error: 'خطا در دریافت لاگ‌های سیستم'
    });
  }
};

// Reset user password (admin only)
const resetUserPassword = async (req, res) => {
  try {
    const { userId } = req.params;
    const { newPassword } = req.body;

    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({
        error: 'رمز عبور جدید باید حداقل 6 کاراکتر باشد'
      });
    }
    
    const user = await databases.users.get(userId);
    
    if (!user) {
      return res.status(404).json({
        error: 'کاربر یافت نشد'
      });
    }

    // Prevent resetting super admin password by non-super admin
    if (user.role === 'super_admin' && req.user.role !== 'super_admin') {
      return res.status(403).json({
        error: 'تنها مدیر کل می‌تواند رمز عبور مدیر کل را تغییر دهد'
      });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 12);

    // Update user
    const updatedUser = {
      ...user,
      password: hashedPassword,
      passwordResetAt: new Date().toISOString(),
      passwordResetBy: req.user.userId
    };

    await databases.users.put(updatedUser);

    // Log password reset
    await logAudit(req.user.userId, 'PASSWORD_RESET_BY_ADMIN', {
      targetUserId: userId,
      targetUserEmail: user.email,
      ip: req.ip
    });

    logger.info(`Password reset for user: ${user.email} by admin: ${req.user.email}`);

    res.json({
      success: true,
      message: 'رمز عبور کاربر با موفقیت تغییر یافت'
    });
  } catch (error) {
    logger.error('Reset user password error:', error);
    res.status(500).json({
      error: 'خطا در تغییر رمز عبور کاربر'
    });
  }
};

module.exports = {
  getAllUsers,
  getPendingUsers,
  approveUser,
  deactivateUser,
  changeUserRole,
  getSystemStats,
  getAuditLogs,
  resetUserPassword
};