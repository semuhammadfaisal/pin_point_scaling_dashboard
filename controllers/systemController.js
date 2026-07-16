const mongoose = require('mongoose');
const runtimeState = require('../utils/runtimeState');

function health(_req, res) {
  res.set('Cache-Control', 'no-store');
  return res.status(200).json({ status: 'ok', uptimeSeconds: Math.floor(process.uptime()), timestamp: new Date().toISOString() });
}

async function ready(_req, res) {
  res.set('Cache-Control', 'no-store');
  const databaseReady = mongoose.connection.readyState === 1;
  const readyNow = databaseReady && !runtimeState.isShuttingDown();
  if (databaseReady) {
    try {
      await mongoose.connection.db.admin().ping();
    } catch (_error) {
      return res.status(503).json({ status: 'not_ready', database: 'unavailable', timestamp: new Date().toISOString() });
    }
  }
  return res.status(readyNow ? 200 : 503).json({
    status: readyNow ? 'ready' : 'not_ready',
    database: databaseReady ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString(),
  });
}

module.exports = { health, ready };
