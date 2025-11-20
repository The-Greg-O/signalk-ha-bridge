#!/usr/bin/with-contenv bashio

bashio::log.info "Starting SignalK HA Bridge..."

# ============================================================================
# Self-healing data directory initialization (migration-proof)
# Ensures persistent data directory exists even after HA migrations/restores
# ============================================================================
ADDON_SLUG="signalk-ha-bridge"  # matches config.yaml slug
DATA_DIR="/data/addons/data/${ADDON_SLUG}"

# Create data directory if missing (happens after migrations)
if [[ ! -d "$DATA_DIR" ]]; then
  bashio::log.warning "Data directory missing (likely after migration) - creating ${DATA_DIR}"
  mkdir -p "$DATA_DIR"
  chmod 755 "$DATA_DIR"
fi

# Create minimal options.json if completely missing
# This prevents Supervisor errors when trying to write add-on options
if [[ ! -f "$DATA_DIR/options.json" ]]; then
  bashio::log.warning "options.json missing - creating empty file (you may need to reconfigure settings)"
  echo '{}' > "$DATA_DIR/options.json"
  chmod 644 "$DATA_DIR/options.json"
fi

bashio::log.info "Data directory check complete"

# ============================================================================
# Get config from HA add-on options
# ============================================================================
export SIGNALK_HOST=$(bashio::config 'signalk_host')
export SIGNALK_PORT=$(bashio::config 'signalk_port')
export MQTT_BROKER=$(bashio::config 'mqtt_broker')
export MQTT_PORT=$(bashio::config 'mqtt_port')
export MQTT_USERNAME=$(bashio::config 'mqtt_username')
export MQTT_PASSWORD=$(bashio::config 'mqtt_password')
export RAW_MODE=$(bashio::config 'raw_mode' 'false')

bashio::log.info "SignalK Server: ${SIGNALK_HOST}:${SIGNALK_PORT}"
bashio::log.info "MQTT Broker: ${MQTT_BROKER}:${MQTT_PORT}"

# Start the Node.js application
cd /app
exec node src/index.js
