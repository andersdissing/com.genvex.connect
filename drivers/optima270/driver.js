'use strict';
const Homey = require('homey');
const { NabtoDiscovery, NabtoConnection } = require('../../lib/nabto');

class Optima270Driver extends Homey.Driver {

  async onInit() {
    this.log('Optima270 driver initialized');
  }

  async onPair(session) {
    // Step 1: User enters IP + email via custom pair view
    session.setHandler('validate', async (data) => {
      const ipAddress = data.ip;
      const email = data.email;

      if (!ipAddress || !email) {
        throw new Error('IP address and email are required');
      }

      // Validate by attempting discovery + connect
      const discovery = new NabtoDiscovery({ timeout: 8000, retries: 3 });
      const discovered = await discovery.discoverByIp(ipAddress);

      let deviceId = 'unknown';
      if (discovered) {
        deviceId = discovered.deviceId;
      }

      // Test actual connection
      const conn = new NabtoConnection({
        ip: ipAddress,
        email: email,
        deviceId: deviceId,
        connectRetries: 3,
        connectRetryInterval: 2000
      });

      try {
        await conn.connect();
        // Wait briefly for ping/model info
        await new Promise(resolve => setTimeout(resolve, 1500));
        conn.disconnect();
      } catch (err) {
        throw new Error(`Connection failed: ${err.message}`);
      }

      // Store for list_devices step
      this._pairingDevice = { ipAddress, email, deviceId };
      return true;
    });

    // Step 2: Return device for list_devices template
    session.setHandler('list_devices', async () => {
      const dev = this._pairingDevice;
      return [{
        name: `Genvex ${dev.deviceId !== 'unknown' ? dev.deviceId : dev.ipAddress}`,
        data: {
          id: dev.deviceId !== 'unknown' ? dev.deviceId : `genvex-${dev.ipAddress}`
        },
        store: {
          ip: dev.ipAddress,
          email: dev.email,
          deviceId: dev.deviceId
        },
        settings: {
          ip_address: dev.ipAddress,
          email: dev.email,
          poll_interval: 30,
          device_id: dev.deviceId
        }
      }];
    });
  }
}

module.exports = Optima270Driver;
