const express = require('express');
const { body } = require('express-validator');
const authController = require('../controllers/authController');
const { authenticateUser } = require('../middleware/auth');

const router = express.Router();

// Validation rules
const registerValidation = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('ایمیل نامعتبر است'),
  body('password')
    .isLength({ min: 6 })
    .withMessage('رمز عبور باید حداقل 6 کاراکتر باشد')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('رمز عبور باید شامل حداقل یک حرف بزرگ، یک حرف کوچک و یک عدد باشد'),
  body('name')
    .notEmpty()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('نام باید بین 2 تا 50 کاراکتر باشد'),
  body('role')
    .optional()
    .isIn(['operator', 'technician', 'engineer', 'supervisor'])
    .withMessage('نقش کاربری نامعتبر است')
];

const loginValidation = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('ایمیل نامعتبر است'),
  body('password')
    .notEmpty()
    .withMessage('رمز عبور الزامی است')
];

const updateProfileValidation = [
  body('name')
    .notEmpty()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('نام باید بین 2 تا 50 کاراکتر باشد')
];

const changePasswordValidation = [
  body('currentPassword')
    .notEmpty()
    .withMessage('رمز عبور فعلی الزامی است'),
  body('newPassword')
    .isLength({ min: 6 })
    .withMessage('رمز عبور جدید باید حداقل 6 کاراکتر باشد')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('رمز عبور جدید باید شامل حداقل یک حرف بزرگ، یک حرف کوچک و یک عدد باشد')
];

// Routes
router.post('/register', registerValidation, authController.register);
router.post('/login', loginValidation, authController.login);
router.get('/profile', authenticateUser, authController.getProfile);
router.put('/profile', authenticateUser, updateProfileValidation, authController.updateProfile);
router.put('/change-password', authenticateUser, changePasswordValidation, authController.changePassword);
router.post('/logout', authenticateUser, authController.logout);

module.exports = router;