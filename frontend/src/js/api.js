// API communication layer
class API {
  constructor() {
    this.baseURL = this.getBaseURL();
    this.token = Utils.getItem('authToken');
    this.retryCount = 3;
    this.retryDelay = 1000;
  }

  getBaseURL() {
    // In production, API calls go to same domain
    if (window.location.hostname === 'localhost') {
      return 'http://localhost:5000/api';
    }
    return '/api';
  }

  // Set authentication token
  setToken(token) {
    this.token = token;
    if (token) {
      Utils.setItem('authToken', token);
    } else {
      Utils.removeItem('authToken');
    }
  }

  // Get default headers
  getHeaders(contentType = 'application/json') {
    const headers = {
      'Content-Type': contentType
    };

    if (this.token) {
      headers.Authorization = `Bearer ${this.token}`;
    }

    return headers;
  }

  // Main request method with retry logic
  async request(endpoint, options = {}) {
    const config = {
      headers: this.getHeaders(),
      ...options
    };

    let lastError;
    
    for (let attempt = 0; attempt < this.retryCount; attempt++) {
      try {
        const response = await fetch(`${this.baseURL}${endpoint}`, config);
        
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          
          if (response.status === 401) {
            // Token expired or invalid
            this.setToken(null);
            window.location.reload();
            return;
          }
          
          if (response.status === 403) {
            if (errorData.needsApproval) {
              throw new APIError(errorData.error, response.status, 'NEEDS_APPROVAL');
            }
            throw new APIError(errorData.error || 'دسترسی ممنوع', response.status);
          }
          
          throw new APIError(
            errorData.error || `خطای HTTP ${response.status}`,
            response.status
          );
        }

        return await response.json();
      } catch (error) {
        lastError = error;
        
        // Don't retry on client errors (400-499) except network errors
        if (error instanceof APIError && error.status >= 400 && error.status < 500) {
          throw error;
        }
        
        // Don't retry on last attempt
        if (attempt === this.retryCount - 1) {
          break;
        }
        
        // Wait before retry
        await this.delay(this.retryDelay * Math.pow(2, attempt));
      }
    }

    // Handle offline scenario
    if (!Utils.isOnline()) {
      if (options.method === 'GET') {
        // Try to get cached data for GET requests
        const cachedData = await this.getCachedResponse(endpoint);
        if (cachedData) {
          return cachedData;
        }
      } else {
        // Queue non-GET requests for later sync
        await this.queueOfflineRequest(endpoint, options);
        throw new APIError('درخواست در حالت آفلاین ذخیره شد', 0, 'OFFLINE_QUEUED');
      }
    }

    throw lastError || new APIError('خطای شبکه');
  }

  async delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // GET request
  async get(endpoint, params = {}) {
    const searchParams = new URLSearchParams(params);
    const url = searchParams.toString() ? `${endpoint}?${searchParams}` : endpoint;
    return this.request(url);
  }

  // POST request
  async post(endpoint, data = {}) {
    return this.request(endpoint, {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  // PUT request
  async put(endpoint, data = {}) {
    return this.request(endpoint, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  }

  // DELETE request
  async delete(endpoint) {
    return this.request(endpoint, {
      method: 'DELETE'
    });
  }

  // Authentication endpoints
  async login(credentials) {
    const response = await this.post('/auth/login', credentials);
    if (response.token) {
      this.setToken(response.token);
      Utils.setItem('currentUser', response.user);
    }
    return response;
  }

  async register(userData) {
    return this.post('/auth/register', userData);
  }

  async logout() {
    try {
      await this.post('/auth/logout');
    } catch (error) {
      console.warn('Logout API call failed:', error);
    } finally {
      this.setToken(null);
      Utils.removeItem('currentUser');
    }
  }

  async getProfile() {
    return this.get('/auth/profile');
  }

  async updateProfile(data) {
    return this.put('/auth/profile', data);
  }

  async changePassword(data) {
    return this.put('/auth/change-password', data);
  }

  // User management endpoints
  async getUsers() {
    return this.get('/users');
  }

  // Data endpoints
  async getVibrateData(filters = {}) {
    return this.get('/data', filters);
  }

  async saveVibrateData(data) {
    return this.post('/data', data);
  }

  async deleteVibrateData(dataId) {
    return this.delete(`/data/${dataId}`);
  }

  async getDataAnalysis(params = {}) {
    return this.get('/data/analysis', params);
  }

  async getConfigurations() {
    return this.get('/data/config');
  }

  // Admin endpoints
  async getAllUsers(params = {}) {
    return this.get('/admin/users', params);
  }

  async getPendingUsers() {
    return this.get('/admin/users/pending');
  }

  async approveUser(userId) {
    return this.post(`/admin/users/${userId}/approve`);
  }

  async deactivateUser(userId, reason = '') {
    return this.post(`/admin/users/${userId}/deactivate`, { reason });
  }

  async changeUserRole(userId, role) {
    return this.put(`/admin/users/${userId}/role`, { role });
  }

  async resetUserPassword(userId, newPassword) {
    return this.post(`/admin/users/${userId}/reset-password`, { newPassword });
  }

  async getSystemStats() {
    return this.get('/admin/stats');
  }

  async getAuditLogs(params = {}) {
    return this.get('/admin/audit-logs', params);
  }

  // Offline support methods
  async queueOfflineRequest(endpoint, options) {
    const offlineQueue = Utils.getItem('offlineQueue', []);
    
    offlineQueue.push({
      id: Date.now().toString(),
      endpoint,
      options,
      timestamp: new Date().toISOString()
    });
    
    Utils.setItem('offlineQueue', offlineQueue);
  }

  async getCachedResponse(endpoint) {
    // Implementation would depend on caching strategy
    return null;
  }

  async syncOfflineQueue() {
    const offlineQueue = Utils.getItem('offlineQueue', []);
    
    if (offlineQueue.length === 0) return;
    
    const syncedItems = [];
    
    for (const item of offlineQueue) {
      try {
        await this.request(item.endpoint, item.options);
        syncedItems.push(item.id);
        Utils.showNotification(`داده آفلاین همگام‌سازی شد`, 'success', 2000);
      } catch (error) {
        console.warn('Failed to sync offline item:', item.id, error);
      }
    }
    
    // Remove successfully synced items
    const remainingQueue = offlineQueue.filter(item => !syncedItems.includes(item.id));
    Utils.setItem('offlineQueue', remainingQueue);
  }
}

// Custom API Error class
class APIError extends Error {
  constructor(message, status = 0, code = null) {
    super(message);
    this.name = 'APIError';
    this.status = status;
    this.code = code;
  }
}

// Create global API instance
window.api = new API();

// Handle online/offline events
Utils.onOnline(async () => {
  Utils.showNotification('اتصال اینترنت برقرار شد', 'success');
  document.getElementById('offlineNotification')?.classList.add('d-none');
  
  // Sync offline queue
  try {
    await window.api.syncOfflineQueue();
  } catch (error) {
    console.error('Error syncing offline queue:', error);
  }
});

Utils.onOffline(() => {
  Utils.showNotification('اتصال اینترنت قطع شد. حالت آفلاین فعال است.', 'warning', 5000);
  document.getElementById('offlineNotification')?.classList.remove('d-none');
});