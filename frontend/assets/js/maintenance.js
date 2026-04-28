(function () {
  'use strict';

  const STORAGE_KEY = 'maintenanceAccessToken';
  const statusText = document.getElementById('maintenanceStatusText');
  const messageText = document.getElementById('maintenanceMessage');
  const errorText = document.getElementById('maintenanceErrorText');
  const form = document.getElementById('maintenanceKeyForm');
  const input = document.getElementById('maintenanceKeyInput');
  const submitBtn = document.getElementById('maintenanceSubmitBtn');
  const continueBtn = document.getElementById('maintenanceContinueBtn');
  const sliderTrack = document.getElementById('maintenanceSliderTrack');
  const dotsHost = document.getElementById('maintenanceSliderDots');

  const setError = (message) => {
    if (errorText) errorText.textContent = message || '';
  };

  const setStatus = (message) => {
    if (statusText) statusText.textContent = message || '';
  };

  const setMessage = (message) => {
    if (messageText) messageText.textContent = message || '';
  };

  const getToken = () => {
    try {
      return String(localStorage.getItem(STORAGE_KEY) || '');
    } catch (_e) {
      return '';
    }
  };

  const saveToken = (token) => {
    try {
      localStorage.setItem(STORAGE_KEY, token);
    } catch (_e) {
      // ignore storage errors
    }
  };

  const resolveApiBaseUrl = () => {
    if (typeof window === 'undefined') return '';
    const meta = document.querySelector('meta[name="api-base"]');
    const metaValue = meta ? String(meta.content || '').trim() : '';
    if (metaValue) return metaValue.replace(/\/+$/, '');
    const hostname = String(window.location.hostname || '').toLowerCase();
    const isLocalHost = hostname === 'localhost' || hostname === '127.0.0.1';
    if (window.location.protocol === 'file:') return 'http://localhost:5000';
    if (isLocalHost && window.location.port !== '5000' && window.location.port !== '5443') return 'http://localhost:5000';
    return '';
  };

  const buildApiUrl = (pathname) => {
    const safePath = pathname.startsWith('/') ? pathname : '/' + pathname;
    return resolveApiBaseUrl() + safePath;
  };

  const fetchStatus = async () => {
    try {
      const response = await fetch(buildApiUrl('/api/maintenance/status'));
      if (!response.ok) throw new Error('Bakim durumu alinamadi.');
      const payload = await response.json();
      if (payload && payload.message) {
        setMessage(payload.message);
      }
      setStatus(payload?.enabled ? 'Bakım Modu Aktif' : 'Bakım Modu Kapalı');
    } catch (_error) {
      setStatus('Bakım Bilgisi Alınamadı');
    }
  };

  /* ---- Slider ---- */
  function initSlider() {
    if (!sliderTrack) return;
    const slides = Array.from(sliderTrack.querySelectorAll('.maint-bg-slide'));
    if (slides.length < 2) return;

    if (dotsHost) {
      dotsHost.innerHTML = slides.map((_, idx) => '<span class="maint-card-dot' + (idx === 0 ? ' is-active' : '') + '" data-slide-index="' + idx + '"></span>').join('');
    }
    const dots = dotsHost ? Array.from(dotsHost.querySelectorAll('.maint-card-dot')) : [];

    let activeIndex = 0;
    let timer = null;
    const card = document.querySelector('.maint-card');
    const intervalAttr = Number(card?.getAttribute('data-autoplay-interval') || 4500);
    const interval = Number.isFinite(intervalAttr) && intervalAttr >= 1500 ? intervalAttr : 4500;

    const goTo = (nextIndex) => {
      const next = ((nextIndex % slides.length) + slides.length) % slides.length;
      if (next === activeIndex) return;
      slides[activeIndex].classList.remove('is-active');
      slides[next].classList.add('is-active');
      if (dots[activeIndex]) dots[activeIndex].classList.remove('is-active');
      if (dots[next]) dots[next].classList.add('is-active');
      activeIndex = next;
    };

    const start = () => {
      stop();
      timer = window.setInterval(() => goTo(activeIndex + 1), interval);
    };
    const stop = () => {
      if (timer) {
        window.clearInterval(timer);
        timer = null;
      }
    };

    dots.forEach((dot) => {
      dot.addEventListener('click', () => {
        const idx = Number(dot.dataset.slideIndex || 0);
        goTo(idx);
        start();
      });
    });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) stop();
      else start();
    });

    start();
  }

  /* ---- Form ---- */
  if (continueBtn) {
    continueBtn.addEventListener('click', () => {
      window.location.href = 'index.html';
    });
  }

  if (form) {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      setError('');

      const rawKey = String(input?.value || '').trim();
      if (!rawKey) {
        setError('Lütfen erişim anahtarını girin.');
        return;
      }

      try {
        if (submitBtn) submitBtn.disabled = true;
        setStatus('Anahtar Doğrulanıyor...');

        const response = await fetch(buildApiUrl('/api/maintenance/verify'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: rawKey }),
          credentials: 'same-origin'
        });

        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload?.message || 'Anahtar doğrulanamadı.');
        }

        if (!payload?.token) {
          throw new Error('Erişim tokeni üretilmedi.');
        }

        saveToken(payload.token);
        window.location.href = 'index.html';
      } catch (error) {
        setError(error.message || 'Anahtar doğrulanamadı.');
        setStatus('Bakım Modu Aktif');
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
    });
  }

  const existingToken = getToken();
  if (existingToken && continueBtn) {
    continueBtn.classList.remove('hidden');
  }

  initSlider();
  fetchStatus();
})();
