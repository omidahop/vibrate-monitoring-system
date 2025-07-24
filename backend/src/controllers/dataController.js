const { v4: uuidv4 } = require('uuid');
const { validationResult } = require('express-validator');
const { databases, logAudit } = require('../config/database');
const { logger } = require('../config/logger');

// Equipment and parameter configurations
const EQUIPMENT_CONFIG = [
  { id: 'GB-cp48A', name: 'گیربکس کمپرسور 48A', code: 'GB-cp 48A' },
  { id: 'CP-cp48A', name: 'کمپرسور 48A', code: 'CP-cp 48A' },
  { id: 'GB-cp48B', name: 'گیربکس کمپرسور 48B', code: 'GB-cp 48B' },
  { id: 'CP-cp48B', name: 'کمپرسور 48B', code: 'CP-cp 48B' },
  { id: 'GB-cp51', name: 'گیربکس کمپرسور 51', code: 'GB-cp 51' },
  { id: 'CP-cp51', name: 'کمپرسور 51', code: 'CP-cp 51' },
  { id: 'GB-cp71', name: 'گیربکس کمپرسور 71', code: 'GB-cp 71' },
  { id: 'CP-cp71', name: 'کمپرسور 71', code: 'CP-cp 71' },
  { id: 'CP-cpSGC', name: 'کمپرسور سیل گس', code: 'CP-cp SGC' },
  { id: 'FN-fnESF', name: 'فن استک', code: 'FN-fn ESF' },
  { id: 'FN-fnAUX', name: 'فن اگزیلاری', code: 'FN-fn AUX' },
  { id: 'FN-fnMAB', name: 'فن هوای اصلی', code: 'FN-fn MAB' }
];

const PARAMETER_CONFIG = [
  { id: 'V1', name: 'سرعت عمودی متصل', maxValue: 20, type: 'velocity' },
  { id: 'GV1', name: 'شتاب عمودی متصل', maxValue: 2, type: 'acceleration' },
  { id: 'H1', name: 'سرعت افقی متصل', maxValue: 20, type: 'velocity' },
  { id: 'GH1', name: 'شتاب افقی متصل', maxValue: 2, type: 'acceleration' },
  { id: 'A1', name: 'سرعت محوری متصل', maxValue: 20, type: 'velocity' },
  { id: 'GA1', name: 'شتاب محوری متصل', maxValue: 2, type: 'acceleration' },
  { id: 'V2', name: 'سرعت عمودی آزاد', maxValue: 20, type: 'velocity' },
  { id: 'GV2', name: 'شتاب عمودی آزاد', maxValue: 2, type: 'acceleration' },
  { id: 'H2', name: 'سرعت افقی آزاد', maxValue: 20, type: 'velocity' },
  { id: 'GH2', name: 'شتاب افقی آزاد', maxValue: 2, type: 'acceleration' },
  { id: 'A2', name: 'سرعت محوری آزاد', maxValue: 20, type: 'velocity' },
  { id: 'GA2', name: 'شتاب محوری آزاد', maxValue: 2, type: 'acceleration' }
];

// Validate parameter values
const validateParameters = (parameters) => {
  const errors = [];
  
  for (const [paramId, value] of Object.entries(parameters)) {
    const param = PARAMETER_CONFIG.find(p => p.id === paramId);
    
    if (!param) {
      errors.push(`پارامتر نامعتبر: ${paramId}`);
      continue;
    }
    
    const numValue = parseFloat(value);
    
    if (isNaN(numValue)) {
      errors.push(`مقدار پارامتر ${param.name} باید عدد باشد`);
      continue;
    }
    
    if (numValue < 0) {
      errors.push(`مقدار پارامتر ${param.name} نمی‌تواند منفی باشد`);
      continue;
    }
    
    if (numValue > param.maxValue) {
      errors.push(`مقدار پارامتر ${param.name} نمی‌تواند بیشتر از ${param.maxValue} باشد`);
      continue;
    }
    
    // Check decimal places (max 2)
    const decimalPlaces = (numValue.toString().split('.')[1] || '').length;
    if (decimalPlaces > 2) {
      errors.push(`پارامتر ${param.name} حداکثر 2 رقم اعشار مجاز است`);
    }
  }
  
  return errors;
};

// Get vibrate data
const getVibrateData = async (req, res) => {
  try {
    const { 
      unit, 
      equipment, 
      date, 
      dateFrom, 
      dateTo, 
      page = 1, 
      limit = 50 
    } = req.query;
    
    let selector = {};
    
    if (unit) selector.unit = unit;
    if (equipment) selector.equipment = equipment;
    if (date) selector.date = date;
    
    const result = await databases.vibrateData.find({
      selector,
      sort: [{ timestamp: 'desc' }],
      limit: parseInt(limit),
      skip: (parseInt(page) - 1) * parseInt(limit)
    });

    // Filter by date range if provided
    let data = result.docs;
    if (dateFrom || dateTo) {
      data = data.filter(item => {
        const itemDate = item.date;
        if (dateFrom && itemDate < dateFrom) return false;
        if (dateTo && itemDate > dateTo) return false;
        return true;
      });
    }

    // Log data access
    await logAudit(req.user.userId, 'DATA_ACCESSED', {
      filters: { unit, equipment, date, dateFrom, dateTo },
      resultCount: data.length,
      ip: req.ip
    });

    res.json({
      success: true,
      data,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: data.length
      }
    });
  } catch (error) {
    logger.error('Get vibrate data error:', error);
    res.status(500).json({
      error: 'خطا در دریافت داده‌های ویبره'
    });
  }
};

// Save vibrate data
const saveVibrateData = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'اطلاعات وارد شده نامعتبر است',
        details: errors.array().map(err => err.msg)
      });
    }

    const { unit, equipment, date, parameters, notes = '' } = req.body;

    // Validate unit
    if (!['DRI1', 'DRI2'].includes(unit)) {
      return res.status(400).json({
        error: 'واحد نامعتبر است'
      });
    }

    // Validate equipment
    const validEquipment = EQUIPMENT_CONFIG.find(e => e.id === equipment);
    if (!validEquipment) {
      return res.status(400).json({
        error: 'تجهیز نامعتبر است'
      });
    }

    // Validate parameters
    const paramErrors = validateParameters(parameters);
    if (paramErrors.length > 0) {
      return res.status(400).json({
        error: 'خطا در پارامترها',
        details: paramErrors
      });
    }

    // Create data item
    const dataId = `data_${unit}_${equipment}_${date}`;
    const dataItem = {
      _id: dataId,
      unit,
      equipment,
      date,
      parameters,
      notes: notes.trim(),
      timestamp: new Date().toISOString(),
      userId: req.user.userId,
      userName: req.user.name
    };

    // Check if data already exists
    let isUpdate = false;
    try {
      const existing = await databases.vibrateData.get(dataId);
      dataItem._rev = existing._rev;
      isUpdate = true;
    } catch (error) {
      // Data doesn't exist, create new
    }

    const result = await databases.vibrateData.put(dataItem);

    // Log data save
    await logAudit(req.user.userId, isUpdate ? 'DATA_UPDATED' : 'DATA_CREATED', {
      dataId: result.id,
      unit,
      equipment,
      date,
      parametersCount: Object.keys(parameters).length,
      ip: req.ip
    });

    logger.info(`Data ${isUpdate ? 'updated' : 'created'}: ${dataId} by ${req.user.email}`);

    res.json({
      success: true,
      message: isUpdate ? 'داده با موفقیت به‌روزرسانی شد' : 'داده جدید ذخیره شد',
      data: {
        id: result.id,
        unit,
        equipment,
        date,
        timestamp: dataItem.timestamp
      }
    });
  } catch (error) {
    logger.error('Save vibrate data error:', error);
    res.status(500).json({
      error: 'خطا در ذخیره داده‌های ویبره'
    });
  }
};

// Delete vibrate data
const deleteVibrateData = async (req, res) => {
  try {
    const { dataId } = req.params;
    
    // Only admins and supervisors can delete data
    if (!['admin', 'super_admin', 'supervisor'].includes(req.user.role)) {
      return res.status(403).json({
        error: 'شما مجوز حذف داده‌ها را ندارید'
      });
    }

    const data = await databases.vibrateData.get(dataId);
    
    await databases.vibrateData.remove(data);

    // Log data deletion
    await logAudit(req.user.userId, 'DATA_DELETED', {
      dataId,
      deletedData: {
        unit: data.unit,
        equipment: data.equipment,
        date: data.date
      },
      ip: req.ip
    });

    logger.info(`Data deleted: ${dataId} by ${req.user.email}`);

    res.json({
      success: true,
      message: 'داده با موفقیت حذف شد'
    });
  } catch (error) {
    if (error.name === 'not_found') {
      return res.status(404).json({
        error: 'داده یافت نشد'
      });
    }

    logger.error('Delete vibrate data error:', error);
    res.status(500).json({
      error: 'خطا در حذف داده'
    });
  }
};

// Get data analysis (for anomaly detection)
const getDataAnalysis = async (req, res) => {
  try {
    const { 
      threshold = 20, 
      timeRange = 7, 
      comparisonDays = 1 
    } = req.query;

    const thresholdVal = parseFloat(threshold);
    const timeRangeVal = parseInt(timeRange);
    const comparisonDaysVal = parseInt(comparisonDays);

    // Get data from specified time range
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - timeRangeVal);

    const startDateStr = startDate.toISOString().split('T')[0];
    const endDateStr = endDate.toISOString().split('T')[0];

    const result = await databases.vibrateData.find({
      selector: {
        date: {
          $gte: startDateStr,
          $lte: endDateStr
        }
      },
      sort: [{ date: 'desc' }]
    });

    const data = result.docs;
    const anomalies = [];

    // Group data by unit and equipment
    const dataGroups = {};
    data.forEach(item => {
      const key = `${item.unit}_${item.equipment}`;
      if (!dataGroups[key]) {
        dataGroups[key] = [];
      }
      dataGroups[key].push(item);
    });

    // Find anomalies
    for (const [groupKey, groupData] of Object.entries(dataGroups)) {
      if (groupData.length < 2) continue;

      // Sort by date
      groupData.sort((a, b) => new Date(b.date) - new Date(a.date));

      const latest = groupData[0];
      const comparison = groupData[comparisonDaysVal] || groupData[groupData.length - 1];

      for (const parameterId of Object.keys(latest.parameters)) {
        const latestValue = latest.parameters[parameterId];
        const comparisonValue = comparison.parameters[parameterId];

        if (!latestValue || !comparisonValue || comparisonValue === 0) continue;

        const increasePercentage = ((latestValue - comparisonValue) / comparisonValue) * 100;

        if (increasePercentage >= thresholdVal) {
          const [unit, equipment] = groupKey.split('_');
          const equipmentInfo = EQUIPMENT_CONFIG.find(e => e.id === equipment);
          const parameterInfo = PARAMETER_CONFIG.find(p => p.id === parameterId);

          anomalies.push({
            unit,
            equipment,
            equipmentName: equipmentInfo?.name || equipment,
            parameter: parameterId,
            parameterName: parameterInfo?.name || parameterId,
            currentValue: latestValue,
            previousValue: comparisonValue,
            increasePercentage: Math.round(increasePercentage * 100) / 100,
            increaseAmount: Math.round((latestValue - comparisonValue) * 100) / 100,
            latestDate: latest.date,
            comparisonDate: comparison.date
          });
        }
      }
    }

    // Sort anomalies by increase percentage (highest first)
    anomalies.sort((a, b) => b.increasePercentage - a.increasePercentage);

    // Log analysis request
    await logAudit(req.user.userId, 'DATA_ANALYSIS_REQUESTED', {
      threshold: thresholdVal,
      timeRange: timeRangeVal,
      comparisonDays: comparisonDaysVal,
      anomaliesFound: anomalies.length,
      ip: req.ip
    });

    res.json({
      success: true,
      anomalies,
      analysis: {
        threshold: thresholdVal,
        timeRange: timeRangeVal,
        comparisonDays: comparisonDaysVal,
        totalDataPoints: data.length,
        anomaliesFound: anomalies.length
      }
    });
  } catch (error) {
    logger.error('Get data analysis error:', error);
    res.status(500).json({
      error: 'خطا در آنالیز داده‌ها'
    });
  }
};

// Get equipment and parameter configurations
const getConfigurations = async (req, res) => {
  try {
    res.json({
      success: true,
      equipment: EQUIPMENT_CONFIG,
      parameters: PARAMETER_CONFIG,
      units: [
        { id: 'DRI1', name: 'واحد احیا مستقیم 1', code: 'DRI 1' },
        { id: 'DRI2', name: 'واحد احیا مستقیم 2', code: 'DRI 2' }
      ]
    });
  } catch (error) {
    logger.error('Get configurations error:', error);
    res.status(500).json({
      error: 'خطا در دریافت تنظیمات'
    });
  }
};

module.exports = {
  getVibrateData,
  saveVibrateData,
  deleteVibrateData,
  getDataAnalysis,
  getConfigurations
};