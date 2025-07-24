const { EQUIPMENT_CONFIG, PARAMETER_CONFIG } = require('../controllers/dataController');

// Validate equipment ID
const isValidEquipment = (equipmentId) => {
  return EQUIPMENT_CONFIG.some(eq => eq.id === equipmentId);
};

// Validate parameter ID
const isValidParameter = (parameterId) => {
  return PARAMETER_CONFIG.some(param => param.id === parameterId);
};

// Validate parameter value
const isValidParameterValue = (parameterId, value) => {
  const parameter = PARAMETER_CONFIG.find(p => p.id === parameterId);
  if (!parameter) return false;

  const numValue = parseFloat(value);
  if (isNaN(numValue) || numValue < 0 || numValue > parameter.maxValue) {
    return false;
  }

  // Check decimal places (max 2)
  const decimalPlaces = (numValue.toString().split('.')[1] || '').length;
  return decimalPlaces <= 2;
};

// Validate email format
const isValidEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

// Validate password strength
const isValidPassword = (password) => {
  // At least 6 characters, one uppercase, one lowercase, one number
  const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{6,}$/;
  return passwordRegex.test(password);
};

// Sanitize string input
const sanitizeString = (str) => {
  if (typeof str !== 'string') return '';
  return str.trim().replace(/[<>]/g, '');
};

module.exports = {
  isValidEquipment,
  isValidParameter,
  isValidParameterValue,
  isValidEmail,
  isValidPassword,
  sanitizeString
};