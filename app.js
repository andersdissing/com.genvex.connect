'use strict';
const Homey = require('homey');

class GenvexApp extends Homey.App {
  async onInit() {
    this.log('Genvex Connect has been initialized');
  }
}

module.exports = GenvexApp;
