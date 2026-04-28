(function () {
  'use strict';

  if (typeof window === 'undefined') return;
  if (window.location && window.location.protocol === 'file:') return;

  const STORAGE_KEY = 'maintenanceAccessToken';
  const resolveStatusUrl = () => {
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      if (window.location.port === '5000') return '/api/maintenance/status';
      return 'http://localhost:5000/api/maintenance/status';
    }
    return '/api/maintenance/status';
  };
  const apiBaseMeta = document.querySelector('meta[name="api-base"]');
  const apiBaseValue = apiBaseMeta ? String(apiBaseMeta.content || '').trim() : '';
  const apiBase = apiBaseValue ? apiBaseValue.replace(/\/+$/, '') : '';

  const statusUrl = apiBase ? (apiBase + '/api/maintenance/status') : resolveStatusUrl();
  const basePath = window.location.pathname.replace(/[^/]*$/, '');
  const maintenanceUrl = basePath + 'maintenance.html';
  const isMaintenancePage = window.location.pathname.endsWith('/maintenance.html')
    || window.location.pathname.endsWith('maintenance.html');

  const getToken = () => {
    try {
      return String(window.localStorage.getItem(STORAGE_KEY) || '');
    } catch (_e) {
      return '';
    }
  };

  const allowedOrigins = [
    window.location.origin,
    'http://localhost:5000',
    'https://localhost:5000'
  ];
  if (apiBase) {
    try {
      const parsed = new URL(apiBase, window.location.href);
      if (!allowedOrigins.includes(parsed.origin)) {
        allowedOrigins.push(parsed.origin);
      }
    } catch (_e) {
      // ignore invalid api-base
    }
  }

  const isAllowedOrigin = (url) => {
    try {
      const parsed = new URL(url, window.location.href);
      return allowedOrigins.includes(parsed.origin);
    } catch (_e) {
      return false;
    }
  };

  const originalFetch = typeof window.fetch === 'function' ? window.fetch.bind(window) : null;
  if (originalFetch) {
    window.fetch = (input, init) => {
      const token = getToken();
      const url = typeof input === 'string' ? input : (input && input.url ? input.url : '');
      if (!token || !url || !isAllowedOrigin(url)) {
        return originalFetch(input, init);
      }

      const nextInit = Object.assign({}, init || {});
      const headers = new Headers(nextInit.headers || {});
      if (!headers.has('X-Maintenance-Token')) {
        headers.set('X-Maintenance-Token', token);
      }
      nextInit.headers = headers;
      return originalFetch(input, nextInit);
    };
  }

  if (!originalFetch) return;

  const token = getToken();
  const statusHeaders = token ? { 'X-Maintenance-Token': token } : undefined;

  originalFetch(statusUrl, { headers: statusHeaders })
    .then((response) => response.ok ? response.json() : null)
    .then((payload) => {
      if (!payload || payload.enabled !== true) {
        if (isMaintenancePage && token) {
          window.location.replace(basePath + 'index.html');
        }
        return;
      }

      if (!token && !isMaintenancePage) {
        window.location.replace(maintenanceUrl);
        return;
      }

      if (token && isMaintenancePage) {
        window.location.replace(basePath + 'index.html');
      }
    })
    .catch(() => {
      // fail-open to avoid accidental lockout if API is down
    });
})();
