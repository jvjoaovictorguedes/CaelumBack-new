const GameSetting = require('../models/GameSetting');
const cache = require('./gameSettingCache');
const KEY = 'temple.enabled';
async function enabled(transaction) {
  const row = await GameSetting.findByPk(KEY, {transaction});
  return row?.valor === true;
}
async function requireEnabled() {
  if (!await enabled()) throw Object.assign(new Error('O Templo está indisponível.'), {statusCode:404});
}
async function backgroundEnabled(transaction) {
  if (cache.obter(KEY, false) !== true) return false;
  return enabled(transaction);
}
module.exports = {KEY, enabled, requireEnabled, backgroundEnabled};
