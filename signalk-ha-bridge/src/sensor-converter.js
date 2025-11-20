class SensorConverter {
  constructor(config) {
    this.config = config;
    // Cache for temperature conversion functions per path
    this.tempTransformCache = new Map();

    // Regex-based device class lookup table (case-insensitive)
    this.deviceClassMap = [
      // Temperature sensors (all variations)
      { pattern: /\b(water|outside|inside|engine|exhaust|coolant).*temperature/i, deviceClass: 'temperature', unit: '°C', icon: 'mdi:thermometer' },
      { pattern: /temperature/i, deviceClass: 'temperature', unit: '°C', icon: 'mdi:thermometer' },

      // Speed sensors
      { pattern: /speedOverGround|speed\.sog|\.sog$/i, deviceClass: 'speed', unit: 'm/s', icon: 'mdi:speedometer' },
      { pattern: /speedThroughWater|speed\.stw|\.stw$/i, deviceClass: 'speed', unit: 'm/s', icon: 'mdi:speedometer-medium' },

      // Wind speed (special device_class)
      { pattern: /wind.*speed|windSpeed/i, deviceClass: 'wind_speed', unit: 'm/s', icon: 'mdi:weather-windy' },

      // Distance/Depth
      { pattern: /depth\.(below|surface)/i, deviceClass: 'distance', unit: 'm', icon: 'mdi:waves' },
      { pattern: /\b(log|trip|distance)\b/i, deviceClass: 'distance', unit: 'm', icon: 'mdi:map-marker-distance' },

      // Angles (heading, course, wind angle)
      { pattern: /\b(heading|course|courseOver|cog|angle|direction)\b/i, deviceClass: null, unit: 'rad', icon: 'mdi:compass' },
      { pattern: /wind.*angle/i, deviceClass: null, unit: 'rad', icon: 'mdi:windsock' },

      // Voltage
      { pattern: /voltage/i, deviceClass: 'voltage', unit: 'V', icon: 'mdi:flash' },

      // Current (electrical)
      { pattern: /\bcurrent\b(?!.*level)/i, deviceClass: 'current', unit: 'A', icon: 'mdi:current-ac' },

      // Pressure
      { pattern: /pressure/i, deviceClass: 'pressure', unit: 'Pa', icon: 'mdi:gauge' },

      // Position
      { pattern: /position/i, deviceClass: null, unit: null, icon: 'mdi:crosshairs-gps' },

      // Satellites
      { pattern: /satellites/i, deviceClass: null, unit: null, icon: 'mdi:satellite-variant' },
    ];
  }

  /**
   * Get sensor configuration for a given SignalK path
   * Auto-generates config if not explicitly defined in config file
   * @param {string} signalkPath - SignalK path
   * @param {*} value - SignalK value (used to infer type)
   * @returns {Object} - Sensor configuration (never null)
   */
  getSensorConfig(signalkPath, value = null) {
    // Check if explicitly configured in config file
    if (this.config.sensors && this.config.sensors[signalkPath]) {
      return this.config.sensors[signalkPath];
    }

    // Check wildcard match (e.g., "electrical.batteries.*.voltage")
    if (this.config.sensors) {
      for (const [configPath, sensorConfig] of Object.entries(this.config.sensors)) {
        if (configPath.includes('*')) {
          const pattern = configPath.replace(/\*/g, '[^.]+');
          const regex = new RegExp(`^${pattern}$`);
          if (regex.test(signalkPath)) {
            return sensorConfig;
          }
        }
      }
    }

    // Auto-generate configuration from path
    return this.autoGenerateConfig(signalkPath, value);
  }

  /**
   * Auto-generate sensor config from SignalK path
   * @param {string} signalkPath - SignalK path
   * @param {*} value - SignalK value
   * @returns {Object} - Generated sensor configuration
   */
  autoGenerateConfig(signalkPath, value) {
    // Generate friendly name from path
    const name = this.generateFriendlyName(signalkPath);

    // Auto-detect device class and unit using regex table
    const { deviceClass, unit, icon } = this.inferMetadata(signalkPath, value);

    return {
      enabled: true,
      name: name,
      deviceClass: deviceClass,
      unit: unit,
      icon: icon
    };
  }

  /**
   * Generate friendly name from SignalK path
   * @param {string} signalkPath - SignalK path
   * @returns {string} - Friendly name
   */
  generateFriendlyName(signalkPath) {
    // Convert path like "environment.water.temperature" to "Water Temperature"
    const parts = signalkPath.split('.');

    // Take last 2-3 meaningful parts
    const relevantParts = parts.slice(-2);

    return relevantParts
      .map(part => part.charAt(0).toUpperCase() + part.slice(1))
      .map(part => part.replace(/([A-Z])/g, ' $1').trim()) // Add spaces before capitals
      .join(' ');
  }

  /**
   * Infer metadata (device class, unit, icon) from SignalK path and value
   * Uses regex-based lookup table for precise matching
   * @param {string} signalkPath - SignalK path
   * @param {*} value - SignalK value
   * @returns {Object} - { deviceClass, unit, icon }
   */
  inferMetadata(signalkPath, value) {
    // Try regex table first (most specific)
    for (const entry of this.deviceClassMap) {
      if (entry.pattern.test(signalkPath)) {
        return {
          deviceClass: entry.deviceClass,
          unit: entry.unit,
          icon: entry.icon
        };
      }
    }

    // Boolean fallback
    if (typeof value === 'boolean') {
      return { deviceClass: null, unit: null, icon: 'mdi:toggle-switch' };
    }

    // Default for unknown types
    return { deviceClass: null, unit: null, icon: 'mdi:gauge' };
  }

  /**
   * Get or create cached temperature conversion function for a path
   * Default assumption: if meta is missing, assume °C (many modern SignalK feeds already output °C)
   * If meta.units is explicitly K or F, convert accordingly
   * @param {string} signalkPath - SignalK path
   * @param {Object} meta - SignalK meta object (if available)
   * @returns {Function} - Conversion function (value) => convertedValue
   */
  getTempTransform(signalkPath, meta = null) {
    // Check cache first
    if (this.tempTransformCache.has(signalkPath)) {
      return this.tempTransformCache.get(signalkPath);
    }

    // Determine transform based on meta.units
    let transform;
    const metaUnits = meta?.units;

    if (metaUnits === 'K') {
      // Explicit Kelvin → Celsius
      transform = (v) => v - 273.15;
    } else if (metaUnits === 'F' || metaUnits === '°F') {
      // Explicit Fahrenheit → Celsius
      transform = (v) => (v - 32) * 5/9;
    } else {
      // Default (no meta or meta says C/°C): assume already Celsius (identity)
      transform = (v) => v;
    }

    // Cache it
    this.tempTransformCache.set(signalkPath, transform);
    return transform;
  }

  /**
   * Round value intelligently based on type
   * @param {number} value - Value to round
   * @param {string} signalkPath - SignalK path
   * @param {Object} sensorConfig - Sensor config
   * @returns {number} - Rounded value
   */
  smartRound(value, signalkPath, sensorConfig) {
    if (typeof value !== 'number' || !isFinite(value)) {
      return value;
    }

    // Never round position (lat/lon)
    if (signalkPath.includes('position')) {
      return value;
    }

    // Never round pressure (need precision for weather)
    if (signalkPath.includes('pressure')) {
      return Number(value.toFixed(2));
    }

    // 1 decimal for temp, speed, wind, depth, angles
    if (
      sensorConfig.deviceClass === 'temperature' ||
      sensorConfig.deviceClass === 'speed' ||
      sensorConfig.deviceClass === 'wind_speed' ||
      sensorConfig.deviceClass === 'distance' ||
      sensorConfig.unit === 'rad' ||
      sensorConfig.unit === '°'
    ) {
      return Number(value.toFixed(1));
    }

    // 2 decimals for everything else
    return Number(value.toFixed(2));
  }

  /**
   * Convert SignalK value to Home Assistant format
   * Implements v6 spec: meta-aware temp conversion, smart rounding, raw mode support
   * @param {string} signalkPath - SignalK path
   * @param {*} value - SignalK value
   * @param {Object} sensorConfig - Sensor configuration
   * @param {Object} meta - SignalK meta object (optional)
   * @returns {string} - Converted value for HA
   */
  convertValue(signalkPath, value, sensorConfig, meta = null) {
    // Handle null/undefined values
    if (value === null || value === undefined) {
      return 'unknown';
    }

    // Handle position (lat/lon object)
    if (signalkPath.includes('position') && typeof value === 'object' && value.latitude && value.longitude) {
      return JSON.stringify({
        value: `${value.latitude.toFixed(6)}, ${value.longitude.toFixed(6)}`,
        latitude: value.latitude,
        longitude: value.longitude,
      });
    }

    // Handle datetime/timestamp
    if (signalkPath.includes('datetime') || (sensorConfig && sensorConfig.deviceClass === 'timestamp')) {
      return new Date(value).toISOString();
    }

    // Handle numeric values
    if (typeof value === 'number') {
      // Check if NaN or non-finite
      if (!isFinite(value)) {
        return 'unknown';
      }

      // RAW MODE: return exactly as received (no conversion, no rounding)
      if (this.config.rawMode) {
        return value.toString();
      }

      // NORMAL MODE: Apply conversions

      // Temperature conversion (K/°F → °C)
      if (sensorConfig.deviceClass === 'temperature') {
        const transform = this.getTempTransform(signalkPath, meta);
        value = transform(value);

        // Sanity check
        if (value < -50 || value > 100) {
          console.warn(`⚠️  Suspicious temperature value ${value.toFixed(1)}°C for ${signalkPath} - check meta.units`);
        }
      }

      // Apply smart rounding
      return this.smartRound(value, signalkPath, sensorConfig).toString();
    }

    // Handle objects (convert to JSON string)
    if (typeof value === 'object') {
      return JSON.stringify(value);
    }

    // Handle strings and other types
    return String(value);
  }
}

module.exports = SensorConverter;
