const { failure } = require("./antiAutomationErrors");
const inFlight = new Set();
async function exclusive(key, operation) {
  if (inFlight.has(key)) throw failure("INVALID_ACTION_STATE", 409);
  inFlight.add(key);
  try {
    return await operation();
  } finally {
    inFlight.delete(key);
  }
}
function assertVersion(expected, actual) {
  if (!Number.isInteger(expected) || expected !== actual)
    throw failure("INVALID_ACTION_STATE", 409);
}
module.exports = { exclusive, assertVersion };
