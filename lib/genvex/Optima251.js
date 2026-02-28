'use strict';

/**
 * Register definitions for Optima 251 controller
 * Used by Genvex 400 (Optima 251).
 *
 * Addresses sourced from genvexnabto Python library (models/optima251.py).
 * Value conversion formula: (raw + offset) / divider
 *
 * Datapoints are read-only sensors (CMD_DATAPOINT_READLIST).
 * Setpoints are read/write controls (CMD_SETPOINT_READLIST / CMD_SETPOINT_WRITELIST).
 * On Optima 251, setpoints use the same address for reading and writing.
 */

const Optima251Datapoints = {
  TEMP_SUPPLY: {
    name: 'supplyTemperature',
    address: 0,
    divider: 10,
    offset: -300,
    unit: '\u00b0C',
    homeyCapability: 'measure_temperature.supply'
  },
  TEMP_OUTSIDE: {
    name: 'outsideTemperature',
    address: 2,
    divider: 10,
    offset: -300,
    unit: '\u00b0C',
    homeyCapability: 'measure_temperature.outside'
  },
  TEMP_EXHAUST: {
    name: 'exhaustTemperature',
    address: 3,
    divider: 10,
    offset: -300,
    unit: '\u00b0C',
    homeyCapability: 'measure_temperature.exhaust'
  },
  TEMP_EXTRACT: {
    name: 'extractTemperature',
    address: 6,
    divider: 10,
    offset: -300,
    unit: '\u00b0C',
    homeyCapability: 'measure_temperature.extract'
  },
  HUMIDITY: {
    name: 'humidity',
    address: 10,
    divider: 1,
    offset: 0,
    unit: '%',
    homeyCapability: 'measure_humidity'
  },
  DUTYCYCLE_SUPPLY: {
    name: 'dutyCycleSupply',
    address: 102,
    divider: 1,
    offset: 0,
    unit: '%',
    homeyCapability: 'measure_fan_speed.supply'
  },
  DUTYCYCLE_EXTRACT: {
    name: 'dutyCycleExtract',
    address: 103,
    divider: 1,
    offset: 0,
    unit: '%',
    homeyCapability: 'measure_fan_speed.extract'
  },
  RPM_SUPPLY: {
    name: 'rpmSupply',
    address: 108,
    divider: 1,
    offset: 0,
    unit: 'RPM',
    homeyCapability: 'measure_rpm.supply'
  },
  RPM_EXTRACT: {
    name: 'rpmExtract',
    address: 109,
    divider: 1,
    offset: 0,
    unit: 'RPM',
    homeyCapability: 'measure_rpm.extract'
  },
  BYPASS_ACTIVE: {
    name: 'bypassActive',
    address: 104,
    divider: 1,
    offset: 0,
    unit: '',
    homeyCapability: 'alarm_bypass'
  },
  ALARM: {
    name: 'alarm',
    address: 101,
    divider: 1,
    offset: 0,
    unit: '',
    homeyCapability: 'alarm_generic'
  }
};

const Optima251Setpoints = {
  FAN_SPEED: {
    name: 'fanSpeed',
    readAddress: 100,
    writeAddress: 100,
    divider: 1,
    offset: 0,
    min: 0,
    max: 4,
    unit: '',
    homeyCapability: 'measure_fan_speed'
  },
  TEMP_SETPOINT: {
    name: 'temperatureSetpoint',
    readAddress: 0,
    writeAddress: 0,
    divider: 10,
    offset: 100,
    min: 0,
    max: 200,
    unit: '\u00b0C',
    homeyCapability: 'target_temperature'
  },
  REHEATING: {
    name: 'reheating',
    readAddress: 2,
    writeAddress: 2,
    divider: 1,
    offset: 0,
    min: 0,
    max: 1,
    unit: '',
    homeyCapability: 'genvex_reheat'
  },
  FILTER_RESET: {
    name: 'filterReset',
    readAddress: 105,
    writeAddress: 105,
    divider: 1,
    offset: 0,
    min: 0,
    max: 1,
    unit: '',
    homeyCapability: null,
    writeOnly: true
  }
};

/**
 * Get ordered datapoint request list for NabtoConnection.readDatapoints.
 * @returns {{ keys: string[], requests: { obj: number, address: number }[] }}
 */
function getDatapointRequestList() {
  const keys = [];
  const requests = [];
  for (const [key, dp] of Object.entries(Optima251Datapoints)) {
    keys.push(key);
    requests.push({ obj: 0, address: dp.address });
  }
  return { keys, requests };
}

/**
 * Get ordered setpoint request list for NabtoConnection.readSetpoints.
 * Uses readAddress for reading.
 * @returns {{ keys: string[], requests: { obj: number, address: number }[] }}
 */
function getSetpointRequestList() {
  const keys = [];
  const requests = [];
  for (const [key, sp] of Object.entries(Optima251Setpoints)) {
    if (sp.writeOnly) continue;
    keys.push(key);
    requests.push({ obj: 0, address: sp.readAddress });
  }
  return { keys, requests };
}

/**
 * Convert raw value to display value using divider and offset.
 * Formula: (raw + offset) / divider
 * @param {number} rawValue
 * @param {{ divider: number, offset: number }} register
 * @returns {number}
 */
function convertDatapointValue(rawValue, register) {
  return (rawValue + (register.offset || 0)) / (register.divider || 1);
}

/**
 * Convert raw setpoint value to display value.
 * Same formula: (raw + offset) / divider
 * @param {number} rawValue
 * @param {{ divider: number, offset: number }} register
 * @returns {number}
 */
function convertSetpointValue(rawValue, register) {
  return (rawValue + (register.offset || 0)) / (register.divider || 1);
}

/**
 * Convert display value back to raw value for writing.
 * Inverse: raw = (display * divider) - offset
 * @param {number} displayValue
 * @param {{ divider: number, offset: number }} register
 * @returns {number}
 */
function toRawSetpointValue(displayValue, register) {
  return Math.round(displayValue * (register.divider || 1)) - (register.offset || 0);
}

/**
 * Get a setpoint definition by name.
 * @param {string} name
 * @returns {Object|undefined}
 */
function getSetpointByName(name) {
  return Object.values(Optima251Setpoints).find(sp => sp.name === name);
}

/** Model object for use with GenvexDevice */
const Optima251Model = {
  datapoints: Optima251Datapoints,
  setpoints: Optima251Setpoints,
  getDatapointRequestList,
  getSetpointRequestList,
  convertDatapointValue,
  convertSetpointValue,
  toRawSetpointValue,
  getSetpointByName
};

module.exports = {
  Optima251Datapoints,
  Optima251Setpoints,
  Optima251Model,
  getDatapointRequestList,
  getSetpointRequestList,
  convertDatapointValue,
  convertSetpointValue,
  toRawSetpointValue,
  getSetpointByName
};
