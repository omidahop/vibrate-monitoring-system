const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { validationResult } = require('express-validator');
const { databases, logAudit } = require('../config/database');
const { logger } = require('../config/logger');

// Get all users (limited info for regular users)
const getUsers = async (req, res) => {
  try {
    const result = await databases.users.find({
      selector: { 
        isApproved: true,
        isActive: true 
      },
      fields: ['_id', 'name', 'role', 'email', 'createdAt']
    });

    const users = result.docs.map(user => ({
      id: user._id,
      name: user.name,
      role: user.role,
      email: user.email,
      createdAt: user.createdAt
    }));

    res.json({
      success: true,
      users
    });
  } catch (error) {
    logger.error('Get users error:', error);
    res.status(500).json({
      error: 'خطا در دریافت لیست کاربران'
    });
  }
};

// Search users
const searchUsers = async (req, res) => {
  try {
    const { query, role } = req.query;

    let selector = {
      isApproved: true,
      isActive: true
    };

    if (role) {
      selector.role = role;
    }

    const result = await databases.users.find({
      selector,
      fields: ['_id', 'name', 'role', 'email']
    });

    let users = result.docs;

    // Filter by search query if provided
    if (query && query.trim()) {
      const searchTerm = query.toLowerCase().trim();
      users = users.filter(user => 
        user.name.toLowerCase().includes(searchTerm) ||
        user.email.toLowerCase().includes(searchTerm)
      );
    }

    const filteredUsers = users.map(user => ({
      id: user._id,
      name: user.name,
      role: user.role,
      email: user.email
    }));

    res.json({
      success: true,
      users: filteredUsers
    });
  } catch (error) {
    logger.error('Search users error:', error);
    res.status(500).json({
      error: 'خطا در جستجوی کاربران'
    });
  }
};

// Get user statistics (for dashboard)
const getUserStats = async (req, res) => {
  try {
    const result = await databases.users.find({ selector: {} });
    const users = result.docs;

    const stats = {
      total: users.length,
      active: users.filter(u => u.isActive).length,
      approved: users.filter(u => u.isApproved).length,
      pending: users.filter(u => !u.isApproved && u.isActive).length,
      inactive: users.filter(u => !u.isActive).length,
      byRole: users.reduce((acc, user) => {
        acc[user.role] = (acc[user.role] || 0) + 1;
        return acc;
      }, {}),
      recentRegistrations: users
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(0, 5)
        .map(user => ({
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          createdAt: user.createdAt,
          isApproved: user.isApproved
        }))
    };

    res.json({
      success: true,
      stats
    });
  } catch (error) {
    logger.error('Get user stats error:', error);
    res.status(500).json({
      error: 'خطا در دریافت آمار کاربران'
    });
  }
};

// Get user activity (for admin monitoring)
const getUserActivity = async (req, res) => {
  try {
    const { page = 1, limit = 20, userId, dateFrom, dateTo } = req.query;

    let selector = {};
    
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
    let activities = result.docs;
    if (dateFrom || dateTo) {
      activities = activities.filter(activity => {
        const activityDate = activity.timestamp.split('T')[0];
        if (dateFrom && activityDate < dateFrom) return false;
        if (dateTo && activityDate > dateTo) return false;
        return true;
      });
    }

    // Get user names for activities
    const userIds = [...new Set(activities.map(activity => activity.userId))];
    const usersResult = await databases.users.find({
      selector: { _id: { $in: userIds } },
      fields: ['_id', 'name', 'email']
    });
    
    const userMap = usersResult.docs.reduce((map, user) => {
      map[user._id] = {
        name: user.name,
        email: user.email
      };
      return map;
    }, {});

    // Add user info to activities
    const activitiesWithUsers = activities.map(activity => ({
      ...activity,
      user: userMap[activity.userId] || { name: 'نامشخص', email: '' }
    }));

    res.json({
      success: true,
      activities: activitiesWithUsers,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: activities.length
      }
    });
  } catch (error) {
    logger.error('Get user activity error:', error);
    res.status(500).json({
      error: 'خطا در دریافت فعالیت‌های کاربران'
    });
  }
};

// Bulk operations for users
const bulkUpdateUsers = async (req, res) => {
  try {
    const { userIds, action, data } = req.body;

    if (!Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({
        error: 'لیست کاربران نامعتبر است'
      });
    }

    const results = {
      success: [],
      failed: []
    };

    for (const userId of userIds) {
      try {
        const user = await databases.users.get(userId);
        
        let updatedUser = { ...user };
        
        switch (action) {
          case 'approve':
            if (!user.isApproved) {
              updatedUser.isApproved = true;
              updatedUser.approvedAt = new Date().toISOString();
              updatedUser.approvedBy = req.user.userId;
            }
            break;
            
          case 'deactivate':
            updatedUser.isActive = false;
            updatedUser.deactivatedAt = new Date().toISOString();
            updatedUser.deactivatedBy = req.user.userId;
            updatedUser.deactivationReason = data.reason || 'Bulk deactivation';
            break;
            
          case 'changeRole':
            if (data.role && ['operator', 'technician', 'engineer', 'supervisor', 'admin'].includes(data.role)) {
              updatedUser.role = data.role;
              updatedUser.roleChangedAt = new Date().toISOString();
              updatedUser.roleChangedBy = req.user.userId;
            }
            break;
            
          default:
            throw new Error('عملیات نامعتبر');
        }

        await databases.users.put(updatedUser);
        
        // Log the action
        await logAudit(req.user.userId, `BULK_${action.toUpperCase()}`, {
          targetUserId: userId,
          targetUserEmail: user.email,
          data,
          ip: req.ip
        });

        results.success.push({
          userId,
          email: user.email,
          name: user.name
        });

      } catch (error) {
        results.failed.push({
          userId,
          error: error.message
        });
      }
    }

    logger.info(`Bulk operation ${action} completed by ${req.user.email}: ${results.success.length} success, ${results.failed.length} failed`);

    res.json({
      success: true,
      message: `عملیات انجام شد: ${results.success.length} موفق، ${results.failed.length} ناموفق`,
      results
    });

  } catch (error) {
    logger.error('Bulk update users error:', error);
    res.status(500).json({
      error: 'خطا در عملیات گروهی کاربران'
    });
  }
};

// Export user data (for GDPR compliance)
const exportUserData = async (req, res) => {
  try {
    const { userId } = req.params;
    
    // Users can only export their own data, admins can export any user's data
    if (req.user.userId !== userId && !['admin', 'super_admin'].includes(req.user.role)) {
      return res.status(403).json({
        error: 'شما مجوز خروجی گرفتن از این داده‌ها را ندارید'
      });
    }

    // Get user data
    const user = await databases.users.get(userId);
    
    // Get user's vibrate data
    const vibrateDataResult = await databases.vibrateData.find({
      selector: { userId }
    });

    // Get user's audit logs
    const auditLogsResult = await databases.auditLogs.find({
      selector: { userId },
      limit: 1000 // Limit to last 1000 actions
    });

    const exportData = {
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        createdAt: user.createdAt,
        lastLoginAt: user.lastLoginAt,
        isApproved: user.isApproved,
        isActive: user.isActive
      },
      vibrateData: vibrateDataResult.docs.map(data => ({
        id: data._id,
        unit: data.unit,
        equipment: data.equipment,
        date: data.date,
        parameters: data.parameters,
        notes: data.notes,
        timestamp: data.timestamp
      })),
      auditLogs: auditLogsResult.docs.map(log => ({
        action: log.action,
        timestamp: log.timestamp,
        details: log.details
      })),
      exportedAt: new Date().toISOString(),
      exportedBy: req.user.email
    };

    // Log the export
    await logAudit(req.user.userId, 'USER_DATA_EXPORTED', {
      targetUserId: userId,
      exportedDataSize: JSON.stringify(exportData).length,
      ip: req.ip
    });

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename=user-data-${userId}-${Date.now()}.json`);
    res.json(exportData);

  } catch (error) {
    logger.error('Export user data error:', error);
    res.status(500).json({
      error: 'خطا در خروجی گرفتن داده‌های کاربر'
    });
  }
};

// Delete user account (GDPR compliance)
const deleteUserAccount = async (req, res) => {
  try {
    const { userId } = req.params;
    const { confirmation } = req.body;

    if (confirmation !== 'DELETE_PERMANENTLY') {
      return res.status(400).json({
        error: 'تایید حذف اکانت نامعتبر است'
      });
    }

    const user = await databases.users.get(userId);

    // Prevent deleting super admin
    if (user.role === 'super_admin') {
      return res.status(403).json({
        error: 'نمی‌توان مدیر کل را حذف کرد'
      });
    }

    // Only super admin can delete other users' accounts
    if (req.user.userId !== userId && req.user.role !== 'super_admin') {
      return res.status(403).json({
        error: 'شما مجوز حذف این حساب کاربری را ندارید'
      });
    }

    // Instead of hard delete, we'll anonymize the data for audit purposes
    const anonymizedUser = {
      ...user,
      name: 'Deleted User',
      email: `deleted-${Date.now()}@anonymized.local`,
      password: 'DELETED',
      isActive: false,
      isApproved: false,
      deletedAt: new Date().toISOString(),
      deletedBy: req.user.userId,
      originalEmail: user.email // Keep for audit
    };

    await databases.users.put(anonymizedUser);

    // Log the deletion
    await logAudit(req.user.userId, 'USER_ACCOUNT_DELETED', {
      targetUserId: userId,
      originalEmail: user.email,
      ip: req.ip
    });

    logger.info(`User account deleted: ${user.email} by ${req.user.email}`);

    res.json({
      success: true,
      message: 'حساب کاربری با موفقیت حذف شد'
    });

  } catch (error) {
    logger.error('Delete user account error:', error);
    res.status(500).json({
      error: 'خطا در حذف حساب کاربری'
    });
  }
};

// Get user profile by ID (for admin viewing)
const getUserProfile = async (req, res) => {
  try {
    const { userId } = req.params;
    
    const user = await databases.users.get(userId);
    
    // Remove sensitive information
    const { password, ...userProfile } = user;

    // Get user's recent activity
    const recentActivity = await databases.auditLogs.find({
      selector: { userId },
      sort: [{ timestamp: 'desc' }],
      limit: 10
    });

    res.json({
      success: true,
      user: userProfile,
      recentActivity: recentActivity.docs
    });

  } catch (error) {
    if (error.name === 'not_found') {
      return res.status(404).json({
        error: 'کاربر یافت نشد'
      });
    }

    logger.error('Get user profile error:', error);
    res.status(500).json({
      error: 'خطا در دریافت پروفایل کاربر'
    });
  }
};

module.exports = {
  getUsers,
  searchUsers,
  getUserStats,
  getUserActivity,
  bulkUpdateUsers,
  exportUserData,
  deleteUserAccount,
  getUserProfile
};