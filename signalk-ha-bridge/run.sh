#!/usr/bin/with-contenv bashio

bashio::log.info "Starting SignalK HA Bridge..."

# Get config from HA add-on options
export SIGNALK_HOST=$(bashio::config 'signalk_host')
export SIGNALK_PORT=$(bashio::config 'signalk_port')
export MQTT_BROKER=$(bashio::config 'mqtt_broker')
export MQTT_PORT=$(bashio::config 'mqtt_port')
export MQTT_USERNAME=$(bashio::config 'mqtt_username')
export MQTT_PASSWORD=$(bashio::config 'mqtt_password')

bashio::log.info "SignalK Server: ${SIGNALK_HOST}:${SIGNALK_PORT}"
bashio::log.info "MQTT Broker: ${MQTT_BROKER}:${MQTT_PORT}"

# Start the Node.js application
cd /app
exec node src/index.js
