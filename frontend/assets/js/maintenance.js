(function () {
  'use strict';

  const STORAGE_KEY = 'maintenanceAccessToken';

  const statusText  = document.getElementById('maintenanceStatusText');
  const messageText = document.getElementById('maintenanceMessage');
  const errorText   = document.getElementById('maintenanceErrorText');
  const form        = document.getElementById('maintenanceKeyForm');
  const input       = document.getElementById('maintenanceKeyInput');
  const submitBtn   = document.getElementById('maintenanceSubmitBtn');
  const continueBtn = document.getElementById('maintenanceContinueBtn');
  const keyOverlay  = document.getElementById('keyOverlay');
  const closeBtnEl  = document.getElementById('keyPanelClose');
  const siteLoader  = document.getElementById('siteLoader');
  const heroBgShell = document.getElementById('heroBgShell');

  /* ---- Helpers ---- */
  const setError   = (m) => { if (errorText)   errorText.textContent   = m || ''; };
  const setStatus  = (m) => { if (statusText)  statusText.textContent  = m || ''; };
  const setMessage = (m) => { if (messageText) messageText.textContent = m || ''; };

  const getToken = () => {
    try { return String(localStorage.getItem(STORAGE_KEY) || ''); } catch { return ''; }
  };

  const saveToken = (token) => {
    try { localStorage.setItem(STORAGE_KEY, token); } catch { /* ignore */ }
  };

  const resolveApiBaseUrl = () => {
    if (typeof window === 'undefined') return '';
    const meta = document.querySelector('meta[name="api-base"]');
    const metaValue = meta ? String(meta.content || '').trim() : '';
    if (metaValue) return metaValue.replace(/\/+$/, '');
    const hostname = String(window.location.hostname || '').toLowerCase();
    const isLocal  = hostname === 'localhost' || hostname === '127.0.0.1';
    if (window.location.protocol === 'file:') return 'http://localhost:5000';
    if (isLocal && window.location.port !== '5000' && window.location.port !== '5443') return 'http://localhost:5000';
    return '';
  };

  const buildApiUrl = (path) => resolveApiBaseUrl() + (path.startsWith('/') ? path : '/' + path);

  /* ---- Site Loader ---- */
  function initLoader() {
    if (!siteLoader) return;
    // Dismiss after chomp animation completes (~2.2 s)
    setTimeout(() => siteLoader.classList.add('is-done'), 2200);
  }

  /* ---- Background Slideshow ---- */
  function initHeroSlider() {
    if (!heroBgShell) return;
    const slides = Array.from(heroBgShell.querySelectorAll('.hero-bg-slide'));
    if (slides.length < 2) return;

    let active = 0;
    const advance = () => {
      slides[active].classList.remove('is-active');
      active = (active + 1) % slides.length;
      slides[active].classList.add('is-active');
    };

    let timer = setInterval(advance, 6000);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { clearInterval(timer); }
      else                  { timer = setInterval(advance, 6000); }
    });
  }

  /* ---- Key Overlay ---- */
  function openOverlay() {
    if (!keyOverlay) return;
    keyOverlay.classList.add('is-open');
    keyOverlay.setAttribute('aria-hidden', 'false');
    setTimeout(() => input && input.focus(), 300);
  }

  function closeOverlay() {
    if (!keyOverlay) return;
    keyOverlay.classList.remove('is-open');
    keyOverlay.setAttribute('aria-hidden', 'true');
    setError('');
  }

  /* Keyboard shortcut: Ctrl + Shift + K  (toggle) */
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.shiftKey && (e.key === 'K' || e.key === 'k')) {
      e.preventDefault();
      keyOverlay && keyOverlay.classList.contains('is-open') ? closeOverlay() : openOverlay();
      return;
    }
    if (e.key === 'Escape' && keyOverlay && keyOverlay.classList.contains('is-open')) {
      closeOverlay();
    }
  });

  if (closeBtnEl) closeBtnEl.addEventListener('click', closeOverlay);

  // Close on backdrop click
  if (keyOverlay) {
    keyOverlay.addEventListener('click', (e) => {
      if (e.target === keyOverlay) closeOverlay();
    });
  }

  /* ---- Fetch maintenance status ---- */
  async function fetchStatus() {
    try {
      const res = await fetch(buildApiUrl('/api/maintenance/status'));
      if (!res.ok) throw new Error();
      const data = await res.json();
      if (data && data.message) setMessage(data.message);
      setStatus(data?.enabled ? 'Bakım Modu Aktif' : 'Bakım Modu Kapalı');
    } catch {
      setStatus('Bakım Bilgisi Alınamadı');
    }
  }

  /* ---- Continue button ---- */
  if (continueBtn) {
    continueBtn.addEventListener('click', () => { window.location.href = 'index.html'; });
  }

  /* ---- Key form submit ---- */
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      setError('');

      const rawKey = String(input?.value || '').trim();
      if (!rawKey) { setError('Lütfen erişim anahtarını girin.'); return; }

      try {
        if (submitBtn) submitBtn.disabled = true;
        setStatus('Anahtar Doğrulanıyor…');

        const res = await fetch(buildApiUrl('/api/maintenance/verify'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: rawKey }),
          credentials: 'same-origin',
        });

        const payload = await res.json().catch(() => ({}));
        if (!res.ok)        throw new Error(payload?.message || 'Anahtar doğrulanamadı.');
        if (!payload?.token) throw new Error('Erişim tokeni üretilmedi.');

        saveToken(payload.token);
        window.location.href = 'index.html';
      } catch (err) {
        setError(err.message || 'Anahtar doğrulanamadı.');
        setStatus('Bakım Modu Aktif');
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
    });
  }

  /* ---- Init ---- */
  const existing = getToken();
  if (existing && continueBtn) continueBtn.classList.remove('hidden');

  initLoader();
  initHeroSlider();
  fetchStatus();

})();
