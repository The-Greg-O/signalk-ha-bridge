require('dotenv').config();
const fs = require('fs');
const path = require('path');
const MQTTClient = require('./mqtt-client');
const SignalKClient = require('./signalk-client');
const HADiscovery = require('./ha-discovery');
const SensorConverter = require('./sensor-converter');
const DeviceRegistry = require('./device-registry');

// Load configuration
const configPath = path.join(__dirname, '..', 'app-config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

// Override config with environment variables if provided
if (process.env.MQTT_BROKER) config.mqtt.broker = process.env.MQTT_BROKER;
if (process.env.MQTT_PORT) config.mqtt.port = parseInt(process.env.MQTT_PORT);
if (process.env.MQTT_USERNAME) config.mqtt.username = process.env.MQTT_USERNAME;
if (process.env.MQTT_PASSWORD) config.mqtt.password = process.env.MQTT_PASSWORD;
if (process.env.SIGNALK_HOST) config.signalk.host = process.env.SIGNALK_HOST;
if (process.env.SIGNALK_PORT) config.signalk.port = parseInt(process.env.SIGNALK_PORT);
if (process.env.RAW_MODE !== undefined) config.rawMode = process.env.RAW_MODE === 'true';

// Default raw_mode to false if not set
if (config.rawMode === undefined) {
  config.rawMode = false;
}

console.log('🚢 N2K HA Bridge starting...');
console.log(`📡 SignalK Server: ${config.signalk.host}:${config.signalk.port}`);
console.log(`📡 MQTT Broker: ${config.mqtt.broker}:${config.mqtt.port}`);
console.log(`🔑 MQTT Auth: ${config.mqtt.username ? 'Enabled (user: ' + config.mqtt.username + ')' : 'Disabled'}`);
console.log(`🏠 Home Assistant Discovery: ${config.homeassistant.discoveryPrefix}`);
console.log(`📏 Unit Mode: ${config.rawMode ? 'Raw (debug)' : 'Auto (HA unit system)'}`);

// Initialize components
const mqttClient = new MQTTClient(config);
const signalKClient = new SignalKClient(config);
const deviceRegistry = new DeviceRegistry(config);
const haDiscovery = new HADiscovery(config, mqttClient, deviceRegistry);
const sensorConverter = new SensorConverter(config);

// Track discovered sensors
const discoveredSensors = new Set();

// Track last publish time for throttling (sensorKey -> timestamp)
const lastPublishTime = new Map();
const PUBLISH_THROTTLE_MS = 1000; // Publish max once per second per sensor

// Track if device registry is ready
let deviceRegistryReady = false;

// Initialize device registry
async function initializeDeviceRegistry() {
  try {
    console.log('📋 Fetching device information from SignalK...');
    await deviceRegistry.fetchDevices();
  } catch (error) {
    console.warn('⚠️  Could not fetch device registry from SignalK:', error.message);
    console.warn('⚠️  Continuing without device metadata...');
  } finally {
    deviceRegistryReady = true;
  }
}

// Handle MQTT connection (for Home Assistant integration)
mqttClient.on('connected', () => {
  console.log('✅ Connected to MQTT broker (Home Assistant)');
});

mqttClient.on('error', (error) => {
  console.error('❌ MQTT Error:', error.message);
});

mqttClient.on('reconnecting', () => {
  console.log('🔄 Reconnecting to MQTT broker...');
});

// Handle SignalK connection
signalKClient.on('connected', async () => {
  console.log('✅ Connected to SignalK WebSocket');

  // Fetch device metadata after connection
  await initializeDeviceRegistry();
});

signalKClient.on('hello', (message) => {
  console.log(`👋 SignalK Server: ${message.name || 'Unknown'} v${message.version || 'Unknown'}`);
  if (message.self) {
    console.log(`🚢 Vessel: ${message.self}`);
  }
});

signalKClient.on('delta', (data) => {
  try {
    // Wait for device registry to load before processing deltas
    if (!deviceRegistryReady) {
      return;
    }

    if (!data || !data.updates || data.updates.length === 0) {
      return;
    }

    // Extract context (vessel self identifier)
    const context = data.context || 'vessels.self';

    // Process each update
    data.updates.forEach(update => {
      if (!update.values || update.values.length === 0) return;

      // Extract source information from the update
      let source = update.source || update.$source || {};

      // Handle string sources (e.g., "derived-data", "defaults")
      if (typeof source === 'string') {
        source = { label: source, src: source };
      }

      const sourceId = source.src || source.label || 'unknown';
      const sourceLabel = source.label || `N2K Source ${sourceId}`;

      update.values.forEach(({ path, value, meta }) => {
        // Expand objects into separate entities (e.g., attitude.yaw, attitude.pitch, attitude.roll)
        const pathsToProcess = expandObjectPaths(path, value);

        pathsToProcess.forEach(({ path: expandedPath, value: expandedValue }) => {
          // Get or auto-generate sensor configuration
          const sensorConfig = sensorConverter.getSensorConfig(expandedPath, expandedValue);

          // Skip if explicitly disabled in config
          if (sensorConfig.enabled === false) {
            return;
          }

          // Auto-discover sensor in Home Assistant (only once per source+path combination)
          const sensorKey = `${sourceId}_${expandedPath}`;
          if (!discoveredSensors.has(sensorKey)) {
            haDiscovery.publishDiscovery(expandedPath, sensorConfig, sourceId, sourceLabel, source, meta);
            discoveredSensors.add(sensorKey);

            // Get device info for logging
            const deviceInfo = deviceRegistry.getDevice(sourceId);
            const deviceName = deviceInfo
              ? `${deviceInfo.manufacturer} ${deviceInfo.model}`
              : sourceLabel;

            console.log(`🔍 Discovered: ${sensorConfig.name} (${expandedPath}) on ${deviceName}`);
          }

          // Throttle publishing - max once per second per sensor
          const publishKey = `${sourceId}_${expandedPath}`;
          const now = Date.now();
          const lastPublish = lastPublishTime.get(publishKey) || 0;

          if (now - lastPublish >= PUBLISH_THROTTLE_MS) {
            // Convert and publish sensor value (pass meta for unit awareness)
            const haValue = sensorConverter.convertValue(expandedPath, expandedValue, sensorConfig, meta);
            const stateTopic = haDiscovery.getStateTopic(expandedPath, sourceId);
            mqttClient.publish(stateTopic, haValue);

            lastPublishTime.set(publishKey, now);
          }
        });
      });
    });
  } catch (error) {
    console.error('❌ Error processing SignalK delta:', error.message);
  }
});

signalKClient.on('error', (error) => {
  console.error('❌ SignalK Error:', error.message);
});

signalKClient.on('disconnected', () => {
  console.log('🔌 Disconnected from SignalK');
});

/**
 * Expand object values into separate path/value pairs
 * E.g., attitude: {yaw, pitch, roll} → attitude.yaw, attitude.pitch, attitude.roll
 * @param {string} path - SignalK path
 * @param {*} value - SignalK value
 * @returns {Array} - Array of {path, value} objects
 */
function expandObjectPaths(path, value) {
  // Skip null/undefined
  if (value === null || value === undefined) {
    return [{ path, value }];
  }

  // Special handling for position (already formatted correctly)
  if (path.includes('position') && typeof value === 'object' && value.latitude && value.longitude) {
    return [{ path, value }];
  }

  // If value is a simple object with numeric/string/boolean properties, expand it
  if (typeof value === 'object' && !Array.isArray(value) && value !== null) {
    const isSimpleObject = Object.values(value).every(v =>
      typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean' || v === null
    );

    if (isSimpleObject) {
      const expanded = [];
      for (const [key, val] of Object.entries(value)) {
        expanded.push({
          path: `${path}.${key}`,
          value: val
        });
      }
      return expanded.length > 0 ? expanded : [{ path, value }];
    }
  }

  // Default: return as-is
  return [{ path, value }];
}

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down...');
  mqttClient.disconnect();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Shutting down...');
  mqttClient.disconnect();
  process.exit(0);
});

// Connect to MQTT broker and SignalK
mqttClient.connect();
signalKClient.connect();
