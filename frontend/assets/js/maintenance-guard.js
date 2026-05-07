(function () {
  'use strict';

  if (typeof window === 'undefined') return;
  if (window.location && window.location.protocol === 'file:') return;

  const resolveApiBase = () => {
    const meta = document.querySelector('meta[name="api-base"]');
    const metaValue = meta ? String(meta.content || '').trim() : '';
    if (metaValue) return metaValue.replace(/\/+$/, '');
    const h = String(window.location.hostname || '').toLowerCase();
    if ((h === 'localhost' || h === '127.0.0.1')
        && window.location.port !== '5000'
        && window.location.port !== '5443') {
      return 'http://localhost:5000';
    }
    return '';
  };

  const apiBase = resolveApiBase();
  const buildUrl  = (p) => apiBase + p;
  const basePath  = window.location.pathname.replace(/[^/]*$/, '');
  const isMaintenancePage = window.location.pathname.endsWith('maintenance.html');

  const originalFetch = typeof window.fetch === 'function' ? window.fetch.bind(window) : null;
  if (!originalFetch) return;

  originalFetch(buildUrl('/api/maintenance/status'))
    .then((res) => (res.ok ? res.json() : null))
    .then(async (payload) => {
      if (!payload || payload.enabled !== true) {
        // Bakım modu kapalı — maintenance sayfasındaysak ana sayfaya dön
        if (isMaintenancePage) {
          window.location.replace(basePath + 'index.html');
        }
        return;
      }

      // Bakım modu açık — zaten maintenance sayfasındaysak işlem yapma
      if (isMaintenancePage) return;

      // HttpOnly cookie'de geçerli oturum var mı diye sor
      const sessionRes = await originalFetch(buildUrl('/api/maintenance/session'), {
        credentials: 'same-origin'
      });
      const sessionData = sessionRes.ok ? await sessionRes.json() : null;

      if (!sessionData || !sessionData.valid) {
        window.location.replace(basePath + 'maintenance.html');
      }
    })
    .catch(() => {
      // API erişilemiyorsa kullanıcıyı kilitlemiyoruz (fail-open)
    });
})();
