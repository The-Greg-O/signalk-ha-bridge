# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

N2K HA Bridge is a bridge application that connects NMEA 2000 (N2K) marine networks to Home Assistant for automation and monitoring. The bridge reads data from N2K networks, converts it to Home Assistant-compatible formats, and provides real-time updates.

## Development Commands

### Setup
```bash
npm install
```

### Running the Application
```bash
npm start
```

## Architecture

### Core Components

**NMEA 2000 Interface Layer**
- Responsible for connecting to and reading from N2K networks
- Handles N2K protocol parsing and message decoding
- Should support various N2K interface types (CAN bus, network-based, etc.)

**Data Converter Layer**
- Transforms N2K data into Home Assistant entity formats
- Maps N2K PGNs (Parameter Group Numbers) to HA sensor types
- Handles unit conversions and data normalization

**Home Assistant Integration Layer**
- Manages connection to Home Assistant API
- Publishes sensor data and state updates
- Handles authentication and API credentials
- Should support MQTT or REST API integration patterns

**Configuration Management**
- Reads from `config.json` for:
  - NMEA 2000 interface settings
  - Home Assistant API credentials
  - Sensor mapping definitions

### Key Design Considerations

**N2K Protocol**: NMEA 2000 uses a CAN bus-based protocol with standardized PGNs for different data types (depth, speed, temperature, etc.). The bridge must decode these binary messages correctly.

**Real-time Updates**: The application should maintain persistent connections to both N2K and HA, streaming data continuously rather than polling.

**Error Handling**: Marine environments can have intermittent connections. The bridge should gracefully handle network interruptions and reconnect automatically.

**Configuration**: Sensor mappings should be flexible to support different boat configurations and allow users to selectively expose N2K data points to Home Assistant.
