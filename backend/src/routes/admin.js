const express = require('express');
const { body } = require('express-validator');
const adminController = require('../controllers/adminController');
const { authenticateUser } = require('../middleware/auth');
const { adminOnly, superAdminOnly } = require('../middleware/adminAuth');

const router = express.Router();

// All admin routes require authentication and admin role
router.use(authenticateUser);

// Validation rules
const changeRoleValidation = [
  body('role')
    .isIn(['operator', 'technician', 'engineer', 'supervisor', 'admin'])
    .withMessage('نقش کاربری نامعتبر است')
];

const resetPasswordValidation = [
  body('newPassword')
    .isLength({ min: 6 })
    .withMessage('رمز عبور باید حداقل 6 کاراکتر باشد')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('رمز عبور باید شامل حداقل یک حرف بزرگ، یک حرف کوچک و یک عدد باشد')
];

const deactivateUserValidation = [
  body('reason')
    .optional()
    .isLength({ max: 500 })
    .withMessage('دلیل غیرفعال‌سازی نباید بیشتر از 500 کاراکتر باشد')
];

// User management routes
router.get('/users', adminOnly, adminController.getAllUsers);
router.get('/users/pending', adminOnly, adminController.getPendingUsers);
router.post('/users/:userId/approve', adminOnly, adminController.approveUser);
router.post('/users/:userId/deactivate', adminOnly, deactivateUserValidation, adminController.deactivateUser);
router.put('/users/:userId/role', adminOnly, changeRoleValidation, adminController.changeUserRole);
router.post('/users/:userId/reset-password', superAdminOnly, resetPasswordValidation, adminController.resetUserPassword);

// System monitoring routes
router.get('/stats', adminOnly, adminController.getSystemStats);
router.get('/audit-logs', adminOnly, adminController.getAuditLogs);

module.exports = router;