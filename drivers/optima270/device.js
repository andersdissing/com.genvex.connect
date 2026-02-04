'use strict';
const Homey = require('homey');
const { GenvexDevice } = require('../../lib/genvex');
const {
  Optima270Datapoints,
  Optima270Setpoints
} = require('../../lib/genvex/Optima270');

// Map from Optima270 register key -> Homey capability ID
const DATAPOINT_CAPABILITY_MAP = {
  TEMP_SUPPLY:       'measure_temperature.supply',
  TEMP_OUTSIDE:      'measure_temperature.outside',
  TEMP_EXHAUST:      'measure_temperature.exhaust',
  TEMP_EXTRACT:      'measure_temperature.extract',
  HUMIDITY:          'measure_humidity',
  RPM_SUPPLY:        'measure_rpm.supply',
  RPM_EXTRACT:       'measure_rpm.extract',
  BYPASS_ACTIVE:     'alarm_bypass',
  ALARM:             'alarm_generic'
};

const SETPOINT_CAPABILITY_MAP = {
  FAN_SPEED:     'genvex_fan_level',
  TEMP_SETPOINT: 'target_temperature',
  REHEATING:     'genvex_reheat'
};

const RECONNECT_INTERVAL = 60000; // 1 minute

class Optima270Device extends Homey.Device {

  async onInit() {
    this.log('Optima270 device initializing...');
    this.genvex = null;
    this.reconnectTimer = null;

    // Ensure all required capabilities exist (migration for already-paired devices)
    const requiredCapabilities = [
      'target_temperature',
      'measure_temperature.supply',
      'measure_temperature.outside',
      'measure_temperature.extract',
      'measure_temperature.exhaust',
      'measure_humidity',
      'genvex_fan_level',
      'measure_fan_speed',
      'measure_rpm.supply',
      'measure_rpm.extract',
      'alarm_bypass',
      'alarm_generic',
      'genvex_reheat'
    ];
    // Remove old subcapabilities from previous versions
    for (const old of ['measure_fan_speed.supply', 'measure_fan_speed.extract']) {
      if (this.hasCapability(old)) {
        this.log(`Removing old capability: ${old}`);
        await this.removeCapability(old);
      }
    }
    for (const cap of requiredCapabilities) {
      if (!this.hasCapability(cap)) {
        this.log(`Adding missing capability: ${cap}`);
        await this.addCapability(cap);
      }
    }

    // Register capability listeners for writable setpoints
    this.registerCapabilityListener('genvex_fan_level', async (value) => {
      await this._writeSetpoint('fanSpeed', Number(value));
    });

    this.registerCapabilityListener('target_temperature', async (value) => {
      await this._writeSetpoint('temperatureSetpoint', value);
    });

    this.registerCapabilityListener('genvex_reheat', async (value) => {
      await this._writeSetpoint('reheating', value ? 1 : 0);
    });

    // Flow card: triggers
    this._triggerTemperatureChanged = this.homey.flow.getDeviceTriggerCard('temperature_changed');
    this._triggerAlarm = this.homey.flow.getDeviceTriggerCard('alarm_triggered');
    this._triggerBypassChanged = this.homey.flow.getDeviceTriggerCard('bypass_changed');

    // Flow card: conditions
    this.homey.flow.getConditionCard('bypass_is_active')
      .registerRunListener(async (args, state) => {
        return this.getCapabilityValue('alarm_bypass') === true;
      });

    this.homey.flow.getConditionCard('fan_level_is')
      .registerRunListener(async (args, state) => {
        return this.getCapabilityValue('genvex_fan_level') === args.level;
      });

    // Flow card: actions
    this.homey.flow.getActionCard('set_fan_level')
      .registerRunListener(async (args, state) => {
        await this._writeSetpoint('fanSpeed', Number(args.level));
      });

    this.homey.flow.getActionCard('set_temperature')
      .registerRunListener(async (args, state) => {
        await this._writeSetpoint('temperatureSetpoint', args.temperature);
      });

    // Connect
    await this._connect();
  }

  async _connect() {
    this._clearReconnect();

    const settings = this.getSettings();
    const store = this.getStore();

    const ip = settings.ip_address || store.ip;
    const email = settings.email || store.email;
    const deviceId = settings.device_id || store.deviceId || 'unknown';
    const pollInterval = (settings.poll_interval || 30) * 1000;

    if (!ip || !email) {
      this.setUnavailable('IP address and email not configured');
      return;
    }

    try {
      this.genvex = new GenvexDevice({
        deviceId,
        ip,
        email,
        pollInterval
      });

      this.genvex.on('data', ({ name, value, capability }) => {
        this._updateCapabilityFromName(name, value);
      });

      this.genvex.on('model', (modelInfo) => {
        this.setSettings({
          device_model: `${modelInfo.deviceNumber}/${modelInfo.deviceModel}`
        }).catch(() => {});
      });

      this.genvex.on('error', (err) => {
        this.log('Device error:', err.message);
      });


      this.genvex.on('disconnected', () => {
        this.log('Device disconnected');
        this.setUnavailable('Connection lost');
        this._scheduleReconnect();
      });

      await this.genvex.connect();
      this.setAvailable();
      this.log('Connected to Genvex device');

    } catch (err) {
      this.log('Connection failed:', err.message);
      this.setUnavailable(`Connection failed: ${err.message}`);
      this._scheduleReconnect();
    }
  }

  _updateCapabilityFromName(name, value) {
    // Find the capability ID for this register name
    for (const [key, capId] of Object.entries(DATAPOINT_CAPABILITY_MAP)) {
      const reg = Optima270Datapoints[key];
      if (reg && reg.name === name) {
        // Convert boolean for indicator capabilities
        if (capId === 'alarm_bypass' || capId === 'alarm_generic') {
          this._safeSetCapability(capId, value !== 0);
        } else {
          this._safeSetCapability(capId, value);
        }

        // Fire flow triggers for specific capabilities
        this._fireFlowTriggers(capId, name, value);
        return;
      }
    }
    for (const [key, capId] of Object.entries(SETPOINT_CAPABILITY_MAP)) {
      const reg = Optima270Setpoints[key];
      if (reg && reg.name === name) {
        if (capId === 'genvex_reheat') {
          this._safeSetCapability(capId, value !== 0);
        } else if (capId === 'genvex_fan_level') {
          const level = Math.round(value);
          if (level >= 1 && level <= 4) {
            this._safeSetCapability(capId, String(level));
            this._safeSetCapability('measure_fan_speed', level);
          }
        } else {
          this._safeSetCapability(capId, value);
        }
        return;
      }
    }
  }

  _fireFlowTriggers(capId, name, value) {
    // Temperature changed trigger
    if (capId.startsWith('measure_temperature.')) {
      const tokens = {
        supply: this.getCapabilityValue('measure_temperature.supply') || 0,
        outside: this.getCapabilityValue('measure_temperature.outside') || 0,
        extract: this.getCapabilityValue('measure_temperature.extract') || 0
      };
      this._triggerTemperatureChanged.trigger(this, tokens).catch(() => {});
    }

    // Alarm trigger
    if (capId === 'alarm_generic' && value !== 0) {
      this._triggerAlarm.trigger(this).catch(() => {});
    }

    // Bypass changed trigger
    if (capId === 'alarm_bypass') {
      const active = value !== 0;
      this._triggerBypassChanged.trigger(this, { active }).catch(() => {});
    }
  }

  _safeSetCapability(capId, value) {
    if (this.hasCapability(capId)) {
      this.setCapabilityValue(capId, value).catch((err) => {
        this.log(`Failed to set ${capId}:`, err.message);
      });
    }
  }

  async _writeSetpoint(name, value) {
    if (!this.genvex || !this.genvex.isConnected()) {
      throw new Error('Not connected to device');
    }
    await this.genvex.setValue(name, value);
  }

  _scheduleReconnect() {
    this._clearReconnect();
    this.reconnectTimer = setTimeout(() => {
      this.log('Attempting reconnect...');
      this._connect();
    }, RECONNECT_INTERVAL);
  }

  _clearReconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  async onSettings({ oldSettings, newSettings, changedKeys }) {
    // Reconnect if connection-related settings changed
    if (changedKeys.includes('ip_address') ||
        changedKeys.includes('email') ||
        changedKeys.includes('poll_interval')) {
      this.log('Settings changed, reconnecting...');
      if (this.genvex) {
        this.genvex.disconnect();
        this.genvex = null;
      }
      // Slight delay to let old connection clean up
      setTimeout(() => this._connect(), 1000);
    }
  }

  async onDeleted() {
    this.log('Device deleted, cleaning up');
    this._clearReconnect();
    if (this.genvex) {
      this.genvex.disconnect();
      this.genvex = null;
    }
  }

  async onUninit() {
    this._clearReconnect();
    if (this.genvex) {
      this.genvex.disconnect();
      this.genvex = null;
    }
  }
}

module.exports = Optima270Device;
