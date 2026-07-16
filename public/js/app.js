document.addEventListener('DOMContentLoaded', () => {
  const dateTarget = document.querySelector('[data-current-date]');
  if (dateTarget) {
    dateTarget.textContent = new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(new Date());
  }

  const passwordToggle = document.querySelector('[data-password-toggle]');
  if (passwordToggle) {
    passwordToggle.addEventListener('click', () => {
      const input = document.querySelector('#password');
      const showing = input.type === 'text';
      input.type = showing ? 'password' : 'text';
      passwordToggle.setAttribute('aria-label', showing ? 'Show password' : 'Hide password');
      passwordToggle.querySelector('i').className = showing ? 'bi bi-eye' : 'bi bi-eye-slash';
    });
  }

  document.querySelectorAll('.sidebar-link').forEach((link) => {
    link.addEventListener('click', () => {
      const sidebar = document.querySelector('#adminSidebar');
      if (sidebar && window.innerWidth < 992 && window.bootstrap) {
        bootstrap.Offcanvas.getOrCreateInstance(sidebar).hide();
      }
    });
  });
});
