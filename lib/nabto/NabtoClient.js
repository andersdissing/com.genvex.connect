'use strict';

const NabtoDiscovery = require('./NabtoDiscovery');
const NabtoConnection = require('./NabtoConnection');

/**
 * Main class for Nabto communication.
 * Combines discovery and connection.
 */
class NabtoClient {
  constructor() {
    this.discovery = new NabtoDiscovery();
    this.connection = null;
  }

  /**
   * Find devices on the network.
   * @param {Object} options
   * @returns {Promise<Array>}
   */
  async discover(options = {}) {
    return this.discovery.discover(options.deviceId || '*');
  }

  /**
   * Find device by specific IP.
   * @param {string} ip
   * @returns {Promise<Object|null>}
   */
  async discoverByIp(ip) {
    return this.discovery.discoverByIp(ip);
  }

  /**
   * Connect to device.
   * @param {Object} options - { deviceId, ip, email, port? }
   * @returns {Promise<NabtoConnection>}
   */
  async connect(options) {
    this.connection = new NabtoConnection(options);
    await this.connection.connect();
    return this.connection;
  }

  /**
   * Close connection.
   */
  disconnect() {
    if (this.connection) {
      this.connection.disconnect();
      this.connection = null;
    }
  }

  /**
   * Get active connection.
   * @returns {NabtoConnection|null}
   */
  getConnection() {
    return this.connection;
  }
}

module.exports = NabtoClient;
