let shuttingDown = false;

module.exports = {
  isShuttingDown: () => shuttingDown,
  beginShutdown: () => { shuttingDown = true; },
};
