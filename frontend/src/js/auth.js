// Authentication and user management
class AuthManager {
  constructor() {
    this.currentUser = Utils.getItem('currentUser');
    this.isAuthenticated = !!api.token;
    this.checkInterval = null;
  }

  // Initialize authentication system
  init() {
    this.setupEventListeners();
    this.startTokenValidation();
    
    if (this.isAuthenticated && this.currentUser) {
      this.showMainApplication();
    } else {
      this.showLoginScreen();
    }
  }

  setupEventListeners() {
    // Form submissions
    document.addEventListener('submit', (e) => {
      if (e.target.id === 'loginForm') {
        e.preventDefault();
        this.handleLogin();
      } else if (e.target.id === 'registerForm') {
        e.preventDefault();
        this.handleRegister();
      }
    });

    // Password visibility toggles
    document.addEventListener('click', (e) => {
      if (e.target.classList.contains('password-toggle')) {
        this.togglePasswordVisibility(e.target);
      }
    });
  }

  startTokenValidation() {
    // Check token validity every 5 minutes
    this.checkInterval = setInterval(async () => {
      if (this.isAuthenticated) {
        try {
          await api.getProfile();
        } catch (error) {
          if (error.status === 401) {
            this.logout();
          }
        }
      }
    }, 5 * 60 * 1000);
  }

  async handleLogin() {
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    const loginBtn = document.getElementById('loginBtn');

    if (!email || !password) {
      Utils.showNotification('لطفاً تمام فیلدها را پر کنید', 'error');
      return;
    }

    if (!Utils.validateEmail(email)) {
      Utils.showNotification('فرمت ایمیل صحیح نیست', 'error');
      return;
    }

    Utils.showLoading('loginBtn');

    try {
      const response = await api.login({ email, password });
      
      this.currentUser = response.user;
      this.isAuthenticated = true;
      
      Utils.showNotification(response.message || 'وارد شدید', 'success');
      this.showMainApplication();
      
    } catch (error) {
      if (error.code === 'NEEDS_APPROVAL') {
        this.showApprovalPending();
      } else {
        Utils.showNotification(error.message || 'خطا در ورود', 'error');
      }
    } finally {
      Utils.hideLoading('loginBtn');
    }
  }

  async handleRegister() {
    const name = document.getElementById('registerName').value.trim();
    const email = document.getElementById('registerEmail').value.trim();
    const password = document.getElementById('registerPassword').value;
    const role = document.getElementById('registerRole').value;

    // Validation
    if (!name || !email || !password || !role) {
      Utils.showNotification('لطفاً تمام فیلدها را پر کنید', 'error');
      return;
    }

    if (name.length < 2 || name.length > 50) {
      Utils.showNotification('نام باید بین 2 تا 50 کاراکتر باشد', 'error');
      return;
    }

    if (!Utils.validateEmail(email)) {
      Utils.showNotification('فرمت ایمیل صحیح نیست', 'error');
      return;
    }

    if (!Utils.validatePassword(password)) {
      Utils.showNotification('رمز عبور باید شامل حداقل یک حرف بزرگ، یک حرف کوچک و یک عدد باشد', 'error');
      return;
    }

    Utils.showLoading('registerBtn');

    try {
      const response = await api.register({
        name,
        email,
        password,
        role
      });
      
      Utils.showNotification(response.message || 'ثبت‌نام انجام شد', 'success');
      this.showApprovalPending();
      
    } catch (error) {
      Utils.showNotification(error.message || 'خطا در ثبت‌نام', 'error');
    } finally {
      Utils.hideLoading('registerBtn');
    }
  }

  async logout() {
    try {
      await api.logout();
    } catch (error) {
      console.warn('Logout API error:', error);
    }
    
    this.currentUser = null;
    this.isAuthenticated = false;
    
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }
    
    Utils.showNotification('از سیستم خارج شدید', 'info');
    this.showLoginScreen();
  }

  showLoginScreen() {
    document.getElementById('loadingScreen').classList.add('d-none');
    document.getElementById('loginScreen').classList.remove('d-none');
    document.getElementById('mainApp').classList.add('d-none');
    
    this.showLoginForm();
  }

  showMainApplication() {
    document.getElementById('loadingScreen').classList.add('d-none');
    document.getElementById('loginScreen').classList.add('d-none');
    document.getElementById('mainApp').classList.remove('d-none');
    
    // Initialize main app
    if (window.app) {
      window.app.init();
    }
  }

  showLoginForm() {
    document.getElementById('loginForm').classList.remove('d-none');
    document.getElementById('registerForm').classList.add('d-none');
    document.getElementById('approvalPending').classList.add('d-none');
    
    // Clear forms
    document.getElementById('loginEmail').value = '';
    document.getElementById('loginPassword').value = '';
  }

  showRegisterForm() {
    document.getElementById('loginForm').classList.add('d-none');
    document.getElementById('registerForm').classList.remove('d-none');
    document.getElementById('approvalPending').classList.add('d-none');
    
    // Clear forms
    document.getElementById('registerName').value = '';
    document.getElementById('registerEmail').value = '';
    document.getElementById('registerPassword').value = '';
    document.getElementById('registerRole').value = 'operator';
  }

  showApprovalPending() {
    document.getElementById('loginForm').classList.add('d-none');
    document.getElementById('registerForm').classList.add('d-none');
    document.getElementById('approvalPending').classList.remove('d-none');
  }

  togglePasswordVisibility(button) {
    const input = button.previousElementSibling;
    const icon = button.querySelector('i');
    
    if (input.type === 'password') {
      input.type = 'text';
      icon.classList.remove('fa-eye');
      icon.classList.add('fa-eye-slash');
    } else {
      input.type = 'password';
      icon.classList.remove('fa-eye-slash');
      icon.classList.add('fa-eye');
    }
  }

  getCurrentUser() {
    return this.currentUser;
  }

  hasRole(roles) {
    if (!this.currentUser) return false;
    if (typeof roles === 'string') roles = [roles];
    return roles.includes(this.currentUser.role);
  }

  isAdmin() {
    return this.hasRole(['admin', 'super_admin']);
  }

  isSuperAdmin() {
    return this.hasRole(['super_admin']);
  }
}

// Global auth functions for HTML onclick handlers
window.handleLogin = () => window.auth.handleLogin();
window.handleRegister = () => window.auth.handleRegister();
window.handleLogout = () => window.auth.logout();
window.showLoginForm = () => window.auth.showLoginForm();
window.showRegisterForm = () => window.auth.showRegisterForm();
window.togglePasswordVisibility = (inputId) => {
  const input = document.getElementById(inputId);
  const button = input.nextElementSibling;
  window.auth.togglePasswordVisibility(button);
};

// Create global auth instance
window.auth = new AuthManager();