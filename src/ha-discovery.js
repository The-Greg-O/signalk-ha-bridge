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
   */
  publishDiscovery(signalkPath, sensorConfig, sourceId, sourceLabel, source) {
    const sensorId = this.getSensorId(signalkPath);
    const discoveryTopic = this.getDiscoveryTopic(signalkPath, sourceId);
    const stateTopic = this.getStateTopic(signalkPath, sourceId);
    const deviceId = this.getDeviceId(sourceId);

    const discoveryPayload = {
      name: sensorConfig.name,
      unique_id: `${deviceId}_${sensorId}`,
      state_topic: stateTopic,
      device: {
        identifiers: [deviceId],
        name: this.getDeviceName(sourceId, sourceLabel, source),
        manufacturer: this.getDeviceManufacturer(sourceId),
        model: this.getDeviceModel(sourceId, source),
        via_device: this.config.homeassistant.deviceId,
      },
    };

    // Add optional fields if they exist
    if (sensorConfig.deviceClass) {
      discoveryPayload.device_class = sensorConfig.deviceClass;
    }

    if (sensorConfig.unit) {
      discoveryPayload.unit_of_measurement = sensorConfig.unit;
    }

    if (sensorConfig.icon) {
      discoveryPayload.icon = sensorConfig.icon;
    }

    // Add value template for JSON state topics
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
