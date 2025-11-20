class HADiscovery {
  constructor(config, mqttClient, deviceRegistry = null) {
    this.config = config;
    this.mqttClient = mqttClient;
    this.deviceRegistry = deviceRegistry;
  }

  /**
   * Publish Home Assistant MQTT Discovery message
   * @param {string} signalkPath - SignalK path (e.g., "navigation.speedOverGround")
   * @param {Object} sensorConfig - Sensor configuration from config.json
   * @param {string} sourceId - N2K source ID (e.g., "3", "35", "43")
   * @param {string} sourceLabel - Human-readable source label
   * @param {Object} source - Full source object from SignalK message
   * @param {Object} meta - SignalK meta object (optional, for raw mode unit labeling)
   */
  publishDiscovery(signalkPath, sensorConfig, sourceId, sourceLabel, source, meta = null) {
    const sensorId = this.getSensorId(signalkPath);
    const discoveryTopic = this.getDiscoveryTopic(signalkPath, sourceId);
    const stateTopic = this.getStateTopic(signalkPath, sourceId);
    const deviceId = this.getDeviceId(sourceId);

    // Build entity name (add " (raw)" suffix if raw_mode is enabled)
    const entityName = this.config.rawMode
      ? `${sensorConfig.name} (raw)`
      : sensorConfig.name;

    // Build unique_id (add "_raw" suffix if raw_mode is enabled)
    const uniqueId = this.config.rawMode
      ? `${deviceId}_${sensorId}_raw`
      : `${deviceId}_${sensorId}`;

    const discoveryPayload = {
      name: entityName,
      unique_id: uniqueId,
      state_topic: stateTopic,
      device: {
        identifiers: [deviceId],
        name: this.getDeviceName(sourceId, sourceLabel, source),
        manufacturer: this.getDeviceManufacturer(sourceId),
        model: this.getDeviceModel(sourceId, source),
        via_device: this.config.homeassistant.deviceId,
      },
    };

    // Add device_class (only in normal mode for speed/wind/temp)
    // In raw mode, omit device_class so HA doesn't try to convert
    if (!this.config.rawMode && sensorConfig.deviceClass) {
      discoveryPayload.device_class = sensorConfig.deviceClass;
    }

    // Handle unit of measurement
    if (this.config.rawMode) {
      // RAW MODE: Use meta.units if available, otherwise omit unit entirely
      if (meta && meta.units) {
        discoveryPayload.unit_of_measurement = meta.units;
      }
      // No value_template in raw mode - publish raw values
    } else if (sensorConfig.unit) {
      // NORMAL MODE: Use target units (conversions already applied in sensor-converter)
      discoveryPayload.unit_of_measurement = sensorConfig.unit;

      // For angles: sensor-converter already converted rad→degrees, just set precision
      if (sensorConfig.unit === '°') {
        discoveryPayload.suggested_display_precision = 1;
      }
    }

    if (sensorConfig.icon) {
      discoveryPayload.icon = sensorConfig.icon;
    }

    // Add state_class for numeric sensors to enable history/statistics
    // Only add if unit exists and sensor is numeric (not position, not boolean)
    if (sensorConfig.unit && typeof sensorConfig.unit === 'string' && !this.isComplexSensor(signalkPath)) {
      discoveryPayload.state_class = 'measurement';
    }

    // Add value template for JSON state topics (position)
    if (this.isComplexSensor(signalkPath)) {
      discoveryPayload.value_template = '{{ value_json.value }}';
      discoveryPayload.json_attributes_topic = stateTopic;
    }

    // Publish discovery message with retain flag
    this.mqttClient.publish(discoveryTopic, discoveryPayload, { qos: 1, retain: true });
  }

  /**
   * Get device ID for a specific N2K source
   * @param {string} sourceId - N2K source ID
   * @returns {string} - Device ID
   */
  getDeviceId(sourceId) {
    return `n2k_src_${sourceId}`;
  }

  /**
   * Get device name for a specific N2K source
   * @param {string} sourceId - N2K source ID
   * @param {string} sourceLabel - Source label from SignalK
   * @param {Object} source - Full source object
   * @returns {string} - Device name
   */
  getDeviceName(sourceId, sourceLabel, source) {
    // Try device registry first for best name
    if (this.deviceRegistry) {
      const device = this.deviceRegistry.getDevice(sourceId);
      if (device && device.manufacturer && device.model) {
        return `${device.manufacturer} ${device.model}`;
      }
    }

    // Use label if available, otherwise use source ID
    if (sourceLabel && sourceLabel !== `N2K Source ${sourceId}`) {
      return sourceLabel;
    }
    return `N2K Source ${sourceId}`;
  }

  /**
   * Get device model from source information
   * @param {string} sourceId - N2K source ID
   * @param {Object} source - Source object from SignalK
   * @returns {string} - Device model
   */
  getDeviceModel(sourceId, source = {}) {
    // Try device registry first
    if (this.deviceRegistry) {
      const model = this.deviceRegistry.getModel(sourceId);
      if (model && model !== 'NMEA 2000 Device') {
        return model;
      }
    }

    // Fallback to source.type
    if (source && source.type) {
      return source.type;
    }
    return 'NMEA 2000 Device';
  }

  /**
   * Get device manufacturer from source information
   * @param {string} sourceId - N2K source ID
   * @returns {string} - Device manufacturer
   */
  getDeviceManufacturer(sourceId) {
    if (this.deviceRegistry) {
      return this.deviceRegistry.getManufacturer(sourceId);
    }
    return 'NMEA 2000';
  }

  /**
   * Get Home Assistant discovery topic
   * @param {string} signalkPath - SignalK path
   * @param {string} sourceId - N2K source ID
   * @returns {string} - Discovery topic
   */
  getDiscoveryTopic(signalkPath, sourceId) {
    const component = this.getComponentType(signalkPath);
    const sensorId = this.getSensorId(signalkPath);
    const deviceId = this.getDeviceId(sourceId);
    return `${this.config.homeassistant.discoveryPrefix}/${component}/${deviceId}/${sensorId}/config`;
  }

  /**
   * Get state topic for sensor
   * @param {string} signalkPath - SignalK path
   * @param {string} sourceId - N2K source ID
   * @returns {string} - State topic
   */
  getStateTopic(signalkPath, sourceId) {
    const sensorId = this.getSensorId(signalkPath);
    const deviceId = this.getDeviceId(sourceId);
    return `${this.config.homeassistant.discoveryPrefix}/sensor/${deviceId}/${sensorId}/state`;
  }

  /**
   * Get Home Assistant component type based on SignalK path
   * @param {string} signalkPath - SignalK path
   * @returns {string} - Component type (sensor, binary_sensor, etc.)
   */
  getComponentType(signalkPath) {
    // Most marine data are sensors
    // Could be extended for binary_sensors, switches, etc.
    return 'sensor';
  }

  /**
   * Generate sensor ID from SignalK path
   * @param {string} signalkPath - SignalK path
   * @returns {string} - Sensor ID
   */
  getSensorId(signalkPath) {
    return signalkPath.replace(/\./g, '_').replace(/\*/g, 'wildcard');
  }

  /**
   * Check if sensor requires complex value handling
   * @param {string} signalkPath - SignalK path
   * @returns {boolean}
   */
  isComplexSensor(signalkPath) {
    // Position sensors have lat/lon objects
    return signalkPath.includes('position');
  }
}

module.exports = HADiscovery;
