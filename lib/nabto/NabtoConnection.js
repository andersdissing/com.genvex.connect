'use strict';

const crypto = require('crypto');
const dgram = require('dgram');
const { EventEmitter } = require('events');
const NabtoPacket = require('./NabtoPacket');

class NabtoConnection extends EventEmitter {
  constructor(options) {
    super();

    if (!options.ip) throw new Error('ip required');
    if (!options.email) throw new Error('email required');

    this.deviceId = options.deviceId || 'unknown';
    this.ip = options.ip;
    this.port = options.port || 5570;
    this.email = options.email;

    this.socket = null;
    this.clientId = crypto.randomBytes(4).readUInt32BE(0);
    this.serverId = 0x00000000;
    this.connected = false;
    this.modelInfo = null;
    this.seqId = 300;

    this.connectRetries = options.connectRetries || 5;
    this.connectRetryInterval = options.connectRetryInterval || 2000;

    this.pendingRequests = new Map();
    this.keepAliveTimer = null;
    this.keepAliveSeq = 100; // dedicated range for keep-alive pings
  }

  async connect() {
    return new Promise((resolve, reject) => {
      this.socket = dgram.createSocket('udp4');

      this.socket.on('error', (err) => {
        this.connected = false;
        this.emit('error', err);
        reject(err);
      });

      this.socket.on('message', (msg, rinfo) => {
        this._handleMessage(msg);
      });

      this.socket.on('close', () => {
        this.connected = false;
        this.emit('disconnected');
      });

      this.socket.bind(() => {
        const packet = NabtoPacket.buildConnectPacket(this.clientId, this.email);

        const sendPacket = () => {
          if (this.connected || !this.socket) return;
          this.socket.send(packet, 0, packet.length, this.port, this.ip);
        };
        sendPacket();
        const retryTimers = [];
        for (let i = 1; i < this.connectRetries; i++) {
          retryTimers.push(setTimeout(sendPacket, this.connectRetryInterval * i));
        }

        const timeout = setTimeout(() => {
          if (!this.connected) {
            retryTimers.forEach(t => clearTimeout(t));
            this.disconnect();
            reject(new Error('Connection timeout'));
          }
        }, this.connectRetries * this.connectRetryInterval + 2000);

        this.once('connected', () => {
          clearTimeout(timeout);
          retryTimers.forEach(t => clearTimeout(t));
          resolve(true);
        });
      });
    });
  }

  _handleMessage(data) {
    if (data.length < 16) return;

    const hdr = NabtoPacket.parseHeader(data);
    if (!hdr) return;


    // U_CONNECT response
    if (hdr.type === NabtoPacket.TYPE_U_CONNECT && (hdr.flags & NabtoPacket.FLAG_RESPONSE)) {
      const resp = NabtoPacket.parseConnectResponse(data);
      if (resp) {
        this.serverId = resp.serverId;
        this.connected = true;
        this._startKeepAlive();
        this.emit('connected');
        this._sendPing().catch(() => {});
      }
      return;
    }

    // DATA response
    if (hdr.type === NabtoPacket.TYPE_DATA) {
      const parsed = NabtoPacket.parseDataResponse(data);
      if (!parsed) {
        return;
      }


      // Ping response (seqId 50 or keep-alive ping range 100-199)
      if (parsed.seqId === 50 || (parsed.seqId >= 100 && parsed.seqId < 200)) {
        if (parsed.seqId === 50) {
          const pingResult = NabtoPacket.parsePingResponse(parsed.commandData);
          if (pingResult) {
            this.modelInfo = pingResult;
            this.emit('model', this.modelInfo);
          }
        }
        // Keep-alive ping response - connection is alive
        return;
      }

      // Resolve pending request by seqId
      const pending = this.pendingRequests.get(parsed.seqId);
      if (pending) {
        clearTimeout(pending.timeout);
        this.pendingRequests.delete(parsed.seqId);
        pending.resolve(parsed.commandData);
      } else {
      }

      this.emit('data', parsed);
      return;
    }

    // U_ALIVE response - just acknowledge
    if (hdr.type === NabtoPacket.TYPE_U_ALIVE) {
      return;
    }
  }

  async _sendPing() {
    const packet = NabtoPacket.buildPingPacket(this.clientId, this.serverId);
    this._send(packet);
  }

  _startKeepAlive() {
    this._stopKeepAlive();
    this.keepAliveTimer = setInterval(() => {
      if (!this.connected || !this.socket) return;
      // Use PING as keep-alive since the device responds to it
      const seq = this.keepAliveSeq++;
      if (this.keepAliveSeq >= 200) this.keepAliveSeq = 100;
      const packet = NabtoPacket.buildPingPacket(this.clientId, this.serverId);
      this._send(packet);
    }, 10000);
  }

  _stopKeepAlive() {
    if (this.keepAliveTimer) {
      clearInterval(this.keepAliveTimer);
      this.keepAliveTimer = null;
    }
  }

  _send(packet) {
    if (!this.socket) return;
    this.socket.send(packet, 0, packet.length, this.port, this.ip);
  }

  _nextSeqId() {
    return this.seqId++;
  }

  async readDatapoints(keys, datapoints) {
    if (!this.connected) throw new Error('Not connected');

    const seqId = this._nextSeqId();
    const packet = NabtoPacket.buildDatapointReadPacket(this.clientId, this.serverId, seqId, datapoints);


    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(seqId);
        reject(new Error(`Read timeout for datapoints (seq ${seqId})`));
      }, 5000);

      this.pendingRequests.set(seqId, {
        resolve: (cmdData) => {
          const values = NabtoPacket.parseDatapointResponse(cmdData);
          const result = new Map();
          for (let i = 0; i < Math.min(keys.length, values.length); i++) {
            result.set(keys[i], values[i]);
          }
          resolve(result);
        },
        reject,
        timeout
      });

      this._send(packet);
    });
  }

  async readSetpoints(keys, setpoints) {
    if (!this.connected) throw new Error('Not connected');

    const seqId = this._nextSeqId();
    const packet = NabtoPacket.buildSetpointReadPacket(this.clientId, this.serverId, seqId, setpoints);


    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(seqId);
        reject(new Error(`Read timeout for setpoints (seq ${seqId})`));
      }, 5000);

      this.pendingRequests.set(seqId, {
        resolve: (cmdData) => {
          const values = NabtoPacket.parseSetpointResponse(cmdData);
          const result = new Map();
          for (let i = 0; i < Math.min(keys.length, values.length); i++) {
            result.set(keys[i], values[i]);
          }
          resolve(result);
        },
        reject,
        timeout
      });

      this._send(packet);
    });
  }

  async writeSetpoints(setpoints) {
    if (!this.connected) throw new Error('Not connected');

    const seqId = this._nextSeqId();
    const packet = NabtoPacket.buildSetpointWritePacket(this.clientId, this.serverId, seqId, setpoints);

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(seqId);
        reject(new Error(`Write timeout for setpoints (seq ${seqId})`));
      }, 5000);

      this.pendingRequests.set(seqId, {
        resolve: () => resolve(),
        reject,
        timeout
      });

      this._send(packet);
    });
  }

  disconnect() {
    this.connected = false;
    this._stopKeepAlive();
    if (this.socket) {
      try {
        this.socket.close();
      } catch (e) {}
      this.socket = null;
    }
    for (const [, pending] of this.pendingRequests) {
      clearTimeout(pending.timeout);
    }
    this.pendingRequests.clear();
    this.emit('disconnected');
  }

  isConnected() {
    return this.connected;
  }
}

module.exports = NabtoConnection;
