const PouchDB = require('pouchdb');
const PouchDBFind = require('pouchdb-find');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { logger } = require('./logger');

// Add plugins
PouchDB.plugin(PouchDBFind);

// Database configuration
const DB_URL = process.env.COUCHDB_URL || 'http://admin:password@localhost:5984';
const DB_PREFIX = process.env.NODE_ENV === 'production' ? 'prod_' : 'dev_';

// Initialize databases
const databases = {
  users: new PouchDB(`${DB_URL}/${DB_PREFIX}users`),
  vibrateData: new PouchDB(`${DB_URL}/${DB_PREFIX}vibrate_data`),
  settings: new PouchDB(`${DB_URL}/${DB_PREFIX}settings`),
  auditLogs: new PouchDB(`${DB_URL}/${DB_PREFIX}audit_logs`)
};

// Setup databases and indexes
const setupDatabases = async () => {
  try {
    logger.info('🔧 Setting up databases...');

    // Users database indexes
    await databases.users.createIndex({
      index: { fields: ['email'] }
    });

    await databases.users.createIndex({
      index: { fields: ['role'] }
    });

    await databases.users.createIndex({
      index: { fields: ['isApproved'] }
    });

    await databases.users.createIndex({
      index: { fields: ['createdAt'] }
    });

    // Vibrate data database indexes
    await databases.vibrateData.createIndex({
      index: { fields: ['unit', 'equipment', 'date'] }
    });

    await databases.vibrateData.createIndex({
      index: { fields: ['timestamp'] }
    });

    await databases.vibrateData.createIndex({
      index: { fields: ['userId'] }
    });

    // Audit logs database indexes
    await databases.auditLogs.createIndex({
      index: { fields: ['timestamp'] }
    });

    await databases.auditLogs.createIndex({
      index: { fields: ['action'] }
    });

    await databases.auditLogs.createIndex({
      index: { fields: ['userId'] }
    });

    logger.info('✅ Database indexes created successfully');
    
    // Create super admin if not exists
    await createSuperAdmin();
    
    logger.info('✅ Database setup completed');
  } catch (error) {
    logger.error('❌ Database setup error:', error);
    throw error;
  }
};

// Create super admin user
const createSuperAdmin = async () => {
  try {
    const superAdminEmail = process.env.SUPER_ADMIN_EMAIL || 'admin@vibratemonitor.com';
    
    // Check if super admin exists
    const existingAdmin = await databases.users.find({
      selector: { email: superAdminEmail }
    });

    if (existingAdmin.docs.length === 0) {
      const hashedPassword = await bcrypt.hash(
        process.env.SUPER_ADMIN_PASSWORD || 'SuperAdmin123!',
        12
      );

      const superAdmin = {
        _id: `user_${uuidv4()}`,
        email: superAdminEmail,
        password: hashedPassword,
        name: 'مدیر سیستم',
        role: 'super_admin',
        isApproved: true,
        isActive: true,
        createdAt: new Date().toISOString(),
        approvedAt: new Date().toISOString(),
        approvedBy: 'system'
      };

      await databases.users.put(superAdmin);
      logger.info('✅ Super admin created successfully');
    } else {
      logger.info('ℹ️ Super admin already exists');
    }
  } catch (error) {
    logger.error('❌ Error creating super admin:', error);
  }
};

// Audit logging function
const logAudit = async (userId, action, details = {}) => {
  try {
    const auditLog = {
      _id: `audit_${Date.now()}_${uuidv4()}`,
      userId,
      action,
      details,
      timestamp: new Date().toISOString(),
      ip: details.ip || 'unknown'
    };

    await databases.auditLogs.put(auditLog);
  } catch (error) {
    logger.error('Error logging audit:', error);
  }
};

// Initialize databases
setupDatabases().catch(error => {
  logger.error('Failed to setup databases:', error);
  process.exit(1);
});

module.exports = {
  databases,
  logAudit
};