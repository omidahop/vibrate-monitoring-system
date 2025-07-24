// Admin panel functionality
class AdminManager {
  constructor() {
    this.currentView = 'dashboard';
    this.users = [];
    this.pendingUsers = [];
    this.stats = {};
  }

  async init() {
    if (!auth.isAdmin()) {
      console.warn('Admin panel access denied');
      return;
    }

    await this.loadAdminData();
    this.renderAdminPanel();
    this.setupEventListeners();
  }

  async loadAdminData() {
    try {
      const [usersData, pendingData, statsData] = await Promise.all([
        api.getAllUsers(),
        api.getPendingUsers(),
        api.getSystemStats()
      ]);

      this.users = usersData.users || [];
      this.pendingUsers = pendingData.users || [];
      this.stats = statsData.stats || {};
      
    } catch (error) {
      console.error('Error loading admin data:', error);
      Utils.showNotification('خطا در بارگذاری داده‌های مدیریت', 'error');
    }
  }

  renderAdminPanel() {
    const adminContent = document.getElementById('adminContent');
    if (!adminContent) return;

    adminContent.innerHTML = `
      <div class="admin-tabs">
        <button class="admin-tab-btn ${this.currentView === 'dashboard' ? 'active' : ''}" 
                onclick="adminManager.switchView('dashboard')">
          <i class="fas fa-tachometer-alt"></i>
          داشبورد
        </button>
        <button class="admin-tab-btn ${this.currentView === 'users' ? 'active' : ''}" 
                onclick="adminManager.switchView('users')">
          <i class="fas fa-users"></i>
          مدیریت کاربران
        </button>
        <button class="admin-tab-btn ${this.currentView === 'pending' ? 'active' : ''}" 
                onclick="adminManager.switchView('pending')">
          <i class="fas fa-clock"></i>
          در انتظار تایید
          ${this.pendingUsers.length > 0 ? `<span class="badge">${this.pendingUsers.length}</span>` : ''}
        </button>
        <button class="admin-tab-btn ${this.currentView === 'logs' ? 'active' : ''}" 
                onclick="adminManager.switchView('logs')">
          <i class="fas fa-history"></i>
          لاگ‌های سیستم
        </button>
      </div>
      
      <div class="admin-content">
        ${this.renderCurrentView()}
      </div>
    `;
  }

  renderCurrentView() {
    switch (this.currentView) {
      case 'dashboard':
        return this.renderDashboard();
      case 'users':
        return this.renderUsersManagement();
      case 'pending':
        return this.renderPendingUsers();
      case 'logs':
        return this.renderSystemLogs();
      default:
        return '<div class="text-center p-5">بخش مورد نظر یافت نشد</div>';
    }
  }

  renderDashboard() {
    return `
      <div class="admin-dashboard">
        <h3 class="mb-4">آمار کلی سیستم</h3>
        
        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-icon">
              <i class="fas fa-users"></i>
            </div>
            <div class="stat-content">
              <div class="stat-number">${this.stats.users?.total || 0}</div>
              <div class="stat-label">کل کاربران</div>
            </div>
          </div>
          
          <div class="stat-card">
            <div class="stat-icon">
              <i class="fas fa-user-check"></i>
            </div>
            <div class="stat-content">
              <div class="stat-number">${this.stats.users?.approved || 0}</div>
              <div class="stat-label">کاربران تایید شده</div>
            </div>
          </div>
          
          <div class="stat-card warning">
            <div class="stat-icon">
              <i class="fas fa-hourglass-half"></i>
            </div>
            <div class="stat-content">
              <div class="stat-number">${this.stats.users?.pending || 0}</div>
              <div class="stat-label">در انتظار تایید</div>
            </div>
          </div>
          
          <div class="stat-card success">
            <div class="stat-icon">
              <i class="fas fa-database"></i>
            </div>
            <div class="stat-content">
              <div class="stat-number">${this.stats.data?.totalRecords || 0}</div>
              <div class="stat-label">کل رکوردهای ثبت شده</div>
            </div>
          </div>
          
          <div class="stat-card info">
            <div class="stat-icon">
              <i class="fas fa-calendar-day"></i>
            </div>
            <div class="stat-content">
              <div class="stat-number">${this.stats.data?.todayRecords || 0}</div>
              <div class="stat-label">رکوردهای امروز</div>
            </div>
          </div>
          
          <div class="stat-card primary">
            <div class="stat-icon">
              <i class="fas fa-calendar-alt"></i>
            </div>
            <div class="stat-content">
              <div class="stat-number">${this.stats.data?.uniqueDates || 0}</div>
              <div class="stat-label">روزهای فعال</div>
            </div>
          </div>
        </div>

        <div class="recent-activity mt-4">
          <h4>آخرین فعالیت‌ها</h4>
          <div class="activity-list">
            ${this.renderRecentActivity()}
          </div>
        </div>

        <div class="user-roles-chart mt-4">
          <h4>توزیع نقش‌های کاربری</h4>
          <div class="roles-grid">
            ${Object.entries(this.stats.users?.byRole || {}).map(([role, count]) => `
              <div class="role-stat">
                <div class="role-name">${this.getRoleName(role)}</div>
                <div class="role-count">${count}</div>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    `;
  }

  renderUsersManagement() {
    return `
      <div class="users-management">
        <div class="users-header">
          <h3>مدیریت کاربران</h3>
          <div class="users-filters">
            <select class="form-control" id="roleFilter" onchange="adminManager.filterUsers()">
              <option value="">همه نقش‌ها</option>
              <option value="operator">اپراتور</option>
              <option value="technician">تکنسین</option>
              <option value="engineer">مهندس</option>
              <option value="supervisor">سرپرست</option>
              <option value="admin">مدیر</option>
            </select>
            <select class="form-control" id="statusFilter" onchange="adminManager.filterUsers()">
              <option value="">همه وضعیت‌ها</option>
              <option value="approved">تایید شده</option>
              <option value="pending">در انتظار تایید</option>
              <option value="inactive">غیرفعال</option>
            </select>
          </div>
        </div>
        
        <div class="users-table-container">
          <table class="table">
            <thead>
              <tr>
                <th>نام</th>
                <th>ایمیل</th>
                <th>نقش</th>
                <th>وضعیت</th>
                <th>تاریخ عضویت</th>
                <th>عملیات</th>
              </tr>
            </thead>
            <tbody id="usersTableBody">
              ${this.renderUsersTable()}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  renderUsersTable() {
    if (this.users.length === 0) {
      return '<tr><td colspan="6" class="text-center">کاربری یافت نشد</td></tr>';
    }

    return this.users.map(user => `
      <tr>
        <td>${Utils.escapeHtml(user.name)}</td>
        <td>${Utils.escapeHtml(user.email)}</td>
        <td>
          <span class="role-badge role-${user.role}">${this.getRoleName(user.role)}</span>
        </td>
        <td>
          <span class="status-badge ${user.isApproved ? 'approved' : 'pending'} ${!user.isActive ? 'inactive' : ''}">
            ${!user.isActive ? 'غیرفعال' : user.isApproved ? 'تایید شده' : 'در انتظار تایید'}
          </span>
        </td>
        <td>${Utils.formatDate(user.createdAt)}</td>
        <td>
          <div class="action-buttons">
            ${!user.isApproved && user.isActive ? `
              <button class="btn btn-sm btn-success" onclick="adminManager.approveUser('${user._id}')">
                <i class="fas fa-check"></i>
                تایید
              </button>
            ` : ''}
            
            ${user.isActive ? `
              <button class="btn btn-sm btn-warning" onclick="adminManager.showChangeRoleModal('${user._id}', '${user.role}')">
                <i class="fas fa-user-tag"></i>
                تغییر نقش
              </button>
              
              <button class="btn btn-sm btn-error" onclick="adminManager.showDeactivateModal('${user._id}', '${Utils.escapeHtml(user.name)}')">
                <i class="fas fa-user-slash"></i>
                غیرفعال
              </button>
            ` : ''}
            
            ${auth.isSuperAdmin() ? `
              <button class="btn btn-sm btn-secondary" onclick="adminManager.showResetPasswordModal('${user._id}', '${Utils.escapeHtml(user.name)}')">
                <i class="fas fa-key"></i>
                تغییر رمز
              </button>
            ` : ''}
          </div>
        </td>
      </tr>
    `).join('');
  }

  renderPendingUsers() {
    if (this.pendingUsers.length === 0) {
      return `
        <div class="text-center p-5">
          <i class="fas fa-check-circle text-success" style="font-size: 4rem;"></i>
          <h3 class="mt-3">همه کاربران تایید شده‌اند</h3>
          <p class="text-secondary">در حال حاضر کاربری در انتظار تایید نیست</p>
        </div>
      `;
    }

    return `
      <div class="pending-users">
        <h3 class="mb-4">کاربران در انتظار تایید (${this.pendingUsers.length})</h3>
        
        <div class="pending-users-grid">
          ${this.pendingUsers.map(user => `
            <div class="pending-user-card">
              <div class="user-header">
                <div class="user-avatar">
                  ${user.name.charAt(0).toUpperCase()}
                </div>
                <div class="user-info">
                  <h4>${Utils.escapeHtml(user.name)}</h4>
                  <p>${Utils.escapeHtml(user.email)}</p>
                  <span class="role-badge role-${user.role}">${this.getRoleName(user.role)}</span>
                </div>
              </div>
              
              <div class="user-meta">
                <div class="meta-item">
                  <i class="fas fa-calendar"></i>
                  <span>درخواست: ${Utils.formatDate(user.createdAt)}</span>
                </div>
              </div>
              
              <div class="user-actions">
                <button class="btn btn-success" onclick="adminManager.approveUser('${user._id}')">
                  <i class="fas fa-check"></i>
                  تایید کاربر
                </button>
                <button class="btn btn-error" onclick="adminManager.rejectUser('${user._id}', '${Utils.escapeHtml(user.name)}')">
                  <i class="fas fa-times"></i>
                  رد درخواست
                </button>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  renderSystemLogs() {
    return `
      <div class="system-logs">
        <div class="logs-header">
          <h3>لاگ‌های سیستم</h3>
          <div class="logs-filters">
            <input type="date" class="form-control" id="logDateFrom" onchange="adminManager.loadLogs()">
            <input type="date" class="form-control" id="logDateTo" onchange="adminManager.loadLogs()">
            <select class="form-control" id="logActionFilter" onchange="adminManager.loadLogs()">
              <option value="">همه عملیات</option>
              <option value="LOGIN_SUCCESS">ورود موفق</option>
              <option value="LOGIN_FAILED">ورود ناموفق</option>
              <option value="USER_REGISTERED">ثبت‌نام</option>
              <option value="USER_APPROVED">تایید کاربر</option>
              <option value="DATA_CREATED">ثبت داده</option>
              <option value="DATA_UPDATED">ویرایش داده</option>
            </select>
          </div>
        </div>
        
        <div class="logs-table-container" id="logsContainer">
          <div class="text-center p-4">
            <i class="fas fa-spinner fa-spin"></i>
            در حال بارگذاری لاگ‌ها...
          </div>
        </div>
      </div>
    `;
  }

  async loadLogs() {
    const container = document.getElementById('logsContainer');
    if (!container) return;

    container.innerHTML = `
      <div class="text-center p-4">
        <i class="fas fa-spinner fa-spin"></i>
        در حال بارگذاری لاگ‌ها...
      </div>
    `;

    try {
      const params = {
        page: 1,
        limit: 50
      };

      const dateFrom = document.getElementById('logDateFrom')?.value;
      const dateTo = document.getElementById('logDateTo')?.value;
      const action = document.getElementById('logActionFilter')?.value;

      if (dateFrom) params.dateFrom = dateFrom;
      if (dateTo) params.dateTo = dateTo;
      if (action) params.action = action;

      const response = await api.getAuditLogs(params);
      
      container.innerHTML = `
        <table class="table">
          <thead>
            <tr>
              <th>زمان</th>
              <th>کاربر</th>
              <th>عملیات</th>
              <th>جزئیات</th>
              <th>IP</th>
            </tr>
          </thead>
          <tbody>
            ${response.logs.map(log => this.renderLogRow(log)).join('')}
          </tbody>
        </table>
      `;
    } catch (error) {
      container.innerHTML = `
        <div class="text-center p-4 text-error">
          <i class="fas fa-exclamation-triangle"></i>
          خطا در بارگذاری لاگ‌ها
        </div>
      `;
    }
  }

  renderLogRow(log) {
    return `
      <tr>
        <td>${Utils.formatDate(log.timestamp)}</td>
        <td>${Utils.escapeHtml(log.userName)}</td>
        <td>
          <span class="action-badge action-${log.action.toLowerCase()}">
            ${this.getActionName(log.action)}
          </span>
        </td>
        <td>
          <div class="log-details">
            ${this.formatLogDetails(log.details)}
          </div>
        </td>
        <td><code>${log.details.ip || 'نامشخص'}</code></td>
      </tr>
    `;
  }

  formatLogDetails(details) {
    const items = [];
    
    if (details.email) items.push(`ایمیل: ${details.email}`);
    if (details.targetUserEmail) items.push(`کاربر هدف: ${details.targetUserEmail}`);
    if (details.oldRole && details.newRole) items.push(`نقش: ${details.oldRole} → ${details.newRole}`);
    if (details.reason) items.push(`دلیل: ${details.reason}`);
    
    return items.join('<br>') || 'جزئیات در دسترس نیست';
  }

  setupEventListeners() {
    // Auto-refresh admin data every 30 seconds
    setInterval(() => {
      if (document.getElementById('admin-panel')?.classList.contains('active')) {
        this.loadAdminData().then(() => {
          if (this.currentView === 'dashboard') {
            this.renderAdminPanel();
          }
        });
      }
    }, 30000);
  }

  switchView(view) {
    this.currentView = view;
    this.renderAdminPanel();
    
    if (view === 'logs') {
      setTimeout(() => this.loadLogs(), 100);
    }
  }

  async approveUser(userId) {
    try {
      const response = await api.approveUser(userId);
      Utils.showNotification(response.message, 'success');
      
      // Update local data
      this.pendingUsers = this.pendingUsers.filter(u => u._id !== userId);
      await this.loadAdminData();
      this.renderAdminPanel();
      
    } catch (error) {
      Utils.showNotification(error.message || 'خطا در تایید کاربر', 'error');
    }
  }

  async rejectUser(userId, userName) {
    if (!confirm(`آیا از رد درخواست ${userName} مطمئن هستید؟`)) {
      return;
    }

    const reason = prompt('دلیل رد درخواست را وارد کنید:');
    
    try {
      await api.deactivateUser(userId, reason);
      Utils.showNotification('درخواست کاربر رد شد', 'success');
      
      // Update local data
      this.pendingUsers = this.pendingUsers.filter(u => u._id !== userId);
      await this.loadAdminData();
      this.renderAdminPanel();
      
    } catch (error) {
      Utils.showNotification(error.message || 'خطا در رد درخواست', 'error');
    }
  }

  // Helper methods
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

  getActionName(action) {
    const actionNames = {
      LOGIN_SUCCESS: 'ورود موفق',
      LOGIN_FAILED: 'ورود ناموفق',
      USER_REGISTERED: 'ثبت‌نام',
      USER_APPROVED: 'تایید کاربر',
      USER_DEACTIVATED: 'غیرفعال‌سازی کاربر',
      USER_ROLE_CHANGED: 'تغییر نقش',
      PASSWORD_CHANGED: 'تغییر رمز عبور',
      PASSWORD_RESET_BY_ADMIN: 'بازنشانی رمز توسط مدیر',
      DATA_CREATED: 'ثبت داده',
      DATA_UPDATED: 'ویرایش داده',
      DATA_DELETED: 'حذف داده',
      DATA_ACCESSED: 'دسترسی به داده',
      PROFILE_UPDATED: 'ویرایش پروفایل'
    };
    return actionNames[action] || action;
  }

  renderRecentActivity() {
    if (!this.stats.recentActivity || this.stats.recentActivity.length === 0) {
      return '<div class="text-center text-muted p-3">فعالیت اخیری یافت نشد</div>';
    }

    return this.stats.recentActivity.slice(0, 10).map(activity => `
      <div class="activity-item">
        <div class="activity-icon">
          <i class="fas ${this.getActivityIcon(activity.action)}"></i>
        </div>
        <div class="activity-content">
          <div class="activity-text">${this.getActionName(activity.action)}</div>
          <div class="activity-time">${Utils.formatDate(activity.timestamp)}</div>
        </div>
      </div>
    `).join('');
  }

  getActivityIcon(action) {
    const icons = {
      LOGIN_SUCCESS: 'fa-sign-in-alt',
      USER_REGISTERED: 'fa-user-plus',
      USER_APPROVED: 'fa-user-check',
      DATA_CREATED: 'fa-plus',
      DATA_UPDATED: 'fa-edit',
      DATA_DELETED: 'fa-trash'
    };
    return icons[action] || 'fa-info';
  }
}

// Create global admin manager instance
window.adminManager = new AdminManager();