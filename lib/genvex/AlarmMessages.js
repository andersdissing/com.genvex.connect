'use strict';

/**
 * Alarm code to message mapping for Genvex devices
 *
 * The alarm code is read from register address 38.
 * Code 0 means no alarm.
 * Other codes correspond to specific alarm conditions.
 *
 * Messages sourced from Genvex user manual page 9, "LED 2: Alarm"
 */

const AlarmMessages = {
  // Alarm messages by language
  // Key is the alarm code (number), value is the message
  en: {
    0: 'No alarm',
    1: 'Stop control - check level guard if installed and condensate drain',
    2: 'Temperature sensor and humidity sensor error',
    3: 'Filter alarm',
    4: 'Fan error - check fan, RPM gives 0 signal',
    5: 'Water frost error',
    6: 'Fire error/during test',
    7: 'Fire error - Damper 1',
    8: 'Fire error - Damper 2',
    9: 'Fire error - Box 1',
    10: 'Fire error - Damper 3',
    11: 'Fire error - Damper 4',
    12: 'Fire error - Box 2',
    13: 'Rotor alarm - indicates high exhaust temperature and ineffective heat recovery. Check drive belt and air balance'
  },
  da: {
    0: 'Ingen alarm',
    1: 'Stop styring - tjek niveauvagt hvis monteret og kondensafløb',
    2: 'Temperaturfører og fugtfølerfejl',
    3: 'Filteralarm',
    4: 'Ventilatorfejl - tjek ventilator, omdrejningstal/RPM giver 0 signal',
    5: 'Vandfrostfejl',
    6: 'Brandfejl/ved test',
    7: 'Brandfejl - Spjæld 1',
    8: 'Brandfejl - Spjæld 2',
    9: 'Brandfejl - Boks 1',
    10: 'Brandfejl - Spjæld 3',
    11: 'Brandfejl - Spjæld 4',
    12: 'Brandfejl - Boks 2',
    13: 'Rotoralarm - indikerer høj afkast temperatur og ineffektiv varmegenvinding. Tjek drivrem og luftbalance'
  }
};

/**
 * Get alarm message for a given code and language
 * @param {number} code - The alarm code from the device
 * @param {string} language - Language code ('en', 'da', etc.)
 * @returns {string} The alarm message, or a default unknown message
 */
function getAlarmMessage(code, language = 'en') {
  const messages = AlarmMessages[language] || AlarmMessages.en;

  if (code === 0) {
    return messages[0] || AlarmMessages.en[0];
  }

  if (messages[code]) {
    return messages[code];
  }

  // Fallback to English if available
  if (AlarmMessages.en[code]) {
    return AlarmMessages.en[code];
  }

  // Unknown alarm code
  return language === 'da'
    ? `Ukendt alarm (kode ${code})`
    : `Unknown alarm (code ${code})`;
}

/**
 * Get all supported languages
 * @returns {string[]}
 */
function getSupportedLanguages() {
  return Object.keys(AlarmMessages);
}

module.exports = {
  AlarmMessages,
  getAlarmMessage,
  getSupportedLanguages
};
