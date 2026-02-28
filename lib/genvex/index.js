'use strict';

const GenvexDevice = require('./GenvexDevice');
const Optima270 = require('./Optima270');
const Optima251 = require('./Optima251');
const RegisterTypes = require('./RegisterTypes');

module.exports = {
  GenvexDevice,
  ...Optima270,
  ...Optima251,
  ...RegisterTypes
};
