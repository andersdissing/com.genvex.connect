'use strict';

/**
 * Nabto packet encoder/decoder
 * Based on the real uNabto/genvexnabto protocol:
 *   - Legacy header format for discovery
 *   - Regular 16-byte header for connection/data
 *   - Cleartext CRYPT payloads (no encryption on local connections)
 *
 * References:
 *   - https://github.com/superrob/genvexnabto  (Python)
 *   - https://github.com/nabto/unabto           (C reference)
 */
class NabtoPacket {
  // -- Legacy header constants (discovery) ---------------------------------
  static LEGACY_HDR_SIZE = 12; // 4-byte header + 8 bytes padding
  static LEGACY_TYPE_DISCOVERY = 0x00000001;
  static LEGACY_FLAG_RSP = 0x00800000;

  // -- Regular header constants --------------------------------------------
  static HDR_SIZE = 16;
  static HDR_VERSION = 0x02;

  // Packet types (regular header byte 8)
  static TYPE_U_CONNECT = 0x83;
  static TYPE_DATA = 0x16;
  static TYPE_U_ALIVE = 0x82;

  // Flags (regular header byte 11)
  static FLAG_NONE = 0x00;
  static FLAG_RESPONSE = 0x01;
  static FLAG_EXCEPTION = 0x02;
  static FLAG_TAG = 0x40;
  static FLAG_NSI_CO = 0x80;

  // -- Payload types -------------------------------------------------------
  static PAYLOAD_IPX = 0x35;
  static PAYLOAD_CRYPT = 0x36;
  static PAYLOAD_CP_ID = 0x3F;

  // -- Command types (inside CRYPT payload) --------------------------------
  static CMD_KEEP_ALIVE = 0x02;
  static CMD_PING = 0x11;
  static CMD_SETPOINT_READLIST = 0x2A;
  static CMD_SETPOINT_WRITELIST = 0x2B;
  static CMD_DATAPOINT_READLIST = 0x2D;

  // -- Crypto code for cleartext -------------------------------------------
  static CRYPTO_CLEARTEXT = 0x000A;

  // ========================================================================
  //  Discovery packets (legacy header format)
  // ========================================================================

  /**
   * Build discovery broadcast packet.
   * Legacy format: [4-byte header][8 zero bytes][deviceId][0x00]
   * @param {string} deviceId - Device ID or '*' for wildcard
   * @returns {Buffer}
   */
  static buildDiscoveryPacket(deviceId = '*') {
    const header = Buffer.alloc(4);
    header.writeUInt32BE(NabtoPacket.LEGACY_TYPE_DISCOVERY, 0);
    const padding = Buffer.alloc(8, 0x00);
    const id = Buffer.from(deviceId, 'ascii');
    const terminator = Buffer.from([0x00]);
    return Buffer.concat([header, padding, id, terminator]);
  }

  /**
   * Parse discovery response (legacy format with RSP flag).
   * The response has: [4-byte header w/ RSP][...][device ID at offset 19, null-terminated]
   * The header word at bytes 0-3 should be 0x00800001 (RSP flag | DISCOVERY type).
   * @param {Buffer} data
   * @returns {{ deviceId: string, localPort: number } | null}
   */
  static parseDiscoveryResponse(data) {
    if (!data || data.length < 20) return null;

    try {
      const headerWord = data.readUInt32BE(0);
      // Must have RSP flag set and be a discovery response
      if (headerWord !== 0x00800001) return null;

      // Device ID starts at offset 19 as null-terminated ASCII
      const idStart = 19;
      const idEnd = data.indexOf(0x00, idStart);
      if (idEnd === -1) {
        // No null terminator found; use rest of buffer
        var deviceId = data.slice(idStart).toString('ascii');
      } else {
        var deviceId = data.slice(idStart, idEnd).toString('ascii');
      }

      if (!deviceId || deviceId.length === 0) return null;

      return { deviceId, localPort: 5570 };
    } catch (err) {
      return null;
    }
  }

  // ========================================================================
  //  Regular Nabto packet header (16 bytes)
  // ========================================================================

  /**
   * Build a 16-byte regular Nabto header.
   * @param {number} clientId  - nsi_cp
   * @param {number} serverId  - nsi_sp
   * @param {number} type      - packet type
   * @param {number} flags     - header flags
   * @param {number} seqId     - sequence number
   * @param {number} totalLen  - total packet length including header
   * @returns {Buffer}
   */
  static buildHeader(clientId, serverId, type, flags, seqId, totalLen) {
    const hdr = Buffer.alloc(NabtoPacket.HDR_SIZE);
    hdr.writeUInt32BE(clientId, 0);
    hdr.writeUInt32BE(serverId, 4);
    hdr.writeUInt8(type, 8);
    hdr.writeUInt8(NabtoPacket.HDR_VERSION, 9);
    hdr.writeUInt8(0x00, 10); // retransmit / reserved
    hdr.writeUInt8(flags, 11);
    hdr.writeUInt16BE(seqId, 12);
    hdr.writeUInt16BE(totalLen, 14);
    return hdr;
  }

  /**
   * Parse a regular Nabto header from a buffer.
   * @param {Buffer} data
   * @returns {{ clientId, serverId, type, version, flags, seqId, length } | null}
   */
  static parseHeader(data) {
    if (!data || data.length < NabtoPacket.HDR_SIZE) return null;
    return {
      clientId: data.readUInt32BE(0),
      serverId: data.readUInt32BE(4),
      type: data.readUInt8(8),
      version: data.readUInt8(9),
      flags: data.readUInt8(11),
      seqId: data.readUInt16BE(12),
      length: data.readUInt16BE(14)
    };
  }

  // ========================================================================
  //  Payload builders
  // ========================================================================

  /**
   * Build IPX payload (17 bytes) -- used in U_CONNECT.
   * All IP/port fields zeroed; flags = 0x80 (rendezvous disabled).
   * @returns {Buffer}
   */
  static buildIpxPayload() {
    const buf = Buffer.alloc(17);
    buf.writeUInt8(NabtoPacket.PAYLOAD_IPX, 0);
    buf.writeUInt8(0x00, 1); // flags
    buf.writeUInt16BE(17, 2); // length (including 4-byte payload header)
    // bytes 4-15: IP+port fields all zero
    buf.writeUInt8(0x80, 16); // rendezvous disabled
    return buf;
  }

  /**
   * Build CP_ID payload -- carries the email for authentication.
   * Format: [type=0x3F][flags=0x00][len:2][0x01][email bytes]
   * @param {string} email
   * @returns {Buffer}
   */
  static buildCpIdPayload(email) {
    const emailBuf = Buffer.from(email, 'ascii');
    const len = 4 + 1 + emailBuf.length; // header(4) + idType(1) + email
    const hdr = Buffer.alloc(5);
    hdr.writeUInt8(NabtoPacket.PAYLOAD_CP_ID, 0);
    hdr.writeUInt8(0x00, 1);
    hdr.writeUInt16BE(len, 2);
    hdr.writeUInt8(0x01, 4); // ID type = email
    return Buffer.concat([hdr, emailBuf]);
  }

  /**
   * Build CRYPT payload wrapping a command buffer.
   * Format: [type=0x36][flags=0x00][len:2][crypto_code:2][cmd][0x02][checksum:2]
   * The length field includes everything: header(4) + cryptoCode(2) + data + terminator(1) + checksum(2)
   * @param {Buffer} commandData
   * @returns {Buffer}
   */
  static buildCryptPayload(commandData) {
    // len = header(4) + cryptoCode(2) + data + terminator(1) + checksum(2) = 9 + data_len
    const len = 9 + commandData.length;
    const hdr = Buffer.alloc(6);
    hdr.writeUInt8(NabtoPacket.PAYLOAD_CRYPT, 0);
    hdr.writeUInt8(0x00, 1);
    hdr.writeUInt16BE(len, 2);
    hdr.writeUInt16BE(NabtoPacket.CRYPTO_CLEARTEXT, 4);
    const terminator = Buffer.from([0x02]);
    return Buffer.concat([hdr, commandData, terminator]);
  }

  // ========================================================================
  //  Checksum
  // ========================================================================

  /**
   * Compute 16-bit checksum (sum of all bytes, masked to 16 bits).
   * @param {Buffer} data
   * @returns {Buffer} 2-byte big-endian checksum
   */
  static computeChecksum(data) {
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      sum += data[i];
    }
    const buf = Buffer.alloc(2);
    buf.writeUInt16BE(sum & 0xFFFF, 0);
    return buf;
  }

  // ========================================================================
  //  High-level packet builders
  // ========================================================================

  /**
   * Build U_CONNECT packet (connection request).
   * @param {number} clientId
   * @param {string} email
   * @returns {Buffer}
   */
  static buildConnectPacket(clientId, email) {
    const ipx = NabtoPacket.buildIpxPayload();
    const cpId = NabtoPacket.buildCpIdPayload(email);
    const payloads = Buffer.concat([ipx, cpId]);
    const totalLen = NabtoPacket.HDR_SIZE + payloads.length;

    const hdr = NabtoPacket.buildHeader(
      clientId,
      0x00000000, // server ID unknown before connect
      NabtoPacket.TYPE_U_CONNECT,
      NabtoPacket.FLAG_NONE,
      0, // seq 0
      totalLen
    );

    return Buffer.concat([hdr, payloads]);
  }

  /**
   * Parse a U_CONNECT response.
   * Check success status at bytes 20-23 (== 0x00000001), read serverId from bytes 24-27.
   * @param {Buffer} data
   * @returns {{ serverId: number } | null}
   */
  static parseConnectResponse(data) {
    if (!data || data.length < 28) return null;

    const hdr = NabtoPacket.parseHeader(data);
    if (!hdr) return null;
    if (hdr.type !== NabtoPacket.TYPE_U_CONNECT) return null;
    if (!(hdr.flags & NabtoPacket.FLAG_RESPONSE)) return null;

    // Check success status at bytes 20-23
    const status = data.readUInt32BE(20);
    if (status !== 0x00000001) return null;

    // Read serverId from bytes 24-27
    const serverId = data.readUInt32BE(24);
    return { serverId };
  }

  // ========================================================================
  //  Data / command packets
  // ========================================================================

  /**
   * Build a PING command packet.
   * @param {number} clientId
   * @param {number} serverId
   * @returns {Buffer}
   */
  static buildPingPacket(clientId, serverId) {
    const cmd = Buffer.from([
      0x00, 0x00, 0x00, NabtoPacket.CMD_PING,
      0x70, 0x69, 0x6E, 0x67  // "ping"
    ]);
    return NabtoPacket._buildDataPacket(clientId, serverId, 50, cmd);
  }

  /**
   * Build a U_ALIVE keep-alive packet (header only, no payload).
   * @param {number} clientId
   * @param {number} serverId
   * @returns {Buffer}
   */
  static buildKeepAlivePacket(clientId, serverId) {
    return NabtoPacket.buildHeader(
      clientId,
      serverId,
      NabtoPacket.TYPE_U_ALIVE,
      NabtoPacket.FLAG_NONE,
      0,
      NabtoPacket.HDR_SIZE
    );
  }

  /**
   * Build a DATAPOINT_READLIST command.
   * @param {number} clientId
   * @param {number} serverId
   * @param {number} seqId
   * @param {{ obj: number, address: number }[]} datapoints
   * @returns {Buffer}
   */
  static buildDatapointReadPacket(clientId, serverId, seqId, datapoints) {
    const parts = [
      Buffer.from([0x00, 0x00, 0x00, NabtoPacket.CMD_DATAPOINT_READLIST])
    ];
    // Count (2 bytes big-endian)
    const countBuf = Buffer.alloc(2);
    countBuf.writeUInt16BE(datapoints.length, 0);
    parts.push(countBuf);
    // Each datapoint: obj(1) + address(4 BE)
    for (const dp of datapoints) {
      const entry = Buffer.alloc(5);
      entry.writeUInt8(dp.obj, 0);
      entry.writeUInt32BE(dp.address, 1);
      parts.push(entry);
    }
    parts.push(Buffer.from([0x01])); // terminator
    return NabtoPacket._buildDataPacket(clientId, serverId, seqId, Buffer.concat(parts));
  }

  /**
   * Build a SETPOINT_READLIST command.
   * @param {number} clientId
   * @param {number} serverId
   * @param {number} seqId
   * @param {{ obj: number, address: number }[]} setpoints
   * @returns {Buffer}
   */
  static buildSetpointReadPacket(clientId, serverId, seqId, setpoints) {
    const parts = [
      Buffer.from([0x00, 0x00, 0x00, NabtoPacket.CMD_SETPOINT_READLIST])
    ];
    const countBuf = Buffer.alloc(2);
    countBuf.writeUInt16BE(setpoints.length, 0);
    parts.push(countBuf);
    for (const sp of setpoints) {
      const entry = Buffer.alloc(3);
      entry.writeUInt8(sp.obj, 0);
      entry.writeUInt16BE(sp.address, 1);
      parts.push(entry);
    }
    parts.push(Buffer.from([0x01])); // terminator
    return NabtoPacket._buildDataPacket(clientId, serverId, seqId, Buffer.concat(parts));
  }

  /**
   * Build a SETPOINT_WRITELIST command.
   * @param {number} clientId
   * @param {number} serverId
   * @param {number} seqId
   * @param {{ id: number, value: number, param: number }[]} setpoints
   * @returns {Buffer}
   */
  static buildSetpointWritePacket(clientId, serverId, seqId, setpoints) {
    const parts = [
      Buffer.from([0x00, 0x00, 0x00, NabtoPacket.CMD_SETPOINT_WRITELIST])
    ];
    const countBuf = Buffer.alloc(2);
    countBuf.writeUInt16BE(setpoints.length, 0);
    parts.push(countBuf);
    for (const sp of setpoints) {
      const entry = Buffer.alloc(7);
      entry.writeUInt8(sp.id, 0);
      entry.writeUInt32BE(sp.value, 1);
      entry.writeUInt16BE(sp.param, 5);
      parts.push(entry);
    }
    parts.push(Buffer.from([0x01])); // terminator
    return NabtoPacket._buildDataPacket(clientId, serverId, seqId, Buffer.concat(parts));
  }

  /**
   * Internal: build a DATA packet with CRYPT payload + checksum.
   * @param {number} clientId
   * @param {number} serverId
   * @param {number} seqId
   * @param {Buffer} commandData
   * @param {boolean} isKeepAlive - uses FLAG_TAG and extra frame control bytes
   * @returns {Buffer}
   * @private
   */
  static _buildDataPacket(clientId, serverId, seqId, commandData, isKeepAlive = false) {
    const crypt = NabtoPacket.buildCryptPayload(commandData);
    let flags = NabtoPacket.FLAG_NONE;
    let extra = Buffer.alloc(0);

    if (isKeepAlive) {
      flags = NabtoPacket.FLAG_TAG;
      extra = Buffer.from([0x00, 0x03]); // frame control tag
    }

    const payloadLen = extra.length + crypt.length;
    const totalLen = NabtoPacket.HDR_SIZE + payloadLen;

    const hdr = NabtoPacket.buildHeader(clientId, serverId, NabtoPacket.TYPE_DATA, flags, seqId, totalLen + 2); // +2 for checksum
    const body = Buffer.concat([hdr, extra, crypt]);
    const checksum = NabtoPacket.computeChecksum(body);
    return Buffer.concat([body, checksum]);
  }

  // ========================================================================
  //  Response parsing
  // ========================================================================

  /**
   * Parse a DATA response. Extracts the CRYPT payload command data.
   * Matching Python's message[22:20+length] extraction.
   * @param {Buffer} data
   * @returns {{ seqId: number, commandData: Buffer } | null}
   */
  static parseDataResponse(data) {
    const hdr = NabtoPacket.parseHeader(data);
    if (!hdr) return null;
    if (hdr.type !== NabtoPacket.TYPE_DATA) return null;

    let offset = NabtoPacket.HDR_SIZE;

    // If TAG flag is set, skip 2-byte frame control
    if (hdr.flags & NabtoPacket.FLAG_TAG) {
      offset += 2;
    }

    // Look for CRYPT payload
    if (offset >= data.length) return null;
    const payloadType = data.readUInt8(offset);
    if (payloadType !== NabtoPacket.PAYLOAD_CRYPT) return null;

    const payloadLen = data.readUInt16BE(offset + 2);
    // Skip payload header (4 bytes) + crypto code (2 bytes) = 6 bytes to get to command data
    const cmdStart = offset + 6;
    // Matching Python's message[22:20+length]: cmdEnd = offset + 4 + payloadLen
    // Clamp to buffer size (Python slicing does this implicitly; the length field
    // may account for checksum bytes that extend past the CRYPT payload)
    const cmdEnd = Math.min(offset + 4 + payloadLen, data.length);
    if (cmdStart >= data.length || cmdEnd <= cmdStart) return null;

    const commandData = data.slice(cmdStart, cmdEnd);
    return { seqId: hdr.seqId, commandData };
  }

  /**
   * Parse datapoint values from a DATAPOINT_READLIST response.
   * Device response payload format (no command header):
   *   count(2 bytes) + values(2 bytes each, signed int16).
   * Values are IN ORDER of the request (no addresses in response).
   * @param {Buffer} payload - payload from parseDataResponse
   * @returns {number[]} ordered array of signed int16 values
   */
  static parseDatapointResponse(payload) {
    const values = [];
    if (!payload || payload.length < 2) return values;

    const count = payload.readUInt16BE(0);
    let offset = 2;

    for (let i = 0; i < count; i++) {
      if (offset + 2 > payload.length) break;
      const value = payload.readInt16BE(offset); // signed int16
      values.push(value);
      offset += 2;
    }
    return values;
  }

  /**
   * Parse setpoint values from a SETPOINT_READLIST response.
   * Device response payload format (no command header):
   *   skip(1 byte) + count(2 bytes) + values(2 bytes each, unsigned int16).
   * Values are IN ORDER of the request (no addresses in response).
   * @param {Buffer} payload
   * @returns {number[]} ordered array of unsigned int16 values
   */
  static parseSetpointResponse(payload) {
    const values = [];
    if (!payload || payload.length < 3) return values;

    // Skip byte 0, read count at bytes 1-2
    const count = payload.readUInt16BE(1);
    let offset = 3;

    for (let i = 0; i < count; i++) {
      if (offset + 2 > payload.length) break;
      const value = payload.readUInt16BE(offset); // unsigned int16
      values.push(value);
      offset += 2;
    }
    return values;
  }

  /**
   * Parse a PING response to get device model info.
   * Device response payload format (no command header):
   *   device_number(bytes 0-3), device_model(4-7),
   *   [gap 8-11], slave_device_number(12-15), slave_device_model(16-19)
   * @param {Buffer} payload
   * @returns {{ deviceNumber: number, deviceModel: number, slaveDeviceNumber: number, slaveDeviceModel: number } | null}
   */
  static parsePingResponse(payload) {
    if (!payload || payload.length < 4) return null;

    const result = {
      deviceNumber: 0,
      deviceModel: 0,
      slaveDeviceNumber: 0,
      slaveDeviceModel: 0
    };

    if (payload.length >= 4) {
      result.deviceNumber = payload.readUInt32BE(0);
    }
    if (payload.length >= 8) {
      result.deviceModel = payload.readUInt32BE(4);
    }
    if (payload.length >= 16) {
      result.slaveDeviceNumber = payload.readUInt32BE(12);
    }
    if (payload.length >= 20) {
      result.slaveDeviceModel = payload.readUInt32BE(16);
    }

    return result;
  }
}

module.exports = NabtoPacket;
