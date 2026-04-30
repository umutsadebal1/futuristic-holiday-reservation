(function () {
  'use strict';

  const CATALOG_REFRESH_STORAGE_KEY = 'catalogUpdatedAt';
  const AUTH_TOKENS_STORAGE_KEY = 'authTokens';
  const DEFAULT_CITY_GRADIENT = 'linear-gradient(135deg, rgba(11, 137, 105, 0.667), rgba(4, 102, 132, 0.7))';
  const USER_ROLES = {
    PATRON: 'patron',
    UST_YETKILI: 'ust_yetkili',
    ALT_YETKILI: 'alt_yetkili',
    KULLANICI: 'kullanici'
  };
  const SIDEBAR_PERMISSION_KEYS = ['dashboardPanel', 'citiesPanel', 'hotelsPanel', 'apisPanel', 'usersPanel', 'reservationsPanel', 'contactPanel'];
  const CITY_PALETTE_PRESETS = [
    { label: 'Akdeniz', start: '#0b8969', end: '#046684' },
    { label: 'Sahil', start: '#0ea5e9', end: '#2563eb' },
    { label: 'Gunes', start: '#fb7185', end: '#f97316' },
    { label: 'Yayla', start: '#16a34a', end: '#0f766e' },
    { label: 'Gece', start: '#475569', end: '#1e293b' },
    { label: 'Toprak', start: '#a16207', end: '#7c2d12' }
  ];

  const state = {
    cities: [],
    hotels: [],
    modules: [],
    integrations: [],
    registeredUsers: [],
    activeUsers: [],
    currentUser: null,
    selectedManagedUserId: 0,
    editingCityId: 0,
    editingHotelId: 0,
    editingIntegrationId: 0,
    selectedHotelCityId: 0,
    toastTimer: 0,
    lastSyncAt: '',
    dashboardInsights: {
      recentRecords: [],
      userActivity: [],
      reservationActivity: [],
      reservationStatus: []
    },
    activityLogs: [],
    dashboardTimerId: 0,
    reservations: [],
    contactRequests: []
  };

  function getAuthSession() {
    try {
      const raw = localStorage.getItem('authSession');
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (_error) {
      return null;
    }
  }

  function getAuthTokens() {
    try {
      const raw = localStorage.getItem(AUTH_TOKENS_STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (_error) {
      return null;
    }
  }

  function getAccessToken() {
    const tokens = getAuthTokens();
    if (tokens && tokens.accessToken) return String(tokens.accessToken);

    const session = getAuthSession();
    if (session && session.token) return String(session.token);

    return '';
  }

  function clearAuthStorage() {
    localStorage.removeItem('authTokens');
    localStorage.removeItem('authSession');
    localStorage.removeItem('user');
  }

  function normalizeUserRole(value, fallback) {
    const nextFallback = fallback || USER_ROLES.KULLANICI;
    const raw = String(value || '').trim().toLowerCase();
    if (raw === USER_ROLES.PATRON) return USER_ROLES.PATRON;
    if (raw === USER_ROLES.UST_YETKILI) return USER_ROLES.UST_YETKILI;
    if (raw === USER_ROLES.ALT_YETKILI) return USER_ROLES.ALT_YETKILI;
    if (raw === USER_ROLES.KULLANICI) return USER_ROLES.KULLANICI;
    return nextFallback;
  }

  function isAdminRole(role) {
    const raw = String(role || '').trim().toLowerCase();
    return raw === USER_ROLES.PATRON || raw === USER_ROLES.UST_YETKILI || raw === USER_ROLES.ALT_YETKILI;
  }

  function roleLabel(role) {
    const safeRole = normalizeUserRole(role);
    if (safeRole === USER_ROLES.PATRON) return 'Patron';
    if (safeRole === USER_ROLES.UST_YETKILI) return 'Ust Yetkili';
    if (safeRole === USER_ROLES.ALT_YETKILI) return 'Alt Yetkili';
    return 'Kullanici';
  }

  function getDefaultSidebarPermissionsForRole(role) {
    const safeRole = normalizeUserRole(role);
    if (safeRole === USER_ROLES.PATRON) return SIDEBAR_PERMISSION_KEYS.slice();
    if (safeRole === USER_ROLES.UST_YETKILI) return ['dashboardPanel', 'citiesPanel', 'hotelsPanel', 'usersPanel', 'reservationsPanel', 'contactPanel'];
    return ['dashboardPanel'];
  }

  function normalizeSidebarPermissions(value, role) {
    const safeRole = normalizeUserRole(role);
    if (safeRole === USER_ROLES.PATRON) {
      return SIDEBAR_PERMISSION_KEYS.slice();
    }

    const source = Array.isArray(value) ? value : [];
    const unique = [];
    const seen = new Set();

    source.forEach((entry) => {
      const key = String(entry || '').trim();
      if (!SIDEBAR_PERMISSION_KEYS.includes(key) || seen.has(key)) return;
      seen.add(key);
      unique.push(key);
    });

    if (!unique.length) {
      return getDefaultSidebarPermissionsForRole(safeRole);
    }

    return unique;
  }

  function hasSwal() {
    return typeof window.Swal !== 'undefined' && window.Swal && typeof window.Swal.fire === 'function';
  }

  async function confirmAction(title, text, confirmText) {
    if (hasSwal()) {
      const result = await window.Swal.fire({
        icon: 'warning',
        title,
        text,
        showCancelButton: true,
        confirmButtonText: confirmText || 'Evet',
        cancelButtonText: 'Vazgec',
        reverseButtons: true,
        confirmButtonColor: '#d60d54'
      });
      return result.isConfirmed;
    }

    return window.confirm(text || title);
  }

  function alertAction(message, isError) {
    if (hasSwal()) {
      window.Swal.fire({
        icon: isError ? 'error' : 'success',
        title: isError ? 'Islem Basarisiz' : 'Islem Basarili',
        text: message,
        confirmButtonColor: '#d60d54'
      });
      return;
    }

    showToast(message, isError);
  }

  function canCurrentUserManageAccess() {
    return normalizeUserRole(state.currentUser?.role) === USER_ROLES.PATRON;
  }

  function canCurrentUserToggleModules() {
    return isAdminRole(state.currentUser?.role);
  }

  function getCurrentUserSidebarPermissions() {
    if (!state.currentUser) return SIDEBAR_PERMISSION_KEYS.slice();
    return normalizeSidebarPermissions(state.currentUser.sidebarPermissions, state.currentUser.role);
  }

  function updateSidebarRoleLabel() {
    const label = document.getElementById('sidebarCurrentUserRole');
    if (!label) return;

    if (!state.currentUser) {
      label.textContent = 'Admin Control';
      return;
    }

    if (!isAdminRole(state.currentUser.role)) {
      label.textContent = 'Yetkisiz Erisim';
      return;
    }

    label.textContent = roleLabel(state.currentUser.role) + ' - ' + (state.currentUser.name || state.currentUser.email || 'Admin');
  }

  function applySidebarAccessControls() {
    const allowed = new Set(getCurrentUserSidebarPermissions());

    document.querySelectorAll('[data-panel-target]').forEach((item) => {
      const panelId = String(item.getAttribute('data-panel-target') || '').trim();
      if (!panelId) return;

      const visible = allowed.has(panelId);
      item.classList.toggle('is-hidden-by-permission', !visible);
      if ('disabled' in item) {
        item.disabled = !visible;
      }
      item.setAttribute('aria-hidden', visible ? 'false' : 'true');
      item.tabIndex = visible ? 0 : -1;
    });

    const activePanel = document.querySelector('.admin-panel.active');
    const activePanelId = activePanel ? activePanel.id : '';
    if (activePanelId && allowed.has(activePanelId)) return;

    const firstAllowed = SIDEBAR_PERMISSION_KEYS.find((panelId) => allowed.has(panelId)) || 'dashboardPanel';
    activatePanel(firstAllowed);
  }

  function resetUserAccessForm() {
    state.selectedManagedUserId = 0;

    const idInput = document.getElementById('userAccessUserIdInput');
    if (idInput) idInput.value = '';

    const nameInput = document.getElementById('userAccessUserNameInput');
    if (nameInput) nameInput.value = '';

    const roleSelect = document.getElementById('userRoleSelect');
    if (roleSelect) roleSelect.value = USER_ROLES.KULLANICI;

    const formNote = document.getElementById('userAccessFormNote');
    if (formNote) {
      formNote.textContent = canCurrentUserManageAccess()
        ? 'Kullaniciyi secin, rutbe ve sidebar erisimlerini kaydedin.'
        : 'Rutbe atamasi ve sidebar erişimlerini sadece patron yetkisi kaydedebilir.';
    }

    applySidebarPermissionCheckboxes(getDefaultSidebarPermissionsForRole(USER_ROLES.KULLANICI));
    syncPermissionLockByRole();
  }

  function applySidebarPermissionCheckboxes(keys) {
    const selected = new Set(normalizeSidebarPermissions(keys, USER_ROLES.KULLANICI));
    const inputs = document.querySelectorAll('#userSidebarPermissions input[type="checkbox"]');
    inputs.forEach((input) => {
      const key = input.value;
      input.checked = selected.has(key);
    });
  }

  function readSidebarPermissionsFromForm() {
    const selected = [];
    const seen = new Set();
    document.querySelectorAll('#userSidebarPermissions input[type="checkbox"]:checked').forEach((input) => {
      const key = String(input.value || '').trim();
      if (!SIDEBAR_PERMISSION_KEYS.includes(key) || seen.has(key)) return;
      seen.add(key);
      selected.push(key);
    });
    return selected;
  }

  function syncPermissionLockByRole() {
    const roleSelect = document.getElementById('userRoleSelect');
    if (!roleSelect) return;

    const role = normalizeUserRole(roleSelect.value);
    const checkboxInputs = document.querySelectorAll('#userSidebarPermissions input[type="checkbox"]');

    if (role === USER_ROLES.PATRON) {
      applySidebarPermissionCheckboxes(SIDEBAR_PERMISSION_KEYS);
      checkboxInputs.forEach((input) => {
        input.disabled = true;
      });
      return;
    }

    checkboxInputs.forEach((input) => {
      input.disabled = !canCurrentUserManageAccess();
    });
  }

  function setUserAccessFormEnabled(enabled) {
    const isEnabled = Boolean(enabled);
    const userSelectButtons = document.querySelectorAll('[data-user-action="select"]');
    userSelectButtons.forEach((button) => {
      button.disabled = !isEnabled;
      button.classList.toggle('disabled', !isEnabled);
    });

    const roleSelect = document.getElementById('userRoleSelect');
    if (roleSelect) roleSelect.disabled = !isEnabled;

    const saveBtn = document.getElementById('saveUserAccessBtn');
    if (saveBtn) saveBtn.disabled = !isEnabled;

    const resetBtn = document.getElementById('resetUserAccessFormBtn');
    if (resetBtn) resetBtn.disabled = !isEnabled;

    document.querySelectorAll('#userSidebarPermissions input[type="checkbox"]').forEach((input) => {
      input.disabled = !isEnabled;
    });

    if (isEnabled) {
      syncPermissionLockByRole();
    }
  }

  function fillUserAccessForm(user) {
    if (!user) return;
    state.selectedManagedUserId = Number(user.id) || 0;

    const idInput = document.getElementById('userAccessUserIdInput');
    if (idInput) idInput.value = String(state.selectedManagedUserId);

    const nameInput = document.getElementById('userAccessUserNameInput');
    if (nameInput) nameInput.value = (user.name || '-') + ' <' + (user.email || '-') + '>';

    const roleSelect = document.getElementById('userRoleSelect');
    const normalizedRole = normalizeUserRole(user.role, USER_ROLES.KULLANICI);
    if (roleSelect) roleSelect.value = normalizedRole;

    applySidebarPermissionCheckboxes(normalizeSidebarPermissions(user.sidebarPermissions, normalizedRole));
    syncPermissionLockByRole();
  }

  async function loadCurrentAdminProfile() {
    const session = getAuthSession();

    if (!session || (!session.userId && !session.email)) {
      state.currentUser = {
        role: '',
        sidebarPermissions: [],
        name: 'Oturum Yok'
      };
      updateSidebarRoleLabel();
      applySidebarAccessControls();
      return;
    }

    try {
      const payload = await requestJson('/api/auth/me');
      const user = payload?.user;

      state.currentUser = user
        ? {
            id: user.id,
            name: user.name,
            email: user.email,
            role: normalizeUserRole(user.role),
            sidebarPermissions: normalizeSidebarPermissions(user.sidebarPermissions, user.role)
          }
        : {
            role: '',
            sidebarPermissions: [],
            name: 'Bilinmeyen Kullanici'
          };
    } catch (_error) {
      state.currentUser = {
        role: '',
        sidebarPermissions: [],
        name: 'Bilinmeyen Kullanici'
      };
    }

    updateSidebarRoleLabel();
    applySidebarAccessControls();
  }

  function normalizeHexColor(value, fallback) {
    const raw = String(value || '').trim();
    if (/^#[0-9a-fA-F]{6}$/.test(raw)) return raw.toLowerCase();
    if (/^#[0-9a-fA-F]{3}$/.test(raw)) {
      const chars = raw.slice(1).toLowerCase().split('');
      return '#' + chars.map((ch) => ch + ch).join('');
    }
    return fallback;
  }

  function clampChannel(value) {
    const num = Number(value);
    if (!Number.isFinite(num)) return 0;
    return Math.max(0, Math.min(255, Math.round(num)));
  }

  function rgbToHex(r, g, b) {
    const toHex = (num) => clampChannel(num).toString(16).padStart(2, '0');
    return '#' + toHex(r) + toHex(g) + toHex(b);
  }

  function hexToRgb(hex) {
    const safeHex = normalizeHexColor(hex, '');
    if (!safeHex) return null;

    const value = safeHex.slice(1);
    const r = Number.parseInt(value.slice(0, 2), 16);
    const g = Number.parseInt(value.slice(2, 4), 16);
    const b = Number.parseInt(value.slice(4, 6), 16);
    if (![r, g, b].every(Number.isFinite)) return null;

    return { r, g, b };
  }

  function buildGradientValue(startHex, endHex) {
    const start = hexToRgb(startHex) || { r: 11, g: 137, b: 105 };
    const end = hexToRgb(endHex) || { r: 4, g: 102, b: 132 };

    return 'linear-gradient(135deg, rgba(' + start.r + ', ' + start.g + ', ' + start.b + ', 0.667), rgba(' + end.r + ', ' + end.g + ', ' + end.b + ', 0.7))';
  }

  function extractGradientColors(gradientText) {
    const matches = Array.from(String(gradientText || '').matchAll(/rgba?\((\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/g));
    if (matches.length < 2) return null;

    const start = rgbToHex(matches[0][1], matches[0][2], matches[0][3]);
    const end = rgbToHex(matches[1][1], matches[1][2], matches[1][3]);
    return { start, end };
  }

  function setGradientPreview(value) {
    const preview = document.getElementById('cityGradientPreview');
    if (!preview) return;

    preview.style.background = String(value || '').trim() || DEFAULT_CITY_GRADIENT;
  }

  function markPresetSelection(startHex, endHex) {
    const presetWrap = document.getElementById('cityPalettePresets');
    if (!presetWrap) return;

    const safeStart = normalizeHexColor(startHex, '');
    const safeEnd = normalizeHexColor(endHex, '');

    presetWrap.querySelectorAll('.palette-swatch').forEach((button) => {
      const buttonStart = normalizeHexColor(button.getAttribute('data-start'), '');
      const buttonEnd = normalizeHexColor(button.getAttribute('data-end'), '');
      button.classList.toggle('active', buttonStart === safeStart && buttonEnd === safeEnd);
    });
  }

  function applyGradientFromPaletteInputs() {
    const heroInput = document.getElementById('cityHeroInput');
    const startInput = document.getElementById('cityGradientStartColor');
    const endInput = document.getElementById('cityGradientEndColor');
    if (!heroInput || !startInput || !endInput) return;

    const startHex = normalizeHexColor(startInput.value, '#0b8969');
    const endHex = normalizeHexColor(endInput.value, '#046684');
    const gradient = buildGradientValue(startHex, endHex);

    heroInput.value = gradient;
    setGradientPreview(gradient);
    markPresetSelection(startHex, endHex);
  }

  function syncPaletteFromHeroInput() {
    const heroInput = document.getElementById('cityHeroInput');
    const startInput = document.getElementById('cityGradientStartColor');
    const endInput = document.getElementById('cityGradientEndColor');
    if (!heroInput || !startInput || !endInput) return;

    const gradientValue = String(heroInput.value || '').trim() || DEFAULT_CITY_GRADIENT;
    const extracted = extractGradientColors(gradientValue);

    if (extracted) {
      startInput.value = normalizeHexColor(extracted.start, '#0b8969');
      endInput.value = normalizeHexColor(extracted.end, '#046684');
      markPresetSelection(startInput.value, endInput.value);
    } else {
      markPresetSelection('', '');
    }

    setGradientPreview(gradientValue);
  }

  function initCityPalette() {
    const heroInput = document.getElementById('cityHeroInput');
    const startInput = document.getElementById('cityGradientStartColor');
    const endInput = document.getElementById('cityGradientEndColor');
    const presetWrap = document.getElementById('cityPalettePresets');
    if (!heroInput || !startInput || !endInput || !presetWrap) return;

    presetWrap.innerHTML = CITY_PALETTE_PRESETS.map((preset) => {
      return '<button type="button" class="palette-swatch" data-start="' + preset.start + '" data-end="' + preset.end + '" title="'
        + escapeHtml(preset.label) + '" style="--start:' + preset.start + ';--end:' + preset.end + ';"></button>';
    }).join('');

    if (startInput.dataset.bound !== 'true') {
      startInput.addEventListener('input', applyGradientFromPaletteInputs);
      startInput.dataset.bound = 'true';
    }

    if (endInput.dataset.bound !== 'true') {
      endInput.addEventListener('input', applyGradientFromPaletteInputs);
      endInput.dataset.bound = 'true';
    }

    if (heroInput.dataset.bound !== 'true') {
      heroInput.addEventListener('change', syncPaletteFromHeroInput);
      heroInput.dataset.bound = 'true';
    }

    if (presetWrap.dataset.bound !== 'true') {
      presetWrap.addEventListener('click', (event) => {
        const button = event.target.closest('.palette-swatch');
        if (!button) return;

        const startHex = normalizeHexColor(button.getAttribute('data-start'), '#0b8969');
        const endHex = normalizeHexColor(button.getAttribute('data-end'), '#046684');

        startInput.value = startHex;
        endInput.value = endHex;
        applyGradientFromPaletteInputs();
      });

      presetWrap.dataset.bound = 'true';
    }

    syncPaletteFromHeroInput();
  }

  function setCityRegionSelectionVisibility(forceValue) {
    const checkbox = document.getElementById('cityShowInRegionsInput');
    const settings = document.getElementById('cityRegionSettings');
    if (!checkbox || !settings) return;

    const shouldShow = typeof forceValue === 'boolean' ? forceValue : Boolean(checkbox.checked);
    checkbox.checked = shouldShow;
    settings.classList.toggle('visible', shouldShow);
    settings.setAttribute('aria-hidden', shouldShow ? 'false' : 'true');
  }

  function initCityRegionSelectionToggle() {
    const checkbox = document.getElementById('cityShowInRegionsInput');
    if (!checkbox) return;

    if (checkbox.dataset.bound !== 'true') {
      checkbox.addEventListener('change', () => {
        setCityRegionSelectionVisibility();
      });
      checkbox.dataset.bound = 'true';
    }

    setCityRegionSelectionVisibility(Boolean(checkbox.checked));
  }

  function resolveApiBaseUrl() {
    if (typeof window === 'undefined') return '';
    const meta = document.querySelector('meta[name="api-base"]');
    const metaValue = meta ? String(meta.content || '').trim() : '';
    if (metaValue) return metaValue.replace(/\/+$/, '');
    const hostname = String(window.location.hostname || '').toLowerCase();
    const isLocalHost = hostname === 'localhost' || hostname === '127.0.0.1';
    if (window.location.protocol === 'file:') return 'http://localhost:5000';
    if (isLocalHost && window.location.port !== '5000' && window.location.port !== '5443') return 'http://localhost:5000';
    return '';
  }

  function buildApiUrl(pathname) {
    const safePath = pathname.startsWith('/') ? pathname : '/' + pathname;
    return resolveApiBaseUrl() + safePath;
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function parseCommaList(value) {
    return String(value || '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  function formatCurrency(value) {
    const amount = Number(value) || 0;
    return '₺' + amount.toLocaleString('tr-TR');
  }

  function formatDateTime(value) {
    if (!value) return '-';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return '-';
    return parsed.toLocaleString('tr-TR');
  }

  async function requestJson(pathname, options) {
    const requestOptions = options || {};
    const headers = Object.assign({}, requestOptions.headers || {});
    const accessToken = getAccessToken();
    if (accessToken && !headers.Authorization) {
      headers.Authorization = 'Bearer ' + accessToken;
    }
    if (requestOptions.body && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }

    const response = await fetch(buildApiUrl(pathname), Object.assign({}, requestOptions, { headers }));
    const responseData = await response.json().catch(() => ({}));

    if (!response.ok) {
      const message = responseData && responseData.message
        ? responseData.message
        : 'Islem basarisiz. Kod: ' + response.status;
      if (response.status === 401) {
        clearAuthStorage();
        window.location.href = '/admin?denied=1';
      }
      throw new Error(message);
    }

    return responseData;
  }

  async function uploadImage(category, file) {
    const accessToken = getAccessToken();
    const formData = new FormData();
    formData.append('image', file);

    const headers = {};
    if (accessToken) {
      headers.Authorization = 'Bearer ' + accessToken;
    }

    const response = await fetch(buildApiUrl('/api/admin/uploads/' + category), {
      method: 'POST',
      headers,
      body: formData
    });

    const responseData = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = responseData && responseData.message
        ? responseData.message
        : 'Gorsel yukleme basarisiz. Kod: ' + response.status;
      throw new Error(message);
    }

    return responseData;
  }

  function setApiStatus(status, text) {
    const badge = document.getElementById('apiStatusBadge');
    if (!badge) return;

    badge.classList.remove('pending', 'online', 'offline');
    badge.classList.add(status);
    badge.textContent = text;
  }

  function showToast(message, isError) {
    const toast = document.getElementById('adminToast');
    if (!toast) return;

    if (state.toastTimer) {
      window.clearTimeout(state.toastTimer);
    }

    toast.textContent = message;
    toast.classList.toggle('error', Boolean(isError));
    toast.classList.add('show');

    state.toastTimer = window.setTimeout(() => {
      toast.classList.remove('show');
      toast.classList.remove('error');
      state.toastTimer = 0;
    }, 2800);
  }

  function setLastSyncText() {
    const textEl = document.getElementById('lastSyncText');
    if (!textEl) return;

    if (!state.lastSyncAt) {
      textEl.textContent = 'Henuz senkron yapilmadi.';
      return;
    }

    textEl.textContent = 'Son guncelleme: ' + state.lastSyncAt;
  }

  function activatePanel(panelId) {
    document.querySelectorAll('.admin-panel').forEach((panel) => {
      panel.classList.toggle('active', panel.id === panelId);
    });

    document.querySelectorAll('[data-panel-target]').forEach((button) => {
      button.classList.toggle('active', button.getAttribute('data-panel-target') === panelId);
    });

    if (document.body) {
      document.body.dataset.activePanel = String(panelId || '');
    }
  }

  function resetCityForm() {
    state.editingCityId = 0;

    const form = document.getElementById('cityForm');
    if (form) form.reset();

    const title = document.getElementById('cityFormTitle');
    if (title) title.textContent = 'Yeni Sehir Ekle';

    const saveBtn = document.getElementById('saveCityBtn');
    if (saveBtn) saveBtn.textContent = 'Sehri Kaydet';

    const idInput = document.getElementById('cityIdInput');
    if (idInput) idInput.value = '';

    const heroInput = document.getElementById('cityHeroInput');
    if (heroInput) {
      heroInput.value = DEFAULT_CITY_GRADIENT;
    }

    const regionInput = document.getElementById('cityRegionClassInput');
    if (regionInput) regionInput.value = 'bottom-right';

    const showInRegionsInput = document.getElementById('cityShowInRegionsInput');
    if (showInRegionsInput) showInRegionsInput.checked = false;
    setCityRegionSelectionVisibility(false);

    syncPaletteFromHeroInput();
  }

  function resetHotelForm() {
    state.editingHotelId = 0;

    const form = document.getElementById('hotelForm');
    if (form) form.reset();

    const title = document.getElementById('hotelFormTitle');
    if (title) title.textContent = 'Yeni Otel Ekle';

    const saveBtn = document.getElementById('saveHotelBtn');
    if (saveBtn) saveBtn.textContent = 'Oteli Kaydet';

    const idInput = document.getElementById('hotelIdInput');
    if (idInput) idInput.value = '';

    const citySelect = document.getElementById('hotelCitySelect');
    if (citySelect) citySelect.value = state.selectedHotelCityId ? String(state.selectedHotelCityId) : '';

    const ratingInput = document.getElementById('hotelRatingInput');
    if (ratingInput) ratingInput.value = '4.2';

    const priceInput = document.getElementById('hotelPriceInput');
    if (priceInput) priceInput.value = '750';
  }

  function resetApiIntegrationForm() {
    state.editingIntegrationId = 0;

    const form = document.getElementById('apiIntegrationForm');
    if (form) form.reset();

    const title = document.getElementById('apiIntegrationFormTitle');
    if (title) title.textContent = 'API Bagla';

    const saveBtn = document.getElementById('saveApiIntegrationBtn');
    if (saveBtn) saveBtn.textContent = 'API Kaydet';

    const idInput = document.getElementById('apiIntegrationIdInput');
    if (idInput) idInput.value = '';

    const nameInput = document.getElementById('apiIntegrationNameInput');
    if (nameInput) nameInput.value = '';

    const baseUrlInput = document.getElementById('apiIntegrationBaseUrlInput');
    if (baseUrlInput) baseUrlInput.value = '';

    const healthPathInput = document.getElementById('apiIntegrationHealthPathInput');
    if (healthPathInput) healthPathInput.value = '/api/health';

    const enabledInput = document.getElementById('apiIntegrationEnabledInput');
    if (enabledInput) enabledInput.checked = true;
  }

  function renderMetricCards() {
    const cityCount = state.cities.length;
    const hotelCount = state.hotels.length;

    const averageRating = hotelCount > 0
      ? (state.hotels.reduce((sum, hotel) => sum + (Number(hotel.rating) || 0), 0) / hotelCount).toFixed(1)
      : '0.0';

    const averagePrice = hotelCount > 0
      ? Math.round(state.hotels.reduce((sum, hotel) => sum + (Number(hotel.price) || 0), 0) / hotelCount)
      : 0;

    const citiesEl = document.getElementById('metricCities');
    if (citiesEl) citiesEl.textContent = String(cityCount);

    const hotelsEl = document.getElementById('metricHotels');
    if (hotelsEl) hotelsEl.textContent = String(hotelCount);

    const ratingEl = document.getElementById('metricAverageRating');
    if (ratingEl) ratingEl.textContent = averageRating;

    const priceEl = document.getElementById('metricAveragePrice');
    if (priceEl) priceEl.textContent = formatCurrency(averagePrice);
  }

  function renderCityOptions() {
    const select = document.getElementById('hotelCitySelect');
    if (!select) return;

    const currentValue = String(select.value || state.selectedHotelCityId || '');
    const options = ['<option value="">Sehir secin</option>'].concat(state.cities
      .slice()
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'tr'))
      .map((city) => {
        return '<option value="' + city.id + '">' + escapeHtml(city.name) + ' (' + escapeHtml(city.slug) + ')</option>';
      }));

    select.innerHTML = options.length
      ? options.join('')
      : '<option value="">Once sehir ekleyin</option>';

    select.value = currentValue;
  }

  function renderCityTable() {
    const body = document.getElementById('cityTableBody');
    if (!body) return;

    const countText = document.getElementById('cityCountText');
    if (countText) countText.textContent = state.cities.length + ' kayit';

    const rows = state.cities
      .slice()
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'tr'));

    if (rows.length === 0) {
      body.innerHTML = '<tr><td colspan="5" class="empty-row">Kayit bulunamadi.</td></tr>';
      return;
    }

    body.innerHTML = rows.map((city) => {
      const visibleOnHomepage = city.showInRegions !== false;
      return ''
        + '<tr>'
        + '  <td><strong>' + escapeHtml(city.name) + '</strong></td>'
        + '  <td>' + escapeHtml(city.slug) + '</td>'
        + '  <td><span class="city-visibility-pill ' + (visibleOnHomepage ? 'visible' : 'hidden') + '">' + (visibleOnHomepage ? 'Acik' : 'Gizli') + '</span></td>'
        + '  <td>' + (Number(city.hotelsCount) || 0) + '</td>'
        + '  <td>'
        + '    <div class="table-action-row">'
        + '      <button type="button" class="table-action-btn edit" data-city-action="edit" data-city-id="' + city.id + '">Duzenle</button>'
        + '      <button type="button" class="table-action-btn delete" data-city-action="delete" data-city-id="' + city.id + '">Sil</button>'
        + '    </div>'
        + '  </td>'
        + '</tr>';
    }).join('');
  }

  function renderHotelTable() {
    const body = document.getElementById('hotelTableBody');
    if (!body) return;

    const countText = document.getElementById('hotelCountText');
    const selectedCityId = Number(state.selectedHotelCityId) || 0;

    const cityById = new Map(state.cities.map((city) => [String(city.id), city]));

    if (!selectedCityId) {
      if (countText) countText.textContent = 'Sehir secin';
      body.innerHTML = '<tr><td colspan="5" class="empty-row">Otelleri gormek icin yukaridaki secim kutusundan bir sehir secin.</td></tr>';
      return;
    }

    const filteredHotels = state.hotels.filter((hotel) => Number(hotel.cityId) === selectedCityId);

    if (countText) {
      const selectedCityName = cityById.get(String(selectedCityId))?.name || 'Seçili şehir';
      countText.textContent = filteredHotels.length + ' kayit • ' + selectedCityName;
    }

    const rows = filteredHotels
      .slice()
      .sort((a, b) => {
        const cityA = cityById.get(String(a.cityId))?.name || a.cityName || '';
        const cityB = cityById.get(String(b.cityId))?.name || b.cityName || '';
        if (cityA !== cityB) return cityA.localeCompare(cityB, 'tr');
        return String(a.name || '').localeCompare(String(b.name || ''), 'tr');
      });

    if (rows.length === 0) {
      body.innerHTML = '<tr><td colspan="5" class="empty-row">Kayit bulunamadi.</td></tr>';
      return;
    }

    body.innerHTML = rows.map((hotel) => {
      const cityName = cityById.get(String(hotel.cityId))?.name || hotel.cityName || '-';
      return ''
        + '<tr>'
        + '  <td><strong>' + escapeHtml(hotel.name) + '</strong></td>'
        + '  <td>' + escapeHtml(cityName) + '</td>'
        + '  <td>' + (Number(hotel.rating) || 0).toFixed(1) + '</td>'
        + '  <td>' + formatCurrency(hotel.price) + '</td>'
        + '  <td>'
        + '    <div class="table-action-row">'
        + '      <button type="button" class="table-action-btn edit" data-hotel-action="edit" data-hotel-id="' + hotel.id + '">Duzenle</button>'
        + '      <button type="button" class="table-action-btn delete" data-hotel-action="delete" data-hotel-id="' + hotel.id + '">Sil</button>'
        + '    </div>'
        + '  </td>'
        + '</tr>';
    }).join('');
  }

  function renderApiSidebar() {
    const list = document.getElementById('sidebarApiList');
    if (!list) return;

    if (!state.integrations.length) {
      list.innerHTML = '<li class="sidebar-api-empty">Bagli API bulunamadi.</li>';
      return;
    }

    list.innerHTML = state.integrations.map((integration) => {
      const status = String(integration.lastStatus || 'unknown');
      return ''
        + '<li class="sidebar-api-item">'
        + '  <span class="sidebar-api-dot is-' + status + '"></span>'
        + '  <div class="sidebar-api-meta">'
        + '    <p class="sidebar-api-name">' + escapeHtml(integration.name) + '</p>'
        + '    <p class="sidebar-api-url">' + escapeHtml(integration.baseUrl) + '</p>'
        + '  </div>'
        + '</li>';
    }).join('');
  }

  function renderApiModuleTable() {
    const body = document.getElementById('apiModuleTableBody');
    if (!body) return;

    const countText = document.getElementById('apiModuleCountText');
    if (countText) {
      countText.textContent = state.modules.length + ' modul';
    }

    if (!state.modules.length) {
      body.innerHTML = '<tr><td colspan="5" class="empty-row">Modul kaydi bulunamadi.</td></tr>';
      return;
    }

    const canToggleModules = canCurrentUserToggleModules();
    body.innerHTML = state.modules.map((moduleItem) => {
      const status = moduleItem?.isActive === false ? 'disabled' : 'online';
      const statusLabel = moduleItem?.isActive === false ? 'Kapali' : 'Acik';
      const updatedAt = moduleItem?.updatedAt ? new Date(moduleItem.updatedAt).toLocaleString('tr-TR') : '-';
      const moduleKey = String(moduleItem?.moduleKey || '').trim();
      return ''
        + '<tr>'
        + '  <td><strong class="api-module-key">' + escapeHtml(moduleItem?.displayName || moduleKey || '-') + '</strong><div class="small-muted">' + escapeHtml(moduleKey || '-') + '</div></td>'
        + '  <td>' + escapeHtml(moduleItem?.note || '-') + '</td>'
        + '  <td><span class="api-status-pill ' + status + '">' + escapeHtml(statusLabel) + '</span></td>'
        + '  <td>' + escapeHtml(updatedAt) + '</td>'
        + '  <td>'
        + '    <div class="table-action-row">'
        + '      <label class="switch">'
        + '        <input type="checkbox" class="api-module-switch" data-module-key="' + escapeHtml(moduleKey) + '" ' + (moduleItem?.isActive ? 'checked' : '') + ' ' + (canToggleModules ? '' : 'disabled') + '>'
        + '        <span class="slider"></span>'
        + '      </label>'
        + '    </div>'
        + '  </td>'
        + '</tr>';
    }).join('');
  }

  function renderActivityLog() {
    const body = document.getElementById('activityLogBody');
    if (!body) return;

    const rows = Array.isArray(state.activityLogs) ? state.activityLogs : [];
    if (!rows.length) {
      body.innerHTML = '<tr><td colspan="4" class="empty-row">Islem kaydi bulunamadi.</td></tr>';
      return;
    }

    body.innerHTML = rows.map((r) => {
      return ''
        + '<tr>'
        + '  <td>' + escapeHtml(formatDateTime(r.createdAt)) + '</td>'
        + '  <td>' + escapeHtml(r.action || '-') + '</td>'
        + '  <td>' + escapeHtml(r.actorEmail || (r.actorUserId ? 'user#' + r.actorUserId : '-')) + '</td>'
        + '  <td>' + escapeHtml(JSON.stringify(r.details || {})) + '</td>'
        + '</tr>';
    }).join('');
  }

  function renderApiIntegrationTable() {
    const body = document.getElementById('apiIntegrationTableBody');
    if (!body) return;

    const countText = document.getElementById('apiIntegrationCountText');
    if (countText) countText.textContent = state.integrations.length + ' kayit';

    if (state.integrations.length === 0) {
      body.innerHTML = '<tr><td colspan="5" class="empty-row">Bagli API bulunamadi.</td></tr>';
      return;
    }

    body.innerHTML = state.integrations.map((integration) => {
      const status = String(integration.lastStatus || 'unknown');
      const checkedAt = integration.lastCheckedAt ? new Date(integration.lastCheckedAt).toLocaleString('tr-TR') : '-';
      const enabledLabel = integration.isEnabled ? 'Aktif' : 'Pasif';
      return ''
        + '<tr>'
        + '  <td><strong>' + escapeHtml(integration.name) + '</strong><div class="small-muted">' + escapeHtml(enabledLabel) + '</div></td>'
        + '  <td>' + escapeHtml(integration.baseUrl) + '<div class="small-muted">' + escapeHtml(integration.healthPath) + '</div></td>'
        + '  <td><span class="api-status-pill ' + status + '">' + escapeHtml(status) + '</span><div class="small-muted">' + escapeHtml(integration.lastMessage || '-') + '</div></td>'
        + '  <td>' + escapeHtml(checkedAt) + '</td>'
        + '  <td>'
        + '    <div class="table-action-row">'
        + '      <button type="button" class="table-action-btn check" data-api-action="check" data-api-id="' + integration.id + '">Kontrol</button>'
        + '      <button type="button" class="table-action-btn edit" data-api-action="edit" data-api-id="' + integration.id + '">Duzenle</button>'
        + '      <button type="button" class="table-action-btn toggle" data-api-action="toggle" data-api-id="' + integration.id + '">' + (integration.isEnabled ? 'Bagi Kes' : 'Bagla') + '</button>'
        + '      <button type="button" class="table-action-btn delete" data-api-action="delete" data-api-id="' + integration.id + '">Sil</button>'
        + '    </div>'
        + '  </td>'
        + '</tr>';
    }).join('');
  }

  function renderUsersSidebar() {
    const registeredCount = Array.isArray(state.registeredUsers) ? state.registeredUsers.length : 0;
    const activeCount = Array.isArray(state.activeUsers) ? state.activeUsers.length : 0;

    const registeredEl = document.getElementById('sidebarRegisteredUsersCount');
    if (registeredEl) registeredEl.textContent = String(registeredCount);

    const activeEl = document.getElementById('sidebarActiveUsersCount');
    if (activeEl) activeEl.textContent = String(activeCount);
  }

  function renderUsersPanel() {
    const registered = Array.isArray(state.registeredUsers) ? state.registeredUsers : [];
    const active = Array.isArray(state.activeUsers) ? state.activeUsers : [];

    const registeredCountEl = document.getElementById('registeredUsersCount');
    if (registeredCountEl) registeredCountEl.textContent = String(registered.length);

    const activeCountEl = document.getElementById('activeUsersCount');
    if (activeCountEl) activeCountEl.textContent = String(active.length);

    const registeredTableCount = document.getElementById('registeredUsersTableCount');
    if (registeredTableCount) registeredTableCount.textContent = registered.length + ' kayit';

    const activeTableCount = document.getElementById('activeUsersTableCount');
    if (activeTableCount) activeTableCount.textContent = active.length + ' kayit';

    const registeredBody = document.getElementById('registeredUsersTableBody');
    if (registeredBody) {
      if (!registered.length) {
        registeredBody.innerHTML = '<tr><td colspan="7" class="empty-row">Kayitli kullanici bulunamadi.</td></tr>';
      } else {
        const currentUserId = Number(state.currentUser?.id) || 0;
        registeredBody.innerHTML = registered.map((user) => {
          const isActive = user?.isActive === true;
          const role = normalizeUserRole(user?.role, USER_ROLES.KULLANICI);
          const canManage = canCurrentUserManageAccess();
          const isSelf = currentUserId && Number(user.id) === currentUserId;
          const canDelete = canManage && !isSelf;
          return ''
            + '<tr>'
            + '  <td><strong>' + escapeHtml(user?.name || '-') + '</strong></td>'
            + '  <td>' + escapeHtml(user?.email || '-') + '</td>'
            + '  <td><span class="user-role-pill role-' + role + '">' + escapeHtml(roleLabel(role)) + '</span></td>'
            + '  <td><span class="user-status-pill ' + (isActive ? 'active' : 'offline') + '">' + (isActive ? 'Aktif' : 'Pasif') + '</span></td>'
            + '  <td>' + escapeHtml(formatDateTime(user?.registeredAt)) + '</td>'
            + '  <td>' + escapeHtml(formatDateTime(user?.lastActiveAt || user?.lastLoginAt)) + '</td>'
            + '  <td>'
            + '    <div class="table-action-row">'
            + '      <button type="button" class="table-action-btn edit ' + (canManage ? '' : 'disabled') + '" data-user-action="select" data-user-id="' + user.id + '" ' + (canManage ? '' : 'disabled') + '>Rutbe Ver</button>'
            + '      <button type="button" class="table-action-btn delete ' + (canDelete ? '' : 'disabled') + '" data-user-action="delete" data-user-id="' + user.id + '" ' + (canDelete ? '' : 'disabled') + (isSelf ? ' title="Kendinizi silemezsiniz"' : '') + '>Sil</button>'
            + '    </div>'
            + '  </td>'
            + '</tr>';
        }).join('');
      }
    }

    const activeBody = document.getElementById('activeUsersTableBody');
    if (activeBody) {
      if (!active.length) {
        activeBody.innerHTML = '<tr><td colspan="4" class="empty-row">Aktif kullanici bulunamadi.</td></tr>';
      } else {
        activeBody.innerHTML = active.map((user) => {
          return ''
            + '<tr>'
            + '  <td><strong>' + escapeHtml(user?.name || '-') + '</strong></td>'
            + '  <td>' + escapeHtml(user?.email || '-') + '</td>'
            + '  <td>' + escapeHtml(formatDateTime(user?.lastLoginAt)) + '</td>'
            + '  <td>' + escapeHtml(formatDateTime(user?.lastActiveAt)) + '</td>'
            + '</tr>';
        }).join('');
      }
    }
  }

  function getRecentRecordsForDashboard() {
    const fromInsights = Array.isArray(state.dashboardInsights?.recentRecords)
      ? state.dashboardInsights.recentRecords
      : [];

    if (fromInsights.length) {
      return fromInsights.map((item) => ({
        type: String(item?.type || '-'),
        name: String(item?.name || '-'),
        time: String(item?.time || '')
      }));
    }

    const cityRows = state.cities.map((city) => ({
      type: 'Sehir',
      name: city.name || '-',
      time: city.updatedAt || city.createdAt || ''
    }));

    const hotelRows = state.hotels.map((hotel) => ({
      type: 'Otel',
      name: hotel.name || '-',
      time: hotel.updatedAt || hotel.createdAt || ''
    }));

    const moduleRows = state.modules.map((moduleItem) => ({
      type: 'API Modul',
      name: moduleItem.displayName || moduleItem.moduleKey || '-',
      time: moduleItem.updatedAt || ''
    }));

    const integrationRows = state.integrations.map((integration) => ({
      type: 'API Baglantisi',
      name: integration.name || '-',
      time: integration.updatedAt || integration.lastCheckedAt || ''
    }));

    const userRows = state.registeredUsers.map((user) => ({
      type: 'Kullanici',
      name: user.name || user.email || '-',
      time: user.lastActiveAt || user.lastLoginAt || user.updatedAt || user.registeredAt || ''
    }));

    return cityRows.concat(hotelRows, moduleRows, integrationRows, userRows);
  }

  function buildMiniChartSvg(labels, seriesList) {
    const safeLabels = Array.isArray(labels) ? labels : [];
    const safeSeries = Array.isArray(seriesList) ? seriesList : [];
    if (!safeLabels.length || !safeSeries.length) return '';

    const width = 320;
    const height = 160;
    const paddingTop = 14;
    const paddingRight = 10;
    const paddingBottom = 24;
    const paddingLeft = 24;
    const chartWidth = width - paddingLeft - paddingRight;
    const chartHeight = height - paddingTop - paddingBottom;

    const maxValue = Math.max(1, ...safeSeries.flatMap((series) => series.values.map((item) => Number(item) || 0)));
    const stepX = safeLabels.length > 1 ? chartWidth / (safeLabels.length - 1) : 0;

    const toPoint = (value, index) => {
      const safeValue = Number(value) || 0;
      const x = paddingLeft + (index * stepX);
      const y = paddingTop + chartHeight - ((safeValue / maxValue) * chartHeight);
      return { x, y };
    };

    const gridLines = [0, 0.25, 0.5, 0.75, 1].map((ratio) => {
      const y = paddingTop + (chartHeight * ratio);
      return '<line class="mini-chart-grid-line" x1="' + paddingLeft + '" y1="' + y.toFixed(2) + '" x2="' + (width - paddingRight) + '" y2="' + y.toFixed(2) + '"></line>';
    }).join('');

    const linePaths = safeSeries.map((series) => {
      const points = series.values.map((value, index) => toPoint(value, index));
      const polyline = points.map((point) => point.x.toFixed(2) + ',' + point.y.toFixed(2)).join(' ');
      const circles = points.map((point) => {
        return '<circle class="' + series.pointClass + '" cx="' + point.x.toFixed(2) + '" cy="' + point.y.toFixed(2) + '" r="2.6"></circle>';
      }).join('');

      return '<polyline class="' + series.lineClass + '" points="' + polyline + '"></polyline>' + circles;
    }).join('');

    const firstLabel = safeLabels[0] || '';
    const midLabel = safeLabels[Math.floor((safeLabels.length - 1) / 2)] || '';
    const lastLabel = safeLabels[safeLabels.length - 1] || '';
    const axisLabels = ''
      + '<text class="mini-chart-label" x="' + paddingLeft + '" y="' + (height - 6) + '">' + escapeHtml(firstLabel) + '</text>'
      + '<text class="mini-chart-label" x="' + (paddingLeft + (chartWidth / 2)) + '" y="' + (height - 6) + '" text-anchor="middle">' + escapeHtml(midLabel) + '</text>'
      + '<text class="mini-chart-label" x="' + (width - paddingRight) + '" y="' + (height - 6) + '" text-anchor="end">' + escapeHtml(lastLabel) + '</text>';

    return ''
      + '<svg class="mini-chart-svg" viewBox="0 0 ' + width + ' ' + height + '" preserveAspectRatio="none" aria-hidden="true">'
      + gridLines
      + linePaths
      + axisLabels
      + '</svg>';
  }

  function renderDashboardCharts() {
    const userChart = document.getElementById('userActivityChart');
    const userMeta = document.getElementById('userActivityChartMeta');
    const reservationChart = document.getElementById('reservationActivityChart');
    const reservationMeta = document.getElementById('reservationStatusLegend');

    const userActivity = Array.isArray(state.dashboardInsights?.userActivity) ? state.dashboardInsights.userActivity : [];
    const reservationActivity = Array.isArray(state.dashboardInsights?.reservationActivity) ? state.dashboardInsights.reservationActivity : [];
    const reservationStatus = Array.isArray(state.dashboardInsights?.reservationStatus) ? state.dashboardInsights.reservationStatus : [];

    if (userChart) {
      const labels = userActivity.map((item) => String(item?.label || '-'));
      const logins = userActivity.map((item) => Number(item?.logins) || 0);
      const logouts = userActivity.map((item) => Number(item?.logouts) || 0);

      if (!labels.length) {
        userChart.innerHTML = '<p class="small-muted" style="padding:0.7rem;">Kullanici hareket verisi bulunamadi.</p>';
      } else {
        userChart.innerHTML = buildMiniChartSvg(labels, [
          { values: logins, lineClass: 'mini-chart-line-primary', pointClass: 'mini-chart-point-primary' },
          { values: logouts, lineClass: 'mini-chart-line-secondary', pointClass: 'mini-chart-point-secondary' }
        ]);
      }
    }

    if (userMeta) {
      const loginTotal = userActivity.reduce((sum, item) => sum + (Number(item?.logins) || 0), 0);
      const logoutTotal = userActivity.reduce((sum, item) => sum + (Number(item?.logouts) || 0), 0);
      userMeta.innerHTML = ''
        + '<span class="chart-pill logins">Giris: ' + loginTotal + '</span>'
        + '<span class="chart-pill logouts">Cikis: ' + logoutTotal + '</span>';
    }

    if (reservationChart) {
      const labels = reservationActivity.map((item) => String(item?.label || '-'));
      const created = reservationActivity.map((item) => Number(item?.created) || 0);
      const cancelled = reservationActivity.map((item) => Number(item?.cancelled) || 0);

      if (!labels.length) {
        reservationChart.innerHTML = '<p class="small-muted" style="padding:0.7rem;">Rezervasyon verisi bulunamadi.</p>';
      } else {
        reservationChart.innerHTML = buildMiniChartSvg(labels, [
          { values: created, lineClass: 'mini-chart-line-primary', pointClass: 'mini-chart-point-primary' },
          { values: cancelled, lineClass: 'mini-chart-line-secondary', pointClass: 'mini-chart-point-secondary' }
        ]);
      }
    }

    if (reservationMeta) {
      const createdTotal = reservationActivity.reduce((sum, item) => sum + (Number(item?.created) || 0), 0);
      const cancelledTotal = reservationActivity.reduce((sum, item) => sum + (Number(item?.cancelled) || 0), 0);

      const statusBadges = reservationStatus.slice(0, 3).map((item) => {
        return '<span class="chart-pill status">' + escapeHtml(String(item?.status || 'unknown')) + ': ' + (Number(item?.count) || 0) + '</span>';
      }).join('');

      reservationMeta.innerHTML = ''
        + '<span class="chart-pill created">Yeni: ' + createdTotal + '</span>'
        + '<span class="chart-pill cancelled">Iptal: ' + cancelledTotal + '</span>'
        + statusBadges;
    }
  }

  function renderRecentRecords() {
    const body = document.getElementById('recentRecordsBody');
    if (!body) return;

    const rows = getRecentRecordsForDashboard()
      .sort((a, b) => {
        const dateA = a.time ? new Date(a.time).getTime() : 0;
        const dateB = b.time ? new Date(b.time).getTime() : 0;
        return dateB - dateA;
      })
      .slice(0, 10);

    if (!rows.length) {
      body.innerHTML = '<tr><td colspan="3" class="empty-row">Gosterilecek kayit yok.</td></tr>';
      return;
    }

    body.innerHTML = rows.map((row) => {
      return ''
        + '<tr>'
        + '  <td>' + escapeHtml(row.type) + '</td>'
        + '  <td><strong>' + escapeHtml(row.name) + '</strong></td>'
        + '  <td>' + escapeHtml(formatDateTime(row.time)) + '</td>'
        + '</tr>';
    }).join('');
  }

  function renderAll() {
    renderMetricCards();
    renderCityOptions();
    renderCityTable();
    renderHotelTable();
    renderApiSidebar();
    renderApiModuleTable();
    renderApiIntegrationTable();
    renderUsersSidebar();
    renderUsersPanel();
    renderRecentRecords();
    renderDashboardCharts();
    applySidebarAccessControls();
    setUserAccessFormEnabled(canCurrentUserManageAccess());
    setLastSyncText();
  }

  function fillApiIntegrationForm(integration) {
    if (!integration) return;

    state.editingIntegrationId = Number(integration.id) || 0;

    const idInput = document.getElementById('apiIntegrationIdInput');
    if (idInput) idInput.value = String(state.editingIntegrationId);

    const nameInput = document.getElementById('apiIntegrationNameInput');
    if (nameInput) nameInput.value = integration.name || '';

    const baseUrlInput = document.getElementById('apiIntegrationBaseUrlInput');
    if (baseUrlInput) baseUrlInput.value = integration.baseUrl || '';

    const healthPathInput = document.getElementById('apiIntegrationHealthPathInput');
    if (healthPathInput) healthPathInput.value = integration.healthPath || '/api/health';

    const enabledInput = document.getElementById('apiIntegrationEnabledInput');
    if (enabledInput) enabledInput.checked = integration.isEnabled !== false;

    const title = document.getElementById('apiIntegrationFormTitle');
    if (title) title.textContent = 'API Duzenle';

    const saveBtn = document.getElementById('saveApiIntegrationBtn');
    if (saveBtn) saveBtn.textContent = 'Guncellemeyi Kaydet';

    activatePanel('apisPanel');
  }

  function apiIntegrationPayloadFromForm() {
    return {
      name: document.getElementById('apiIntegrationNameInput')?.value?.trim() || '',
      baseUrl: document.getElementById('apiIntegrationBaseUrlInput')?.value?.trim() || '',
      healthPath: document.getElementById('apiIntegrationHealthPathInput')?.value?.trim() || '',
      isEnabled: Boolean(document.getElementById('apiIntegrationEnabledInput')?.checked)
    };
  }

  function fillCityForm(city) {
    if (!city) return;

    state.editingCityId = Number(city.id) || 0;
    const idInput = document.getElementById('cityIdInput');
    if (idInput) idInput.value = String(state.editingCityId);

    const nameInput = document.getElementById('cityNameInput');
    if (nameInput) nameInput.value = city.name || '';

    const slugInput = document.getElementById('citySlugInput');
    if (slugInput) slugInput.value = city.slug || '';

    const descriptionInput = document.getElementById('cityDescriptionInput');
    if (descriptionInput) descriptionInput.value = city.description || '';

    const imageInput = document.getElementById('cityImageInput');
    if (imageInput) imageInput.value = city.image || '';

    const heroImageInput = document.getElementById('cityHeroImageInput');
    if (heroImageInput) heroImageInput.value = city.heroImage || '';

    const heroInput = document.getElementById('cityHeroInput');
    if (heroInput) heroInput.value = city.heroBackground || '';

    syncPaletteFromHeroInput();

    const regionInput = document.getElementById('cityRegionClassInput');
    if (regionInput) regionInput.value = city.regionClass || 'bottom-right';

    const showInRegionsInput = document.getElementById('cityShowInRegionsInput');
    if (showInRegionsInput) showInRegionsInput.checked = city.showInRegions !== false;
    setCityRegionSelectionVisibility(city.showInRegions !== false);

    const aliasesInput = document.getElementById('cityAliasesInput');
    if (aliasesInput) aliasesInput.value = Array.isArray(city.aliases) ? city.aliases.join(', ') : '';

    const title = document.getElementById('cityFormTitle');
    if (title) title.textContent = 'Sehri Duzenle';

    const saveBtn = document.getElementById('saveCityBtn');
    if (saveBtn) saveBtn.textContent = 'Guncellemeyi Kaydet';

    activatePanel('citiesPanel');
  }

  function fillHotelForm(hotel) {
    if (!hotel) return;

    state.editingHotelId = Number(hotel.id) || 0;
    state.selectedHotelCityId = Number(hotel.cityId) || state.selectedHotelCityId || 0;
    const idInput = document.getElementById('hotelIdInput');
    if (idInput) idInput.value = String(state.editingHotelId);

    const citySelect = document.getElementById('hotelCitySelect');
    if (citySelect) citySelect.value = String(state.selectedHotelCityId || hotel.cityId || '');

    const nameInput = document.getElementById('hotelNameInput');
    if (nameInput) nameInput.value = hotel.name || '';

    const imageInput = document.getElementById('hotelImageInput');
    if (imageInput) imageInput.value = hotel.image || '';

    const ratingInput = document.getElementById('hotelRatingInput');
    if (ratingInput) ratingInput.value = String(Number(hotel.rating) || 0);

    const priceInput = document.getElementById('hotelPriceInput');
    if (priceInput) priceInput.value = String(Number(hotel.price) || 0);

    const featuresInput = document.getElementById('hotelFeaturesInput');
    if (featuresInput) {
      const features = Array.isArray(hotel.features) ? hotel.features : [];
      featuresInput.value = features.join(', ');
    }

    const title = document.getElementById('hotelFormTitle');
    if (title) title.textContent = 'Oteli Duzenle';

    const saveBtn = document.getElementById('saveHotelBtn');
    if (saveBtn) saveBtn.textContent = 'Guncellemeyi Kaydet';

    activatePanel('hotelsPanel');
  }

  function cityPayloadFromForm() {
    return {
      name: document.getElementById('cityNameInput')?.value?.trim() || '',
      slug: document.getElementById('citySlugInput')?.value?.trim() || '',
      description: document.getElementById('cityDescriptionInput')?.value?.trim() || '',
      image: document.getElementById('cityImageInput')?.value?.trim() || '',
      heroImage: document.getElementById('cityHeroImageInput')?.value?.trim() || '',
      heroBackground: document.getElementById('cityHeroInput')?.value?.trim() || '',
      regionClass: document.getElementById('cityRegionClassInput')?.value?.trim() || '',
      showInRegions: Boolean(document.getElementById('cityShowInRegionsInput')?.checked),
      aliases: parseCommaList(document.getElementById('cityAliasesInput')?.value || '')
    };
  }

  function hotelPayloadFromForm() {
    const cityId = Number(document.getElementById('hotelCitySelect')?.value || state.selectedHotelCityId || 0);
    if (cityId) state.selectedHotelCityId = cityId;

    return {
      cityId,
      name: document.getElementById('hotelNameInput')?.value?.trim() || '',
      image: document.getElementById('hotelImageInput')?.value?.trim() || '',
      rating: Number(document.getElementById('hotelRatingInput')?.value || 0),
      price: Number(document.getElementById('hotelPriceInput')?.value || 0),
      features: parseCommaList(document.getElementById('hotelFeaturesInput')?.value || '')
    };
  }

  async function refreshCatalogData() {
    const payload = await requestJson('/api/bootstrap');
    state.cities = (Array.isArray(payload.cities) ? payload.cities : []).map((city) => {
      return Object.assign({}, city, {
        showInRegions: city?.showInRegions !== false
      });
    });
    state.hotels = Array.isArray(payload.hotels) ? payload.hotels : [];
    state.lastSyncAt = new Date().toLocaleString('tr-TR');
    renderAll();
  }

  async function refreshApiModules() {
    const payload = await requestJson('/api/admin/modules');
    state.modules = Array.isArray(payload.modules) ? payload.modules : [];
    renderAll();
  }

  async function refreshApiIntegrations() {
    const payload = await requestJson('/api/admin/integrations');
    state.integrations = Array.isArray(payload.integrations) ? payload.integrations : [];
    renderAll();
  }

  async function checkAllIntegrations() {
    const payload = await requestJson('/api/admin/integrations/check-all', { method: 'POST' });
    state.integrations = Array.isArray(payload.integrations) ? payload.integrations : state.integrations;
    renderAll();
    showToast('API baglantilari kontrol edildi.');
  }

  async function refreshUsersData() {
    const payload = await requestJson('/api/admin/users');
    state.registeredUsers = Array.isArray(payload.registeredUsers) ? payload.registeredUsers : [];
    state.activeUsers = Array.isArray(payload.activeUsers) ? payload.activeUsers : [];

    if (state.selectedManagedUserId) {
      const selected = state.registeredUsers.find((user) => Number(user.id) === Number(state.selectedManagedUserId));
      if (selected) {
        fillUserAccessForm(selected);
      } else {
        resetUserAccessForm();
      }
    }

    renderAll();
  }

  async function refreshDashboardInsights() {
    const payload = await requestJson('/api/admin/dashboard-insights');
    state.dashboardInsights = {
      recentRecords: Array.isArray(payload?.recentRecords) ? payload.recentRecords : [],
      userActivity: Array.isArray(payload?.userActivity) ? payload.userActivity : [],
      reservationActivity: Array.isArray(payload?.reservationActivity) ? payload.reservationActivity : [],
      reservationStatus: Array.isArray(payload?.reservationStatus) ? payload.reservationStatus : []
    };

    renderAll();
  }

  async function refreshActivityLogs() {
    try {
      const payload = await requestJson('/api/admin/activity');
      state.activityLogs = Array.isArray(payload.logs) ? payload.logs : [];
      renderActivityLog();
    } catch (_error) {
      // ignore failures
    }
  }

  function startDashboardLiveTimer() {
    if (state.dashboardTimerId) {
      window.clearInterval(state.dashboardTimerId);
    }

    state.dashboardTimerId = window.setInterval(async () => {
      try {
        await refreshDashboardInsights();
      } catch (_error) {
        // Live chart refresh should not interrupt admin operations.
      }
    }, 20000);
  }

  async function notifyCatalogUpdated() {
    localStorage.setItem(CATALOG_REFRESH_STORAGE_KEY, String(Date.now()));
  }

  function bindPanelNavigation() {
    document.querySelectorAll('[data-panel-target]').forEach((button) => {
      button.addEventListener('click', () => {
        const panelId = button.getAttribute('data-panel-target') || 'dashboardPanel';
        activatePanel(panelId);
      });
    });
  }

  function bindCityTableActions() {
    const cityTableBody = document.getElementById('cityTableBody');
    if (!cityTableBody) return;

    cityTableBody.addEventListener('click', async (event) => {
      const actionBtn = event.target.closest('[data-city-action]');
      if (!actionBtn) return;

      const cityId = Number(actionBtn.getAttribute('data-city-id') || 0);
      if (!cityId) return;

      const action = actionBtn.getAttribute('data-city-action');
      const city = state.cities.find((entry) => Number(entry.id) === cityId);
      if (!city) return;

      if (action === 'edit') {
        fillCityForm(city);
        return;
      }

      if (action === 'delete') {
        const approved = await confirmAction(
          'Sehir Silinsin mi?',
          '"' + city.name + '" sehrini silerseniz bu sehre bagli oteller de silinir.',
          'Sehri Sil'
        );
        if (!approved) return;

        try {
          await requestJson('/api/admin/cities/' + cityId, { method: 'DELETE' });
          await refreshCatalogData();
          await notifyCatalogUpdated();
          resetCityForm();
          alertAction('Sehir silindi.', false);
        } catch (error) {
          showToast(error.message, true);
        }
      }
    });
  }

  function bindHotelTableActions() {
    const hotelTableBody = document.getElementById('hotelTableBody');
    if (!hotelTableBody) return;

    hotelTableBody.addEventListener('click', async (event) => {
      const actionBtn = event.target.closest('[data-hotel-action]');
      if (!actionBtn) return;

      const hotelId = Number(actionBtn.getAttribute('data-hotel-id') || 0);
      if (!hotelId) return;

      const action = actionBtn.getAttribute('data-hotel-action');
      const hotel = state.hotels.find((entry) => Number(entry.id) === hotelId);
      if (!hotel) return;

      if (action === 'edit') {
        fillHotelForm(hotel);
        return;
      }

      if (action === 'delete') {
        const approved = await confirmAction(
          'Otel Silinsin mi?',
          '"' + hotel.name + '" otelini silmek istediginize emin misiniz?',
          'Oteli Sil'
        );
        if (!approved) return;

        try {
          await requestJson('/api/admin/hotels/' + hotelId, { method: 'DELETE' });
          await refreshCatalogData();
          await notifyCatalogUpdated();
          resetHotelForm();
          alertAction('Otel silindi.', false);
        } catch (error) {
          showToast(error.message, true);
        }
      }
    });
  }

  function bindApiModuleActions() {
    const moduleTableBody = document.getElementById('apiModuleTableBody');
    if (!moduleTableBody) return;

    moduleTableBody.addEventListener('change', async (event) => {
      const input = event.target;
      if (!input || !input.classList || !input.classList.contains('api-module-switch')) return;

      const moduleKey = String(input.dataset.moduleKey || '').trim();
      if (!moduleKey) return;

      if (!canCurrentUserToggleModules()) {
        showToast('Modul ac/kapa islemi admin yetkisi gerektirir.', true);
        // revert checkbox
        input.checked = !input.checked;
        return;
      }

      try {
        const isActive = Boolean(input.checked);
        const payload = await requestJson('/api/admin/modules/' + encodeURIComponent(moduleKey), {
          method: 'PUT',
          body: JSON.stringify({ isActive, note: '' })
        });

        if (payload?.module) {
          state.modules = state.modules.map((entry) => String(entry.moduleKey || '') === moduleKey ? payload.module : entry);
        }

        renderAll();
        showToast(isActive ? 'Modul aktif edildi.' : 'Modul pasife alindi.');
      } catch (error) {
        // revert
        input.checked = !input.checked;
        showToast(error.message, true);
      }
    });
  }

  function bindApiTableActions() {
    const apiTableBody = document.getElementById('apiIntegrationTableBody');
    if (!apiTableBody) return;

    apiTableBody.addEventListener('click', async (event) => {
      const actionBtn = event.target.closest('[data-api-action]');
      if (!actionBtn) return;

      const apiId = Number(actionBtn.getAttribute('data-api-id') || 0);
      if (!apiId) return;

      const action = actionBtn.getAttribute('data-api-action');
      const integration = state.integrations.find((entry) => Number(entry.id) === apiId);
      if (!integration && action !== 'delete') return;

      if (action === 'edit') {
        fillApiIntegrationForm(integration);
        return;
      }

      if (action === 'check') {
        try {
          const payload = await requestJson('/api/admin/integrations/' + apiId + '/check', { method: 'POST' });
          if (payload?.integration) {
            state.integrations = state.integrations.map((item) => Number(item.id) === apiId ? payload.integration : item);
          }
          renderAll();
          showToast('API kontrol edildi.');
        } catch (error) {
          showToast(error.message, true);
        }
        return;
      }

      if (action === 'toggle') {
        try {
          const nextEnabled = !integration.isEnabled;
          const payload = await requestJson('/api/admin/integrations/' + apiId, {
            method: 'PUT',
            body: JSON.stringify({ isEnabled: nextEnabled })
          });
          if (payload?.integration) {
            state.integrations = state.integrations.map((item) => Number(item.id) === apiId ? payload.integration : item);
          }
          renderAll();
          showToast(nextEnabled ? 'API baglandi.' : 'API cikarildi.');
        } catch (error) {
          showToast(error.message, true);
        }
        return;
      }

      if (action === 'delete') {
        const approved = await confirmAction(
          'API Baglantisi Silinsin mi?',
          '"' + (integration?.name || 'API') + '" baglantisini silmek istediginize emin misiniz?',
          'Sil'
        );
        if (!approved) return;

        try {
          await requestJson('/api/admin/integrations/' + apiId, { method: 'DELETE' });
          await refreshApiIntegrations();
          await notifyCatalogUpdated();
          resetApiIntegrationForm();
          showToast('API baglantisi silindi.');
        } catch (error) {
          showToast(error.message, true);
        }
      }
    });
  }

  function bindUsersTableActions() {
    const usersBody = document.getElementById('registeredUsersTableBody');
    if (!usersBody) return;

    usersBody.addEventListener('click', async (event) => {
      const actionBtn = event.target.closest('[data-user-action]');
      if (!actionBtn) return;

      if (!canCurrentUserManageAccess()) {
        showToast('Bu islem sadece patron kullaniciya aciktir.', true);
        return;
      }

      const action = actionBtn.getAttribute('data-user-action');
      const userId = Number(actionBtn.getAttribute('data-user-id') || 0);
      if (!action || !userId) return;

      const user = state.registeredUsers.find((entry) => Number(entry.id) === userId);
      if (!user) return;

      if (action === 'select') {
        fillUserAccessForm(user);
        showToast('Kullanici secildi: ' + (user.name || user.email || 'Kullanici'));
        return;
      }

      if (action === 'delete') {
        if (Number(state.currentUser?.id) === userId) {
          showToast('Kendinizi silemezsiniz.', true);
          return;
        }

        const approved = await confirmAction(
          'Kullaniciyi sil',
          (user.name || user.email || 'Bu kullanici') + ' silinecek. Geri alinamaz. Devam edilsin mi?',
          'Sil'
        );
        if (!approved) return;

        try {
          await requestJson('/api/admin/users/' + userId, { method: 'DELETE' });
          showToast('Kullanici silindi.');
          await refreshUsersData();
        } catch (error) {
          showToast(error.message, true);
        }
      }
    });
  }

  // ── Rezervasyon Yönetimi ──────────────────────────────────────────────────

  const RESERVATION_STATUS_LABELS = {
    confirmed: { label: 'Onaylı',      cls: 'status-confirmed' },
    pending:   { label: 'Beklemede',   cls: 'status-pending'   },
    cancelled: { label: 'İptal',       cls: 'status-cancelled' },
    completed: { label: 'Tamamlandı',  cls: 'status-completed' },
  };

  function reservationStatusBadge(status) {
    const s = RESERVATION_STATUS_LABELS[status] || { label: status, cls: '' };
    return '<span class="status-badge ' + s.cls + '">' + escapeHtml(s.label) + '</span>';
  }

  function renderReservationsTable() {
    const tbody = document.getElementById('reservationsTableBody');
    if (!tbody) return;

    if (!state.reservations.length) {
      tbody.innerHTML = '<tr><td colspan="8" class="table-empty">Rezervasyon bulunamadı.</td></tr>';
      return;
    }

    tbody.innerHTML = state.reservations.map((r) => {
      const checkIn  = r.checkIn  ? new Date(r.checkIn).toLocaleDateString('tr-TR')  : '-';
      const checkOut = r.checkOut ? new Date(r.checkOut).toLocaleDateString('tr-TR') : '-';
      const canConfirm  = r.status !== 'confirmed'  && r.status !== 'completed';
      const canComplete = r.status === 'confirmed';
      const canCancel   = r.status !== 'cancelled';

      return '<tr>' +
        '<td>' + r.id + '</td>' +
        '<td><span title="' + escapeHtml(r.userEmail) + '">' + escapeHtml(r.userName || r.userEmail || '-') + '</span></td>' +
        '<td>' + escapeHtml(r.hotelName || '-') + '</td>' +
        '<td>' + checkIn + ' → ' + checkOut + '</td>' +
        '<td>' + r.nights + ' gece / ' + r.guestCount + ' kişi</td>' +
        '<td>₺' + (r.totalAmount || 0).toLocaleString('tr-TR') + '</td>' +
        '<td>' + reservationStatusBadge(r.status) + '</td>' +
        '<td class="action-cell">' +
          (canConfirm  ? '<button class="btn-sm btn-success" data-res-id="' + r.id + '" data-res-action="confirmed">Onayla</button> '  : '') +
          (canComplete ? '<button class="btn-sm btn-info"    data-res-id="' + r.id + '" data-res-action="completed">Tamamla</button> ' : '') +
          (canCancel   ? '<button class="btn-sm btn-danger"  data-res-id="' + r.id + '" data-res-action="cancelled">İptal</button>'    : '') +
        '</td>' +
        '</tr>';
    }).join('');
  }

  async function refreshReservationsData() {
    const filter = document.getElementById('reservationStatusFilter')?.value || '';
    const url = '/api/admin/reservations' + (filter ? '?status=' + filter : '');
    const data = await requestJson(url);
    state.reservations = data.reservations || [];

    const metricEl = document.getElementById('metricReservations');
    if (metricEl) metricEl.textContent = state.reservations.length;

    renderReservationsTable();
  }

  function bindReservationPanel() {
    const refreshBtn = document.getElementById('refreshReservationsBtn');
    if (refreshBtn && !refreshBtn.dataset.bound) {
      refreshBtn.dataset.bound = 'true';
      refreshBtn.addEventListener('click', async () => {
        try { await refreshReservationsData(); showToast('Rezervasyonlar yenilendi.'); }
        catch (e) { showToast(e.message, true); }
      });
    }

    const filterEl = document.getElementById('reservationStatusFilter');
    if (filterEl && !filterEl.dataset.bound) {
      filterEl.dataset.bound = 'true';
      filterEl.addEventListener('change', async () => {
        try { await refreshReservationsData(); }
        catch (e) { showToast(e.message, true); }
      });
    }

    const tbody = document.getElementById('reservationsTableBody');
    if (tbody && !tbody.dataset.bound) {
      tbody.dataset.bound = 'true';
      tbody.addEventListener('click', async (e) => {
        const btn = e.target.closest('[data-res-id][data-res-action]');
        if (!btn) return;

        const id     = Number(btn.dataset.resId);
        const action = btn.dataset.resAction;
        const labels = { confirmed: 'Onayla', completed: 'Tamamla', cancelled: 'İptal et' };
        const confirmed = await confirmAction(
          labels[action] + '?',
          '#' + id + ' numaralı rezervasyon ' + (labels[action] || action) + ' olarak işaretlensin mi?',
          labels[action]
        );
        if (!confirmed) return;

        try {
          await requestJson('/api/admin/reservations/' + id + '/status', {
            method: 'PUT',
            body: JSON.stringify({ status: action })
          });
          showToast('Rezervasyon güncellendi.');
          await refreshReservationsData();
        } catch (err) {
          showToast(err.message, true);
        }
      });
    }
  }

  // ── İletişim Talepleri ────────────────────────────────────────────────────

  function renderContactRequestsTable() {
    const tbody = document.getElementById('contactRequestsTableBody');
    if (!tbody) return;

    const newCount = state.contactRequests.filter((r) => r.status === 'new').length;
    const countEl  = document.getElementById('contactRequestsNewCount');
    if (countEl) countEl.textContent = newCount + ' yeni';

    const badge = document.getElementById('sidebarContactBadge');
    if (badge) {
      badge.textContent = newCount || '';
      badge.style.display = newCount ? '' : 'none';
    }

    const metricEl = document.getElementById('metricContactNew');
    if (metricEl) metricEl.textContent = newCount;

    if (!state.contactRequests.length) {
      tbody.innerHTML = '<tr><td colspan="8" class="table-empty">İletişim talebi bulunamadı.</td></tr>';
      return;
    }

    tbody.innerHTML = state.contactRequests.map((r) => {
      const date    = r.createdAt ? new Date(r.createdAt).toLocaleDateString('tr-TR') : '-';
      const isNew   = r.status === 'new';
      const rowCls  = isNew ? ' class="row-highlight"' : '';
      const msgShort = escapeHtml((r.message || '').slice(0, 80)) + (r.message.length > 80 ? '…' : '');

      return '<tr' + rowCls + '>' +
        '<td>' + r.id + '</td>' +
        '<td>' + escapeHtml(r.name) + '</td>' +
        '<td><a href="mailto:' + escapeHtml(r.email) + '">' + escapeHtml(r.email) + '</a></td>' +
        '<td>' + escapeHtml(r.subject || '-') + '</td>' +
        '<td title="' + escapeHtml(r.message) + '">' + msgShort + '</td>' +
        '<td><span class="status-badge ' + (isNew ? 'status-pending' : '') + '">' + (isNew ? 'Yeni' : 'Okundu') + '</span></td>' +
        '<td>' + date + '</td>' +
        '<td class="action-cell">' +
          (isNew ? '<button class="btn-sm btn-info" data-contact-id="' + r.id + '" data-contact-action="read">Okundu</button> ' : '') +
          '<button class="btn-sm btn-danger" data-contact-id="' + r.id + '" data-contact-action="delete">Sil</button>' +
        '</td>' +
        '</tr>';
    }).join('');
  }

  async function refreshContactRequestsData() {
    const data = await requestJson('/api/admin/contact-requests');
    state.contactRequests = data.contactRequests || [];
    renderContactRequestsTable();
  }

  function bindContactPanel() {
    const refreshBtn = document.getElementById('refreshContactRequestsBtn');
    if (refreshBtn && !refreshBtn.dataset.bound) {
      refreshBtn.dataset.bound = 'true';
      refreshBtn.addEventListener('click', async () => {
        try { await refreshContactRequestsData(); showToast('İletişim talepleri yenilendi.'); }
        catch (e) { showToast(e.message, true); }
      });
    }

    const tbody = document.getElementById('contactRequestsTableBody');
    if (tbody && !tbody.dataset.bound) {
      tbody.dataset.bound = 'true';
      tbody.addEventListener('click', async (e) => {
        const btn = e.target.closest('[data-contact-id]');
        if (!btn) return;

        const id     = Number(btn.dataset.contactId);
        const action = btn.dataset.contactAction;

        if (action === 'read') {
          try {
            await requestJson('/api/admin/contact-requests/' + id + '/status', {
              method: 'PUT',
              body: JSON.stringify({ status: 'read' })
            });
            showToast('Okundu olarak işaretlendi.');
            await refreshContactRequestsData();
          } catch (err) { showToast(err.message, true); }
          return;
        }

        if (action === 'delete') {
          const ok = await confirmAction('Talep silinsin mi?', '#' + id + ' numaralı talep kalıcı olarak silinecek.', 'Sil');
          if (!ok) return;
          try {
            await requestJson('/api/admin/contact-requests/' + id, { method: 'DELETE' });
            showToast('Talep silindi.');
            await refreshContactRequestsData();
          } catch (err) { showToast(err.message, true); }
        }
      });
    }
  }

  // ── bindForms ─────────────────────────────────────────────────────────────
  function bindForms() {
    const adminLogoutBtn = document.getElementById('adminLogoutBtn');
    if (adminLogoutBtn) {
      adminLogoutBtn.addEventListener('click', async () => {
        const approved = await confirmAction('Cikis Yapilsin mi?', 'Guvenli cikis yapip admin oturumunu sonlandirmak istiyor musunuz?', 'Cikis Yap');
        if (!approved) return;

        try {
          await requestJson('/api/auth/logout', { method: 'POST', body: JSON.stringify({}) });
        } catch (_error) {
          // Best effort logout
        }

        clearAuthStorage();
        window.location.href = '/admin';
      });
    }

    const toggleSidebarBtn = document.getElementById('toggleSidebarBtn');
    const adminShell = document.querySelector('.admin-shell');
    const sidebarBackdrop = document.getElementById('sidebarBackdrop');

    const closeSidebar = () => {
      if (!adminShell || !sidebarBackdrop) return;
      adminShell.classList.remove('sidebar-open');
      sidebarBackdrop.classList.remove('is-visible');
    };

    const openSidebar = () => {
      if (!adminShell || !sidebarBackdrop) return;
      adminShell.classList.add('sidebar-open');
      sidebarBackdrop.classList.add('is-visible');
    };

    if (toggleSidebarBtn) {
      toggleSidebarBtn.addEventListener('click', () => {
        if (!adminShell) return;
        const isOpen = adminShell.classList.contains('sidebar-open');
        if (isOpen) {
          closeSidebar();
          return;
        }
        openSidebar();
      });
    }

    if (sidebarBackdrop) {
      sidebarBackdrop.addEventListener('click', closeSidebar);
    }

    const sidebarSearch = document.getElementById('sidebarSearchInput');
    if (sidebarSearch) {
      sidebarSearch.addEventListener('input', (e) => {
        const q = String(e.target.value || '').trim().toLowerCase();
        document.querySelectorAll('.sidebar-nav .sidebar-link').forEach((btn) => {
          const text = (btn.textContent || '').toLowerCase();
          btn.style.display = (!q || text.includes(q)) ? '' : 'none';
        });
      });
    }

    const darkModeToggle = document.getElementById('darkModeToggleBtn');
    if (darkModeToggle) {
      const apply = (on) => {
        document.body.classList.toggle('dark-mode', !!on);
        try { localStorage.setItem('adminDarkMode', !!on ? '1' : '0'); } catch (_e) {}
      };
      const stored = localStorage.getItem('adminDarkMode');
      if (stored === '1') apply(true);
      darkModeToggle.addEventListener('click', () => apply(!document.body.classList.contains('dark-mode')));
    }

    window.addEventListener('resize', () => {
      if (window.innerWidth > 940) {
        closeSidebar();
      }
    });

    const cityForm = document.getElementById('cityForm');
    if (cityForm) {
      cityForm.addEventListener('submit', async (event) => {
        event.preventDefault();

        const payload = cityPayloadFromForm();
        if (!payload.name) {
          showToast('Sehir adi zorunludur.', true);
          return;
        }

        try {
          if (state.editingCityId) {
            await requestJson('/api/admin/cities/' + state.editingCityId, {
              method: 'PUT',
              body: JSON.stringify(payload)
            });
            showToast('Sehir guncellendi.');
          } else {
            await requestJson('/api/admin/cities', {
              method: 'POST',
              body: JSON.stringify(payload)
            });
            showToast('Yeni sehir eklendi.');
          }

          await refreshCatalogData();
          await notifyCatalogUpdated();
          resetCityForm();
        } catch (error) {
          showToast(error.message, true);
        }
      });
    }

    const hotelForm = document.getElementById('hotelForm');
    if (hotelForm) {
      hotelForm.addEventListener('submit', async (event) => {
        event.preventDefault();

        const payload = hotelPayloadFromForm();
        if (!payload.name || !payload.cityId) {
          showToast('Otel adi ve sehir secimi zorunludur.', true);
          return;
        }

        try {
          if (state.editingHotelId) {
            await requestJson('/api/admin/hotels/' + state.editingHotelId, {
              method: 'PUT',
              body: JSON.stringify(payload)
            });
            showToast('Otel guncellendi.');
          } else {
            await requestJson('/api/admin/hotels', {
              method: 'POST',
              body: JSON.stringify(payload)
            });
            showToast('Yeni otel eklendi.');
          }

          await refreshCatalogData();
          await notifyCatalogUpdated();
          resetHotelForm();
        } catch (error) {
          showToast(error.message, true);
        }
      });
    }

    const hotelCitySelect = document.getElementById('hotelCitySelect');
    if (hotelCitySelect) {
      hotelCitySelect.addEventListener('change', () => {
        const nextCityId = Number(hotelCitySelect.value || 0);
        state.selectedHotelCityId = nextCityId;
        renderHotelTable();
      });
    }

    const resetCityBtn = document.getElementById('resetCityFormBtn');
    if (resetCityBtn) {
      resetCityBtn.addEventListener('click', () => {
        resetCityForm();
      });
    }

    const resetHotelBtn = document.getElementById('resetHotelFormBtn');
    if (resetHotelBtn) {
      resetHotelBtn.addEventListener('click', () => {
        resetHotelForm();
      });
    }

    const uploadCityImageBtn = document.getElementById('uploadCityImageBtn');
    if (uploadCityImageBtn) {
      uploadCityImageBtn.addEventListener('click', async () => {
        const fileInput = document.getElementById('cityImageFileInput');
        const imageInput = document.getElementById('cityImageInput');
        const statusText = document.getElementById('cityUploadStatusText');
        const file = fileInput && fileInput.files && fileInput.files[0] ? fileInput.files[0] : null;

        if (!file) {
          if (statusText) statusText.textContent = 'Yukleme icin once bir dosya secin.';
          return;
        }

        try {
          if (statusText) statusText.textContent = 'Yukleniyor...';
          const payload = await uploadImage('cities', file);
          if (imageInput) imageInput.value = payload?.file?.path || '';
          if (statusText) statusText.textContent = 'Yukleme tamamlandi: ' + (payload?.file?.path || '-');
          showToast('Sehir reg gorseli yuklendi.');
        } catch (error) {
          if (statusText) statusText.textContent = error.message;
          showToast(error.message, true);
        }
      });
    }

    const uploadCityHeroImageBtn = document.getElementById('uploadCityHeroImageBtn');
    if (uploadCityHeroImageBtn) {
      uploadCityHeroImageBtn.addEventListener('click', async () => {
        const fileInput = document.getElementById('cityHeroImageFileInput');
        const heroInput = document.getElementById('cityHeroImageInput');
        const statusText = document.getElementById('cityHeroUploadStatusText');
        const file = fileInput && fileInput.files && fileInput.files[0] ? fileInput.files[0] : null;

        if (!file) {
          if (statusText) statusText.textContent = 'Yukleme icin once bir dosya secin.';
          return;
        }

        try {
          if (statusText) statusText.textContent = 'Yukleniyor...';
          const payload = await uploadImage('cities', file);
          if (heroInput) heroInput.value = payload?.file?.path || '';
          if (statusText) statusText.textContent = 'Yukleme tamamlandi: ' + (payload?.file?.path || '-');
          showToast('Sehir hero gorseli yuklendi.');
        } catch (error) {
          if (statusText) statusText.textContent = error.message;
          showToast(error.message, true);
        }
      });
    }

    const uploadHotelImageBtn = document.getElementById('uploadHotelImageBtn');
    if (uploadHotelImageBtn) {
      uploadHotelImageBtn.addEventListener('click', async () => {
        const fileInput = document.getElementById('hotelImageFileInput');
        const imageInput = document.getElementById('hotelImageInput');
        const statusText = document.getElementById('hotelUploadStatusText');
        const file = fileInput && fileInput.files && fileInput.files[0] ? fileInput.files[0] : null;

        if (!file) {
          if (statusText) statusText.textContent = 'Yukleme icin once bir dosya secin.';
          return;
        }

        try {
          if (statusText) statusText.textContent = 'Yukleniyor...';
          const payload = await uploadImage('hotels', file);
          if (imageInput) imageInput.value = payload?.file?.path || '';
          if (statusText) statusText.textContent = 'Yukleme tamamlandi: ' + (payload?.file?.path || '-');
          showToast('Otel gorseli yuklendi.');
        } catch (error) {
          if (statusText) statusText.textContent = error.message;
          showToast(error.message, true);
        }
      });
    }

    const refreshBtn = document.getElementById('refreshAdminDataBtn');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', async () => {
        try {
          await Promise.all([refreshCatalogData(), refreshDashboardInsights()]);
          setApiStatus('online', 'API bagli');
          showToast('Katalog verisi yenilendi.');
        } catch (error) {
          setApiStatus('offline', 'API ulasilamiyor');
          showToast(error.message, true);
        }
      });
    }

    const apiIntegrationForm = document.getElementById('apiIntegrationForm');
    if (apiIntegrationForm) {
      apiIntegrationForm.addEventListener('submit', async (event) => {
        event.preventDefault();

        const payload = apiIntegrationPayloadFromForm();
        if (!payload.name || !payload.baseUrl) {
          showToast('API adi ve base URL zorunludur.', true);
          return;
        }

        try {
          if (state.editingIntegrationId) {
            const response = await requestJson('/api/admin/integrations/' + state.editingIntegrationId, {
              method: 'PUT',
              body: JSON.stringify(payload)
            });
            if (response?.integration) {
              state.integrations = state.integrations.map((item) => Number(item.id) === state.editingIntegrationId ? response.integration : item);
            }
            showToast('API guncellendi.');
          } else {
            const response = await requestJson('/api/admin/integrations', {
              method: 'POST',
              body: JSON.stringify(payload)
            });
            if (response?.integration) {
              state.integrations = [response.integration, ...state.integrations];
            }
            showToast('API baglandi.');
          }

          renderAll();
          resetApiIntegrationForm();
        } catch (error) {
          showToast(error.message, true);
        }
      });
    }

    const resetApiBtn = document.getElementById('resetApiIntegrationFormBtn');
    if (resetApiBtn) {
      resetApiBtn.addEventListener('click', () => {
        resetApiIntegrationForm();
      });
    }

    const checkAllApisBtn = document.getElementById('checkAllApisBtn');
    if (checkAllApisBtn) {
      checkAllApisBtn.addEventListener('click', async () => {
        try {
          await checkAllIntegrations();
        } catch (error) {
          showToast(error.message, true);
        }
      });
    }

    const refreshApiModulesBtn = document.getElementById('refreshApiModulesBtn');
    if (refreshApiModulesBtn) {
      refreshApiModulesBtn.addEventListener('click', async () => {
        try {
          await refreshApiModules();
          showToast('API modulleri yenilendi.');
        } catch (error) {
          showToast(error.message, true);
        }
      });
    }

    const sidebarCheckApisBtn = document.getElementById('sidebarCheckApisBtn');
    if (sidebarCheckApisBtn) {
      sidebarCheckApisBtn.addEventListener('click', async () => {
        try {
          await checkAllIntegrations();
        } catch (error) {
          showToast(error.message, true);
        }
      });
    }

    const refreshUsersBtn = document.getElementById('refreshUsersBtn');
    if (refreshUsersBtn) {
      refreshUsersBtn.addEventListener('click', async () => {
        try {
          await refreshUsersData();
          showToast('Kullanici listesi yenilendi.');
        } catch (error) {
          showToast(error.message, true);
        }
      });
    }

    const sidebarRefreshUsersBtn = document.getElementById('sidebarRefreshUsersBtn');
    if (sidebarRefreshUsersBtn) {
      sidebarRefreshUsersBtn.addEventListener('click', async () => {
        try {
          await refreshUsersData();
          showToast('Kullanici ozeti yenilendi.');
        } catch (error) {
          showToast(error.message, true);
        }
      });
    }

    const roleSelect = document.getElementById('userRoleSelect');
    if (roleSelect) {
      roleSelect.addEventListener('change', () => {
        syncPermissionLockByRole();
      });
    }

    const resetUserAccessFormBtn = document.getElementById('resetUserAccessFormBtn');
    if (resetUserAccessFormBtn) {
      resetUserAccessFormBtn.addEventListener('click', () => {
        resetUserAccessForm();
      });
    }

    const userAccessForm = document.getElementById('userAccessForm');
    if (userAccessForm) {
      userAccessForm.addEventListener('submit', async (event) => {
        event.preventDefault();

        if (!canCurrentUserManageAccess()) {
          showToast('Yetki atamasi sadece patron kullaniciya aciktir.', true);
          return;
        }

        const targetUserId = Number(document.getElementById('userAccessUserIdInput')?.value || 0);
        if (!targetUserId) {
          showToast('Once tablodan bir kullanici secin.', true);
          return;
        }

        const role = normalizeUserRole(document.getElementById('userRoleSelect')?.value, USER_ROLES.KULLANICI);
        const sidebarPermissions = role === USER_ROLES.PATRON
          ? SIDEBAR_PERMISSION_KEYS.slice()
          : readSidebarPermissionsFromForm();

        try {
          await requestJson('/api/admin/users/' + targetUserId + '/access', {
            method: 'PUT',
            body: JSON.stringify({
              role,
              sidebarPermissions
            })
          });

          await refreshUsersData();

          if (state.currentUser && Number(state.currentUser.id) === targetUserId) {
            await loadCurrentAdminProfile();
          }

          showToast('Kullanici yetkileri kaydedildi.');
        } catch (error) {
          showToast(error.message, true);
        }
      });
    }
  }

  async function initializeAdminPage() {
    initCityPalette();
    initCityRegionSelectionToggle();
    bindPanelNavigation();
    bindCityTableActions();
    bindHotelTableActions();
    bindApiModuleActions();
    bindApiTableActions();
    bindUsersTableActions();
    bindForms();

    resetCityForm();
    resetHotelForm();
    resetApiIntegrationForm();
    resetUserAccessForm();

    try {
      await loadCurrentAdminProfile();
      if (!isAdminRole(state.currentUser?.role)) {
        window.location.href = '/admin?denied=1';
        return;
      }
      await Promise.all([refreshCatalogData(), refreshApiModules(), refreshApiIntegrations(), refreshUsersData(), refreshDashboardInsights(), refreshActivityLogs(), refreshReservationsData(), refreshContactRequestsData()]);
      bindReservationPanel();
      bindContactPanel();
      startDashboardLiveTimer();
      setApiStatus('online', 'API bagli');
    } catch (error) {
      setApiStatus('offline', 'API ulasilamiyor');
      showToast(error.message, true);
    }
  }

  window.addEventListener('beforeunload', () => {
    if (state.dashboardTimerId) {
      window.clearInterval(state.dashboardTimerId);
      state.dashboardTimerId = 0;
    }
  });

  window.addEventListener('DOMContentLoaded', initializeAdminPage);
})();
