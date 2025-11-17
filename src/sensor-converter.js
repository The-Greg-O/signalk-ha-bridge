class SensorConverter {
  constructor(config) {
    this.config = config;
  }

  /**
   * Get sensor configuration for a given SignalK path
   * @param {string} signalkPath - SignalK path
   * @returns {Object|null} - Sensor configuration or null if not found
   */
  getSensorConfig(signalkPath) {
    // Direct match
    if (this.config.sensors[signalkPath]) {
      return this.config.sensors[signalkPath];
    }

    // Wildcard match (e.g., "electrical.batteries.*.voltage")
    for (const [configPath, sensorConfig] of Object.entries(this.config.sensors)) {
      if (configPath.includes('*')) {
        const pattern = configPath.replace(/\*/g, '[^.]+');
        const regex = new RegExp(`^${pattern}$`);
        if (regex.test(signalkPath)) {
          return sensorConfig;
        }
      }
    }

    return null;
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
    if (signalkPath.includes('position') && typeof value === 'object') {
      return JSON.stringify({
        value: `${value.latitude.toFixed(6)}, ${value.longitude.toFixed(6)}`,
        latitude: value.latitude,
        longitude: value.longitude,
      });
    }

    // Handle datetime/timestamp
    if (signalkPath.includes('datetime') || sensorConfig.deviceClass === 'timestamp') {
      return new Date(value).toISOString();
    }

    // Unit conversions
    const converted = this.convertUnits(signalkPath, value, sensorConfig);

    // Handle numeric values
    if (typeof converted === 'number') {
      // Round to 2 decimal places for readability
      return converted.toFixed(2);
    }

    // Handle strings and other types
    return String(converted);
  }

  /**
   * Convert SignalK units to Home Assistant preferred units
   * @param {string} signalkPath - SignalK path
   * @param {number} value - Value in SignalK units
   * @param {Object} sensorConfig - Sensor configuration
   * @returns {number} - Converted value
   */
  convertUnits(signalkPath, value, sensorConfig) {
    if (typeof value !== 'number') {
      return value;
    }

    // Temperature: Kelvin to Celsius
    if (sensorConfig.unit === 'K' && signalkPath.includes('temperature')) {
      return value - 273.15;
    }

    // Speed: m/s to knots (common for marine)
    if (sensorConfig.deviceClass === 'speed' && sensorConfig.unit === 'm/s') {
      return value * 1.94384; // Convert m/s to knots
    }

    // Angle: radians to degrees
    if (sensorConfig.unit === 'rad') {
      return (value * 180) / Math.PI;
    }

    // Default: return as-is
    return value;
  }
}

module.exports = SensorConverter;
