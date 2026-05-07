(function () {
  'use strict';

  const STORAGE_KEY = 'cookieConsent';
  const BANNER_ID   = 'cookieConsentBanner';

  function getConsent() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); }
    catch (_) { return null; }
  }

  function saveConsent(prefs) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...prefs, savedAt: new Date().toISOString() }));
  }

  function hideBanner() {
    const el = document.getElementById(BANNER_ID);
    if (!el) return;
    el.classList.remove('is-visible');
    setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 400);
  }

  function openPreferenceModal() {
    const modal = document.getElementById('cookiePreferenceModal');
    if (modal) modal.style.display = 'block';
    hideBanner();
  }

  function buildBanner() {
    const banner = document.createElement('div');
    banner.id = BANNER_ID;
    banner.className = 'cookie-banner';
    banner.setAttribute('role', 'region');
    banner.setAttribute('aria-label', 'Çerez bildirimi');
    banner.innerHTML =
      '<p class="cookie-banner__text">'
      + 'Bu site; zorunlu, analitik ve kişiselleştirme çerezleri kullanmaktadır. '
      + 'Devam ederek <a id="cookieOpenPrefs" href="#" role="button">çerez politikamızı</a> kabul etmiş olursunuz.'
      + '</p>'
      + '<div class="cookie-banner__actions">'
      + '  <button class="cookie-btn cookie-btn--reject"  id="cookieRejectBtn">Reddet</button>'
      + '  <button class="cookie-btn cookie-btn--settings" id="cookieSettingsBtn">Ayarlar</button>'
      + '  <button class="cookie-btn cookie-btn--accept"  id="cookieAcceptBtn">Tümünü Kabul Et</button>'
      + '</div>';

    document.body.appendChild(banner);
    requestAnimationFrame(() => banner.classList.add('is-visible'));

    document.getElementById('cookieAcceptBtn').addEventListener('click', function () {
      saveConsent({ analytics: true, marketing: true, personalization: true });
      hideBanner();
    });

    document.getElementById('cookieRejectBtn').addEventListener('click', function () {
      saveConsent({ analytics: false, marketing: false, personalization: false });
      hideBanner();
    });

    document.getElementById('cookieSettingsBtn').addEventListener('click', function (e) {
      e.preventDefault();
      openPreferenceModal();
    });

    const link = document.getElementById('cookieOpenPrefs');
    if (link) {
      link.addEventListener('click', function (e) {
        e.preventDefault();
        openPreferenceModal();
      });
    }
  }

  function bindPreferenceModal() {
    const modal   = document.getElementById('cookiePreferenceModal');
    const form    = document.getElementById('cookiePrefsForm');
    const closeEl = document.getElementById('closeCookieModal');
    const rejectEl = document.getElementById('rejectCookiesBtn');
    const acceptEl = document.getElementById('acceptAllCookiesBtn');

    if (!modal) return;

    if (closeEl) {
      closeEl.addEventListener('click', function () { modal.style.display = 'none'; });
    }

    modal.addEventListener('click', function (e) {
      if (e.target === modal) modal.style.display = 'none';
    });

    if (acceptEl) {
      acceptEl.addEventListener('click', function () {
        saveConsent({ analytics: true, marketing: true, personalization: true });
        modal.style.display = 'none';
      });
    }

    if (rejectEl) {
      rejectEl.addEventListener('click', function () {
        saveConsent({ analytics: false, marketing: false, personalization: false });
        modal.style.display = 'none';
      });
    }

    if (form) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        const data = new FormData(form);
        saveConsent({
          analytics:       data.has('analytics'),
          marketing:       data.has('marketing'),
          personalization: data.has('personalization')
        });
        modal.style.display = 'none';
      });
    }
  }

  function init() {
    bindPreferenceModal();
    if (!getConsent()) buildBanner();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
