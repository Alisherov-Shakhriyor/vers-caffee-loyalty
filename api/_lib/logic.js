'use strict';
const telegram = require('../../firebase/functions/telegram');
const security = require('../../firebase/functions/security');
const stamps = require('../../firebase/functions/stamps');

module.exports = {
  ...telegram,
  ...security,
  ...stamps
};
