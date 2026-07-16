module.exports = (req, res, next) => {
  res.locals.currentUser = req.session?.admin || null;
  res.locals.currentPath = req.path;
  res.locals.appName = 'ClinicPulse';
  next();
};
