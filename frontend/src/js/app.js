// Main application class
class App {
  constructor() {
    this.currentSection = 'data-entry';
    this.currentUser = null;
    this.configurations = null;
    this.dataEntryState = {
      selectedUnit: null,
      currentEquipmentIndex: 0,
      currentParameterIndex: 0,
      currentData: {},
      mode: 'new'
    };
    this.theme = Utils.getTheme();
  }

  async init() {
    try {
      // Apply theme
      Utils.applyTheme(this.theme);
      this.updateThemeIcon();

      // Get current user
      this.currentUser = auth.getCurrentUser();
      if (!this.currentUser) {
        auth.showLoginScreen();
        return;
      }

      // Load configurations
      await this.loadConfigurations();

      // Setup navigation based on user role
      this.setupNavigation();

      // Update user display
      this.updateUserDisplay();

      // Initialize current section
      await this.showSection(this.currentSection);

      // Setup event listeners
      this.setupEventListeners();

      console.log('✅ Application initialized successfully');
    } catch (error) {
      console.error('❌ Application initialization failed:', error);
      Utils.showNotification('خطا در راه‌اندازی برنامه', 'error');
    }
  }

  async loadConfigurations() {
    try {
      const response = await api.getConfigurations();
      this.configurations = response;
    } catch (error) {
      console.error('Error loading configurations:', error);
      // Use fallback data if API fails
      this.configurations = {
        equipment: [
          { id: 'GB-cp48A', name: 'گیربکس کمپرسور 48A', code: 'GB-cp 48A' },
          { id: 'CP-cp48A', name: 'کمپرسور 48A', code: 'CP-cp 48A' }
          // ... other equipment
        ],
        parameters: [
          { id: 'V1', name: 'سرعت عمودی متصل', maxValue: 20, type: 'velocity' },
          { id: 'GV1', name: 'شتاب عمودی متصل', maxValue: 2, type: 'acceleration' }
          // ... other parameters
        ],
        units: [
          { id: 'DRI1', name: 'واحد احیا مستقیم 1', code: 'DRI 1' },
          { id: 'DRI2', name: 'واحد احیا مستقیم 2', code: 'DRI 2' }
        ]
      };
    }
  }

  setupNavigation() {
    const navigation = document.getElementById('mainNavigation');
    if (!navigation) return;

    let navItems = [
      { id: 'data-entry', icon: 'fas fa-edit', text: 'ثبت داده', roles: ['operator', 'technician', 'engineer', 'supervisor', 'admin', 'super_admin'] },
      { id: 'view-data', icon: 'fas fa-table', text: 'مشاهده داده‌ها', roles: ['operator', 'technician', 'engineer', 'supervisor', 'admin', 'super_admin'] },
      { id: 'charts', icon: 'fas fa-chart-area', text: 'نمودار', roles: ['technician', 'engineer', 'supervisor', 'admin', 'super_admin'] },
      { id: 'analysis', icon: 'fas fa-search', text: 'آنالیز', roles: ['engineer', 'supervisor', 'admin', 'super_admin'] },
      { id: 'slideshow', icon: 'fas fa-play', text: 'اسلایدشو', roles: ['supervisor', 'admin', 'super_admin'] }
    ];

    // Add admin panel for admins
    if (auth.isAdmin()) {
      navItems.push({ id: 'admin-panel', icon: 'fas fa-users-cog', text: 'مدیریت', roles: ['admin', 'super_admin'] });
    }

    // Filter nav items based on user role
    const userRole = this.currentUser.role;
    const allowedItems = navItems.filter(item => item.roles.includes(userRole));

    navigation.innerHTML = allowedItems.map(item => `
      <button class="nav-tab ${item.id === this.currentSection ? 'active' : ''}" 
              onclick="app.showSection('${item.id}')">
        <i class="${item.icon}"></i>
        ${item.text}
      </button>
    `).join('');
  }

  setupEventListeners() {
    // User menu toggle
    document.addEventListener('click', (e) => {
      const userMenu = document.getElementById('userMenuDropdown');
      if (!e.target.closest('.user-menu') && userMenu) {
        userMenu.classList.remove('show');
      }
    });

    // Data entry form listeners
    this.setupDataEntryListeners();

    // View data filters
    this.setupViewDataListeners();

    // Charts listeners
    this.setupChartsListeners();

    // Window resize handler
    window.addEventListener('resize', Utils.debounce(() => {
      this.handleResize();
    }, 250));

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      this.handleKeyboardShortcuts(e);
    });

    // Current date display update
    this.updateCurrentDateDisplay();
    setInterval(() => this.updateCurrentDateDisplay(), 60000); // Update every minute
  }

  setupDataEntryListeners() {
    const dataInput = document.getElementById('dataInput');
    if (dataInput) {
      dataInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          this.handleDataInput();
        }
      });

      dataInput.addEventListener('input', (e) => {
        this.validateDataInput(e.target);
      });
    }
  }

  setupViewDataListeners() {
    const viewUnit = document.getElementById('viewUnit');
    const viewDate = document.getElementById('viewDate');
    const viewEquipment = document.getElementById('viewEquipment');

    if (viewUnit) viewUnit.addEventListener('change', () => this.loadViewData());
    if (viewDate) viewDate.addEventListener('change', () => this.loadViewData());
    if (viewEquipment) viewEquipment.addEventListener('change', () => this.loadViewData());

    // Set default date
    if (viewDate && !viewDate.value) {
      viewDate.value = Utils.getCurrentDate();
    }
  }

  setupChartsListeners() {
    const chartUnit = document.getElementById('chartUnit');
    const chartEquipment = document.getElementById('chartEquipment');
    const chartDateFrom = document.getElementById('chartDateFrom');
    const chartDateTo = document.getElementById('chartDateTo');

    if (chartUnit) chartUnit.addEventListener('change', () => this.updateChart());
    if (chartEquipment) chartEquipment.addEventListener('change', () => this.updateChart());
    if (chartDateFrom) chartDateFrom.addEventListener('change', () => this.updateChart());
    if (chartDateTo) chartDateTo.addEventListener('change', () => this.updateChart());

    // Set default dates
    if (chartDateFrom && chartDateTo) {
      const today = Utils.getCurrentDate();
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      
      chartDateFrom.value = weekAgo.toISOString().split('T')[0];
      chartDateTo.value = today;
    }

    // Populate equipment dropdown
    this.populateEquipmentDropdown();
  }

  async showSection(sectionId) {
    // Hide all sections
    document.querySelectorAll('.section').forEach(section => {
      section.classList.remove('active');
    });

    // Show selected section
    const targetSection = document.getElementById(sectionId);
    if (targetSection) {
      targetSection.classList.add('active');
      this.currentSection = sectionId;
      
      // Update navigation
      document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.classList.remove('active');
      });
      
      const activeTab = document.querySelector(`.nav-tab[onclick*="${sectionId}"]`);
      if (activeTab) {
        activeTab.classList.add('active');
      }

      // Initialize section-specific functionality
      await this.initializeSection(sectionId);
    }
  }

  async initializeSection(sectionId) {
    try {
      switch (sectionId) {
        case 'data-entry':
          await this.initDataEntry();
          break;
        case 'view-data':
          await this.initViewData();
          break;
        case 'charts':
          await this.initCharts();
          break;
        case 'analysis':
          await this.initAnalysis();
          break;
        case 'slideshow':
          await this.initSlideshow();
          break;
        case 'admin-panel':
          if (auth.isAdmin()) {
            await adminManager.init();
          }
          break;
      }
    } catch (error) {
      console.error(`Error initializing section ${sectionId}:`, error);
      Utils.showNotification(`خطا در بارگذاری بخش ${sectionId}`, 'error');
    }
  }

  async initDataEntry() {
    this.updateCurrentDateDisplay();
    
    // Reset data entry state
    this.dataEntryState = {
      selectedUnit: null,
      currentEquipmentIndex: 0,
      currentParameterIndex: 0,
      currentData: {},
      mode: 'new'
    };

    // Hide interface initially
    document.getElementById('dataEntryInterface')?.classList.add('d-none');
  }

  async initViewData() {
    this.populateEquipmentDropdown('viewEquipment');
    await this.loadViewData();
  }

  async initCharts() {
    this.populateEquipmentDropdown('chartEquipment');
    await this.initChartParameters();
    await this.updateChart();
  }

  async initAnalysis() {
    await this.loadAnalysisData();
  }

  async initSlideshow() {
    const slideshowDate = document.getElementById('slideshowDate');
    if (slideshowDate && !slideshowDate.value) {
      slideshowDate.value = Utils.getCurrentDate();
    }
  }

  // Data Entry Methods
  async selectUnit(unitId) {
    this.dataEntryState.selectedUnit = unitId;
    this.dataEntryState.currentEquipmentIndex = 0;
    this.dataEntryState.currentParameterIndex = 0;

    // Update UI
    document.querySelectorAll('.unit-btn').forEach(btn => btn.classList.remove('selected'));
    document.querySelector(`.unit-btn.${unitId.toLowerCase()}`)?.classList.add('selected');

    // Show interface
    const dataEntryInterface = document.getElementById('dataEntryInterface');
    const entryHeader = document.getElementById('entryHeader');
    
    if (dataEntryInterface) {
      dataEntryInterface.classList.remove('d-none');
      entryHeader.className = `data-entry-header ${unitId.toLowerCase()}`;
    }

    // Load today's data
    await this.loadTodayData();
    this.updateCurrentDisplay();

    // Focus on input
    setTimeout(() => {
      document.getElementById('dataInput')?.focus();
    }, 100);
  }

  async loadTodayData() {
    try {
      const today = Utils.getCurrentDate();
      const data = await api.getVibrateData({
        unit: this.dataEntryState.selectedUnit,
        date: today
      });

      // Organize data by equipment
      this.dataEntryState.currentData = {};
      data.data.forEach(item => {
        this.dataEntryState.currentData[item.equipment] = item.parameters || {};
      });

      // Find next incomplete position
      this.setNextIncompletePosition();
      
    } catch (error) {
      console.error('Error loading today data:', error);
      Utils.showNotification('خطا در بارگذاری داده‌های امروز', 'error');
    }
  }

  setNextIncompletePosition() {
    const equipment = this.configurations.equipment;
    const parameters = this.configurations.parameters;
    
    for (let i = 0; i < equipment.length; i++) {
      const equipmentId = equipment[i].id;
      const equipmentData = this.dataEntryState.currentData[equipmentId] || {};
      
      for (let j = 0; j < parameters.length; j++) {
        const parameterId = parameters[j].id;
        
        if (!equipmentData[parameterId]) {
          this.dataEntryState.currentEquipmentIndex = i;
          this.dataEntryState.currentParameterIndex = j;
          return;
        }
      }
    }

    // All data completed
    Utils.showNotification('تمام داده‌های امروز تکمیل شده است!', 'success');
  }

  updateCurrentDisplay() {
    const equipment = this.configurations.equipment[this.dataEntryState.currentEquipmentIndex];
    const parameter = this.configurations.parameters[this.dataEntryState.currentParameterIndex];
    const unit = this.configurations.units.find(u => u.id === this.dataEntryState.selectedUnit);

    if (!equipment || !parameter) return;

    // Update display elements
    document.getElementById('currentUnit').textContent = unit?.name || '';
    document.getElementById('currentEquipment').innerHTML = `
      <i class="fas fa-cog"></i>
      ${equipment.name}
    `;
    document.getElementById('currentParameter').innerHTML = `
      <i class="fas fa-arrow-up"></i>
      ${parameter.name} (${parameter.id})
    `;

    // Update progress
    const totalParams = this.configurations.equipment.length * this.configurations.parameters.length;
    const currentProgress = (this.dataEntryState.currentEquipmentIndex * this.configurations.parameters.length) + this.dataEntryState.currentParameterIndex;
    const progressPercent = Math.round((currentProgress / totalParams) * 100);
    
    const progressFill = document.getElementById('progressFill');
    if (progressFill) {
      progressFill.style.width = `${progressPercent}%`;
    }

    // Set input properties
    const dataInput = document.getElementById('dataInput');
    if (dataInput) {
      dataInput.max = parameter.maxValue;
      dataInput.value = '';
      
      // Show existing value if any
      const equipmentData = this.dataEntryState.currentData[equipment.id] || {};
      if (equipmentData[parameter.id]) {
        dataInput.value = equipmentData[parameter.id];
      }
    }

    // Update range info
    const rangeInfo = document.getElementById('rangeInfo');
    if (rangeInfo) {
      rangeInfo.innerHTML = `
        <small class="range-info ${parameter.type}-range">
          <i class="fas fa-info-circle"></i>
          حداکثر مقدار: ${parameter.maxValue} | Enter برای ثبت
        </small>
      `;
    }
  }

  handleDataInput() {
    const input = document.getElementById('dataInput');
    if (!input) return;

    const value = input.value.trim();
    const parameter = this.configurations.parameters[this.dataEntryState.currentParameterIndex];

    if (!Utils.validateParameterValue(value, parameter.maxValue)) {
      input.classList.add('shake');
      setTimeout(() => input.classList.remove('shake'), 500);
      Utils.showNotification(`لطفاً مقدار صحیح (0-${parameter.maxValue}) وارد کنید`, 'error');
      return;
    }

    // Save the value
    this.saveCurrentParameterValue(parseFloat(value));
  }

  async saveCurrentParameterValue(value) {
    const equipment = this.configurations.equipment[this.dataEntryState.currentEquipmentIndex];
    const parameter = this.configurations.parameters[this.dataEntryState.currentParameterIndex];

    // Update local data
    if (!this.dataEntryState.currentData[equipment.id]) {
      this.dataEntryState.currentData[equipment.id] = {};
    }
    this.dataEntryState.currentData[equipment.id][parameter.id] = value;

    // Move to next parameter
    this.dataEntryState.currentParameterIndex++;

    if (this.dataEntryState.currentParameterIndex >= this.configurations.parameters.length) {
      // End of equipment - save to server
      await this.saveEquipmentData(equipment.id);
      
      // Move to next equipment
      this.dataEntryState.currentEquipmentIndex++;
      this.dataEntryState.currentParameterIndex = 0;
      
      if (this.dataEntryState.currentEquipmentIndex >= this.configurations.equipment.length) {
        // All equipment completed
        Utils.showNotification('تمام تجهیزات تکمیل شد!', 'success');
        this.dataEntryState.currentEquipmentIndex = 0;
      }
    }

    this.updateCurrentDisplay();
    
    // Focus on input for next parameter
    setTimeout(() => {
      document.getElementById('dataInput')?.focus();
    }, 100);
  }

  async saveEquipmentData(equipmentId) {
    try {
      const equipmentData = this.dataEntryState.currentData[equipmentId];
      
      const data = {
        unit: this.dataEntryState.selectedUnit,
        equipment: equipmentId,
        date: Utils.getCurrentDate(),
        parameters: equipmentData,
        notes: '' // Could be enhanced with note input
      };

      const response = await api.saveVibrateData(data);
      
      const equipment = this.configurations.equipment.find(e => e.id === equipmentId);
      Utils.showNotification(`${equipment.name} ذخیره شد`, 'success');
      
    } catch (error) {
      console.error('Error saving equipment data:', error);
      Utils.showNotification('خطا در ذخیره داده‌ها', 'error');
    }
  }

  validateDataInput(input) {
    const parameter = this.configurations.parameters[this.dataEntryState.currentParameterIndex];
    if (!parameter) return;

    const value = input.value;
    
    if (value && !Utils.validateParameterValue(value, parameter.maxValue)) {
      input.classList.add('invalid');
    } else {
      input.classList.remove('invalid');
      if (value) {
        input.classList.add('valid');
      } else {
        input.classList.remove('valid');
      }
    }
  }

  resetEntry() {
    this.dataEntryState.currentEquipmentIndex = 0;
    this.dataEntryState.currentParameterIndex = 0;
    this.updateCurrentDisplay();
    
    const dataInput = document.getElementById('dataInput');
    if (dataInput) {
      dataInput.value = '';
      dataInput.focus();
    }
  }

  saveCurrentData() {
    this.handleDataInput();
  }

  switchDataEntryMode(mode) {
    this.dataEntryState.mode = mode;
    
    // Update tab buttons
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById(`${mode}EntryTab`)?.classList.add('active');
    
    // Show/hide mode content
    if (mode === 'new') {
      document.getElementById('newEntryMode')?.classList.remove('d-none');
      document.getElementById('editMode')?.classList.add('d-none');
    } else {
      document.getElementById('newEntryMode')?.classList.add('d-none');
      document.getElementById('editMode')?.classList.remove('d-none');
      this.initEditMode();
    }
  }

  async initEditMode() {
    // Implementation for edit mode
    Utils.showNotification('حالت ویرایش در دست توسعه است', 'info');
  }

  // View Data Methods
  async loadViewData() {
    const viewUnit = document.getElementById('viewUnit')?.value;
    const viewDate = document.getElementById('viewDate')?.value;
    const viewEquipment = document.getElementById('viewEquipment')?.value;

    try {
      const filters = {};
      if (viewUnit) filters.unit = viewUnit;
      if (viewDate) filters.date = viewDate;
      if (viewEquipment) filters.equipment = viewEquipment;

      const response = await api.getVibrateData(filters);
      
      if (viewUnit === '' || !viewUnit) {
        this.renderSeparateUnitTables(response.data, viewDate);
      } else {
        this.renderDataTable(response.data, viewUnit);
      }
    } catch (error) {
      console.error('Error loading view data:', error);
      Utils.showNotification('خطا در بارگذاری داده‌ها', 'error');
    }
  }

  renderSeparateUnitTables(data, date) {
    const container = document.getElementById('dataTablesContainer');
    if (!container) return;

    container.innerHTML = '';

    ['DRI1', 'DRI2'].forEach(unitId => {
      const unitData = data.filter(d => d.unit === unitId);
      const unitInfo = this.configurations.units.find(u => u.id === unitId);
      
      const tableContainer = document.createElement('div');
      tableContainer.className = `table-container mobile-scroll table-${unitId.toLowerCase()}`;
      
      const title = document.createElement('div');
      title.className = `table-title ${unitId.toLowerCase()}`;
      title.innerHTML = `
        <div class="d-flex justify-between align-center">
          <span>${unitInfo.name} - ${date ? Utils.formatDate(date) : 'همه تاریخ‌ها'}</span>
          <span style="font-size: 0.9rem;">کاربر: ${this.currentUser.name}</span>
        </div>
      `;
      tableContainer.appendChild(title);

      const table = this.createDataTable(unitData, unitId);
      tableContainer.appendChild(table);
      container.appendChild(tableContainer);
    });
  }

  renderDataTable(data, selectedUnit) {
    const container = document.getElementById('dataTablesContainer');
    if (!container) return;

    container.innerHTML = '';
    
    const tableContainer = document.createElement('div');
    tableContainer.className = `table-container mobile-scroll table-${selectedUnit.toLowerCase()}`;
    
    const table = this.createDataTable(data, selectedUnit);
    tableContainer.appendChild(table);
    container.appendChild(tableContainer);
  }

  createDataTable(data, unit) {
    const table = document.createElement('table');
    table.className = 'table table-transposed';

    if (data.length === 0) {
      table.innerHTML = '<tbody><tr><td colspan="100%" class="text-center">داده‌ای موجود نیست</td></tr></tbody>';
      return table;
    }

    // Create header
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    headerRow.innerHTML = '<th class="equipment-header">تجهیزات</th>';

    this.configurations.parameters.forEach(parameter => {
      const th = document.createElement('th');
      th.className = 'parameter-header';
      th.innerHTML = `
        <div class="parameter-header-content">
          <i class="fas fa-chart-line" style="color: ${this.getParameterColor(parameter.type)}"></i>
          <div class="parameter-text">
            <div class="parameter-name">${parameter.name}</div>
            <div class="parameter-code">(${parameter.id})</div>
          </div>
        </div>
      `;
      headerRow.appendChild(th);
    });

    const notesHeader = document.createElement('th');
    notesHeader.className = 'notes-header';
    notesHeader.innerHTML = `
      <div class="notes-header-content">
        <i class="fas fa-sticky-note" style="color: var(--warning-color)"></i>
        <span>یادداشت</span>
      </div>
    `;
    headerRow.appendChild(notesHeader);

    thead.appendChild(headerRow);
    table.appendChild(thead);

    // Create body
    const tbody = document.createElement('tbody');
    const equipments = [...new Set(data.map(d => d.equipment))].sort();

    equipments.forEach(equipmentId => {
      const equipment = this.configurations.equipment.find(e => e.id === equipmentId);
      const equipmentData = data.find(d => d.equipment === equipmentId);

      const row = document.createElement('tr');

      // Equipment name cell
      const equipmentCell = document.createElement('td');
      equipmentCell.className = 'equipment-name-cell';
      equipmentCell.innerHTML = `
        <div class="equipment-info">
          <i class="fas fa-cog" style="color: var(--primary-color)"></i>
          <span class="equipment-name">${equipment?.name || equipmentId}</span>
          <small class="equipment-code">${equipment?.code || equipmentId}</small>
        </div>
      `;
      row.appendChild(equipmentCell);

      // Parameter value cells
      this.configurations.parameters.forEach(parameter => {
        const td = document.createElement('td');
        td.className = 'parameter-value-cell';
        const value = equipmentData?.parameters?.[parameter.id];

        if (value !== undefined && value !== null) {
          td.innerHTML = `<span class="parameter-value">${value}</span>`;
          td.classList.add('has-value');
        } else {
          td.innerHTML = `<span class="parameter-value no-value">--</span>`;
          td.classList.add('no-value');
        }

        row.appendChild(td);
      });

      // Notes cell
      const notesCell = document.createElement('td');
      notesCell.className = 'equipment-notes-cell';
      const note = equipmentData?.notes || '';

      if (note.trim()) {
        notesCell.innerHTML = `
          <div class="equipment-note-content">
            <i class="fas fa-comment" style="color: var(--info-color)"></i>
            <span class="note-text">${Utils.escapeHtml(note)}</span>
          </div>
        `;
      } else {
        notesCell.innerHTML = `
          <div class="no-equipment-note">
            <i class="fas fa-minus" style="color: var(--text-muted)"></i>
            <span class="no-note-text">بدون یادداشت</span>
          </div>
        `;
      }

      row.appendChild(notesCell);
      tbody.appendChild(row);
    });

    table.appendChild(tbody);
    return table;
  }

  // Chart Methods
  populateEquipmentDropdown(selectId = 'chartEquipment') {
    const select = document.getElementById(selectId);
    if (!select || !this.configurations) return;

    select.innerHTML = '';
    
    if (selectId === 'viewEquipment') {
      select.innerHTML = '<option value="">همه تجهیزات</option>';
    }

    this.configurations.equipment.forEach(equipment => {
      const option = document.createElement('option');
      option.value = equipment.id;
      option.textContent = equipment.name;
      select.appendChild(option);
    });
  }

  async initChartParameters() {
    const container = document.getElementById('chartParameters');
    if (!container || !this.configurations) return;

    container.innerHTML = '';

    this.configurations.parameters.forEach(parameter => {
      const div = document.createElement('div');
      div.className = 'parameter-item';
      div.innerHTML = `
        <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
          <input type="checkbox" value="${parameter.id}" onchange="app.updateChart()">
          <i class="fas fa-chart-line" style="color: ${this.getParameterColor(parameter.type)}"></i>
          <span>${parameter.name}</span>
        </label>
      `;
      container.appendChild(div);
    });
  }

  async updateChart() {
    const chartUnit = document.getElementById('chartUnit')?.value;
    const chartEquipment = document.getElementById('chartEquipment')?.value;
    const chartDateFrom = document.getElementById('chartDateFrom')?.value;
    const chartDateTo = document.getElementById('chartDateTo')?.value;

    const selectedParameters = Array.from(
      document.querySelectorAll('#chartParameters input[type="checkbox"]:checked')
    ).map(cb => cb.value);

    if (!chartEquipment || selectedParameters.length === 0) {
      this.clearChart();
      return;
    }

    try {
      const filters = {
        unit: chartUnit,
        equipment: chartEquipment
      };

      if (chartDateFrom) filters.dateFrom = chartDateFrom;
      if (chartDateTo) filters.dateTo = chartDateTo;

      const response = await api.getVibrateData(filters);
      this.renderChart(response.data, selectedParameters);
      
    } catch (error) {
      console.error('Error updating chart:', error);
      Utils.showNotification('خطا در بارگذاری داده‌های نمودار', 'error');
    }
  }

  renderChart(data, selectedParameters) {
    const canvas = document.getElementById('mainChart');
    if (!canvas) return;

    // Destroy existing chart
    if (window.chartInstance) {
      window.chartInstance.destroy();
    }

    const ctx = canvas.getContext('2d');
    
    // Group data by date
    const dates = [...new Set(data.map(d => d.date))].sort();
    const datasets = [];

    selectedParameters.forEach(paramId => {
      const parameter = this.configurations.parameters.find(p => p.id === paramId);
      if (!parameter) return;

      const values = dates.map(date => {
        const item = data.find(d => d.date === date);
        return item?.parameters?.[paramId] || null;
      });

      datasets.push({
        label: parameter.name,
        data: values,
        borderColor: this.getParameterColor(parameter.type),
        backgroundColor: this.getParameterColor(parameter.type) + '20',
        borderWidth: 2,
        fill: false,
        tension: 0.1
      });
    });

    window.chartInstance = new Chart(ctx, {
      type: 'line',
      data: {
        labels: dates.map(date => Utils.formatDate(date)),
        datasets: datasets
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'top',
            labels: {
              usePointStyle: true
            }
          }
        },
        scales: {
          x: {
            title: {
              display: true,
              text: 'تاریخ'
            }
          },
          y: {
            title: {
              display: true,
              text: 'مقدار'
            },
            beginAtZero: true
          }
        }
      }
    });
  }

  clearChart() {
    if (window.chartInstance) {
      window.chartInstance.destroy();
      window.chartInstance = null;
    }
  }

  // Analysis Methods
  async loadAnalysisData() {
    try {
      const response = await api.getDataAnalysis({
        threshold: 20,
        timeRange: 7,
        comparisonDays: 1
      });

      this.renderAnalysisCards(response.anomalies || []);
      
    } catch (error) {
      console.error('Error loading analysis data:', error);
      Utils.showNotification('خطا در بارگذاری داده‌های آنالیز', 'error');
    }
  }

  renderAnalysisCards(anomalies) {
    const container = document.getElementById('analysisCardsContainer');
    if (!container) return;

    container.innerHTML = '';

    if (anomalies.length === 0) {
      container.innerHTML = `
        <div class="text-center p-5">
          <i class="fas fa-check-circle text-success" style="font-size: 4rem;"></i>
          <h3 class="mt-3">هیچ افزایش غیرعادی‌ای یافت نشد</h3>
          <p class="text-secondary">تمام پارامترها در محدوده طبیعی قرار دارند</p>
        </div>
      `;
      return;
    }

    anomalies.forEach(anomaly => {
      const card = document.createElement('div');
      card.className = `analysis-card ${anomaly.unit.toLowerCase()}-style`;
      card.onclick = () => this.navigateToChart(anomaly.unit, anomaly.equipment);

      card.innerHTML = `
        <div class="analysis-card-header">
          <div class="analysis-icon">
            <i class="fas fa-chart-line"></i>
          </div>
          <div class="analysis-severity ${this.getSeverityClass(anomaly.increasePercentage)}">
            ${this.getSeverityText(anomaly.increasePercentage)}
          </div>
        </div>
        <div class="analysis-card-body">
          <h4 class="analysis-title">${anomaly.parameterName}</h4>
          <div class="analysis-equipment">
            <strong>${anomaly.equipmentName}</strong> - ${anomaly.unit}
          </div>
          <div class="analysis-values">
            <div class="analysis-value-item">
              <span class="analysis-label">مقدار فعلی:</span>
              <span class="analysis-value analysis-current">${anomaly.currentValue}</span>
            </div>
            <div class="analysis-value-item">
              <span class="analysis-label">مقدار قبلی:</span>
              <span class="analysis-value">${anomaly.previousValue}</span>
            </div>
            <div class="analysis-value-item">
              <span class="analysis-label">درصد افزایش:</span>
              <span class="analysis-value analysis-percentage">+${anomaly.increasePercentage}%</span>
            </div>
          </div>
          <div class="analysis-date">
            <i class="fas fa-calendar"></i>
            ${Utils.formatDate(anomaly.latestDate)}
          </div>
        </div>
      `;

      container.appendChild(card);
    });
  }

  navigateToChart(unit, equipment) {
    this.showSection('charts');
    
    setTimeout(() => {
      const chartUnit = document.getElementById('chartUnit');
      const chartEquipment = document.getElementById('chartEquipment');
      
      if (chartUnit) chartUnit.value = unit;
      if (chartEquipment) chartEquipment.value = equipment;
      
      // Select all parameters
      document.querySelectorAll('#chartParameters input[type="checkbox"]').forEach(cb => {
        cb.checked = true;
      });
      
      this.updateChart();
    }, 300);
  }

  // Helper Methods
  getParameterColor(type) {
    return type === 'velocity' ? '#ec4899' : '#f59e0b';
  }

  getSeverityClass(percentage) {
    if (percentage >= 50) return 'severity-critical';
    if (percentage >= 30) return 'severity-high';
    if (percentage >= 20) return 'severity-medium';
    return 'severity-low';
  }

  getSeverityText(percentage) {
    if (percentage >= 50) return 'بحرانی';
    if (percentage >= 30) return 'بالا';
    if (percentage >= 20) return 'متوسط';
    return 'پایین';
  }

  updateCurrentDateDisplay() {
    const elements = [
      'currentDateDisplay'
    ];

    const currentDate = Utils.formatDate(Utils.getCurrentDate());
    
    elements.forEach(elementId => {
      const element = document.getElementById(elementId);
      if (element) {
        element.textContent = currentDate;
      }
    });
  }

  updateUserDisplay() {
    const elements = [
      { id: 'headerUserName', prop: 'name' },
      { id: 'menuUserName', prop: 'name' },
      { id: 'menuUserRole', prop: 'role' }
    ];

    elements.forEach(({ id, prop }) => {
      const element = document.getElementById(id);
      if (element && this.currentUser) {
        if (prop === 'role') {
          element.textContent = this.getRoleName(this.currentUser[prop]);
        } else {
          element.textContent = this.currentUser[prop] || '';
        }
      }
    });

    // Update user avatar
    const avatar = document.getElementById('userAvatar');
    if (avatar && this.currentUser) {
      if (this.currentUser.name !== 'کاربر میهمان') {
        avatar.textContent = this.currentUser.name.charAt(0).toUpperCase();
      } else {
        avatar.innerHTML = '<i class="fas fa-user"></i>';
      }
    }
  }

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

  toggleTheme() {
    this.theme = this.theme === 'light' ? 'dark' : 'light';
    Utils.applyTheme(this.theme);
    this.updateThemeIcon();
  }

  updateThemeIcon() {
    const themeIcon = document.querySelector('.theme-toggle i');
    if (themeIcon) {
      themeIcon.className = this.theme === 'light' ? 'fas fa-moon' : 'fas fa-sun';
    }
  }

  toggleUserMenu() {
    const dropdown = document.getElementById('userMenuDropdown');
    if (dropdown) {
      dropdown.classList.toggle('show');
    }
  }

  showProfileModal() {
    // Implementation for profile modal
    Utils.showNotification('پروفایل کاربری در دست توسعه است', 'info');
  }

  handleResize() {
    if (window.chartInstance) {
      window.chartInstance.resize();
    }
  }

  handleKeyboardShortcuts(e) {
    // Ctrl/Cmd + shortcuts
    if (e.ctrlKey || e.metaKey) {
      switch (e.key) {
        case '1':
          e.preventDefault();
          this.showSection('data-entry');
          break;
        case '2':
          e.preventDefault();
          this.showSection('view-data');
          break;
        case '3':
          e.preventDefault();
          if (auth.hasRole(['technician', 'engineer', 'supervisor', 'admin', 'super_admin'])) {
            this.showSection('charts');
          }
          break;
        case 'l':
          e.preventDefault();
          auth.logout();
          break;
      }
    }
  }

  printTable() {
    Utils.printElement('dataTablesContainer', 'گزارش داده‌های ویبره');
  }

  toggleFullscreen(sectionId) {
    const section = document.getElementById(sectionId);
    if (!section) return;

    if (section.classList.contains('fullscreen')) {
      this.exitFullscreen(sectionId);
    } else {
      this.enterFullscreen(sectionId);
    }
  }

  enterFullscreen(sectionId) {
    const section = document.getElementById(sectionId);
    if (!section) return;

    section.classList.add('fullscreen');
    document.body.classList.add('fullscreen-mode');
  }

  exitFullscreen(sectionId) {
    const section = document.getElementById(sectionId);
    if (!section) return;

    section.classList.remove('fullscreen');
    document.body.classList.remove('fullscreen-mode');
  }
}

// Global functions for HTML onclick handlers
window.app = new App();

// Global function definitions
window.toggleTheme = () => window.app.toggleTheme();
window.toggleUserMenu = () => window.app.toggleUserMenu();
window.showProfileModal = () => window.app.showProfileModal();
window.selectUnit = (unitId) => window.app.selectUnit(unitId);
window.handleDataInput = () => window.app.handleDataInput();
window.saveCurrentData = () => window.app.saveCurrentData();
window.resetEntry = () => window.app.resetEntry();
window.switchDataEntryMode = (mode) => window.app.switchDataEntryMode(mode);
window.toggleFullscreen = (sectionId) => window.app.toggleFullscreen(sectionId);
window.printTable = () => window.app.printTable();

// Initialize app when DOM is loaded and auth is complete
document.addEventListener('DOMContentLoaded', () => {
  // Show loading screen initially
  document.getElementById('loadingScreen')?.classList.remove('d-none');
  
  // Initialize auth system
  auth.init();
});