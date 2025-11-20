# N2K HA Bridge

## Vision

N2K HA Bridge aims to seamlessly integrate NMEA 2000 (N2K) marine networks with Home Assistant (HA), enabling marine enthusiasts and professionals to monitor and automate their vessels using a unified platform. By bridging these technologies, the project seeks to enhance situational awareness, safety, and convenience on the water.

## What This Project Does

- Connects directly to SignalK server via WebSocket streaming API for real-time NMEA 2000 sensor data
- Translates SignalK data into Home Assistant-compatible sensor entities using MQTT Discovery
- Supports bidirectional control - read sensor data AND send commands back to N2K devices
- Automatically identifies and organizes devices by manufacturer and model from SignalK metadata
- Supports multiple sensor types including GPS, engine data, environmental sensors, autopilot, and more
- Provides real-time updates and status monitoring within Home Assistant
- Offers configurable mappings and easy setup for diverse marine hardware
- Designed for deployment as a Home Assistant add-on for turnkey integration

## Current Architecture

The bridge application acts as a middleware layer connecting SignalK to Home Assistant:

- **NMEA 2000 → SignalK:** N2K interface (e.g., PICAN-M, Actisense NGT-1, USB adapter) connects to SignalK server
- **SignalK Server:** Decodes NMEA 2000 PGNs and provides WebSocket streaming API and REST API for device metadata
- **N2K HA Bridge:** Connects to SignalK via WebSocket for real-time data streaming and REST API for device information
- **Home Assistant Integration:** Bridge publishes sensor entities using MQTT Discovery protocol
- **Bidirectional Control:** Bridge accepts HA commands and sends PUT requests to SignalK, which transmits to N2K devices
- **Configuration Layer:** Allows users to define sensor mappings, device customization, and connection parameters

## Why SignalK API Instead of MQTT?

This project uses SignalK's WebSocket streaming API and REST API instead of MQTT for several key reasons:

1. **Complete Data Access:** SignalK API provides full access to device metadata (manufacturer, model, serial numbers) that isn't available via MQTT export plugins
2. **Bidirectional Control:** PUT API allows sending commands back to NMEA 2000 devices (autopilot control, stereo control, etc.)
3. **Simpler Architecture:** Eliminates need for separate MQTT broker and export plugin configuration
4. **Add-on Ready:** Perfect for Home Assistant add-on deployment where SignalK and bridge run on same host
5. **Real-time Streaming:** WebSocket provides push-based updates just like MQTT, no polling required
6. **Per-Device Organization:** Automatic device identification and grouping in Home Assistant by actual manufacturer and model

## ASCII Architecture Diagram

```
+----------------+       +------------------+
| NMEA 2000 Bus  | <---> |  SignalK Server  |
|  (N2K Devices) |       | (WebSocket + API)|
+----------------+       +------------------+
                                 ^
                                 | WebSocket Stream (sensor data)
                                 | REST API (device metadata)
                                 | PUT API (commands)
                                 v
                        +------------------+
                        | N2K HA Bridge    |
                        |  (This Project)  |
                        +------------------+
                                 |
                                 | MQTT Discovery
                                 | (sensor entities)
                                 v
                        +------------------+
                        | Home Assistant   |
                        | (MQTT Broker)    |
                        +------------------+
```

### Deployment Scenarios

**Scenario 1: Existing SignalK Setup (Current)**
- SignalK runs on separate Raspberry Pi with N2K interface
- Bridge runs as service or container pointing to SignalK IP

**Scenario 2: Home Assistant Add-on (Future)**
- SignalK add-on + Bridge add-on both run on HAOS
- N2K interface (USB/network) connects to HAOS host
- Zero external dependencies, turnkey setup

## Perfect Units System (v1.3.0)

The bridge now features an intelligent unit conversion system that automatically displays marine sensor data in the correct units based on your Home Assistant configuration - without requiring any template sensors or YAML configuration.

### How It Works

**Automatic Mode (Default - `raw_mode: false`)**

The bridge publishes sensor data using Home Assistant's device class system, allowing HA to automatically convert units based on your global unit preferences:

- **Temperature**: SignalK sends Kelvin → Bridge converts to °C → HA displays °F automatically for imperial users
- **Speed/Wind**: SignalK sends m/s → Bridge adds `device_class: speed` → HA displays knots for imperial users, km/h or m/s for metric
- **Depth/Distance**: SignalK sends meters → Bridge adds `device_class: distance` → HA displays feet for imperial users
- **Angles**: SignalK sends radians → Bridge converts to degrees using value templates → Always displays in degrees

**Raw Debug Mode (`raw_mode: true`)**

When enabled, the bridge publishes raw SignalK values without conversion:
- Temperatures in Kelvin
- Speeds in m/s (no device class)
- Angles in radians
- Entities get `_raw` suffix and "(raw)" name tag

### Key Features

✅ **Zero template sensors required** - Everything works out of the box
✅ **Respects HA unit system** - Automatically adapts to imperial/metric preferences
✅ **Meta-aware temperature conversion** - Handles K/°C/°F from SignalK correctly
✅ **Smart rounding** - 1 decimal for speeds/temps/angles, 2 for everything else
✅ **History & statistics support** - All sensors have `state_class: measurement`
✅ **Angle conversion** - Radians → degrees with precision rounding
✅ **Optional raw mode** - For debugging or advanced use cases

### Configuration

Add to your Home Assistant add-on configuration (or environment variables):

```yaml
raw_mode: false  # default - beautiful automatic units
```

That's it. One boolean, perfect units forever.

### Examples

**US/Imperial User** (HA set to imperial):
- Water Temperature: `78.4 °F` (converted from SignalK Kelvin)
- Wind Speed: `15.9 kn` (converted from SignalK m/s)
- Depth: `12.3 ft` (converted from SignalK meters)
- Wind Direction: `184.0°` (converted from SignalK radians)

**Metric User** (HA set to metric):
- Water Temperature: `25.8 °C`
- Wind Speed: `8.2 m/s` or `29.5 km/h`
- Depth: `3.7 m`
- Wind Direction: `184.0°`

**Raw Debug Mode** (`raw_mode: true`):
- Water Temperature (raw): `293.15 K`
- Wind Speed (raw): `8.23 m/s`
- Wind Direction (raw): `3.21 rad`

## Example Home Assistant Entity Output

```json
{
  "entity_id": "sensor.n2k_gps_latitude",
  "state": "37.7749",
  "attributes": {
    "unit_of_measurement": "°",
    "friendly_name": "N2K GPS Latitude",
    "device_class": "latitude"
  }
}
```

## Example SignalK MQTT Messages

Below are representative examples of SignalK MQTT messages that the bridge might receive, illustrating typical data points such as geoidal separation, datetime, satellites in view, and AIS information.

```json
{
  "updates": [
    {
      "values": [
        {
          "path": "navigation.position.geoidalSeparation",
          "value": 26.7
        }
      ]
    }
  ]
}
```

```json
{
  "updates": [
    {
      "values": [
        {
          "path": "navigation.datetime",
          "value": "2024-04-27T12:34:56Z"
        }
      ]
    }
  ]
}
```

```json
{
  "updates": [
    {
      "values": [
        {
          "path": "navigation.satellitesInView",
          "value": 8
        }
      ]
    }
  ]
}
```

```json
{
  "updates": [
    {
      "values": [
        {
          "path": "navigation.ais.target.123456789.mmsi",
          "value": 123456789
        },
        {
          "path": "navigation.ais.target.123456789.name",
          "value": "VesselName"
        }
      ]
    }
  ]
}
```

### Additional Real-World Examples

#### Speed Over Ground
```json
{
  "updates": [
    {
      "values": [
        {
          "path": "navigation.speedOverGround",
          "value": 3.52
        }
      ]
    }
  ]
}
```

#### Apparent & True Wind
```json
{
  "updates": [
    {
      "values": [
        {
          "path": "environment.wind.speedApparent",
          "value": 7.4
        },
        {
          "path": "environment.wind.angleApparent",
          "value": 0.785
        }
      ]
    }
  ]
}
```

```json
{
  "updates": [
    {
      "values": [
        {
          "path": "environment.wind.speedTrue",
          "value": 6.1
        },
        {
          "path": "environment.wind.angleTrueWater",
          "value": 1.047
        }
      ]
    }
  ]
}
```

#### Rudder Angle
```json
{
  "updates": [
    {
      "values": [
        {
          "path": "steering.rudderAngle",
          "value": -0.12
        }
      ]
    }
  ]
}
```

#### Heading
```json
{
  "updates": [
    {
      "values": [
        {
          "path": "navigation.headingMagnetic",
          "value": 4.712
        }
      ]
    }
  ]
}
```

### More Real-World Examples

```json
{
  "updates": [
    {
      "values": [
        {
          "path": "environment.depth.belowTransducer",
          "value": 5.2
        }
      ]
    }
  ]
}
```

```json
{
  "updates": [
    {
      "values": [
        {
          "path": "tanks.fuel.0.currentLevel",
          "value": 0.73
        }
      ]
    }
  ]
}
```

```json
{
  "updates": [
    {
      "values": [
        {
          "path": "navigation.courseOverGroundTrue",
          "value": 1.5708
        }
      ]
    }
  ]
}
```

```json
{
  "updates": [
    {
      "values": [
        {
          "path": "environment.outside.temperature",
          "value": 293.15
        }
      ]
    }
  ]
}
```

## Technical Overview

- **Language:** Node.js for asynchronous event-driven processing
- **Data Ingestion:** WebSocket client for real-time SignalK delta message streaming
- **Device Discovery:** REST API calls to SignalK `/sources` endpoint for N2K device metadata
- **Command Transmission:** HTTP PUT requests to SignalK API for bidirectional control
- **HA Integration:** MQTT Discovery protocol for automatic entity creation in Home Assistant
- **Data Flow:** SignalK WebSocket → Delta parsing → Device registry → HA MQTT entities
- **Extensibility:** Modular design supports adding new sensor types, control entities, and interfaces

## Project Structure

```
n2k-ha-bridge/
├── src/
│   ├── mqttListener.js      # Listens to SignalK MQTT messages
│   ├── parser.js            # Parses SignalK MQTT payloads into sensor data
│   ├── haPublisher.js       # Publishes sensor data to Home Assistant
│   └── config.js            # Loads and validates configuration
├── config.json              # User configuration file
├── package.json             # Node.js project metadata and dependencies
└── README.md                # Project documentation
```

## Implementation Plan

1. **Establish MQTT Connectivity:** Connect to the SignalK MQTT broker to receive decoded NMEA 2000 sensor data.
2. **Parse MQTT Messages:** Decode SignalK MQTT messages into meaningful sensor data.
3. **Map Sensors to HA Entities:** Define configuration schema to map parsed data to Home Assistant sensor entities.
4. **Publish Data to Home Assistant:** Use MQTT or REST API to send sensor updates.
5. **Configuration Management:** Create flexible configuration to support various hardware setups.
6. **Testing and Validation:** Test with real SignalK MQTT messages and Home Assistant instances.
7. **Documentation:** Provide comprehensive usage and contribution guidelines.

## Build Plan for Functional Prototype

- Scaffold Node.js service locally.
- Implement mqttListener, messageRouter, entityBuilder, discoveryPublisher, statePublisher, deviceRegistry, skPathMapper.
- Test locally using HA's MQTT broker.
- Run mosquitto_sub tests.
- Deploy initially as local service.
- Convert to Home Assistant Add-on next.

## Installation as Home Assistant Add-on

### Prerequisites
- Home Assistant OS installed
- SignalK server running and accessible
- MQTT broker (Mosquitto) installed in Home Assistant

### Add the Repository

1. Navigate to **Settings** → **Add-ons** → **Add-on Store**
2. Click the **⋮** menu (top right) → **Repositories**
3. Add this repository URL:
   ```
   https://github.com/The-Greg-O/signalk-ha-bridge
   ```
4. Click **Add** → **Close**

### Install the Add-on

1. Find **SignalK HA Bridge** in your add-on store
2. Click on it and press **Install**
3. After installation, go to the **Configuration** tab
4. Configure your settings:
   - **signalk_host**: IP address of your SignalK server (e.g., `10.147.17.208`)
   - **signalk_port**: SignalK port (default: `3000`)
   - **mqtt_broker**: MQTT broker URL (e.g., `mqtt://homeassistant.local`)
   - **mqtt_port**: MQTT port (default: `1883`)
   - **mqtt_username**: MQTT username
   - **mqtt_password**: MQTT password
5. Click **Save**
6. Go to the **Info** tab and click **Start**
7. Check the **Log** tab to verify successful connection

### Configuration Example

```yaml
signalk_host: "10.147.17.208"
signalk_port: 3000
mqtt_broker: "mqtt://homeassistant.local"
mqtt_port: 1883
mqtt_username: "n2khabridge"
mqtt_password: "your_secure_password"
```

## Current Status

**✅ Production Ready - SignalK API Integration Complete**

- ✅ SignalK WebSocket streaming for real-time sensor data
- ✅ SignalK REST API for N2K device metadata (manufacturer/model)
- ✅ Home Assistant MQTT Discovery with proper device grouping
- ✅ SI unit preservation (K, m/s, rad, m) - HA handles display conversion
- ✅ Home Assistant add-on packaging for HA OS deployment
- 📋 **Planned:** Bidirectional control entities (switches, buttons, numbers) for N2K device commands

## Contributing

Contributions are highly encouraged! To contribute:

- Fork the repository.
- Create a feature branch.
- Submit pull requests with clear descriptions.
- Report issues or feature requests via GitHub Issues.

Please adhere to code style and include tests where applicable.

## License

This project is licensed under the MIT License. See the LICENSE file for details.
