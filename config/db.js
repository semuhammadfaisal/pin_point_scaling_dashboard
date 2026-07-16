const mongoose = require('mongoose');
const env = require('./env');
const logger = require('../utils/logger');

let listenersAttached = false;

function attachConnectionListeners() {
  if (listenersAttached) return;
  listenersAttached = true;
  mongoose.connection.on('connected', () => logger.info('mongodb_connected', { database: mongoose.connection.name }));
  mongoose.connection.on('disconnected', () => logger.warn('mongodb_disconnected'));
  mongoose.connection.on('reconnected', () => logger.info('mongodb_reconnected'));
  mongoose.connection.on('error', (error) => logger.error('mongodb_error', { error }));
}

async function connectDatabase() {
  mongoose.set('strictQuery', true);
  attachConnectionListeners();
  await mongoose.connect(env.mongodbUri, {
    serverSelectionTimeoutMS: 10000,
    maxPoolSize: Number(process.env.MONGODB_MAX_POOL_SIZE || 20),
    minPoolSize: Number(process.env.MONGODB_MIN_POOL_SIZE || 1),
    heartbeatFrequencyMS: 10000,
  });
  return mongoose.connection;
}

module.exports = connectDatabase;
