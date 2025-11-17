const WebSocket = require('ws');
const EventEmitter = require('events');

class SignalKClient extends EventEmitter {
  constructor(config) {
    super();
    this.config = config;
    this.ws = null;
    this.reconnectInterval = 5000;
    this.reconnectTimer = null;
    this.shouldReconnect = true;
  }

  /**
   * Connect to SignalK WebSocket stream
   */
  connect() {
    const host = this.config.signalk.host || 'localhost';
    const port = this.config.signalk.port || 3000;
    // Use 'subscribe=self' to get only own vessel data
    const wsUrl = `ws://${host}:${port}/signalk/v1/stream?subscribe=self`;

    console.log(`Connecting to SignalK WebSocket: ${wsUrl}`);

    this.ws = new WebSocket(wsUrl);

    this.ws.on('open', () => {
      console.log('✅ Connected to SignalK WebSocket');
      this.emit('connected');

      // Subscribe to only own vessel data (excludes AIS targets and other vessels)
      this.subscribe('vessels.self.*');
    });

    this.ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        this.handleMessage(message);
      } catch (error) {
        console.error('❌ Error parsing SignalK message:', error.message);
      }
    });

    this.ws.on('error', (error) => {
      console.error('❌ SignalK WebSocket Error:', error.message);
      this.emit('error', error);
    });

    this.ws.on('close', () => {
      console.log('🔌 SignalK WebSocket connection closed');
      this.emit('disconnected');

      if (this.shouldReconnect) {
        this.scheduleReconnect();
      }
    });
  }

  /**
   * Handle incoming SignalK message
   * @param {Object} message - SignalK message
   */
  handleMessage(message) {
    // Handle different message types
    if (message.updates) {
      // This is a delta message with updates
      this.emit('delta', message);
    } else if (message.self) {
      // This is a hello message with server info
      this.emit('hello', message);
    }
  }

  /**
   * Subscribe to SignalK paths
   * @param {string} path - SignalK path pattern (e.g., "vessels.*" or "vessels.self.navigation.*")
   */
  subscribe(path) {
    const subscription = {
      context: '*',
      subscribe: [
        {
          path: path,
          period: 1000,
          format: 'delta',
          policy: 'instant',
          minPeriod: 200
        }
      ]
    };

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(subscription));
      console.log(`📡 Subscribed to SignalK path: ${path}`);
    }
  }

  /**
   * Send PUT request to SignalK (for bidirectional control)
   * @param {string} path - SignalK path
   * @param {*} value - Value to set
   * @returns {Promise<Object>} - Response from SignalK
   */
  async put(path, value) {
    const host = this.config.signalk.host || 'localhost';
    const port = this.config.signalk.port || 3000;
    const url = `http://${host}:${port}/signalk/v1/api/vessels/self/${path}`;

    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ value })
    });

    return response.json();
  }

  /**
   * Schedule reconnection attempt
   */
  scheduleReconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    console.log(`🔄 Reconnecting to SignalK in ${this.reconnectInterval / 1000}s...`);
    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, this.reconnectInterval);
  }

  /**
   * Disconnect from SignalK
   */
  disconnect() {
    this.shouldReconnect = false;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}

module.exports = SignalKClient;
