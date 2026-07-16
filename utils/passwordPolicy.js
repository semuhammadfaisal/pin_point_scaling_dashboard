const MIN_LENGTH = 12;

function passwordErrors(password) {
  const value = String(password || '');
  const errors = [];
  if (value.length < MIN_LENGTH) errors.push(`must contain at least ${MIN_LENGTH} characters`);
  if (value.length > 128) errors.push('must contain no more than 128 characters');
  if (!/[a-z]/.test(value)) errors.push('must contain a lowercase letter');
  if (!/[A-Z]/.test(value)) errors.push('must contain an uppercase letter');
  if (!/\d/.test(value)) errors.push('must contain a number');
  if (!/[^A-Za-z0-9]/.test(value)) errors.push('must contain a special character');
  return errors;
}

function assertStrongPassword(password, label = 'Password') {
  const errors = passwordErrors(password);
  if (errors.length) throw new Error(`${label} ${errors.join(', ')}.`);
}

module.exports = { MIN_LENGTH, passwordErrors, assertStrongPassword };
