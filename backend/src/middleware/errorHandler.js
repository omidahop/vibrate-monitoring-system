const { logger } = require('../config/logger');

const errorHandler = (err, req, res, next) => {
  logger.error('Error occurred:', {
    error: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });

  // Default error
  let error = { ...err };
  error.message = err.message;

  // CouchDB/PouchDB errors
  if (err.name === 'not_found') {
    const message = 'منبع مورد نظر یافت نشد';
    error = { message, statusCode: 404 };
  }

  // Validation errors
  if (err.name === 'ValidationError') {
    const message = Object.values(err.errors).map(val => val.message);
    error = { message, statusCode: 400 };
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    const message = 'توکن نامعتبر است';
    error = { message, statusCode: 401 };
  }

  if (err.name === 'TokenExpiredError') {
    const message = 'توکن منقضی شده است';
    error = { message, statusCode: 401 };
  }

  // Duplicate key error
  if (err.code === 11000) {
    const message = 'اطلاعات تکراری وارد شده است';
    error = { message, statusCode: 400 };
  }

  res.status(error.statusCode || 500).json({
    success: false,
    error: error.message || 'خطای داخلی سرور'
  });
};

module.exports = { errorHandler };