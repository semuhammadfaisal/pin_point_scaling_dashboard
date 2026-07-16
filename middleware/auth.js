function requireAuth(req, res, next) {
  if (req.session?.admin) return next();
  req.session.returnTo = req.originalUrl;
  req.session.flash = { type: 'error', message: 'Please sign in to continue.' };
  return res.redirect('/login');
}

function redirectIfAuthenticated(req, res, next) {
  if (req.session?.admin) return res.redirect('/dashboard');
  return next();
}

module.exports = { requireAuth, redirectIfAuthenticated };
