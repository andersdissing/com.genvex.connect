'use strict';

const dgram = require('dgram');
const { EventEmitter } = require('events');
const NabtoPacket = require('./NabtoPacket');

/**
 * Nabto device discovery via UDP broadcast
 */
class NabtoDiscovery extends EventEmitter {
  static PORT = 5570;
  static BROADCAST_ADDRESS = '255.255.255.255';

  constructor(options = {}) {
    super();
    this.port = options.port || NabtoDiscovery.PORT;
    this.timeout = options.timeout || 5000;
    this.retries = options.retries || 3;
    this.retryInterval = options.retryInterval || 1000;
    this.socket = null;
  }

  /**
   * Discover devices on the network via broadcast.
   * @param {string} deviceId - Specific ID or '*' for all
   * @param {string} [broadcastAddress] - Override broadcast address
   * @returns {Promise<Array<{deviceId: string, ip: string, port: number}>>}
   */
  async discover(deviceId = '*', broadcastAddress) {
    const targetAddress = broadcastAddress || NabtoDiscovery.BROADCAST_ADDRESS;

    return new Promise((resolve, reject) => {
      const devices = [];

      this.socket = dgram.createSocket('udp4');

      this.socket.on('error', (err) => {
        this.cleanup();
        reject(err);
      });

      this.socket.on('message', (msg, rinfo) => {
        const parsed = NabtoPacket.parseDiscoveryResponse(msg);
        if (parsed) {
          const device = {
            deviceId: parsed.deviceId,
            ip: rinfo.address,
            port: rinfo.port
          };
          devices.push(device);
          this.emit('device', device);
        }
      });

      this.socket.bind(() => {
        this.socket.setBroadcast(true);

        const packet = NabtoPacket.buildDiscoveryPacket(deviceId);

        // Send initial packet + retries
        const sendPacket = () => {
          this.socket.send(packet, 0, packet.length, this.port, targetAddress);
        };
        sendPacket();
        for (let i = 1; i < this.retries; i++) {
          setTimeout(sendPacket, this.retryInterval * i);
        }
      });

      // Timeout and return found devices
      setTimeout(() => {
        this.cleanup();
        resolve(devices);
      }, this.timeout);
    });
  }

  /**
   * Discover a specific device by known IP.
   * Used when broadcast doesn't work (e.g. cross-VNET).
   * @param {string} ip
   * @param {string} deviceId
   * @returns {Promise<Object|null>}
   */
  async discoverByIp(ip, deviceId = '*') {
    return new Promise((resolve, reject) => {
      let resolved = false;
      this.socket = dgram.createSocket('udp4');

      this.socket.on('error', (err) => {
        if (resolved) return;
        resolved = true;
        this.cleanup();
        reject(err);
      });

      this.socket.on('message', (msg, rinfo) => {
        const parsed = NabtoPacket.parseDiscoveryResponse(msg);
        if (parsed && !resolved) {
          resolved = true;
          this.cleanup();
          resolve({
            deviceId: parsed.deviceId,
            ip: rinfo.address,
            port: rinfo.port
          });
        }
      });

      this.socket.bind(() => {
        const packet = NabtoPacket.buildDiscoveryPacket(deviceId);

        // Send initial packet + retries for UDP reliability across VNETs
        const sendPacket = () => {
          if (resolved || !this.socket) return;
          this.socket.send(packet, 0, packet.length, this.port, ip);
        };
        sendPacket();
        for (let i = 1; i < this.retries; i++) {
          setTimeout(sendPacket, this.retryInterval * i);
        }
      });

      setTimeout(() => {
        if (resolved) return;
        resolved = true;
        this.cleanup();
        resolve(null);
      }, this.timeout);
    });
  }

  cleanup() {
    if (this.socket) {
      try {
        this.socket.close();
      } catch (e) {}
      this.socket = null;
    }
  }
}

module.exports = NabtoDiscovery;
