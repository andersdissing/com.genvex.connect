'use strict';

const { EventEmitter } = require('events');
const { NabtoClient } = require('../nabto');

/**
 * Genvex device abstraction
 * Handles communication and data transformation
 */
class GenvexDevice extends EventEmitter {
  constructor(options) {
    super();

    this.deviceId = options.deviceId;
    this.ip = options.ip;
    this.email = options.email;
    this.pollInterval = options.pollInterval || 30000; // 30 seconds
    this.model = options.model;

    this.client = new NabtoClient();
    this.connection = null;
    this.pollTimer = null;
    this.data = new Map();
    this.consecutiveErrors = 0;
    this.maxConsecutiveErrors = 3;
  }

  /**
   * Connect to Genvex device
   */
  async connect() {
    try {
      this.connection = await this.client.connect({
        deviceId: this.deviceId,
        ip: this.ip,
        email: this.email
      });

      this.connection.on('error', (err) => {
        this.emit('error', err);
      });

      this.connection.on('disconnected', () => {
        this.stopPolling();
        this.emit('disconnected');
      });

      this.connection.on('model', (modelInfo) => {
        this.emit('model', modelInfo);
      });


      // Start polling
      this.startPolling();

      this.emit('connected');
      return true;
    } catch (err) {
      this.emit('error', err);
      throw err;
    }
  }

  /**
   * Disconnect
   */
  disconnect() {
    this.stopPolling();
    this.client.disconnect();
    this.connection = null;
    this.emit('disconnected');
  }

  /**
   * Start data polling
   */
  startPolling() {
    this.stopPolling();

    // Initial poll
    this.poll();

    // Periodic polling
    this.pollTimer = setInterval(() => {
      this.poll();
    }, this.pollInterval);
  }

  /**
   * Stop polling
   */
  stopPolling() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  /**
   * Poll all datapoint and setpoint registers
   */
  async poll() {
    if (!this.connection || !this.connection.isConnected()) return;

    try {
      // Read datapoints
      const dpReq = this.model.getDatapointRequestList();
      const dpResults = await this.connection.readDatapoints(dpReq.keys, dpReq.requests);

      for (const [key, rawValue] of dpResults) {
        const register = this.model.datapoints[key];
        if (register) {
          const value = this.model.convertDatapointValue(rawValue, register);
          const oldValue = this.data.get(register.name);

          this.data.set(register.name, value);

          if (oldValue !== value) {
            this.emit('data', {
              name: register.name,
              value,
              capability: register.homeyCapability,
              unit: register.unit
            });
          }
        }
      }

      // Read setpoints
      const spReq = this.model.getSetpointRequestList();
      const spResults = await this.connection.readSetpoints(spReq.keys, spReq.requests);

      for (const [key, rawValue] of spResults) {
        const register = this.model.setpoints[key];
        if (register) {
          const value = this.model.convertSetpointValue(rawValue, register);
          const oldValue = this.data.get(register.name);

          this.data.set(register.name, value);

          if (oldValue !== value) {
            this.emit('data', {
              name: register.name,
              value,
              capability: register.homeyCapability,
              unit: register.unit
            });
          }
        }
      }

      this.consecutiveErrors = 0;
      this.emit('polled', this.data);
    } catch (err) {
      this.consecutiveErrors++;
      this.emit('error', err);

      if (this.consecutiveErrors >= this.maxConsecutiveErrors) {
        this.consecutiveErrors = 0;
        this.emit('error', new Error('Too many consecutive poll failures, reconnecting'));
        this.disconnect();
      }
    }
  }

  /**
   * Get sensor value
   */
  getValue(name) {
    return this.data.get(name);
  }

  /**
   * Get all values
   */
  getAllValues() {
    return Object.fromEntries(this.data);
  }

  /**
   * Set a setpoint value
   */
  async setValue(name, value) {
    const register = this.model.getSetpointByName(name);

    if (!register) {
      throw new Error(`Unknown setpoint: ${name}`);
    }

    // Validate range against raw value limits
    const rawValue = this.model.toRawSetpointValue(value, register);
    if (register.min !== undefined && rawValue < register.min) {
      throw new Error(`Raw value ${rawValue} below minimum ${register.min}`);
    }
    if (register.max !== undefined && rawValue > register.max) {
      throw new Error(`Raw value ${rawValue} above maximum ${register.max}`);
    }

    await this.connection.writeSetpoints([{
      id: 0,
      value: rawValue,
      param: register.writeAddress
    }]);

    // Update local cache
    this.data.set(name, value);

    this.emit('data', {
      name: register.name,
      value,
      capability: register.homeyCapability
    });
  }

  /**
   * Set fan level (0-4)
   */
  async setFanLevel(level) {
    return this.setValue('fanSpeed', level);
  }

  /**
   * Set temperature setpoint
   */
  async setTemperatureSetpoint(temp) {
    return this.setValue('temperatureSetpoint', temp);
  }

  /**
   * Check connection status
   */
  isConnected() {
    return this.connection && this.connection.isConnected();
  }
}

module.exports = GenvexDevice;
