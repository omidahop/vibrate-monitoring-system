const express = require('express');
const { body } = require('express-validator');
const dataController = require('../controllers/dataController');
const { authenticateUser, requireApproval } = require('../middleware/auth');

const router = express.Router();

// All data routes require authentication and approval
router.use(authenticateUser, requireApproval);

// Validation rules
const saveDataValidation = [
  body('unit')
    .isIn(['DRI1', 'DRI2'])
    .withMessage('واحد نامعتبر است'),
  body('equipment')
    .notEmpty()
    .withMessage('تجهیز الزامی است'),
  body('date')
    .isISO8601()
    .withMessage('تاریخ نامعتبر است'),
  body('parameters')
    .isObject()
    .withMessage('پارامترها باید آبجکت باشد'),
  body('notes')
    .optional()
    .isLength({ max: 500 })
    .withMessage('یادداشت نباید بیشتر از 500 کاراکتر باشد')
];

// Routes
router.get('/', dataController.getVibrateData);
router.post('/', saveDataValidation, dataController.saveVibrateData);
router.delete('/:dataId', dataController.deleteVibrateData);
router.get('/analysis', dataController.getDataAnalysis);
router.get('/config', dataController.getConfigurations);

module.exports = router;