'use strict';

/**
 * Register definitions for Optima 270 controller
 * Used by ECO 300, ECO 300 XL, ECO 400 XL, etc.
 *
 * Addresses verified from genvexnabto Python reference (v1.4.4).
 * Value conversion formula: (raw + offset) / divider
 *
 * Datapoints are read-only sensors (CMD_DATAPOINT_READLIST).
 * Setpoints are read/write controls (CMD_SETPOINT_READLIST / CMD_SETPOINT_WRITELIST).
 * For setpoints, readAddress is for reading, writeAddress is for writing.
 */

const Optima270Datapoints = {
  TEMP_SUPPLY: {
    name: 'supplyTemperature',
    address: 20,
    divider: 10,
    offset: -300,
    unit: '\u00b0C',
    homeyCapability: 'measure_temperature.supply'
  },
  TEMP_OUTSIDE: {
    name: 'outsideTemperature',
    address: 21,
    divider: 10,
    offset: -300,
    unit: '\u00b0C',
    homeyCapability: 'measure_temperature.outside'
  },
  TEMP_EXHAUST: {
    name: 'exhaustTemperature',
    address: 22,
    divider: 10,
    offset: -300,
    unit: '\u00b0C',
    homeyCapability: 'measure_temperature.exhaust'
  },
  TEMP_EXTRACT: {
    name: 'extractTemperature',
    address: 23,
    divider: 10,
    offset: -300,
    unit: '\u00b0C',
    homeyCapability: 'measure_temperature.extract'
  },
  HUMIDITY: {
    name: 'humidity',
    address: 26,
    divider: 1,
    offset: 0,
    unit: '%',
    homeyCapability: 'measure_humidity'
  },
  DUTYCYCLE_SUPPLY: {
    name: 'dutyCycleSupply',
    address: 18,
    divider: 100,
    offset: 0,
    unit: '%',
    homeyCapability: 'measure_fan_speed.supply'
  },
  DUTYCYCLE_EXTRACT: {
    name: 'dutyCycleExtract',
    address: 19,
    divider: 100,
    offset: 0,
    unit: '%',
    homeyCapability: 'measure_fan_speed.extract'
  },
  RPM_SUPPLY: {
    name: 'rpmSupply',
    address: 35,
    divider: 1,
    offset: 0,
    unit: 'RPM',
    homeyCapability: 'measure_rpm.supply'
  },
  RPM_EXTRACT: {
    name: 'rpmExtract',
    address: 36,
    divider: 1,
    offset: 0,
    unit: 'RPM',
    homeyCapability: 'measure_rpm.extract'
  },
  BYPASS_ACTIVE: {
    name: 'bypassActive',
    address: 53,
    divider: 1,
    offset: 0,
    unit: '',
    homeyCapability: 'alarm_bypass'
  },
  ALARM: {
    name: 'alarm',
    address: 38,
    divider: 1,
    offset: 0,
    unit: '',
    homeyCapability: 'alarm_generic'
  },
  SACRIFICIAL_ANODE: {
    name: 'sacrificialAnode',
    address: 18,  // same as DUTYCYCLE_SUPPLY in some firmware versions; kept for completeness
    divider: 1,
    offset: 0,
    unit: '',
    homeyCapability: null
  }
};

const Optima270Setpoints = {
  FAN_SPEED: {
    name: 'fanSpeed',
    readAddress: 7,
    writeAddress: 24,
    divider: 1,
    offset: 0,
    min: 1,
    max: 4,
    unit: '',
    homeyCapability: 'genvex_fan_level'
  },
  TEMP_SETPOINT: {
    name: 'temperatureSetpoint',
    readAddress: 1,
    writeAddress: 12,
    divider: 10,
    offset: 100,
    min: 0,
    max: 200,
    unit: '\u00b0C',
    homeyCapability: 'target_temperature'
  },
  BYPASS_OPENOFFSET: {
    name: 'bypassOpenOffset',
    readAddress: 21,
    writeAddress: 52,
    divider: 1,
    offset: 0,
    min: 0,
    max: 10,
    unit: '\u00b0C',
    homeyCapability: null
  },
  REHEATING: {
    name: 'reheating',
    readAddress: 3,
    writeAddress: 16,
    divider: 1,
    offset: 0,
    min: 0,
    max: 1,
    unit: '',
    homeyCapability: 'genvex_reheat'
  },
  FILTER_DAYS: {
    name: 'filterDays',
    readAddress: 100,
    writeAddress: 210,
    divider: 1,
    offset: 0,
    min: 0,
    max: 65535,
    unit: 'days',
    homeyCapability: 'genvex_filter_days'
  },
  FILTER_RESET: {
    name: 'filterReset',
    readAddress: 50,
    writeAddress: 110,
    divider: 1,
    offset: 0,
    min: 0,
    max: 2,
    unit: '',
    homeyCapability: null
  }
};

/**
 * Get ordered datapoint request list for NabtoConnection.readDatapoints.
 * @returns {{ keys: string[], requests: { obj: number, address: number }[] }}
 */
function getDatapointRequestList() {
  const keys = [];
  const requests = [];
  for (const [key, dp] of Object.entries(Optima270Datapoints)) {
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
  for (const [key, sp] of Object.entries(Optima270Setpoints)) {
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
  return Object.values(Optima270Setpoints).find(sp => sp.name === name);
}

module.exports = {
  Optima270Datapoints,
  Optima270Setpoints,
  getDatapointRequestList,
  getSetpointRequestList,
  convertDatapointValue,
  convertSetpointValue,
  toRawSetpointValue,
  getSetpointByName
};
