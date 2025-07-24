const express = require('express');
const { authenticateUser } = require('../middleware/auth');

const router = express.Router();

// All user routes require authentication
router.use(authenticateUser);

// Get user list (for general users - limited info)
router.get('/', async (req, res) => {
  try {
    const { databases } = require('../config/database');
    
    // Only return approved and active users with limited info
    const result = await databases.users.find({
      selector: { 
        isApproved: true,
        isActive: true 
      },
      fields: ['_id', 'name', 'role', 'email']
    });

    const users = result.docs.map(user => ({
      id: user._id,
      name: user.name,
      role: user.role,
      email: user.email
    }));

    res.json({
      success: true,
      users
    });
  } catch (error) {
    res.status(500).json({
      error: 'خطا در دریافت لیست کاربران'
    });
  }
});

module.exports = router;