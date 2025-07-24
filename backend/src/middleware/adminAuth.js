const { requireRole } = require('./auth');

// Admin only access
const adminOnly = requireRole(['admin', 'super_admin']);

// Super admin only access
const superAdminOnly = requireRole(['super_admin']);

module.exports = {
  adminOnly,
  superAdminOnly
};