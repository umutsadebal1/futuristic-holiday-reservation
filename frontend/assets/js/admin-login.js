const ADMIN_ROLES = ['patron', 'ust_yetkili', 'alt_yetkili'];
const API_BASES = ['http://localhost:5000', 'https://localhost:5000'];
const THEME_STORAGE_KEY = 'themePreference';
const AUTH_TOKENS_STORAGE_KEY = 'authTokens';

function normalizeRole(role) {
  return String(role || '').trim().toLowerCase();
}

function isAdminRole(role) {
  return ADMIN_ROLES.includes(normalizeRole(role));
}

function buildApiUrl(pathname) {
  const normalizedPath = pathname.startsWith('/') ? pathname : '/' + pathname;

  if (typeof window === 'undefined') return normalizedPath;

  const meta = document.querySelector('meta[name="api-base"]');
  const metaValue = meta ? String(meta.content || '').trim() : '';
  if (metaValue) return metaValue.replace(/\/+$/, '') + normalizedPath;

  const hostname = String(window.location.hostname || '').toLowerCase();
  const isLocalHost = hostname === 'localhost' || hostname === '127.0.0.1';

  if (window.location.protocol === 'file:') {
    return API_BASES[0] + normalizedPath;
  }
  if (isLocalHost && window.location.port !== '5000' && window.location.port !== '5443') {
    return API_BASES[0] + normalizedPath;
  }
  return normalizedPath;
}

async function requestPost(pathname, payload, headers) {
  const response = await fetch(buildApiUrl(pathname), {
    method: 'POST',
    headers: Object.assign({
      'Content-Type': 'application/json'
    }, headers || {}),
    body: JSON.stringify(payload || {})
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.message || 'İşlem başarısız.');
    error.status = response.status;
    throw error;
  }

  return data;
}

async function requestGet(pathname, headers) {
  const response = await fetch(buildApiUrl(pathname), {
    method: 'GET',
    headers: Object.assign({
      'Content-Type': 'application/json'
    }, headers || {})
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.message || 'Doğrulama alınamadı.');
    error.status = response.status;
    throw error;
  }

  return data;
}

function setFeedback(message, type) {
  const feedback = document.getElementById('adminLoginFeedback');
  if (!feedback) return;
  feedback.textContent = message || '';
  feedback.classList.remove('error');
  if (type === 'error') {
    feedback.classList.add('error');
  }
}

function setLoading(loading) {
  const submitBtn = document.getElementById('adminLoginSubmitBtn');
  if (!submitBtn) return;
  submitBtn.disabled = loading;
  submitBtn.textContent = loading ? 'Doğrulanıyor...' : 'Doğrula ve Panele Gir';
}

function saveSession(user, tokens) {
  localStorage.setItem(AUTH_TOKENS_STORAGE_KEY, JSON.stringify({
    accessToken: tokens?.accessToken || '',
    refreshToken: tokens?.refreshToken || '',
    tokenType: tokens?.tokenType || 'Bearer',
    expiresIn: tokens?.expiresIn || '',
    loggedInAt: new Date().toISOString()
  }));

  localStorage.setItem('authSession', JSON.stringify({
    userId: user.id,
    email: user.email,
    name: user.name,
    token: tokens?.accessToken || '',
    refreshToken: tokens?.refreshToken || '',
    loggedInAt: new Date().toISOString()
  }));

  const currentUser = localStorage.getItem('user');
  let parsedUser = {};
  try {
    parsedUser = currentUser ? JSON.parse(currentUser) : {};
  } catch (_error) {
    parsedUser = {};
  }

  localStorage.setItem('user', JSON.stringify({
    ...parsedUser,
    id: user.id,
    userId: user.id,
    name: user.name,
    email: user.email
  }));
}

function getHumanCheckModeLabel() {
  return document.getElementById('adminHumanCheckMode');
}

function setHumanCheckModeLabel(message, isError) {
  const label = getHumanCheckModeLabel();
  if (!label) return;
  label.textContent = message || '';
  label.style.color = isError ? '#b31343' : '#9f3456';
}

async function getHumanCheckConfig() {
  const fileProtocol = typeof window !== 'undefined' && window.location.protocol === 'file:';
  if (fileProtocol) {
    return {
      enabled: false,
      siteKey: '',
      provider: 'local',
      forcedLocal: true
    };
  }

  try {
    const payload = await requestGet('/api/humancheck/site-config');
    return {
      enabled: Boolean(payload?.enabled),
      siteKey: String(payload?.siteKey || '').trim(),
      provider: String(payload?.provider || 'local').trim().toLowerCase(),
      forcedLocal: false
    };
  } catch (_error) {
    return {
      enabled: false,
      siteKey: '',
      provider: 'local',
      forcedLocal: false
    };
  }
}

function waitForRecaptchaApi(timeoutMs) {
  const startedAt = Date.now();
  return new Promise((resolve, reject) => {
    const probe = () => {
      const hasApi = Boolean(
        window.grecaptcha
          && typeof window.grecaptcha.ready === 'function'
          && typeof window.grecaptcha.execute === 'function'
      );

      const hasEnterpriseApi = Boolean(
        window.grecaptcha
          && window.grecaptcha.enterprise
          && typeof window.grecaptcha.enterprise.ready === 'function'
          && typeof window.grecaptcha.enterprise.execute === 'function'
      );

      if (hasApi || hasEnterpriseApi) {
        resolve();
        return;
      }

      if (Date.now() - startedAt >= timeoutMs) {
        reject(new Error('Google reCAPTCHA hazır değil.'));
        return;
      }

      window.setTimeout(probe, 80);
    };

    probe();
  });
}

async function loadGoogleRecaptchaScript(siteKey) {
  const hasApi = window.grecaptcha && (typeof window.grecaptcha.ready === 'function' || (window.grecaptcha.enterprise && typeof window.grecaptcha.enterprise.ready === 'function'));
  if (hasApi) {
    await waitForRecaptchaApi(5000);
    return;
  }

  const scriptConfigs = [
    { host: 'https://www.google.com', path: '/recaptcha/enterprise.js' },
    { host: 'https://www.google.com', path: '/recaptcha/api.js' },
    { host: 'https://www.recaptcha.net', path: '/recaptcha/api.js' }
  ];
  let lastError = null;

  for (const config of scriptConfigs) {
    try {
      const source = config.host + config.path + '?render=' + encodeURIComponent(siteKey);
      const selector = 'script[data-recaptcha-src="' + source + '"]';
      const existing = document.querySelector(selector);

      if (!existing) {
        const script = document.createElement('script');
        script.src = source;
        script.async = true;
        script.defer = true;
        script.dataset.recaptcha = 'google';
        script.dataset.recaptchaSrc = source;
        await new Promise((resolve, reject) => {
          script.onload = () => resolve();
          script.onerror = () => reject(new Error('Script yüklenemedi: ' + source));
          document.head.appendChild(script);
        });
      }

      await waitForRecaptchaApi(5000);
      return;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error('Google reCAPTCHA script yüklenemedi.');
}

function executeRecaptcha(siteKey, action) {
  return new Promise((resolve, reject) => {
    const hasEnterpriseApi = Boolean(
      window.grecaptcha
        && window.grecaptcha.enterprise
        && typeof window.grecaptcha.enterprise.ready === 'function'
        && typeof window.grecaptcha.enterprise.execute === 'function'
    );

    const hasStandardApi = Boolean(
      window.grecaptcha
        && typeof window.grecaptcha.ready === 'function'
        && typeof window.grecaptcha.execute === 'function'
    );

    if (!hasEnterpriseApi && !hasStandardApi) {
      reject(new Error('Google reCAPTCHA hazir degil.'));
      return;
    }

    if (hasEnterpriseApi) {
      window.grecaptcha.enterprise.ready(() => {
        window.grecaptcha.enterprise.execute(siteKey, { action })
          .then(resolve)
          .catch(reject);
      });
    } else {
      window.grecaptcha.ready(() => {
        window.grecaptcha.execute(siteKey, { action })
          .then(resolve)
          .catch(reject);
      });
    }
  });
}

async function getHumanCheckToken(email, humanCheckConfig) {
  const googleEnabled = Boolean(humanCheckConfig?.enabled && humanCheckConfig?.siteKey);
  const provider = String(humanCheckConfig?.provider || 'google').trim().toLowerCase() === 'google-enterprise'
    ? 'google-enterprise'
    : 'google';

  if (googleEnabled) {
    try {
      await loadGoogleRecaptchaScript(humanCheckConfig.siteKey);

      const token = await executeRecaptcha(humanCheckConfig.siteKey, 'admin_login');
      if (!token) {
        throw new Error('Google human check token alinamadi.');
      }

      return {
        token,
        provider
      };
    } catch (error) {
      const detail = String(error?.message || '').toLowerCase();
      if (detail.includes('invalid key type')) {
        setHumanCheckModeLabel('Google key tipi uyumsuz. Geçici olarak lokal human check moduna geçildi.', true);
      } else if (detail.includes('content security policy') || detail.includes('csp') || detail.includes('browser-error')) {
        setHumanCheckModeLabel('Tarayıcı CSP nedeniyle Google engellendi. Geçici olarak lokal human check modu kullanılıyor.', true);
      } else {
        setHumanCheckModeLabel('Google reCAPTCHA kullanılamadı. Geçici olarak lokal human check moduna geçildi.', true);
      }

      return {
        token: email + ':' + Date.now().toString(36),
        provider: 'local'
      };
    }
  }

  return {
    token: email + ':' + Date.now().toString(36),
    provider: 'local'
  };
}

async function verifyAdminAccess(email, password) {
  const loginPayload = await requestPost('/api/auth/login', { email, password });
  const loginUser = loginPayload?.user;
  if (!loginUser) {
    throw new Error('Giriş yanıtı alınamadı.');
  }

  const accessToken = String(loginPayload?.tokens?.accessToken || '').trim();
  if (!accessToken) {
    throw new Error('Token oluşturulamadı.');
  }

  const profilePayload = await requestGet('/api/auth/me', {
    Authorization: 'Bearer ' + accessToken
  });
  const profileUser = profilePayload?.user;

  if (!profileUser || !isAdminRole(profileUser.role)) {
    try {
      await requestPost('/api/auth/logout', {}, {
        Authorization: 'Bearer ' + accessToken
      });
    } catch (_error) {
      // Best effort logout for non-admin users.
    }

    localStorage.removeItem('authSession');
    localStorage.removeItem(AUTH_TOKENS_STORAGE_KEY);
    throw new Error('Bu hesap admin paneli için yetkili değil.');
  }

  saveSession(profileUser, loginPayload?.tokens || null);
  return profileUser;
}

function getDeniedMessage() {
  const params = new URLSearchParams(window.location.search);
  return params.get('denied') === '1';
}

function shouldRetryWithLocal(humanCheckResponse) {
  const message = String(humanCheckResponse?.message || '').toLowerCase();
  const reasons = Array.isArray(humanCheckResponse?.reasons)
    ? humanCheckResponse.reasons.map((item) => String(item || '').toLowerCase())
    : [];

  return message.includes('browser-error')
    || message.includes('content security policy')
    || reasons.includes('browser-error');
}

async function verifyHumanCheckWithFallback(email, humanCheckPayload) {
  const performHumanCheck = async (payload) => {
    const response = await fetch(buildApiUrl('/api/humancheck/verify'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload || {})
    });

    const data = await response.json().catch(() => ({}));
    return {
      ok: response.ok,
      data
    };
  };

  const firstTryResult = await performHumanCheck({
    token: humanCheckPayload.token,
    provider: humanCheckPayload.provider
  });
  const firstTry = firstTryResult.data;

  if (firstTryResult.ok && firstTry?.verified) {
    return firstTry;
  }

  const isGoogleProvider = humanCheckPayload.provider === 'google' || humanCheckPayload.provider === 'google-enterprise';
  if (!isGoogleProvider || !shouldRetryWithLocal(firstTry)) {
    const message = String(firstTry?.message || 'Human check doğrulaması başarısız oldu.');
    throw new Error(message);
  }
  setHumanCheckModeLabel('Google human check tarayıcı nedeniyle engellendi, lokal moda geçildi.', true);

  let challenge;
  try {
    challenge = await requestGet('/api/humancheck/math-challenge');
  } catch (error) {
    throw new Error('Human check doğrulaması alınamadı: ' + (error.message || 'bilinmeyen hata'));
  }

  if (!challenge || !challenge.challenge) {
    throw new Error('Human check sorusu oluşturulamadı.');
  }

  const c = challenge.challenge;
  const answerRaw = window.prompt('Lütfen aşağıdaki işlemi yapın: ' + c.a + ' + ' + c.b + ' = ?');
  if (answerRaw === null) {
    throw new Error('Human check iptal edildi.');
  }

  const answer = Number(String(answerRaw).trim());
  if (!Number.isFinite(answer)) {
    throw new Error('Human check için geçerli bir sayı girmelisiniz.');
  }

  const verifyResp = await fetch(buildApiUrl('/api/humancheck/verify-math'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ a: c.a, b: c.b, answer: answer, expires: c.expires, sig: c.sig })
  });
  const verifyData = await verifyResp.json().catch(() => ({}));

  if (!verifyResp.ok || !verifyData?.verified) {
    throw new Error(String(verifyData?.message || 'Human check yanlış. Lütfen doğru cevabı girin.'));
  }

  return verifyData;
}

function initAdminLoginPage() {
  const form = document.getElementById('adminLoginForm');
  if (!form) return;

  const themeButton = document.getElementById('toggleAdminThemeBtn');
  const shell = document.querySelector('.admin-login-shell');
  const showcaseCopyTitle = document.querySelector('.showcase-copy h2');
  const showcaseCopyBody = document.querySelector('.showcase-copy p');
  let humanCheckConfig = {
    enabled: false,
    siteKey: '',
    provider: 'local'
  };

  const setTheme = (theme) => {
    const nextTheme = theme === 'dark' ? 'dark' : 'light';
    document.body.classList.toggle('dark-mode', nextTheme === 'dark');
    if (themeButton) {
      themeButton.textContent = nextTheme === 'dark' ? 'Light Mode' : 'Dark Mode';
    }
    localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
  };

  setTheme(localStorage.getItem(THEME_STORAGE_KEY) || 'light');

  if (themeButton) {
    themeButton.addEventListener('click', () => {
      const darkModeOn = document.body.classList.contains('dark-mode');
      setTheme(darkModeOn ? 'light' : 'dark');
    });
  }

  if (getDeniedMessage()) {
    setFeedback('Admin paneline erişim için yetkili hesapla giriş yapmanız gerekiyor.', 'error');
  }

  getHumanCheckConfig().then((config) => {
    humanCheckConfig = config;
    if (config.forcedLocal) {
      setHumanCheckModeLabel('Sayfa file:// üzerinden açık. Google reCAPTCHA için localhost/http(s) gerekir, lokal human check modu kullanılıyor.', false);
      return;
    }

    if (config.enabled && config.siteKey) {
      const providerLabel = String(config.provider || '').toLowerCase() === 'google-enterprise'
        ? 'Google human check aktif (reCAPTCHA Enterprise).'
        : 'Google human check aktif (reCAPTCHA).';
      setHumanCheckModeLabel(providerLabel, false);
      return;
    }
    setHumanCheckModeLabel('Google key tanımlı değil, lokal human check modu kullanılıyor.', false);
  }).catch(() => {
    setHumanCheckModeLabel('Human check konfigürasyonu okunamadı.', true);
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const email = String(document.getElementById('adminEmailInput')?.value || '').trim();
    const password = String(document.getElementById('adminPasswordInput')?.value || '');

    if (!email || !password) {
      setFeedback('Lütfen e-posta ve şifre alanlarını doldurun.', 'error');
      return;
    }

    setFeedback('');
    setLoading(true);
    if (shell) shell.classList.add('is-verifying');
    if (showcaseCopyTitle) showcaseCopyTitle.textContent = 'Portal Security';
    if (showcaseCopyBody) showcaseCopyBody.textContent = 'Hesap dogrulaniyor...';

    try {
      const humanCheckPayload = await getHumanCheckToken(email, humanCheckConfig);
      const humanCheck = await verifyHumanCheckWithFallback(email, humanCheckPayload);
      if (!humanCheck?.verified) {
        throw new Error('Human check doğrulaması başarısız oldu.');
      }

      const user = await verifyAdminAccess(email, password);
      setFeedback('Hoş geldiniz ' + (user.name || user.email) + '. Admin paneline yönlendiriliyorsunuz...');
      if (showcaseCopyTitle) showcaseCopyTitle.textContent = 'Hoş Geldiniz';
      if (showcaseCopyBody) showcaseCopyBody.textContent = 'Hoş geldiniz, ' + (user.name || user.email);
      window.setTimeout(() => {
        window.location.href = '/admin-panel';
      }, 1200);
    } catch (error) {
      setFeedback(error.message || 'Admin doğrulaması başarısız oldu.', 'error');
      if (showcaseCopyTitle) showcaseCopyTitle.textContent = 'Portal Security';
      if (showcaseCopyBody) showcaseCopyBody.textContent = 'Doğrulama başarısız. Bilgileri kontrol edip tekrar deneyin.';
    } finally {
      setLoading(false);
      if (shell) {
        window.setTimeout(() => {
          shell.classList.remove('is-verifying');
        }, 200);
      }
    }
  });
}

document.addEventListener('DOMContentLoaded', initAdminLoginPage);
