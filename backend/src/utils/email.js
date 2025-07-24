const nodemailer = require('nodemailer');
const { logger } = require('../config/logger');

class EmailService {
  constructor() {
    this.transporter = null;
    this.isConfigured = false;
    this.initializeTransporter();
  }

  initializeTransporter() {
    try {
      // Check if email configuration is provided
      if (!process.env.EMAIL_HOST || !process.env.EMAIL_USER || !process.env.EMAIL_PASSWORD) {
        logger.warn('Email configuration not provided. Email service will be disabled.');
        return;
      }

      // Create transporter
      this.transporter = nodemailer.createTransporter({
        host: process.env.EMAIL_HOST,
        port: parseInt(process.env.EMAIL_PORT) || 587,
        secure: process.env.EMAIL_PORT === '465', // true for 465, false for other ports
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASSWORD
        },
        tls: {
          rejectUnauthorized: false
        }
      });

      this.isConfigured = true;
      logger.info('Email service initialized successfully');

      // Verify connection
      this.verifyConnection();

    } catch (error) {
      logger.error('Failed to initialize email service:', error);
      this.isConfigured = false;
    }
  }

  async verifyConnection() {
    if (!this.isConfigured) return false;

    try {
      await this.transporter.verify();
      logger.info('Email service connection verified');
      return true;
    } catch (error) {
      logger.error('Email service connection failed:', error);
      this.isConfigured = false;
      return false;
    }
  }

  async sendEmail(to, subject, html, text = null) {
    if (!this.isConfigured) {
      logger.warn('Email service not configured. Cannot send email.');
      return { success: false, error: 'Email service not configured' };
    }

    try {
      const mailOptions = {
        from: {
          name: 'سیستم ثبت داده‌های ویبره',
          address: process.env.EMAIL_FROM || process.env.EMAIL_USER
        },
        to,
        subject,
        html,
        text: text || this.stripHtml(html)
      };

      const result = await this.transporter.sendMail(mailOptions);
      
      logger.info(`Email sent successfully to ${to}: ${subject}`);
      
      return {
        success: true,
        messageId: result.messageId,
        response: result.response
      };

    } catch (error) {
      logger.error(`Failed to send email to ${to}:`, error);
      
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Welcome email for new users
  async sendWelcomeEmail(user) {
    const subject = 'خوش آمدید به سیستم ثبت داده‌های ویبره';
    const html = `
      <!DOCTYPE html>
      <html dir="rtl" lang="fa">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body {
            font-family: 'Tahoma', sans-serif;
            direction: rtl;
            text-align: right;
            background-color: #f5f5f5;
            margin: 0;
            padding: 20px;
          }
          .container {
            max-width: 600px;
            margin: 0 auto;
            background: white;
            border-radius: 10px;
            padding: 30px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
          }
          .header {
            text-align: center;
            border-bottom: 2px solid #2563eb;
            padding-bottom: 20px;
            margin-bottom: 30px;
          }
          .logo {
            font-size: 24px;
            font-weight: bold;
            color: #2563eb;
            margin-bottom: 10px;
          }
          .content {
            line-height: 1.8;
            color: #333;
          }
          .highlight {
            background-color: #eff6ff;
            padding: 15px;
            border-radius: 5px;
            border-right: 4px solid #2563eb;
            margin: 20px 0;
          }
          .footer {
            text-align: center;
            margin-top: 30px;
            padding-top: 20px;
            border-top: 1px solid #eee;
            color: #666;
            font-size: 14px;
          }
          .button {
            display: inline-block;
            background-color: #2563eb;
            color: white;
            padding: 12px 24px;
            text-decoration: none;
            border-radius: 5px;
            margin: 20px 0;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="logo">سیستم ثبت داده‌های ویبره</div>
            <p>سیستم پیشرفته مانیتورینگ تجهیزات</p>
          </div>
          
          <div class="content">
            <h2>سلام ${user.name} عزیز،</h2>
            
            <p>از ثبت‌نام شما در سیستم ثبت داده‌های ویبره تجهیزات استقبال می‌کنیم!</p>
            
            <div class="highlight">
              <strong>اطلاعات حساب کاربری شما:</strong><br>
              نام: ${user.name}<br>
              ایمیل: ${user.email}<br>
              نقش: ${this.getRoleName(user.role)}<br>
              تاریخ ثبت‌نام: ${new Date().toLocaleDateString('fa-IR')}
            </div>
            
            <p><strong>مرحله بعدی:</strong> حساب کاربری شما در انتظار تایید مدیر سیستم است. پس از تایید، می‌توانید از تمامی امکانات سیستم استفاده کنید.</p>
            
            <p>امکانات در دسترس شما پس از تایید:</p>
            <ul>
              <li>ثبت داده‌های ویبره تجهیزات</li>
              <li>مشاهده گزارشات و نمودارها</li>
              <li>دسترسی به آنالیزهای پیشرفته</li>
              <li>عملکرد آفلاین و همگام‌سازی خودکار</li>
            </ul>
            
            <p>در صورت داشتن سؤال، با تیم پشتیبانی تماس بگیرید.</p>
            
            <p>موفق باشید!</p>
          </div>
          
          <div class="footer">
            <p>این ایمیل به صورت خودکار ارسال شده است.</p>
            <p>© 2024 سیستم ثبت داده‌های ویبره - تمامی حقوق محفوظ است.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    return await this.sendEmail(user.email, subject, html);
  }

  // Account approval notification
  async sendApprovalNotification(user) {
    const subject = 'حساب کاربری شما تایید شد!';
    const html = `
      <!DOCTYPE html>
      <html dir="rtl" lang="fa">
      <head>
        <meta charset="UTF-8">
        <style>
          body {
            font-family: 'Tahoma', sans-serif;
            direction: rtl;
            text-align: right;
            background-color: #f0f9ff;
            margin: 0;
            padding: 20px;
          }
          .container {
            max-width: 600px;
            margin: 0 auto;
            background: white;
            border-radius: 10px;
            padding: 30px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
          }
          .success-header {
            text-align: center;
            color: #10b981;
            margin-bottom: 30px;
          }
          .success-icon {
            font-size: 48px;
            margin-bottom: 20px;
          }
          .content {
            line-height: 1.8;
            color: #333;
          }
          .button {
            display: inline-block;
            background-color: #10b981;
            color: white;
            padding: 15px 30px;
            text-decoration: none;
            border-radius: 5px;
            margin: 20px 0;
            text-align: center;
          }
          .footer {
            text-align: center;
            margin-top: 30px;
            padding-top: 20px;
            border-top: 1px solid #eee;
            color: #666;
            font-size: 14px;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="success-header">
            <div class="success-icon">✅</div>
            <h1>حساب شما تایید شد!</h1>
          </div>
          
          <div class="content">
            <p>سلام ${user.name} عزیز،</p>
            
            <p>خبر خوش! حساب کاربری شما توسط مدیر سیستم تایید شد و اکنون می‌توانید از تمامی امکانات استفاده کنید.</p>
            
            <div style="background-color: #ecfdf5; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h3 style="color: #10b981; margin-top: 0;">چه کاری می‌توانید انجام دهید:</h3>
              <ul style="margin: 10px 0;">
                <li>ثبت داده‌های ویبره برای تجهیزات مختلف</li>
                <li>مشاهده گزارشات تاریخی و نمودارها</li>
                <li>دسترسی به آنالیزهای آماری پیشرفته</li>
                <li>استفاده از قابلیت‌های آفلاین</li>
              </ul>
            </div>
            
            <div style="text-align: center;">
              <a href="${process.env.FRONTEND_URL}" class="button">
                ورود به سیستم
              </a>
            </div>
            
            <p>اگر سؤالی داشتید، با تیم پشتیبانی در تماس باشید.</p>
            
            <p>موفق باشید!</p>
          </div>
          
          <div class="footer">
            <p>تیم سیستم ثبت داده‌های ویبره</p>
          </div>
        </div>
      </body>
      </html>
    `;

    return await this.sendEmail(user.email, subject, html);
  }

  // Account deactivation notification
  async sendDeactivationNotification(user, reason) {
    const subject = 'حساب کاربری شما غیرفعال شد';
    const html = `
      <!DOCTYPE html>
      <html dir="rtl" lang="fa">
      <head>
        <meta charset="UTF-8">
        <style>
          body {
            font-family: 'Tahoma', sans-serif;
            direction: rtl;
            text-align: right;
            background-color: #fef2f2;
            margin: 0;
            padding: 20px;
          }
          .container {
            max-width: 600px;
            margin: 0 auto;
            background: white;
            border-radius: 10px;
            padding: 30px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
          }
          .warning-header {
            text-align: center;
            color: #ef4444;
            margin-bottom: 30px;
          }
          .content {
            line-height: 1.8;
            color: #333;
          }
          .reason-box {
            background-color: #fef2f2;
            border: 1px solid #fecaca;
            padding: 15px;
            border-radius: 5px;
            margin: 20px 0;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="warning-header">
            <h1>حساب کاربری غیرفعال شد</h1>
          </div>
          
          <div class="content">
            <p>سلام ${user.name} عزیز،</p>
            
            <p>متأسفانه حساب کاربری شما در سیستم ثبت داده‌های ویبره غیرفعال شده است.</p>
            
            ${reason ? `
            <div class="reason-box">
              <strong>دلیل غیرفعال‌سازی:</strong><br>
              ${reason}
            </div>
            ` : ''}
            
            <p>برای اطلاعات بیشتر و یا درخواست بررسی مجدد، با مدیر سیستم تماس بگیرید.</p>
            
            <p>با تشکر</p>
          </div>
        </div>
      </body>
      </html>
    `;

    return await this.sendEmail(user.email, subject, html);
  }

  // Password reset email
  async sendPasswordResetNotification(user) {
    const subject = 'رمز عبور شما توسط مدیر تغییر یافت';
    const html = `
      <!DOCTYPE html>
      <html dir="rtl" lang="fa">
      <head>
        <meta charset="UTF-8">
        <style>
          body {
            font-family: 'Tahoma', sans-serif;
            direction: rtl;
            text-align: right;
            background-color: #fffbeb;
            margin: 0;
            padding: 20px;
          }
          .container {
            max-width: 600px;
            margin: 0 auto;
            background: white;
            border-radius: 10px;
            padding: 30px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
          }
          .info-header {
            text-align: center;
            color: #f59e0b;
            margin-bottom: 30px;
          }
          .security-notice {
            background-color: #fffbeb;
            border: 1px solid #fed7aa;
            padding: 15px;
            border-radius: 5px;
            margin: 20px 0;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="info-header">
            <h1>تغییر رمز عبور</h1>
          </div>
          
          <div class="content">
            <p>سلام ${user.name} عزیز،</p>
            
            <p>رمز عبور حساب کاربری شما توسط مدیر سیستم تغییر یافت.</p>
            
            <div class="security-notice">
              <h3 style="margin-top: 0;">نکات امنیتی:</h3>
              <ul>
                <li>رمز عبور جدید توسط مدیر به شما اطلاع داده شده است</li>
                <li>پس از ورود اول، رمز عبور خود را تغییر دهید</li>
                <li>از رمز عبور قوی استفاده کنید</li>
                <li>رمز عبور خود را با دیگران به اشتراک نگذارید</li>
              </ul>
            </div>
            
            <p>اگر شما درخواست این تغییر را نداده‌اید، فوراً با مدیر سیستم تماس بگیرید.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    return await this.sendEmail(user.email, subject, html);
  }

  // Admin notification for new user registration
  async sendNewUserNotificationToAdmin(user, adminEmail) {
    const subject = 'کاربر جدید در انتظار تایید';
    const html = `
      <!DOCTYPE html>
      <html dir="rtl" lang="fa">
      <head>
        <meta charset="UTF-8">
        <style>
          body { font-family: 'Tahoma', sans-serif; direction: rtl; }
          .container { max-width: 600px; margin: 0 auto; background: white; padding: 30px; }
          .user-info { background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <h2>کاربر جدید در انتظار تایید</h2>
          
          <p>کاربر جدیدی در سیستم ثبت‌نام کرده است:</p>
          
          <div class="user-info">
            <strong>نام:</strong> ${user.name}<br>
            <strong>ایمیل:</strong> ${user.email}<br>
            <strong>نقش:</strong> ${this.getRoleName(user.role)}<br>
            <strong>تاریخ ثبت‌نام:</strong> ${new Date().toLocaleDateString('fa-IR')}
          </div>
          
          <p>برای تایید یا رد این کاربر، به پنل مدیریت مراجعه کنید.</p>
        </div>
      </body>
      </html>
    `;

    return await this.sendEmail(adminEmail, subject, html);
  }

  // System notification email
  async sendSystemNotification(email, title, message, type = 'info') {
    const colors = {
      info: '#3b82f6',
      success: '#10b981',
      warning: '#f59e0b',
      error: '#ef4444'
    };

    const html = `
      <!DOCTYPE html>
      <html dir="rtl" lang="fa">
      <head>
        <meta charset="UTF-8">
        <style>
          body { font-family: 'Tahoma', sans-serif; direction: rtl; }
          .container { max-width: 600px; margin: 0 auto; background: white; padding: 30px; }
          .notification { 
            border-right: 4px solid ${colors[type]}; 
            background: ${colors[type]}10; 
            padding: 20px; 
            margin: 20px 0; 
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h2 style="color: ${colors[type]};">${title}</h2>
          <div class="notification">
            ${message}
          </div>
          <p>تاریخ: ${new Date().toLocaleString('fa-IR')}</p>
        </div>
      </body>
      </html>
    `;

    return await this.sendEmail(email, title, html);
  }

  // Helper method to strip HTML for plain text
  stripHtml(html) {
    return html.replace(/<[^>]*>/g, '').replace(/&[^;]+;/g, ' ');
  }

  // Helper method to get role name in Persian
  getRoleName(role) {
    const roleNames = {
      operator: 'اپراتور',
      technician: 'تکنسین',
      engineer: 'مهندس',
      supervisor: 'سرپرست',
      admin: 'مدیر',
      super_admin: 'مدیر کل'
    };
    return roleNames[role] || role;
  }
}

// Create single instance
const emailService = new EmailService();

module.exports = emailService;