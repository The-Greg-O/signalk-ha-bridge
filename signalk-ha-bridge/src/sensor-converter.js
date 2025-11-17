class SensorConverter {
  constructor(config) {
    this.config = config;
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
    const pathParts = signalkPath.split('.');
    const lastPart = pathParts[pathParts.length - 1];

    // Generate friendly name from path
    const name = this.generateFriendlyName(signalkPath);

    // Auto-detect device class and unit
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
   * @param {string} signalkPath - SignalK path
   * @param {*} value - SignalK value
   * @returns {Object} - { deviceClass, unit, icon }
   */
  inferMetadata(signalkPath, value) {
    let deviceClass = null;
    let unit = null;
    let icon = 'mdi:gauge';

    // Temperature
    if (signalkPath.includes('temperature')) {
      deviceClass = 'temperature';
      unit = 'K';
      icon = 'mdi:thermometer';
    }
    // Speed
    else if (signalkPath.includes('speed') || signalkPath.includes('Speed')) {
      deviceClass = 'speed';
      unit = 'm/s';
      icon = 'mdi:speedometer';
    }
    // Distance/Depth
    else if (signalkPath.includes('depth') || signalkPath.includes('log') || signalkPath.includes('distance')) {
      deviceClass = 'distance';
      unit = 'm';
      icon = 'mdi:map-marker-distance';
    }
    // Voltage
    else if (signalkPath.includes('voltage')) {
      deviceClass = 'voltage';
      unit = 'V';
      icon = 'mdi:flash';
    }
    // Current
    else if (signalkPath.includes('current') && !signalkPath.includes('Level')) {
      deviceClass = 'current';
      unit = 'A';
      icon = 'mdi:current-ac';
    }
    // Pressure
    else if (signalkPath.includes('pressure')) {
      deviceClass = 'pressure';
      unit = 'Pa';
      icon = 'mdi:gauge';
    }
    // Angles/Heading/Course
    else if (signalkPath.includes('angle') || signalkPath.includes('heading') || signalkPath.includes('course') || signalkPath.includes('Angle')) {
      unit = 'rad';
      icon = 'mdi:compass';
    }
    // Position
    else if (signalkPath.includes('position')) {
      icon = 'mdi:crosshairs-gps';
    }
    // Volume
    else if (signalkPath.includes('volume')) {
      icon = 'mdi:volume-high';
    }
    // State/Power
    else if (signalkPath.includes('state')) {
      icon = 'mdi:power';
    }
    // Muted
    else if (signalkPath.includes('Muted') || signalkPath.includes('muted')) {
      icon = 'mdi:volume-mute';
    }
    // Track/Song info
    else if (signalkPath.includes('track') || signalkPath.includes('artist') || signalkPath.includes('album')) {
      icon = 'mdi:music';
    }
    // Satellites
    else if (signalkPath.includes('satellites')) {
      icon = 'mdi:satellite-variant';
    }
    // Wind
    else if (signalkPath.includes('wind')) {
      deviceClass = 'wind_speed';
      unit = 'm/s';
      icon = 'mdi:weather-windy';
    }
    // Boolean values
    else if (typeof value === 'boolean') {
      icon = 'mdi:toggle-switch';
    }

    return { deviceClass, unit, icon };
  }

  /**
   * Convert SignalK value to Home Assistant format
   * @param {string} signalkPath - SignalK path
   * @param {*} value - SignalK value
   * @param {Object} sensorConfig - Sensor configuration
   * @returns {string} - Converted value for HA
   */
  convertValue(signalkPath, value, sensorConfig) {
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

    // Handle numeric values - keep SI units unchanged
    if (typeof value === 'number') {
      // Round to 2 decimal places for readability
      return value.toFixed(2);
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
