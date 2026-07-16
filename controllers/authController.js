const { validationResult } = require('express-validator');
const { authenticateAdmin } = require('../services/authService');
const { setFlash } = require('../middleware/flash');
const loginRateLimiter = require('../middleware/loginRateLimiter');
const { recordAudit } = require('../services/auditService');

function showLogin(req, res) {
  res.render('auth/login', {
    layout: 'layouts/auth',
    title: 'Sign in',
    formData: { email: '' },
    errors: [],
    loggedOut: req.query.loggedOut === '1',
  });
}

async function login(req, res, next) {
  const errors = validationResult(req);
  const formData = { email: String(req.body.email || '').trim() };

  if (!errors.isEmpty()) {
    return res.status(422).render('auth/login', {
      layout: 'layouts/auth',
      title: 'Sign in',
      formData,
      errors: errors.array(),
    });
  }

  const admin = await authenticateAdmin(formData.email, req.body.password);
  if (!admin) {
    await recordAudit(req, 'failed_login', { actorEmail: formData.email, status: 'failure' });
    return res.status(401).render('auth/login', {
      layout: 'layouts/auth',
      title: 'Sign in',
      formData,
      errors: [{ msg: 'The email or password is incorrect.' }],
    });
  }

  loginRateLimiter.reset(req);
  const returnTo = req.session.returnTo || '/dashboard';
  await recordAudit(req, 'login', { actorId: admin._id, actorEmail: admin.email });

  return req.session.regenerate((error) => {
    if (error) return next(error);
    req.session.admin = { id: admin.id, name: admin.name, email: admin.email };
    setFlash(req, 'success', `Welcome back, ${admin.name}.`);
    return req.session.save((saveError) => {
      if (saveError) return next(saveError);
      return res.redirect(returnTo.startsWith('/') && !returnTo.startsWith('//') ? returnTo : '/dashboard');
    });
  });
}

async function logout(req, res, next) {
  await recordAudit(req, 'logout');
  req.session.destroy((error) => {
    if (error) return next(error);
    res.clearCookie('clinic.sid', { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' });
    return res.redirect('/login?loggedOut=1');
  });
}

module.exports = { showLogin, login, logout };
