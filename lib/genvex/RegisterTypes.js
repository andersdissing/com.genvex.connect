'use strict';

/**
 * Register type definitions
 * Used to define sensors and controls
 */
const RegisterType = {
  SENSOR: 'sensor',
  CONTROL: 'control',
  BINARY: 'binary'
};

const DataType = {
  TEMPERATURE: 'temperature',    // Divider + offset
  PERCENTAGE: 'percentage',      // 0-100%
  HUMIDITY: 'humidity',          // 0-100%
  SPEED: 'speed',                // RPM
  LEVEL: 'level',                // 0-4
  BOOLEAN: 'boolean',            // 0/1
  RAW: 'raw'                     // Unprocessed value
};

/**
 * Convert raw register value to display value.
 * Formula: (raw + offset) / divider
 * @param {number} rawValue
 * @param {string} dataType
 * @param {number} [divider=1]
 * @param {number} [offset=0]
 * @returns {number|boolean}
 */
function convertValue(rawValue, dataType, divider = 1, offset = 0) {
  switch (dataType) {
    case DataType.TEMPERATURE:
      return (rawValue + offset) / (divider || 10);
    case DataType.PERCENTAGE:
    case DataType.HUMIDITY:
      return Math.max(0, Math.min(100, (rawValue + offset) / (divider || 1)));
    case DataType.BOOLEAN:
      return rawValue !== 0;
    default:
      return (rawValue + offset) / (divider || 1);
  }
}

/**
 * Convert display value to raw register value.
 * Inverse: raw = (display * divider) - offset
 * @param {number|boolean} value
 * @param {string} dataType
 * @param {number} [divider=1]
 * @param {number} [offset=0]
 * @returns {number}
 */
function toRawValue(value, dataType, divider = 1, offset = 0) {
  switch (dataType) {
    case DataType.TEMPERATURE:
      return Math.round(value * (divider || 10)) - offset;
    case DataType.BOOLEAN:
      return value ? 1 : 0;
    default:
      return Math.round(value * (divider || 1)) - offset;
  }
}

module.exports = {
  RegisterType,
  DataType,
  convertValue,
  toRawValue
};
