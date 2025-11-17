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

    // Handle numeric values - keep SI units unchanged
    if (typeof value === 'number') {
      // Round to 2 decimal places for readability
      return value.toFixed(2);
    }

    // Handle strings and other types
    return String(value);
  }
}

module.exports = SensorConverter;
