const crypto = require('crypto');
const JobLock = require('../models/JobLock');

const owner = `${process.pid}-${crypto.randomUUID()}`;

async function acquire(name, ttlMs) {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlMs);
  try {
    const lock = await JobLock.findOneAndUpdate(
      { name, $or: [{ expiresAt: { $lte: now } }, { owner }] },
      { $set: { owner, expiresAt } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    ).lean();
    return lock?.owner === owner;
  } catch (error) {
    if (error.code === 11000) return false;
    throw error;
  }
}

async function release(name) {
  await JobLock.deleteOne({ name, owner });
}

module.exports = { acquire, release };
