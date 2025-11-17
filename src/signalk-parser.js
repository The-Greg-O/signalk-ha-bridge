class SignalKParser {
  constructor(config) {
    this.config = config;
  }

  /**
   * Parse SignalK MQTT message
   * @param {Buffer} message - Raw MQTT message buffer
   * @returns {Object|null} - Parsed SignalK data object or null if invalid
   */
  parse(message) {
    try {
      const data = JSON.parse(message.toString());

      // Validate SignalK message structure
      if (!data.context || !data.updates) {
        return null;
      }

      return data;
    } catch (error) {
      console.error('Failed to parse SignalK message:', error.message);
      return null;
    }
  }

  /**
   * Extract vessel ID from context
   * @param {string} context - SignalK context string
   * @returns {string} - Vessel ID
   */
  extractVesselId(context) {
    // Context format: "vessels.urn:mrn:signalk:uuid:03e9aeb2-0ede-488b-b5fc-5a79921a2c68"
    return context.replace('vessels.', '');
  }
}

module.exports = SignalKParser;
