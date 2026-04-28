// Tema (Açık/Karanlık Mod) Seçicisini Başlat


const initThemeToggle = () => {
    // Tema butonunu ve localStorage'dan kaydedilen temayı al
    const themeToggle = document.getElementById('themeToggle');
    const savedTheme = localStorage.getItem('theme') || 'light'; // Varsayılan: açık mod
    
    // Eğer önceden karanlık mod seçilmişse, onu uygula
    if (savedTheme === 'dark') {
        document.body.classList.add('dark-mode'); // Body'ye dark-mode sınıfı ekle
        if (themeToggle) themeToggle.textContent = '☀️'; // Buton ikonunu güneş yap
    }
    
    // Tema butonu tıklanırsa tema değiştir
    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            document.body.classList.toggle('dark-mode'); // Tema sınıfını aç/kapat
            const isDarkMode = document.body.classList.contains('dark-mode');
            localStorage.setItem('theme', isDarkMode ? 'dark' : 'light'); // Temayı localStorage'a kaydet
            themeToggle.textContent = isDarkMode ? '☀️' : '🌙'; // İkonu güncelle
        });
    }
};

const getStoredUser = () => {
  try {
    const raw = localStorage.getItem('user');
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
};

const getAuthSession = () => {
  try {
    const raw = localStorage.getItem('authSession');
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
};

const AUTH_TOKENS_STORAGE_KEY = 'authTokens';

const getAuthTokens = () => {
  try {
    const raw = localStorage.getItem(AUTH_TOKENS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
};

const getAccessToken = () => {
  const tokens = getAuthTokens();
  if (tokens && tokens.accessToken) {
    return String(tokens.accessToken);
  }

  const session = getAuthSession();
  if (session && session.token) {
    return String(session.token);
  }

  return '';
};

const ADMIN_ROLES = ['patron', 'ust_yetkili', 'alt_yetkili'];

const isAdminRole = (role) => {
  const safeRole = String(role || '').trim().toLowerCase();
  return ADMIN_ROLES.includes(safeRole);
};

const SAVED_SEARCHES_KEY = 'savedSearches';

const ACCOUNT_COUPONS = [
  {
    code: 'ERKEN20',
    title: 'Erken Rezervasyon %20',
    detail: 'Secili sehir otellerinde ekstra indirim.'
  },
  {
    code: 'TRAVEL500',
    title: '20.000 TL Uzeri 500 TL',
    detail: 'Kampanya merkezi kodu, sepet asamasinda uygulanir.'
  },
  {
    code: 'UYE8',
    title: 'Uye Fiyati Avantaji',
    detail: 'Uye girisi yapan kullanicilar icin otomatik fiyat guncellemesi.'
  }
];

const escapeUiHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

function getSavedSearches() {
  try {
    const raw = localStorage.getItem(SAVED_SEARCHES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (error) {
    return [];
  }
}

function setSavedSearches(list) {
  const safeList = Array.isArray(list) ? list : [];
  const normalized = [];

  safeList.forEach((item) => {
    const text = String(item || '').trim();
    if (!text) return;
    const exists = normalized.some((current) => normalizeText(current) === normalizeText(text));
    if (!exists) normalized.push(text);
  });

  localStorage.setItem(SAVED_SEARCHES_KEY, JSON.stringify(normalized.slice(0, 12)));
}

function ensureSavedSearchesSeeded() {
  const saved = getSavedSearches();
  if (saved.length > 0) return saved;

  const recent = getRecentSearches();
  if (recent.length > 0) {
    setSavedSearches(recent);
    return getSavedSearches();
  }

  return [];
}

function getUserMenuIconSvg(action) {
  switch (action) {
    case 'profile':
      return '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.8"></circle><path d="M4 19c1.9-3.3 4.6-5 8-5s6.1 1.7 8 5"></path></svg>';
    case 'reservations':
      return '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5.5" width="17" height="15" rx="2"></rect><path d="M7 3.5v4M17 3.5v4M3.5 10.5h17"></path></svg>';
    case 'favorites':
      return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.2l-1.1-1C6 14.8 3.2 12.3 3.2 8.9c0-2.3 1.8-4.1 4.1-4.1 1.4 0 2.8.7 3.7 1.8.9-1.1 2.3-1.8 3.7-1.8 2.3 0 4.1 1.8 4.1 4.1 0 3.4-2.8 5.9-7.7 10.3L12 20.2z"></path></svg>';
    case 'coupons':
      return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8.5h16v7H4z"></path><path d="M8.5 8.5V6h7v2.5M12 8.5v7"></path></svg>';
    case 'saved-searches':
      return '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="5.5"></circle><path d="M15 15l5 5"></path></svg>';
    case 'admin':
      return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l7.5 3v6c0 4.6-3.2 8.5-7.5 9.7C7.7 20.5 4.5 16.6 4.5 12V6L12 3z"></path><path d="M9.1 12.5l1.9 1.9 3.9-4.1"></path></svg>';
    case 'logout':
      return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 17l5-5-5-5"></path><path d="M20 12H9"></path><path d="M4 4h5v16H4z"></path></svg>';
    default:
      return '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"></circle></svg>';
  }
}

function ensureAccountFeatureModal() {
  let modal = document.getElementById('accountFeatureModal');
  if (modal) return modal;

  modal = document.createElement('div');
  modal.id = 'accountFeatureModal';
  modal.className = 'modal';
  modal.innerHTML = ''
    + '<div class="modal-content account-feature-modal-content">'
    + '  <span class="close" id="closeAccountFeatureModal">&times;</span>'
    + '  <h2 id="accountFeatureModalTitle">Hesabim</h2>'
    + '  <div id="accountFeatureModalBody" class="account-feature-modal-body"></div>'
    + '</div>';

  document.body.appendChild(modal);

  const closeBtn = document.getElementById('closeAccountFeatureModal');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      modal.style.display = 'none';
    });
  }

  modal.addEventListener('click', (event) => {
    if (event.target === modal) {
      modal.style.display = 'none';
    }
  });

  return modal;
}

function closeAccountFeatureModal() {
  const modal = document.getElementById('accountFeatureModal');
  if (modal) modal.style.display = 'none';
}

function openAccountFeatureModal(title, bodyHtml) {
  const modal = ensureAccountFeatureModal();
  const titleEl = document.getElementById('accountFeatureModalTitle');
  const bodyEl = document.getElementById('accountFeatureModalBody');

  if (titleEl) titleEl.textContent = title;
  if (bodyEl) bodyEl.innerHTML = bodyHtml;

  modal.style.display = 'block';
}

function getReservationCountForEmail(email) {
  if (!email) return 0;

  try {
    const reservations = JSON.parse(localStorage.getItem('reservations') || '[]');
    if (!Array.isArray(reservations)) return 0;
    return reservations.filter((item) => String(item?.guestEmail || '').toLowerCase() === String(email).toLowerCase()).length;
  } catch (error) {
    return 0;
  }
}

function formatDisplayDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('tr-TR');
}

function openProfileOverview() {
  const session = getAuthSession();
  if (!session || !session.email) {
    openLoginModal();
    return;
  }

  const storedUser = getStoredUser() || {};
  const activeName = session.name || storedUser.name || session.email;
  const reservationCount = getReservationCountForEmail(session.email);

  const bodyHtml = ''
    + '<div class="account-feature-section">'
    + '  <p class="account-feature-note">Hesap bilgilerin ve hizli profil ayarlari.</p>'
    + '  <div class="account-profile-grid">'
    + '    <div><strong>Ad Soyad:</strong><span>' + escapeUiHtml(activeName) + '</span></div>'
    + '    <div><strong>E-posta:</strong><span>' + escapeUiHtml(session.email) + '</span></div>'
    + '    <div><strong>Uyelik Tarihi:</strong><span>' + escapeUiHtml(formatDisplayDate(storedUser.registeredAt)) + '</span></div>'
    + '    <div><strong>Aktif Rezervasyon:</strong><span>' + reservationCount + '</span></div>'
    + '  </div>'
    + '</div>'
    + '<div class="account-feature-section">'
    + '  <label for="profileQuickNameInput">Gorunen ad</label>'
    + '  <div class="account-inline-row">'
    + '    <input type="text" id="profileQuickNameInput" value="' + escapeUiHtml(activeName) + '" maxlength="60">'
    + '    <button type="button" id="saveProfileQuickBtn" class="btn-book">Kaydet</button>'
    + '  </div>'
    + '  <p id="profileQuickFeedback" class="account-feature-feedback"></p>'
    + '</div>';

  openAccountFeatureModal('Profilim', bodyHtml);

  const saveBtn = document.getElementById('saveProfileQuickBtn');
  const nameInput = document.getElementById('profileQuickNameInput');
  const feedback = document.getElementById('profileQuickFeedback');

  if (saveBtn && nameInput) {
    saveBtn.addEventListener('click', () => {
      const nextName = String(nameInput.value || '').trim();
      if (!nextName) {
        if (feedback) feedback.textContent = 'Ad alani bos birakilamaz.';
        return;
      }

      const nextStoredUser = {
        ...(storedUser || {}),
        name: nextName,
        email: session.email,
        registeredAt: storedUser.registeredAt || new Date().toISOString()
      };

      localStorage.setItem('user', JSON.stringify(nextStoredUser));
      localStorage.setItem('authSession', JSON.stringify({
        userId: session.userId,
        email: session.email,
        name: nextName,
        loggedInAt: session.loggedInAt || new Date().toISOString()
      }));

      initAuthButtons();
      if (feedback) feedback.textContent = 'Profil bilgisi guncellendi.';
    });
  }
}

function openCouponsOverview() {
  const bodyHtml = ''
    + '<div class="account-feature-section">'
    + '  <p class="account-feature-note">Kullanimdaki kampanya kodlari asagida hazir.</p>'
    + '  <div class="account-coupon-list">'
    + ACCOUNT_COUPONS.map((coupon) => {
      return ''
        + '<article class="account-coupon-card">'
        + '  <h3>' + escapeUiHtml(coupon.code) + '</h3>'
        + '  <p>' + escapeUiHtml(coupon.title) + '</p>'
        + '  <small>' + escapeUiHtml(coupon.detail) + '</small>'
        + '  <button type="button" class="btn-secondary js-copy-account-coupon" data-coupon-code="' + escapeUiHtml(coupon.code) + '">Kodu Kopyala</button>'
        + '</article>';
    }).join('')
    + '  </div>'
    + '  <button type="button" id="openCampaignCenterFromMenuBtn" class="btn-book">Kampanya Merkezine Git</button>'
    + '</div>';

  openAccountFeatureModal('Kuponlarim', bodyHtml);

  document.querySelectorAll('.js-copy-account-coupon').forEach((btn) => {
    btn.addEventListener('click', () => {
      const code = btn.getAttribute('data-coupon-code') || '';
      if (!code) return;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(code);
      }
      alert('Kupon kodu kopyalandi: ' + code);
    });
  });

  const openCampaignCenterFromMenuBtn = document.getElementById('openCampaignCenterFromMenuBtn');
  if (openCampaignCenterFromMenuBtn) {
    openCampaignCenterFromMenuBtn.addEventListener('click', () => {
      const center = document.getElementById('campaignCenter');
      if (center) {
        closeAccountFeatureModal();
        center.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else {
        window.location.href = 'index.html#campaignCenter';
      }
    });
  }
}

function renderSavedSearchListHtml(list) {
  if (!Array.isArray(list) || list.length === 0) {
    return '<p class="account-feature-note">Henuz kayitli arama yok. Bir arama ekleyerek baslayabilirsin.</p>';
  }

  return ''
    + '<div class="saved-search-list">'
    + list.map((item) => {
      const safeItem = escapeUiHtml(item);
      return ''
        + '<div class="saved-search-item">'
        + '  <span>' + safeItem + '</span>'
        + '  <div class="saved-search-item-actions">'
        + '    <button type="button" class="btn-secondary js-open-saved-search" data-saved-value="' + safeItem + '">Ara</button>'
        + '    <button type="button" class="btn-secondary js-remove-saved-search" data-saved-value="' + safeItem + '">Sil</button>'
        + '  </div>'
        + '</div>';
    }).join('')
    + '</div>';
}

function searchFromSavedValue(value) {
  const searchValue = String(value || '').trim();
  if (!searchValue) return;

  const matchedCity = resolveCitySlug(searchValue);
  if (matchedCity) {
    const params = new URLSearchParams({ city: matchedCity, q: searchValue });
    window.location.href = 'city.html?' + params.toString();
    return;
  }

  const destinationEl = document.getElementById('destination');
  if (destinationEl) {
    destinationEl.value = searchValue;
    destinationEl.focus();
    closeAccountFeatureModal();
  } else {
    window.location.href = 'index.html?q=' + encodeURIComponent(searchValue);
  }
}

function openSavedSearchesOverview() {
  ensureSavedSearchesSeeded();
  const destinationEl = document.getElementById('destination');
  const currentDestination = destinationEl ? String(destinationEl.value || '').trim() : '';

  const bodyHtml = ''
    + '<div class="account-feature-section">'
    + '  <p class="account-feature-note">Kaydettigin aramalari tek tikla tekrar kullan.</p>'
    + '  <div class="saved-search-create-row">'
    + '    <input type="text" id="newSavedSearchInput" placeholder="Ornek: Antalya veya Konyaalti" value="' + escapeUiHtml(currentDestination) + '">'
    + '    <button type="button" id="addSavedSearchBtn" class="btn-book">Kaydet</button>'
    + '  </div>'
    + '  <div class="saved-search-utility-row">'
    + '    <button type="button" id="importRecentSearchesBtn" class="btn-secondary">Son Aramalari Aktar</button>'
    + '    <button type="button" id="clearSavedSearchesBtn" class="btn-secondary">Tumunu Temizle</button>'
    + '  </div>'
    + '  <div id="savedSearchListWrap">' + renderSavedSearchListHtml(getSavedSearches()) + '</div>'
    + '</div>';

  openAccountFeatureModal('Kayitli Aramalarim', bodyHtml);

  const listWrap = document.getElementById('savedSearchListWrap');
  const addBtn = document.getElementById('addSavedSearchBtn');
  const input = document.getElementById('newSavedSearchInput');
  const importRecentSearchesBtn = document.getElementById('importRecentSearchesBtn');
  const clearSavedSearchesBtn = document.getElementById('clearSavedSearchesBtn');

  const refreshSavedSearchList = () => {
    if (!listWrap) return;
    listWrap.innerHTML = renderSavedSearchListHtml(getSavedSearches());
  };

  if (addBtn && input) {
    addBtn.addEventListener('click', () => {
      const value = String(input.value || '').trim();
      if (!value) return;
      setSavedSearches([value, ...getSavedSearches()]);
      input.value = '';
      refreshSavedSearchList();
    });
  }

  if (importRecentSearchesBtn) {
    importRecentSearchesBtn.addEventListener('click', () => {
      const recent = getRecentSearches();
      if (!recent.length) {
        alert('Aktarilacak son arama bulunamadi.');
        return;
      }
      setSavedSearches([...recent, ...getSavedSearches()]);
      refreshSavedSearchList();
    });
  }

  if (clearSavedSearchesBtn) {
    clearSavedSearchesBtn.addEventListener('click', () => {
      localStorage.removeItem(SAVED_SEARCHES_KEY);
      refreshSavedSearchList();
    });
  }

  if (listWrap) {
    listWrap.addEventListener('click', (event) => {
      const openBtn = event.target.closest('.js-open-saved-search');
      if (openBtn) {
        const value = openBtn.getAttribute('data-saved-value') || '';
        searchFromSavedValue(value);
        return;
      }

      const removeBtn = event.target.closest('.js-remove-saved-search');
      if (removeBtn) {
        const value = removeBtn.getAttribute('data-saved-value') || '';
        const next = getSavedSearches().filter((item) => normalizeText(item) !== normalizeText(value));
        setSavedSearches(next);
        refreshSavedSearchList();
      }
    });
  }
}

const closeUserMenu = () => {
  const userDropdownMenu = document.getElementById('userDropdownMenu');
  const userMenuTrigger = document.getElementById('userMenuTrigger');

  if (userDropdownMenu) {
    userDropdownMenu.classList.remove('show');
  }

  if (userMenuTrigger) {
    userMenuTrigger.setAttribute('aria-expanded', 'false');
  }
};

async function requestAuthGet(pathname) {
  const accessToken = getAccessToken();
  const headers = {
    'Content-Type': 'application/json'
  };
  if (accessToken) {
    headers.Authorization = 'Bearer ' + accessToken;
  }

  const response = await fetch(buildApiUrl(pathname), {
    method: 'GET',
    headers
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.message || 'Islem basarisiz.');
    error.status = response.status;
    throw error;
  }

  return data;
}

async function fetchCurrentUserProfile() {
  const accessToken = getAccessToken();
  if (!accessToken) return null;

  try {
    const payload = await requestAuthGet('/api/auth/me');
    return payload?.user || null;
  } catch (_error) {
    return null;
  }
}

async function syncAdminMenuEntry() {
  const menu = document.getElementById('userDropdownMenu');
  if (!menu) return;

  const existing = document.getElementById('openAdminLoginMenuBtn');
  if (existing) existing.remove();

  let session = getAuthSession();
  if (!session || (!session.userId && !session.email)) return;

  const profile = await fetchCurrentUserProfile();
  if (!profile) return;

  const role = String(profile.role || '').trim().toLowerCase();
  session = {
    userId: profile.id || session.userId,
    email: profile.email || session.email,
    name: profile.name || session.name,
    loggedInAt: session.loggedInAt || new Date().toISOString()
  };
  localStorage.setItem('authSession', JSON.stringify(session));

  if (!isAdminRole(role)) return;

  const separator = menu.querySelector('.user-dropdown-separator');
  const html = '<a href="admin-login.html" id="openAdminLoginMenuBtn" class="user-dropdown-item user-dropdown-admin" data-menu-action="admin"><span class="user-dropdown-icon" aria-hidden="true">'
    + getUserMenuIconSvg('admin') + '</span><span>Admin Girisi</span></a>';

  if (separator) {
    separator.insertAdjacentHTML('beforebegin', html);
    return;
  }

  menu.insertAdjacentHTML('beforeend', html);
}

// Kullanıcı oturum durumuna göre header butonlarını güncelle
const initAuthButtons = () => {
  const authButtonsContainer = document.getElementById('authButtons');
  if (!authButtonsContainer) return;

  const session = getAuthSession();

  if (session && session.email) {
    const displayName = session.name || session.email;
    const safeDisplayName = escapeUiHtml(displayName);
    authButtonsContainer.innerHTML = `
      <div class="user-menu" id="userMenu">
        <button id="userMenuTrigger" class="user-menu-trigger" type="button" aria-expanded="false">
          <span class="user-menu-avatar">⦿</span>
          <span class="user-menu-name">${safeDisplayName}</span>
          <span class="user-menu-caret">▾</span>
        </button>
        <div id="userDropdownMenu" class="user-dropdown-menu" role="menu" aria-label="Kullanıcı Menüsü">
          <button type="button" class="user-dropdown-item" id="openProfileMenuBtn" data-menu-action="profile"><span class="user-dropdown-icon" aria-hidden="true">${getUserMenuIconSvg('profile')}</span><span>Profilim</span></button>
          <a href="reservations.html" class="user-dropdown-item" data-menu-action="reservations"><span class="user-dropdown-icon" aria-hidden="true">${getUserMenuIconSvg('reservations')}</span><span>Rezervasyonlarım</span></a>
          <button type="button" class="user-dropdown-item" id="openWishlistMenuBtn" data-menu-action="favorites"><span class="user-dropdown-icon" aria-hidden="true">${getUserMenuIconSvg('favorites')}</span><span>Beğendiklerim</span></button>
          <button type="button" class="user-dropdown-item" id="openCouponsMenuBtn" data-menu-action="coupons"><span class="user-dropdown-icon" aria-hidden="true">${getUserMenuIconSvg('coupons')}</span><span>Kuponlarım</span></button>
          <button type="button" class="user-dropdown-item" id="openSavedSearchesMenuBtn" data-menu-action="saved-searches"><span class="user-dropdown-icon" aria-hidden="true">${getUserMenuIconSvg('saved-searches')}</span><span>Kayıtlı Aramalarım</span></button>
          <div class="user-dropdown-separator"></div>
          <button id="logoutBtn" class="user-dropdown-item user-dropdown-logout" type="button" data-menu-action="logout"><span class="user-dropdown-icon" aria-hidden="true">${getUserMenuIconSvg('logout')}</span><span>Çıkış Yap</span></button>
        </div>
      </div>
    `;

    const userMenuTrigger = document.getElementById('userMenuTrigger');
    const userDropdownMenu = document.getElementById('userDropdownMenu');

    if (userMenuTrigger && userDropdownMenu) {
      userMenuTrigger.addEventListener('click', (event) => {
        event.stopPropagation();
        const willOpen = !userDropdownMenu.classList.contains('show');
        closeUserMenu();
        if (willOpen) {
          userDropdownMenu.classList.add('show');
          userMenuTrigger.setAttribute('aria-expanded', 'true');
        }
      });

      userDropdownMenu.addEventListener('click', (event) => {
        event.stopPropagation();
      });
    }

    const openProfileMenuBtn = document.getElementById('openProfileMenuBtn');
    if (openProfileMenuBtn) {
      openProfileMenuBtn.addEventListener('click', () => {
        closeUserMenu();
        openProfileOverview();
      });
    }

    const openWishlistMenuBtn = document.getElementById('openWishlistMenuBtn');
    if (openWishlistMenuBtn) {
      openWishlistMenuBtn.addEventListener('click', () => {
        closeUserMenu();
        document.dispatchEvent(new CustomEvent('wishlist:open'));
      });
    }

    const openCouponsMenuBtn = document.getElementById('openCouponsMenuBtn');
    if (openCouponsMenuBtn) {
      openCouponsMenuBtn.addEventListener('click', () => {
        closeUserMenu();
        openCouponsOverview();
      });
    }

    const openSavedSearchesMenuBtn = document.getElementById('openSavedSearchesMenuBtn');
    if (openSavedSearchesMenuBtn) {
      openSavedSearchesMenuBtn.addEventListener('click', () => {
        closeUserMenu();
        openSavedSearchesOverview();
      });
    }

    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', async () => {
        const session = getAuthSession();
        if (session && (session.userId || session.email)) {
          try {
            await requestAuthApi('/api/auth/logout', {});
          } catch (error) {
            console.warn('Logout API cagrisinda hata olustu.', error);
          }
        }

        localStorage.removeItem('authTokens');
        localStorage.removeItem('authSession');
        alert('Çıkış yapıldı!');
        closeUserMenu();
        initAuthButtons();
      });
    }

    syncAdminMenuEntry();
  } else {
    authButtonsContainer.innerHTML = `
      <div class="auth-links">
        <button id="openLoginModalBtn" class="btn-login" type="button">Giriş Yap</button>
        <button id="openSignupModalBtn" class="btn-signup" type="button">Üye Ol</button>
      </div>
    `;

    const openLoginModalBtn = document.getElementById('openLoginModalBtn');
    if (openLoginModalBtn) {
      openLoginModalBtn.addEventListener('click', openLoginModal);
    }

    const openSignupModalBtn = document.getElementById('openSignupModalBtn');
    if (openSignupModalBtn) {
      openSignupModalBtn.addEventListener('click', openSignupModal);
    }
  }
};

  // Otel verilerini window.HOTELS_BY_CITY'den al (hotels.js'den geliyor)
  const HOTEL_DATA = (typeof window !== "undefined" && window.HOTELS_BY_CITY)
    ? window.HOTELS_BY_CITY
    : {};

const CATALOG_REFRESH_STORAGE_KEY = 'catalogUpdatedAt';
let lastCatalogSyncAt = 0;

const LIVE_PRICE_CITY_FACTOR = {
  antalya: 1.21,
  bodrum: 1.24,
  bursa: 1.12,
  diyarbakir: 1.08,
  izmir: 1.22,
  mardin: 1.1,
  mugla: 1.23,
  trabzon: 1.13,
  van: 1.09,
  istanbul: 1.27,
  ankara: 1.16,
  gaziantep: 1.11
};

const LIVE_PRICE_SEASON_FACTOR = {
  1: 0.96,
  2: 0.95,
  3: 0.98,
  4: 1,
  5: 1.05,
  6: 1.12,
  7: 1.18,
  8: 1.2,
  9: 1.09,
  10: 1.03,
  11: 0.99,
  12: 1.04
};

let activeHotelsCitySlug = '';
let livePriceUpdatedLabel = '';

// Seçilen paketin fiyatını saklamak için global değişken
let selectedPackagePrice = 0;
let reservationEditingIndex = -1;

const ROOM_MULTIPLIERS = {
  Standard: 1,
  Deluxe: 1.3,
  Suite: 1.6,
  Villa: 2
};

function getPathCitySlug() {
  const page = window.location.pathname;
  if (page.includes('antalya')) return 'antalya';
  if (page.includes('bodrum')) return 'bodrum';
  if (page.includes('bursa')) return 'bursa';
  if (page.includes('diyarbakir')) return 'diyarbakir';
  if (page.includes('izmir')) return 'izmir';
  if (page.includes('mardin')) return 'mardin';
  if (page.includes('mugla')) return 'mugla';
  if (page.includes('trabzon')) return 'trabzon';
  if (page.includes('van')) return 'van';
  if (page.includes('istanbul')) return 'istanbul';
  if (page.includes('ankara')) return 'ankara';
  if (page.includes('gaziantep')) return 'gaziantep';
  return '';
}

function getLivePrice(basePrice, citySlug, index) {
  const safeBasePrice = Number(basePrice) || 0;
  if (safeBasePrice <= 0) return 0;

  const now = new Date();
  const month = now.getMonth() + 1;
  const day = now.getDay();
  const hour = now.getHours();

  const cityFactor = LIVE_PRICE_CITY_FACTOR[citySlug] || 1.12;
  const seasonFactor = LIVE_PRICE_SEASON_FACTOR[month] || 1;
  const weekendFactor = day === 5 || day === 6 ? 1.06 : 1;
  const hourFactor = hour >= 20 || hour <= 2 ? 1.02 : 1;
  const demandWave = 1 + ((((now.getDate() + (index * 3)) % 9) - 4) * 0.01);

  const computed = safeBasePrice * cityFactor * seasonFactor * weekendFactor * hourFactor * demandWave;
  return Math.max(350, Math.round(computed / 10) * 10);
}

function parseCurrencyValue(value) {
  if (!value) return 0;
  const normalized = String(value).replace(/[^0-9,.-]/g, '').replace(/\./g, '').replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatTRY(value) {
  const amount = Number(value) || 0;
  return '₺' + amount.toLocaleString('tr-TR');
}

function getNightCount(checkInValue, checkOutValue) {
  const checkInDate = new Date(checkInValue);
  const checkOutDate = new Date(checkOutValue);
  if (!(checkInDate instanceof Date) || Number.isNaN(checkInDate.getTime())) return 0;
  if (!(checkOutDate instanceof Date) || Number.isNaN(checkOutDate.getTime())) return 0;
  if (checkOutDate <= checkInDate) return 0;
  return Math.ceil((checkOutDate - checkInDate) / (1000 * 60 * 60 * 24));
}

// Rezervasyon modalını aç ve form alanlarını temizle
function openBooking(hotelName, price) {
  const session = getAuthSession();
  if (!session || !session.email) {
    alert('Rezervasyon için önce giriş yapmalısınız.');
    openLoginModal();
    return;
  }

    // Seçilen paket fiyatını kaydet
    selectedPackagePrice = price;
    const resortNameField = document.getElementById('resortName');
    
    if (resortNameField) {
        // Form alanlarını doldur/temizle
        resortNameField.value = hotelName; // Otel adını yazı alanına koy
        document.getElementById('bookingCheckIn').value = ''; // Giriş tarihi temizle
        document.getElementById('bookingCheckOut').value = ''; // Çıkış tarihi temizle
        document.getElementById('bookingGuests').value = '1'; // Varsayılan konuk sayısı
        document.getElementById('roomType').value = ''; // Oda türü temizle
        document.getElementById('guestName').value = ''; // Konuk adı temizle
        document.getElementById('guestEmail').value = ''; // E-posta temizle
        document.getElementById('guestPhone').value = ''; // Telefon temizle
        document.getElementById('specialRequests').value = ''; // Özel istekler temizle
        updateTotalPrice(); // Toplam fiyatı güncelle
        
        // Rezervasyon modalını göster
        const bookingModal = document.getElementById('bookingModal');
        if (bookingModal) bookingModal.style.display = 'block';
    }
}

// Rezervasyon modalını kapat
function closeModal() {
    const bookingModal = document.getElementById('bookingModal');
    if (bookingModal) bookingModal.style.display = 'none'; // Modal'ı gizle
}

function openLoginModal() {
  const loginModal = document.getElementById('loginModal');
  if (!loginModal) return;

  closeUserMenu();
  closeSignupModal();
  loginModal.style.display = 'block';
  const emailInput = document.getElementById('loginEmail');
  if (emailInput) emailInput.focus();
}

function closeLoginModal() {
  const loginModal = document.getElementById('loginModal');
  if (!loginModal) return;

  loginModal.style.display = 'none';
}

function openSignupModal() {
  const signupModal = document.getElementById('signupModal');
  if (!signupModal) return;

  closeUserMenu();
  closeLoginModal();
  signupModal.style.display = 'block';
  const nameInput = document.getElementById('signupName');
  if (nameInput) nameInput.focus();
}

function closeSignupModal() {
  const signupModal = document.getElementById('signupModal');
  if (!signupModal) return;

  signupModal.style.display = 'none';
}

async function requestAuthApi(pathname, payload) {
  const accessToken = getAccessToken();
  const headers = {
    'Content-Type': 'application/json'
  };
  if (accessToken) {
    headers.Authorization = 'Bearer ' + accessToken;
  }

  const response = await fetch(buildApiUrl(pathname), {
    method: 'POST',
    headers,
    body: JSON.stringify(payload || {})
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.message || 'Islem basarisiz.');
    error.status = response.status;
    throw error;
  }

  return data;
}

function resolveCityHeroImage(city) {
  const explicitHeroImage = String(city?.heroImage || '').trim();
  if (explicitHeroImage) return explicitHeroImage;

  const regionImage = String(city?.image || '').trim();
  if (!regionImage) return 'img/logo.png';

  const converted = regionImage
    .replace(/reg(?=\.[a-zA-Z0-9]+$)/i, 'hero')
    .replace(/-reg(?=\.[a-zA-Z0-9]+$)/i, '-hero')
    .replace(/_reg(?=\.[a-zA-Z0-9]+$)/i, '_hero');

  return converted || regionImage;
}

async function handleLoginSubmit(event) {
  event.preventDefault();

  const email = document.getElementById('loginEmail')?.value?.trim() || '';
  const password = document.getElementById('loginPassword')?.value || '';

  if (!email || !password) {
    alert('Lütfen e-posta ve şifre girin.');
    return;
  }

  const storedUser = getStoredUser();

  const applyLoginState = (user, authPayload) => {
    const nextStoredUser = {
      ...(storedUser || {}),
      id: user.id,
      userId: user.id,
      name: user.name,
      email: user.email,
      registeredAt: user.registeredAt || storedUser?.registeredAt || new Date().toISOString()
    };

    if (storedUser?.password) {
      nextStoredUser.password = storedUser.password;
    }

    localStorage.setItem('user', JSON.stringify(nextStoredUser));
    localStorage.setItem('authTokens', JSON.stringify({
      accessToken: authPayload?.tokens?.accessToken || '',
      refreshToken: authPayload?.tokens?.refreshToken || '',
      tokenType: authPayload?.tokens?.tokenType || 'Bearer',
      expiresIn: authPayload?.tokens?.expiresIn || '',
      loggedInAt: new Date().toISOString()
    }));
    localStorage.setItem('authSession', JSON.stringify({
      userId: user.id,
      email: user.email,
      name: user.name,
      loggedInAt: new Date().toISOString()
    }));

    closeLoginModal();
    initAuthButtons();
    alert('Giriş başarılı.');
  };

  try {
    const payload = await requestAuthApi('/api/auth/login', { email, password });
    if (!payload?.user) {
      throw new Error('Giris yaniti alinmadi.');
    }
    applyLoginState(payload.user, payload);
  } catch (error) {
    if (error.status === 404) {
      alert('Kayıtlı kullanıcı bulunamadı. Önce üye olun.');
      closeLoginModal();
      openSignupModal();
      return;
    }

    const validUser = storedUser && storedUser.email === email && storedUser.password === password;
    if (validUser) {
      applyLoginState({
        id: storedUser.id || storedUser.userId || 0,
        name: storedUser.name,
        email: storedUser.email,
        registeredAt: storedUser.registeredAt
      }, null);
      return;
    }

    alert(error.message || 'E-posta veya şifre hatalı.');
  }
}

async function handleSignupSubmit(event) {
  event.preventDefault();

  const name = document.getElementById('signupName')?.value?.trim() || '';
  const email = document.getElementById('signupEmail')?.value?.trim() || '';
  const password = document.getElementById('signupPassword')?.value || '';

  if (!name || !email || !password) {
    alert('Lütfen tüm alanları doldurun.');
    return;
  }

  if (password.length < 6) {
    alert('Şifre en az 6 karakter olmalıdır.');
    return;
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    alert('Lütfen geçerli bir e-posta adresi girin.');
    return;
  }

  const applySignupState = (user, authPayload) => {
    const userData = {
      id: user.id,
      userId: user.id,
      name: user.name,
      email: user.email,
      password,
      registeredAt: user.registeredAt || new Date().toISOString()
    };

    localStorage.setItem('user', JSON.stringify(userData));
    localStorage.setItem('authTokens', JSON.stringify({
      accessToken: authPayload?.tokens?.accessToken || '',
      refreshToken: authPayload?.tokens?.refreshToken || '',
      tokenType: authPayload?.tokens?.tokenType || 'Bearer',
      expiresIn: authPayload?.tokens?.expiresIn || '',
      loggedInAt: new Date().toISOString()
    }));
    localStorage.setItem('authSession', JSON.stringify({
      userId: user.id,
      email: user.email,
      name: user.name,
      loggedInAt: new Date().toISOString()
    }));

    closeSignupModal();
    initAuthButtons();
    alert('Hesabınız oluşturuldu ve giriş yapıldı.');
  };

  try {
    const payload = await requestAuthApi('/api/auth/register', { name, email, password });
    if (!payload?.user) {
      throw new Error('Kayit yaniti alinmadi.');
    }
    applySignupState(payload.user, payload);
  } catch (error) {
    if (error.status === 409) {
      alert('Bu e-posta adresi zaten kullanılıyor.');
      return;
    }

    const userData = {
      name,
      email,
      password,
      registeredAt: new Date().toISOString()
    };

    localStorage.setItem('user', JSON.stringify(userData));
    localStorage.setItem('authTokens', JSON.stringify({
      accessToken: '',
      refreshToken: '',
      tokenType: 'Bearer',
      expiresIn: '',
      loggedInAt: new Date().toISOString()
    }));
    localStorage.setItem('authSession', JSON.stringify({
      email: userData.email,
      name: userData.name,
      loggedInAt: new Date().toISOString()
    }));

    closeSignupModal();
    initAuthButtons();
    alert('Hesabınız oluşturuldu ve giriş yapıldı.');
  }
}

function toggleLoginPasswordVisibility() {
  const passwordInput = document.getElementById('loginPassword');
  const toggleBtn = document.getElementById('toggleLoginPassword');
  if (!passwordInput || !toggleBtn) return;

  const showing = passwordInput.type === 'text';
  passwordInput.type = showing ? 'password' : 'text';
  toggleBtn.textContent = showing ? 'Göster' : 'Gizle';
}

function toggleSignupPasswordVisibility() {
  const passwordInput = document.getElementById('signupPassword');
  const toggleBtn = document.getElementById('toggleSignupPassword');
  if (!passwordInput || !toggleBtn) return;

  const showing = passwordInput.type === 'text';
  passwordInput.type = showing ? 'password' : 'text';
  toggleBtn.textContent = showing ? 'Göster' : 'Gizle';
}

function initLoginModal() {
  const loginForm = document.getElementById('loginForm');
  const closeBtn = document.getElementById('closeLoginModal');
  const toggleBtn = document.getElementById('toggleLoginPassword');
  const switchToSignupModal = document.getElementById('switchToSignupModal');

  if (loginForm && !loginForm.dataset.bound) {
    loginForm.addEventListener('submit', handleLoginSubmit);
    loginForm.dataset.bound = 'true';
  }

  if (closeBtn && !closeBtn.dataset.bound) {
    closeBtn.addEventListener('click', closeLoginModal);
    closeBtn.dataset.bound = 'true';
  }

  if (toggleBtn && !toggleBtn.dataset.bound) {
    toggleBtn.addEventListener('click', toggleLoginPasswordVisibility);
    toggleBtn.dataset.bound = 'true';
  }

  if (switchToSignupModal && !switchToSignupModal.dataset.bound) {
    switchToSignupModal.addEventListener('click', (event) => {
      event.preventDefault();
      openSignupModal();
    });
    switchToSignupModal.dataset.bound = 'true';
  }
}

function initSignupModal() {
  const signupForm = document.getElementById('signupModalForm');
  const closeBtn = document.getElementById('closeSignupModal');
  const toggleBtn = document.getElementById('toggleSignupPassword');
  const switchToLoginModal = document.getElementById('switchToLoginModal');

  if (signupForm && !signupForm.dataset.bound) {
    signupForm.addEventListener('submit', handleSignupSubmit);
    signupForm.dataset.bound = 'true';
  }

  if (closeBtn && !closeBtn.dataset.bound) {
    closeBtn.addEventListener('click', closeSignupModal);
    closeBtn.dataset.bound = 'true';
  }

  if (toggleBtn && !toggleBtn.dataset.bound) {
    toggleBtn.addEventListener('click', toggleSignupPasswordVisibility);
    toggleBtn.dataset.bound = 'true';
  }

  if (switchToLoginModal && !switchToLoginModal.dataset.bound) {
    switchToLoginModal.addEventListener('click', (event) => {
      event.preventDefault();
      openLoginModal();
    });
    switchToLoginModal.dataset.bound = 'true';
  }
}

// Modalın dışına tıklanırsa modalı kapat
window.onclick = function(event) {
    const bookingModal = document.getElementById('bookingModal');
  const loginModal = document.getElementById('loginModal');
  const signupModal = document.getElementById('signupModal');
  const editReservationModal = document.getElementById('editReservationModal');

    // Eğer tıkla do modal'ın kendisiyse kapat
    if (event.target === bookingModal) {
        closeModal();
    }

  if (event.target === loginModal) {
    closeLoginModal();
  }

  if (event.target === signupModal) {
    closeSignupModal();
  }

  if (event.target === editReservationModal) {
    closeReservationEditModal();
  }

  const clickedInsideUserMenu = event.target && event.target.closest && event.target.closest('.user-menu');
  if (!clickedInsideUserMenu) {
    closeUserMenu();
  }
};

// Gece, oda türü ve otel fiyatına göre toplam rezervasyon fiyatını hesapla
function updateTotalPrice() {
    const checkInEl = document.getElementById('bookingCheckIn');
    const checkOutEl = document.getElementById('bookingCheckOut');
    const roomTypeEl = document.getElementById('roomType');
    const totalPriceEl = document.getElementById('totalPrice');
    
    // Gerekli alanlar boşsa fonksiyondan çık
    if (!checkInEl || !checkOutEl) return;
    
    // Giriş ve çıkış tarihlerini Date objelerine dönüştür
    const checkIn = new Date(checkInEl.value);
    const checkOut = new Date(checkOutEl.value);
    
    // Tarihler geçerli ve giriş çıkıştan önce ise fiyat hesapla
    if (checkIn && checkOut && checkIn < checkOut) {
        // Gece sayısını hesapla (milisaniye cinsinden fark / gün başına millisaniye)
        const nights = Math.ceil((checkOut - checkIn) / (1000 * 60 * 60 * 24));

        const roomType = roomTypeEl ? roomTypeEl.value : 'Standard';
      const multiplier = ROOM_MULTIPLIERS[roomType] || 1; // Seçilen oda türünün çarpanını al
        const total = Math.round(selectedPackagePrice * multiplier * nights); // Toplam = temel fiyat × çarpan × gece
        
        // Toplam fiyatı ekranda göster
        if (totalPriceEl) {
        totalPriceEl.textContent = formatTRY(total);
        }
    }
}

// Rezervasyon formunu gönder ve localStorage'a kaydet
function submitReservation(event) {
    event.preventDefault(); // Form gönderiminin sayfayı yenilemesini engelle
    
    // Form alanlarından değer çekmek için yardımcı fonksiyonlar
    const getElementValue = (id) => document.getElementById(id)?.value || '';
    const getElementText = (id) => document.getElementById(id)?.textContent || '';
    
    // Rezervasyon objesi oluştur (tüm bilgileri sakla)
    const reservation = {
        id: Date.now(), // Benzersiz ID (şu anki zaman damgası)
        resortName: getElementValue('resortName'), // Otel adı
        guestName: getElementValue('guestName'), // Konuk adı
        guestEmail: getElementValue('guestEmail'), // Konuk e-postası
        guestPhone: getElementValue('guestPhone'), // Konuk telefonu
        checkIn: getElementValue('bookingCheckIn'), // Giriş tarihi
        checkOut: getElementValue('bookingCheckOut'), // Çıkış tarihi
        guests: getElementValue('bookingGuests'), // Konuk sayısı
        roomType: getElementValue('roomType'), // Oda türü
        specialRequests: getElementValue('specialRequests'), // Özel istekler
        totalPrice: getElementText('totalPrice'), // Toplam fiyat
        status: 'Onaylandı', // Varsayılan durum
        bookingDate: new Date().toLocaleDateString('tr-TR') // Rezervasyon tarihi
    };
    
    // localStorage'dan mevcut rezervasyonları al
    let reservations = JSON.parse(localStorage.getItem('reservations')) || [];
    reservations.push(reservation); // Yeni rezervasyonu ekle
    localStorage.setItem('reservations', JSON.stringify(reservations)); // Tümünü kaydet
    
    // Başarılı mesajını göster ve ID'yi kopyala
    alert(`Başarılı! Rezervasyon numaranız: ${reservation.id}`);
    closeModal(); // Modalı kapat
    
    // Form alanlarını temizle
    const bookingForm = document.getElementById('bookingForm');
    if (bookingForm) bookingForm.reset();
}

// Hero slayetrı ve yorum kaydıracı için mevcut indeks
let currentSlide = 0;
let currentTestimonial = 0;
let currentCityTestimonial = 0;

// Hero slayderini ileri veya geri hareket ettir
const slideHero = (direction) => {
    const heroSlider = document.getElementById('heroSlider');
    if (!heroSlider) return;
    
    const slides = heroSlider.children; // Tüm slide öğeleri
    const totalSlides = slides.length; // Toplam slide sayısı
    
    // Mevcut indeksi güncelle (dairesel: sonundan başa dön)
    currentSlide = (currentSlide + direction + totalSlides) % totalSlides;
    
    // CSS transform ile slideri horizontal kaydır
    heroSlider.style.transform = `translateX(-${currentSlide * 100}%)`;
};

// Yorum verileri (müşteri testimonyialları)
const testimonials = [
    { text: "Muhteşem bir tatil deneyimi! Her şey mükemmeldi.", name: "xxxx", location: "Antalya Tatili", rating: 5 },
    { text: "Otel personeli çok ilgiliydi. Kesinlikle tekrar geleceğiz!", name: "xxxxxx", location: "Bodrum Tatili", rating: 5 },
    { text: "Tarihi dokusuyla büyüleyici bir şehir. Harika bir deneyimdi!", name: "xxxx", location: "Mardin Tatili", rating: 5 },
    { text: "Çocuklarımız çok eğlendi. Doğa harikası bir tatildi.", name: "xxxx xxxx", location: "Trabzon Tatili", rating: 5 },
    { text: "Ege'nin en güzel kenti. Deniz, güneş, eğlence!", name: "xxxx xxx", location: "İzmir Tatili", rating: 5 }
];

const CITY_REVIEWER_NAMES = ['Merve A.', 'Burak T.', 'Selin K.'];

const CITY_REVIEW_TEMPLATES = [
  '{hotel} otelde 4 gece konakladik, oda temizligi ve kahvalti kalitesi beklentimizin ustundeydi.',
  '{hotel} tesisinde check-in sureci hizliydi, ekip ilgiliydi ve konum planladigimiz geziye cok uygundu.',
  '{hotel} konaklamasinda fiyat/performans dengesi iyiydi; tekrar ayni sehre geldigimizde yine tercih ederiz.'
];

const MAX_TESTIMONIALS_ON_HOME = 3; // Anasayfada gösterilecek maksimum yorum sayısı

function setActiveTestimonialCard(trackEl, activeIndex) {
  if (!trackEl) return;
  Array.from(trackEl.children).forEach((item, idx) => {
    const card = item.querySelector('.testimonial-card');
    if (!card) return;
    card.classList.toggle('active', idx === activeIndex);
  });
}

function getCityTestimonials(citySlug) {
  const safeSlug = citySlug && HOTEL_DATA[citySlug] ? citySlug : (Object.keys(HOTEL_DATA)[0] || 'antalya');
  const hotels = Array.isArray(HOTEL_DATA[safeSlug]) ? HOTEL_DATA[safeSlug] : [];
  const cityName = (CITY_DATA[safeSlug] && CITY_DATA[safeSlug].name) ? CITY_DATA[safeSlug].name : 'Sehir';

  return [0, 1, 2].map((index) => {
    const hotel = hotels[index] || hotels[0] || { name: cityName + ' Merkez Otel', rating: 4.5 };
    const text = CITY_REVIEW_TEMPLATES[index].replace('{hotel}', hotel.name);
    const rating = Math.max(4, Math.min(5, Math.round(Number(hotel.rating) || 4)));

    return {
      text,
      name: CITY_REVIEWER_NAMES[index],
      location: cityName + ' / ' + hotel.name,
      rating
    };
  });
}

// Yorum verilerini HTML'ye dönüştürüp sayfa'da göster
const loadTestimonials = () => {
    const testimonialsTrack = document.getElementById('testimonialsTrack');
    if (!testimonialsTrack) return;
    
    // Sadece ilk 3 yorumu al
    const visibleTestimonials = testimonials.slice(0, MAX_TESTIMONIALS_ON_HOME);

    // Yorumları HTML kartlarına dönüştür ve render et
    testimonialsTrack.innerHTML = visibleTestimonials.map((t, i) => `
        <div class="testimonial-item">
            <div class="testimonial-card ${i === 0 ? 'active' : ''}"> <!-- İlk yorum aktif -->
                <div class="stars">${'⭐'.repeat(t.rating)}</div> <!-- Yıldizları göster -->
                <p>"${t.text}"</p> <!-- Yorum metni -->
                <div class="reviewer">
                    <span class="avatar">👤</span>
                    <div>
                        <strong>${t.name}</strong> <!-- Yorum sahibinin adı -->
                        <p class="subtitle">${t.location}</p> <!-- Tatil lokasyonu -->
                    </div>
                </div>
            </div>
        </div>
    `).join('');

    currentTestimonial = 0;
    testimonialsTrack.style.transform = 'translateX(0)';
    setActiveTestimonialCard(testimonialsTrack, currentTestimonial);
};

// Yorum seçicisini ileri/geri kaydır
const slideTestimonial = (direction) => {
    const testimonialsTrack = document.getElementById('testimonialsTrack');
    if (!testimonialsTrack) return;
    
    const items = testimonialsTrack.children;
    // Mevcut yorum indeksini güncelle (dairesel)
    currentTestimonial = (currentTestimonial + direction + items.length) % items.length;
    
    // CSS transform ile kaydır
    testimonialsTrack.style.transform = `translateX(-${currentTestimonial * 100}%)`;
    setActiveTestimonialCard(testimonialsTrack, currentTestimonial);
};

const loadCityTestimonials = () => {
  const testimonialsTrack = document.getElementById('cityTestimonialsTrack');
  if (!testimonialsTrack) return;

  const citySlug = getCityFromQuery() || getPathCitySlug() || 'antalya';
  const cityName = (CITY_DATA[citySlug] && CITY_DATA[citySlug].name) ? CITY_DATA[citySlug].name : 'Sehir';
  const titleEl = document.getElementById('cityTestimonialsTitle');
  if (titleEl) titleEl.textContent = cityName + ' Konuk Yorumlari';

  const cityTestimonials = getCityTestimonials(citySlug);

  testimonialsTrack.innerHTML = cityTestimonials.map((t, i) => `
    <div class="testimonial-item">
      <div class="testimonial-card ${i === 0 ? 'active' : ''}">
        <div class="stars">${'⭐'.repeat(t.rating)}</div>
        <p>"${t.text}"</p>
        <div class="reviewer">
          <span class="avatar">👤</span>
          <div>
            <strong>${t.name}</strong>
            <p class="subtitle">${t.location}</p>
          </div>
        </div>
      </div>
    </div>
  `).join('');

  currentCityTestimonial = 0;
  testimonialsTrack.style.transform = 'translateX(0)';
  setActiveTestimonialCard(testimonialsTrack, currentCityTestimonial);
};

const slideCityTestimonial = (direction) => {
  const testimonialsTrack = document.getElementById('cityTestimonialsTrack');
  if (!testimonialsTrack) return;

  const items = testimonialsTrack.children;
  if (!items.length) return;

  currentCityTestimonial = (currentCityTestimonial + direction + items.length) % items.length;
  testimonialsTrack.style.transform = `translateX(-${currentCityTestimonial * 100}%)`;
  setActiveTestimonialCard(testimonialsTrack, currentCityTestimonial);
};

const REGION_RENDER_ORDER = [
  'antalya',
  'mardin',
  'diyarbakir',
  'mugla',
  'van',
  'trabzon',
  'bodrum',
  'bursa',
  'izmir',
  'istanbul',
  'ankara',
  'gaziantep'
];

function buildRegionCatalog() {
  const cityEntries = Object.entries(CITY_DATA || {}).filter(([, city]) => {
    return city?.showInRegions !== false;
  });
  const orderMap = new Map(REGION_RENDER_ORDER.map((slug, index) => [slug, index]));

  return cityEntries
    .sort((a, b) => {
      const aOrder = orderMap.has(a[0]) ? orderMap.get(a[0]) : Number.MAX_SAFE_INTEGER;
      const bOrder = orderMap.has(b[0]) ? orderMap.get(b[0]) : Number.MAX_SAFE_INTEGER;
      if (aOrder !== bOrder) return aOrder - bOrder;
      return String(a[1]?.name || a[0]).localeCompare(String(b[1]?.name || b[0]), 'tr');
    })
    .map(([slug, city]) => {
      const hotelsBySlug = Array.isArray(HOTEL_DATA[slug]) ? HOTEL_DATA[slug] : [];
      const hotelsCount = hotelsBySlug.length > 0
        ? hotelsBySlug.length
        : Number(city.hotels || city.hotelsCount || 0);

      return {
        slug,
        name: city.name || slug,
        hotels: Number.isFinite(hotelsCount) ? hotelsCount : 0,
        image: city.image || 'img/logo.png',
        heroImage: resolveCityHeroImage(city),
        link: 'city.html?city=' + encodeURIComponent(slug),
        class: city.regionClass || 'bottom-right'
      };
    });
}

function bindRegionFilterDelegation() {
  const filterWrap = document.getElementById('regionsFilterButtons');
  if (!filterWrap || filterWrap.dataset.bound === 'true') return;

  filterWrap.addEventListener('click', (event) => {
    const button = event.target.closest('[data-city]');
    if (!button) return;

    const citySlug = button.getAttribute('data-city') || '';
    if (!citySlug) return;

    filterWrap.querySelectorAll('[data-city]').forEach((item) => {
      item.classList.toggle('active', item === button);
    });

    const params = new URLSearchParams();
    params.set('city', citySlug);

    const checkIn = document.getElementById('checkIn')?.value || '';
    const checkOut = document.getElementById('checkOut')?.value || '';
    const guests = document.getElementById('guests')?.value || '';
    const rooms = document.getElementById('rooms')?.value || '';

    if (checkIn) params.set('checkIn', checkIn);
    if (checkOut) params.set('checkOut', checkOut);
    if (guests) params.set('guests', guests);
    if (rooms) params.set('rooms', rooms);

    window.location.href = 'city.html?' + params.toString();
  });

  filterWrap.dataset.bound = 'true';
}

function renderRegionFilterButtons(regionList) {
  const filterWrap = document.getElementById('regionsFilterButtons');
  if (!filterWrap) return;

  const cityButtons = (regionList || []).slice(0, 8);
  filterWrap.innerHTML = cityButtons.map((region, index) => {
    const activeClass = index === 0 ? 'active' : '';
    return '<button class="filter-tag ' + activeClass + '" type="button" data-city="'
      + region.slug + '">' + region.name + '</button>';
  }).join('');

  bindRegionFilterDelegation();
}

function applyRegionImageFallbacks(container) {
  if (!container) return;

  container.querySelectorAll('.region-card[data-region-image]').forEach((card) => {
    const imagePath = String(card.getAttribute('data-region-image') || '').trim();
    if (!imagePath) {
      card.style.backgroundImage = "url('img/logo.png')";
      return;
    }

    const probe = new Image();
    probe.onerror = () => {
      card.style.backgroundImage = "url('img/logo.png')";
    };
    probe.src = imagePath;
  });
}

// Bölgeleri sayfaya render et (kaskad kartları)
const loadRegions = () => {
  const container = document.getElementById('regionsCascade');
  if (!container) return;

  const regions = buildRegionCatalog();
  renderRegionFilterButtons(regions);

  container.innerHTML = regions.map((region) => {
    const imagePath = String(region.image || 'img/logo.png');
    const imagePathForCss = imagePath.replace(/'/g, '%27');
    const imagePathForAttr = imagePath.replace(/"/g, '&quot;');

    return ''
      + '<div class="region-card ' + region.class + '" data-region-image="' + imagePathForAttr + '" style="background-image: url(\'' + imagePathForCss + '\');">'
      + '  <div class="region-overlay"></div>'
      + '  <div class="region-content">'
      + '    <h3 class="region-name">' + region.name + '</h3>'
      + '    <span class="region-hotels">' + region.hotels + ' Otel</span>'
      + '  </div>'
      + '  <a href="' + region.link + '" class="region-link"></a>'
      + '</div>';
  }).join('');

  applyRegionImageFallbacks(container);
};

// Rezervasyonları yönetmek için sınıf
class ReservationManager {
    constructor() {
        // localStorage'da rezervasyonları tutacağımız anahtar
        this.storageKey = 'reservations';
    this.indexedDbName = 'tatilrez-account-db';
    this.indexedStoreName = 'reservations';
    }

    // Tüm reservation'ları localStorage'dan al
    getReservations = () => {
        const data = localStorage.getItem(this.storageKey);
        return data ? JSON.parse(data) : [];
    };

    // IndexedDB icindeki rezervasyon loglarini temizle
    clearIndexedReservations = async () => {
      if (!window.indexedDB) return false;

      return new Promise((resolve) => {
        const openRequest = window.indexedDB.open(this.indexedDbName, 1);

        openRequest.onerror = () => resolve(false);

        openRequest.onupgradeneeded = () => {
          const db = openRequest.result;
          if (!db.objectStoreNames.contains(this.indexedStoreName)) {
            db.createObjectStore(this.indexedStoreName, { keyPath: 'id' });
          }
        };

        openRequest.onsuccess = () => {
          const db = openRequest.result;

          if (!db.objectStoreNames.contains(this.indexedStoreName)) {
            db.close();
            resolve(true);
            return;
          }

          try {
            const tx = db.transaction(this.indexedStoreName, 'readwrite');
            tx.objectStore(this.indexedStoreName).clear();
            tx.oncomplete = () => {
              db.close();
              resolve(true);
            };
            tx.onerror = () => {
              db.close();
              resolve(false);
            };
          } catch (error) {
            db.close();
            resolve(false);
          }
        };
      });
    };

    // Tüm reservation'ları sil
    clearAll = async () => {
        // Kullanıcıdan silme onayı iste
        if (confirm('Tüm rezervasyonlar silinecek. Emin misiniz?')) {
            const delbtn = document.querySelector('.delbtn');
        const oldText = delbtn ? delbtn.textContent : '';

        if (delbtn) {
          // Silme işlemi sırasında butonu devre dışı bırak ve "Siliniyor..." yaz
          delbtn.classList.add('delbtn-loading');
          delbtn.textContent = "Siliniyor...";
          delbtn.disabled = true;
            }

        // 1 saniye bekle (animasyon efekti)
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Tüm reservation loglarini temizle (localStorage + IndexedDB)
        localStorage.removeItem(this.storageKey);
        localStorage.removeItem('indexedReservationSyncAt');
        await this.clearIndexedReservations();

        // Temizledikten sonra varsayilan sekmeye don
        reservationActiveFilter = 'approved';
        updateReservationFilterInUrl();
        loadReservations(); // Sayfayı yenile

        if (delbtn) {
          // Buton durumunu eski haline getir
          delbtn.classList.remove('delbtn-loading');
          delbtn.textContent = oldText;
          delbtn.disabled = false;
        }

        // Başarılı mesajı göster
        alert('Tüm rezervasyonlar temizlendi.');

            return true;
        }
        return false;
    };
}

// Sınıftan örnek oluştur (global değişken olarak)
const reservationManager = new ReservationManager();

let reservationActiveFilter = 'approved';
const VALID_RESERVATION_FILTERS = ['approved', 'upcoming', 'past', 'cancelled', 'all'];

function normalizeReservationFilter(value) {
  return VALID_RESERVATION_FILTERS.includes(value) ? value : 'approved';
}

function syncReservationFilterFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const requested = params.get('filter') || '';
  reservationActiveFilter = normalizeReservationFilter(requested || reservationActiveFilter);
}

function updateReservationFilterInUrl() {
  if (!document.getElementById('reservationsContent')) return;

  const params = new URLSearchParams(window.location.search);
  if (reservationActiveFilter === 'approved') {
    params.delete('filter');
  } else {
    params.set('filter', reservationActiveFilter);
  }

  const nextQuery = params.toString();
  const nextUrl = window.location.pathname + (nextQuery ? ('?' + nextQuery) : '');
  window.history.replaceState({}, '', nextUrl);
}

function parseReservationDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatReservationDate(value) {
  const parsed = parseReservationDate(value);
  if (!parsed) return '-';
  return parsed.toLocaleDateString('tr-TR');
}

function getReservationType(reservation) {
  const statusValue = normalizeText(String(reservation?.status || ''));
  if (statusValue.includes('iptal') || statusValue.includes('cancel')) return 'cancelled';

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const checkInDate = parseReservationDate(reservation?.checkIn);
  const checkOutDate = parseReservationDate(reservation?.checkOut);

  if (checkOutDate && checkOutDate < today) return 'past';
  if (checkInDate && checkInDate >= today) return 'upcoming';
  return 'upcoming';
}

// localStorage'dan tüm reservation'ları getir ve sayfada göster
function loadReservations() {
    const reservations = JSON.parse(localStorage.getItem('reservations')) || [];
    const content = document.getElementById('reservationsContent');
  const summary = document.getElementById('reservationsSummary');
  const filterWrap = document.getElementById('reservationFilters');
    
    if (!content) return;

  if (filterWrap && filterWrap.dataset.bound !== 'true') {
    filterWrap.addEventListener('click', (event) => {
      const tab = event.target.closest('[data-res-filter]');
      if (!tab) return;
      reservationActiveFilter = tab.getAttribute('data-res-filter') || 'all';
      reservationActiveFilter = normalizeReservationFilter(reservationActiveFilter);
      updateReservationFilterInUrl();
      loadReservations();
    });
    filterWrap.dataset.bound = 'true';
  }

  if (filterWrap) {
    filterWrap.querySelectorAll('[data-res-filter]').forEach((tab) => {
      tab.classList.toggle('active', tab.getAttribute('data-res-filter') === reservationActiveFilter);
    });
  }

  const prepared = reservations
    .map((res, index) => ({
      ...res,
      _index: index,
      _type: getReservationType(res)
    }))
    .sort((a, b) => {
      const left = parseReservationDate(a.checkIn)?.getTime() || 0;
      const right = parseReservationDate(b.checkIn)?.getTime() || 0;
      return right - left;
    });

  const counts = {
    all: prepared.length,
    upcoming: prepared.filter((res) => res._type === 'upcoming').length,
    past: prepared.filter((res) => res._type === 'past').length,
    cancelled: prepared.filter((res) => res._type === 'cancelled').length
  };

  if (summary) {
    summary.innerHTML = `
      <article class="reservation-summary-card">
        <span>Toplam Rezervasyon</span>
        <strong>${counts.all}</strong>
      </article>
      <article class="reservation-summary-card">
        <span>Yaklaşan Tatiller</span>
        <strong>${counts.upcoming}</strong>
      </article>
      <article class="reservation-summary-card">
        <span>Geçmiş Konaklama</span>
        <strong>${counts.past}</strong>
      </article>
      <article class="reservation-summary-card">
        <span>İptal Sayısı</span>
        <strong>${counts.cancelled}</strong>
      </article>
    `;
  }

    // Eğer hiç reservation yoksa boş durum mesajı göster
  if (prepared.length === 0) {
        content.innerHTML = `
            <div class="no-reservations">
                <p>Henüz hiç rezervasyonunuz yok.</p>
        <p>İlk fırsatı yakalamak için kampanyaları keşfetmeye başlayın.</p>
        <a href="index.html#specials" class="back-to-home">Otelleri Keşfet</a>
            </div>
        `;
        return;
    }

  const list = reservationActiveFilter === 'all'
    ? prepared
    : reservationActiveFilter === 'approved'
      ? prepared.filter((res) => normalizeText(String(res.status || '')).includes('onay'))
      : prepared.filter((res) => res._type === reservationActiveFilter);

  if (list.length === 0) {
    content.innerHTML = `
      <div class="no-reservations">
        <p>Bu filtrede rezervasyon bulunamadı.</p>
        <p>Farklı bir sekme seçerek tüm rezervasyonlarınızı görebilirsiniz.</p>
      </div>
    `;
    return;
  }

    // Her reservation için bir kart oluştur
  content.innerHTML = list.map((res) => {
        // Reservation verilerini çıkart
        const { resortName, guestName, checkIn, checkOut, guests, roomType, totalPrice, status, guestEmail, guestPhone, specialRequests, id } = res;
        // Durum türüne göre stil sınıfını ayarla
    const statusText = status === 'Onaylandı'
      ? (res._type === 'past' ? 'completed' : 'confirmed')
      : status === 'Beklemede'
        ? 'pending'
        : 'cancelled';

    const displayStatus = statusText === 'completed' ? 'Tamamlandı' : status;
    const checkInDate = parseReservationDate(checkIn);
    const checkOutDate = parseReservationDate(checkOut);
    const nightCount = (checkInDate && checkOutDate)
      ? Math.max(1, Math.ceil((checkOutDate.getTime() - checkInDate.getTime()) / (1000 * 60 * 60 * 24)))
      : '-';
    const summaryTone = res._type === 'cancelled'
      ? 'Bu rezervasyon iptal edildi.'
      : res._type === 'past'
        ? 'Bu konaklama tamamlandı.'
        : 'Giriş tarihine kadar planınızı buradan yönetebilirsiniz.';
        
        return `
      <article class="booking-item ets-booking-item">
                <div class="booking-header">
                    <div>
            <h3>${resortName}</h3>
            <p class="booking-id-line">Rezervasyon No: ${id || '-'}</p>
                    </div>
          <span class="status-badge status-${statusText}">${displayStatus}</span>
                </div>

        <div class="booking-kpis">
          <div class="booking-kpi">
            <span>Giriş - Çıkış</span>
            <strong>${formatReservationDate(checkIn)} - ${formatReservationDate(checkOut)}</strong>
          </div>
          <div class="booking-kpi">
            <span>Konaklama</span>
            <strong>${nightCount} gece</strong>
          </div>
          <div class="booking-kpi">
            <span>Toplam Tutar</span>
            <strong>${totalPrice || '₺0'}</strong>
          </div>
          <div class="booking-kpi">
            <span>Durum Bilgisi</span>
            <strong>${summaryTone}</strong>
          </div>
        </div>

                <!-- Reservation detayları -->
                <div class="booking-details">
                    <div class="detail-item">
                        <strong>Konuk Adı</strong>
                        <span>${guestName}</span>
                    </div>
                    <div class="detail-item">
                        <strong>Giriş Tarihi</strong>
                      <span>${formatReservationDate(checkIn)}</span>
                    </div>
                    <div class="detail-item">
                        <strong>Çıkış Tarihi</strong>
                      <span>${formatReservationDate(checkOut)}</span>
                    </div>
                    <div class="detail-item">
                        <strong>Konuk Sayısı</strong>
                        <span>${guests} Konuk</span>
                    </div>
                    <div class="detail-item">
                        <strong>Oda Tipi</strong>
                        <span>${roomType}</span>
                    </div>
                    <div class="detail-item">
                        <strong>Toplam Fiyat</strong>
                        <span style="color: var(--secondary-color); font-weight: bold;">${totalPrice}</span>
                    </div>
                </div>

                <!-- İletişim bilgileri (varsa göster) -->
                ${guestPhone ? `
                <div class="booking-contact-row">
                    <p><strong>E-posta:</strong> ${guestEmail}</p>
                    <p><strong>Telefon:</strong> ${guestPhone}</p>
                </div>
                ` : ''}

                <!-- Özel istekler (varsa göster) -->
                ${specialRequests ? `
                <div class="booking-note-row">
                    <strong>Özel İstekler:</strong>
                  <p>${specialRequests}</p>
                </div>
                ` : ''}

                <!-- Düzenle / İptal Et Butonları -->
                <div class="booking-actions">
                  <button class="btn-edit js-edit-reservation" data-res-index="${res._index}">Detay / Düzenle</button>
                  <button class="btn-cancel js-cancel-reservation" data-res-index="${res._index}">Rezervasyonu İptal Et</button>
                </div>
              </article>
        `;
    }).join('');

          content.querySelectorAll('.js-edit-reservation').forEach((btn) => {
            btn.addEventListener('click', () => {
              const index = Number(btn.getAttribute('data-res-index') || 0);
              editReservation(index);
            });
          });

          content.querySelectorAll('.js-cancel-reservation').forEach((btn) => {
            btn.addEventListener('click', () => {
              const index = Number(btn.getAttribute('data-res-index') || 0);
              cancelReservation(index);
            });
          });
}

function closeReservationEditModal() {
  const modal = document.getElementById('editReservationModal');
  if (modal) modal.style.display = 'none';
  reservationEditingIndex = -1;
}

function updateEditedReservationTotal() {
  const baseNightlyPrice = Number(document.getElementById('editBaseNightlyPrice')?.value || 0);
  const roomType = document.getElementById('editRoomType')?.value || 'Standard';
  const checkIn = document.getElementById('editCheckIn')?.value || '';
  const checkOut = document.getElementById('editCheckOut')?.value || '';
  const totalEl = document.getElementById('editTotalPrice');

  if (!totalEl) return;

  const nights = getNightCount(checkIn, checkOut);
  if (!nights || baseNightlyPrice <= 0) {
    totalEl.textContent = '-';
    return;
  }

  const roomMultiplier = ROOM_MULTIPLIERS[roomType] || 1;
  const total = Math.round(baseNightlyPrice * roomMultiplier * nights);
  totalEl.textContent = formatTRY(total);
}

function openReservationEditModal(index) {
  const reservations = JSON.parse(localStorage.getItem('reservations')) || [];
  const reservation = reservations[index];
  const modal = document.getElementById('editReservationModal');

  if (!reservation) return;
  if (!modal) {
    alert('Düzenleme modali bulunamadi.');
    return;
  }

  reservationEditingIndex = index;

  const oldNightCount = getNightCount(reservation.checkIn, reservation.checkOut) || 1;
  const oldRoomMultiplier = ROOM_MULTIPLIERS[reservation.roomType] || 1;
  const oldTotalPrice = parseCurrencyValue(reservation.totalPrice);
  const fallbackCitySlug = activeHotelsCitySlug || getCityFromQuery() || getPathCitySlug() || 'antalya';
  const fallbackNightly = getLivePrice(1200, fallbackCitySlug, index);
  const baseNightlyPrice = oldTotalPrice > 0
    ? Math.max(1, Math.round(oldTotalPrice / (oldNightCount * oldRoomMultiplier)))
    : fallbackNightly;

  const setValue = (id, value) => {
    const element = document.getElementById(id);
    if (element) element.value = value || '';
  };

  setValue('editResortName', reservation.resortName);
  setValue('editGuestName', reservation.guestName);
  setValue('editGuestEmail', reservation.guestEmail);
  setValue('editGuestPhone', reservation.guestPhone);
  setValue('editCheckIn', reservation.checkIn);
  setValue('editCheckOut', reservation.checkOut);
  setValue('editGuests', reservation.guests || '1');
  setValue('editRoomType', reservation.roomType || 'Standard');
  setValue('editStatus', reservation.status || 'Onaylandı');
  setValue('editSpecialRequests', reservation.specialRequests || '');
  setValue('editBaseNightlyPrice', String(baseNightlyPrice));

  updateEditedReservationTotal();
  modal.style.display = 'block';
}

function saveReservationEdits(event) {
  event.preventDefault();

  if (reservationEditingIndex < 0) return;

  const reservations = JSON.parse(localStorage.getItem('reservations')) || [];
  const reservation = reservations[reservationEditingIndex];
  if (!reservation) return;

  const checkIn = document.getElementById('editCheckIn')?.value || '';
  const checkOut = document.getElementById('editCheckOut')?.value || '';
  const nightCount = getNightCount(checkIn, checkOut);
  if (!nightCount) {
    alert('Lütfen geçerli giriş ve çıkış tarihleri seçin.');
    return;
  }

  reservation.resortName = document.getElementById('editResortName')?.value || reservation.resortName;
  reservation.guestName = document.getElementById('editGuestName')?.value || reservation.guestName;
  reservation.guestEmail = document.getElementById('editGuestEmail')?.value || reservation.guestEmail;
  reservation.guestPhone = document.getElementById('editGuestPhone')?.value || reservation.guestPhone;
  reservation.checkIn = checkIn;
  reservation.checkOut = checkOut;
  reservation.guests = document.getElementById('editGuests')?.value || reservation.guests;
  reservation.roomType = document.getElementById('editRoomType')?.value || reservation.roomType;
  reservation.status = document.getElementById('editStatus')?.value || reservation.status;
  reservation.specialRequests = document.getElementById('editSpecialRequests')?.value || '';

  const updatedTotalText = document.getElementById('editTotalPrice')?.textContent || reservation.totalPrice;
  if (updatedTotalText && updatedTotalText !== '-') {
    reservation.totalPrice = updatedTotalText;
  }

  localStorage.setItem('reservations', JSON.stringify(reservations));

  closeReservationEditModal();
  loadReservations();
  alert('Rezervasyon bilgileri güncellendi.');
}

function initReservationEditModal() {
  const form = document.getElementById('editReservationForm');
  const closeBtn = document.getElementById('closeEditReservationModal');
  const cancelBtn = document.getElementById('cancelEditReservationBtn');

  if (form && !form.dataset.bound) {
    form.addEventListener('submit', saveReservationEdits);
    form.dataset.bound = 'true';
  }

  if (closeBtn && !closeBtn.dataset.bound) {
    closeBtn.addEventListener('click', closeReservationEditModal);
    closeBtn.dataset.bound = 'true';
  }

  if (cancelBtn && !cancelBtn.dataset.bound) {
    cancelBtn.addEventListener('click', closeReservationEditModal);
    cancelBtn.dataset.bound = 'true';
  }

  ['editCheckIn', 'editCheckOut', 'editRoomType'].forEach((id) => {
    const input = document.getElementById(id);
    if (!input || input.dataset.bound) return;
    input.addEventListener('change', updateEditedReservationTotal);
    input.dataset.bound = 'true';
  });
}

// Belirtilen reservation'ı düzenlemeye aç
const editReservation = (index) => {
  openReservationEditModal(index);
};

// Belirtilen reservation'ı iptal et
const cancelReservation = (index) => {
    // Kullanıcıdan iptal onayı iste
    if (confirm('Bu rezervasyonu iptal etmek istediğinizden emin misiniz?')) {
        const reservations = JSON.parse(localStorage.getItem('reservations')) || [];
        if (!reservations[index]) {
          alert('Iptal edilecek rezervasyon bulunamadi.');
          return;
        }
        reservations[index].status = 'İptal Edildi'; // Durumu "İptal Edildi" olarak ayarla
        localStorage.setItem('reservations', JSON.stringify(reservations)); // Güncelle

        reservationActiveFilter = 'cancelled';
        updateReservationFilterInUrl();
        loadReservations(); // Sayfayı yenile

        const cancelledTab = document.querySelector('[data-res-filter="cancelled"]');
        if (cancelledTab) {
          cancelledTab.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }

        alert('Rezervasyon başarıyla iptal edildi. Iptaller sekmesine yonlendirildiniz.');
    }
};
// Bir HTML elemanında "active" sınıfını aç/kapat
const elementToggleFunc = function (elem) { 
    elem.classList.toggle("active"); // Sınıfı ekle veya kaldır
};

// Aboutme sayfasının tüm etkileşimlerini başlat
const initAboutMePage = () => {
    // Sidebar'ı açmak için buton ve sidebar öğelerini al
    const sidebar = document.querySelector("[data-sidebar]");
    const sidebarBtn = document.querySelector("[data-sidebar-btn]");

    // Sidebar butonuna tıklanırsa sidebar'ı aç/kapat
    if (sidebarBtn && sidebar) {
        sidebarBtn.addEventListener("click", function () { 
            elementToggleFunc(sidebar); // Active sınıfını aç/kapat
        });
    }
    
    // Yorum modal ve overlay öğelerini al
    const testimonialsItem = document.querySelectorAll("[data-testimonials-item]");
    const modalContainer = document.querySelector("[data-modal-container]");
    const modalCloseBtn = document.querySelector("[data-modal-close-btn]");
    const overlay = document.querySelector("[data-overlay]");

    const modalImg = document.querySelector("[data-modal-img]");
    const modalTitle = document.querySelector("[data-modal-title]");
    const modalText = document.querySelector("[data-modal-text]");

    // Modal aç/kapat işlevini tanımla
    const testimonialsModalFunc = function () {
        if (modalContainer) modalContainer.classList.toggle("active");
        if (overlay) overlay.classList.toggle("active");
    };

    // Her yorum öğesine tıklanırsa modal aç ve verileri doldur
    for (let i = 0; i < testimonialsItem.length; i++) {
        testimonialsItem[i].addEventListener("click", function () {
            // Modal'ı yorum verileri ile doldur
            if (modalImg) modalImg.src = this.querySelector("[data-testimonials-avatar]").src;
            if (modalImg) modalImg.alt = this.querySelector("[data-testimonials-avatar]").alt;
            if (modalTitle) modalTitle.innerHTML = this.querySelector("[data-testimonials-title]").innerHTML;
            if (modalText) modalText.innerHTML = this.querySelector("[data-testimonials-text]").innerHTML;

            testimonialsModalFunc(); // Modal'ı aç
        });
    }

    // Modal kapat butonları
    if (modalCloseBtn) modalCloseBtn.addEventListener("click", testimonialsModalFunc);
    if (overlay) overlay.addEventListener("click", testimonialsModalFunc); // Overlay'e tıklanırsa kapat

    // Kategori seçiş ve filtreleme öğeleri
    const select = document.querySelector("[data-select]");
    const selectItems = document.querySelectorAll("[data-select-item]");
    const selectValue = document.querySelector("[data-selecct-value]");
    const filterBtn = document.querySelectorAll("[data-filter-btn]");

    // Select açılır menüsü aç/kapat
    if (select) {
        select.addEventListener("click", function () { 
            elementToggleFunc(this); 
        });
    }

    // Seçim yapılırsa filtreyi uygula
    for (let i = 0; i < selectItems.length; i++) {
        selectItems[i].addEventListener("click", function () {
            let selectedValue = this.innerText.toLowerCase();
            if (selectValue) selectValue.innerText = this.innerText; // Seçili değeri göster
            if (select) elementToggleFunc(select); // Select'i kapat
            filterFunc(selectedValue); // Filtre uygula
        });
    }

    // Filtrele işlevi: seçilen kategoriye göre öğeleri göster/gizle
    const filterItems = document.querySelectorAll("[data-filter-item]");

    const filterFunc = function (selectedValue) {
        // Her öğeyi kontrol et ve kategori değeri eşleşirse "active" ekle
        for (let i = 0; i < filterItems.length; i++) {
            if (selectedValue === "all") {
                filterItems[i].classList.add("active"); // Hepsi görünsün
            } else if (selectedValue === filterItems[i].dataset.category) {
                filterItems[i].classList.add("active"); // Kategorisi eşleşerse görünsün
            } else {
                filterItems[i].classList.remove("active"); // Gerekirse gizle
            }
        }
    };

    let lastClickedBtn = filterBtn[0]; // Sonra tıklanan buton

    // Filtre butonlarına tıklanırsa seçili stilini güncelle
    for (let i = 0; i < filterBtn.length; i++) {
        filterBtn[i].addEventListener("click", function () {
            let selectedValue = this.innerText.toLowerCase();
            if (selectValue) selectValue.innerText = this.innerText;
            filterFunc(selectedValue); // Filtre uygula

            // Önceki butondan "active" sınıfını kaldır
            if (lastClickedBtn) lastClickedBtn.classList.remove("active");
            this.classList.add("active"); // Yeni butona "active" ekle
            lastClickedBtn = this; // Güncelle
        });
    }
    
    // Form doğrulama: tüm alanlar dolduysa gönder butonunu aktif et
    const form = document.querySelector("[data-form]");
    const formInputs = document.querySelectorAll("[data-form-input]");
    const formBtn = document.querySelector("[data-form-btn]");

    // Her form inputuna dinleyici ekle
    for (let i = 0; i < formInputs.length; i++) {
        formInputs[i].addEventListener("input", function () {
            // Form geçerli mi ve tüm alanlar dolu mu?
            if (form && form.checkValidity() && formBtn) {
                formBtn.removeAttribute("disabled"); // Butonu aktif et
            } else if (formBtn) {
                formBtn.setAttribute("disabled", ""); // Butonu devre dışı bırak
            }
        });
    }
    
    // Sayfa navigasyon ve sekme sistemi
    const navLinks = document.querySelectorAll("[data-nav-link]");
    const pages = document.querySelectorAll("[data-page]");

    // Her navigation linkine tıklanırsa ilgili sayfayı göster
    navLinks.forEach(link => {
        link.addEventListener("click", function () {
            const clickPage = this.getAttribute("data-nav-link");

            // Sayfaları kontrol et
            pages.forEach(page => {
                if (clickPage === page.dataset.page) {
                    page.classList.add("active"); // Tıklanan sayfayı göster
                    this.classList.add("active"); // Liki aktif yap
                    window.scrollTo(0, 0); // Sayfanın başına git
                } else {
                    page.classList.remove("active"); // Diğerlerini gizle
                }
            });

            // Diğer buttonları deaktif et
            navLinks.forEach(l => {
                if (l !== this) l.classList.remove("active");
            });
        });
    });
};

// Aktif hotel listesi
let currentHotels = [];

// Filtreleme durumunu saklamak için global obje
const FILTER_STATE = {
  minPrice: 0,        // Minimum fiat
  maxPrice: 3000,     // Maksimum fiyat
  minRating: 0,       // Minimum yıldız puanı
  concept: "",        // Otel konsepti (Her Şey Dahil vb.)
  theme: "",          // Otel teması (Çocuk Dostu vb.)
  amenities: [],      // Seçili olanaklar (Spa, Havuz vb.)
  sortBy: "recommended" // Sıralama tercihli
};

// Türkçe karakterleri normalize et (ı→i, ğ→g vb.) arama için
function normalizeText(text) {
  return (text || "")
    .toString()
    .normalize("NFD") // Türkçe karakterleri ayrıştır
    .replace(/[\u0300-\u036f]/g, "") // Aksan işaretlrini kaldır
    .toLowerCase()
    .replace(/ı/g, "i")     // ı → i
    .replace(/ğ/g, "g")     // ğ → g
    .replace(/ü/g, "u")     // ü → u
    .replace(/ş/g, "s")     // ş → s
    .replace(/ö/g, "o")     // ö → o
    .replace(/ç/g, "c");    // ç → c
}

// Şehir verilerini window.CITIES'den al (cities.js'den geliyor)
const CITY_DATA = (typeof window !== "undefined" && window.CITIES) ? window.CITIES : {};
// Şehir başlık verilerini window.CITY_TITLES'den al (title.js'den geliyor)
const CITY_TITLES = (typeof window !== "undefined" && window.CITY_TITLES) ? window.CITY_TITLES : {};

function slugifyText(value) {
  return normalizeText(value)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
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
  const base = resolveApiBaseUrl();
  const safePath = pathname.startsWith('/') ? pathname : '/' + pathname;
  return base + safePath;
}

function clearDataObject(target) {
  Object.keys(target).forEach((key) => {
    delete target[key];
  });
}

function applyCatalogPayload(payload) {
  const cities = Array.isArray(payload?.cities) ? payload.cities : [];
  const hotels = Array.isArray(payload?.hotels) ? payload.hotels : [];

  if (cities.length === 0) return false;

  const nextCityMap = {};
  const nextHotelMap = {};

  cities.forEach((city) => {
    const slug = slugifyText(city.slug || city.name || '');
    if (!slug) return;

    nextCityMap[slug] = {
      slug,
      name: city.name || slug,
      description: city.description || '',
      image: city.image || 'img/logo.png',
      heroImage: city.heroImage || '',
      heroBackground: city.heroBackground || 'linear-gradient(135deg, rgba(11, 137, 105, 0.667), rgba(4, 102, 132, 0.7))',
      regionClass: city.regionClass || 'bottom-right',
      showInRegions: city.showInRegions !== false,
      hotels: Number(city.hotelsCount) || 0,
      aliases: Array.isArray(city.aliases) ? city.aliases : [slug, city.name || slug]
    };

    nextHotelMap[slug] = [];
  });

  hotels.forEach((hotel) => {
    const citySlug = slugifyText(hotel.citySlug || '');
    if (!citySlug || !nextCityMap[citySlug]) return;

    const hotelItem = {
      name: hotel.name || 'Isimsiz Otel',
      image: hotel.image || 'img/logo.png',
      rating: Number(hotel.rating) || 0,
      price: Number(hotel.price) || 0,
      features: Array.isArray(hotel.features) ? hotel.features : []
    };

    nextHotelMap[citySlug].push(hotelItem);
  });

  Object.keys(nextCityMap).forEach((slug) => {
    nextCityMap[slug].hotels = nextHotelMap[slug].length;
  });

  clearDataObject(CITY_DATA);
  Object.assign(CITY_DATA, nextCityMap);

  clearDataObject(HOTEL_DATA);
  Object.assign(HOTEL_DATA, nextHotelMap);

  return true;
}

async function syncCatalogFromApi() {
  try {
    const response = await fetch(buildApiUrl('/api/bootstrap'));
    if (!response.ok) {
      throw new Error('Katalog API istegi basarisiz: ' + response.status);
    }

    const payload = await response.json();
    const applied = applyCatalogPayload(payload);
    if (applied) lastCatalogSyncAt = Date.now();
    return applied;
  } catch (error) {
    console.warn('API katalog verisi alinamadi, static veri kullaniliyor.', error);
    return false;
  }
}

// Kullanıcı girişini normalize edip şehir adlarıyla eşleştir
function resolveCitySlug(input) {
  const normalizedInput = normalizeText(input || "").trim();
  if (!normalizedInput) return "";

  // Tüm şehirleri kontrol et
  const cityEntries = Object.entries(CITY_DATA);
  for (const [slug, city] of cityEntries) {
    // Slug, şehir adı ve takma adları normalize et
    const aliases = Array.isArray(city.aliases) ? city.aliases : [];
    const candidates = [slug, city.name, ...aliases].map(normalizeText);
    
    // Eğer normalize edilmiş giriş eşleşirse slug'u döndür
    if (candidates.some(candidate => candidate === normalizedInput || normalizedInput.includes(candidate))) {
      return slug;
    }
  }

  return "";
}

// URL'den şehir parametresi al ve çöz
function getCityFromQuery() {
  const params = new URLSearchParams(window.location.search);
  return resolveCitySlug(params.get("city"));
}

// Şehir sayfasının başlık, açıklama ve resimlneri render et
function renderCityPage() {
  const cityNameEl = document.getElementById("cityName");
  if (!cityNameEl) return;

  // URL'den şehir bilgisini al
  const slug = getCityFromQuery();
  const city = slug ? CITY_DATA[slug] : null;
  const titleData = slug ? CITY_TITLES[slug] : null; // title.js'den başlık verileri

  // Sayfadaki tüm ilgili öğeleri al
  const pageTitleEl = document.getElementById("cityPageTitle");
  const cityDescriptionEl = document.getElementById("cityDescription");
  const cityImageEl = document.getElementById("cityImage");
  const cityHeroEl = document.getElementById("cityHero");
  const cityHotelsTitleEl = document.getElementById("cityHotelsTitle");
  const hotelsGridEl = document.getElementById("hotelsGrid");

  // Şehir bulunamadıysa hata mesajı göster
  if (!city) {
    cityNameEl.textContent = "Sehir bulunamadi";
    if (cityDescriptionEl) cityDescriptionEl.textContent = "Gecerli bir sehir secerek tekrar deneyin.";
    if (cityHotelsTitleEl) cityHotelsTitleEl.textContent = "Sonuc yok";
    if (hotelsGridEl) {
      hotelsGridEl.innerHTML = "<div class='hotel-card'><div class='hotel-info'><h3 class='hotel-name'>Gecersiz sehir</h3><p>Index sayfasindan bir sehir secip tekrar deneyin.</p><a class='btn-book' href='index.html'>Anasayfaya Don</a></div></div>";
    }
    return;
  }

  // Başlık verilerini al, yoksa fallback kullan
  const resolvedPageTitle = titleData?.pageTitle || (city.name + " Otelleri - TatilRez");
  const resolvedHeroTitle = titleData?.heroTitle || city.name;
  const resolvedHeroDescription = titleData?.heroDescription || city.description;
  const resolvedHotelsTitle = titleData?.hotelsSectionTitle || (city.name + "'da Populer Oteller");

  // Sayfaya başlıkları ve açıklamaları yerleştir
  document.title = resolvedPageTitle; // Tarayıcı sekmesi başlığı
  if (pageTitleEl) pageTitleEl.textContent = resolvedPageTitle;

  cityNameEl.textContent = resolvedHeroTitle;
  if (cityDescriptionEl) cityDescriptionEl.textContent = resolvedHeroDescription;
  if (cityHotelsTitleEl) cityHotelsTitleEl.textContent = resolvedHotelsTitle;

  // Şehir resmini gaçerleştir
  if (cityImageEl) {
    cityImageEl.src = resolveCityHeroImage(city);
    cityImageEl.alt = city.name;
    cityImageEl.onerror = () => {
      cityImageEl.onerror = null;
      cityImageEl.src = 'img/logo.png';
    };
  }

  // Hero bölümünün arkaplan rengini/gradyanını ayarla
  if (cityHeroEl && city.heroBackground) {
    cityHeroEl.style.background = city.heroBackground;
  }

  // Body'ye şehir-spesifik sınıf ekle (CSS'de stilini ayrı yapmak için)
  document.body.className = document.body.className
    .split(" ")
    .filter(cls => cls && !cls.startsWith("page-")) // Eski page sınıfını kaldır
    .concat(["page-" + slug]) // Yeni şehir sınıfını ekle
    .join(" ");
}

// Otel bilgilerindeki özellikleri analiz ederek meta veriler oluştur
function inferMeta(hotel, index) {
  // Otel özelliklerini normalize et
  const featureText = normalizeText((hotel.features || []).join(" "));
  const nameText = normalizeText(hotel.name || "");

  // Olanakları (amenities) özelliklerden çıkart
  const amenities = [];
  if (featureText.includes("spa")) amenities.push("Spa");
  if (featureText.includes("havuz") || featureText.includes("pool")) amenities.push("Havuz");
  if (featureText.includes("sahil") || featureText.includes("beach") || featureText.includes("deniz")) amenities.push("Denize Sifir");
  if (featureText.includes("otopark") || featureText.includes("parking")) amenities.push("Otopark");
  if (featureText.includes("evcil") || featureText.includes("pet")) amenities.push("Evcil Hayvan");

  // Otel konseptini belirle (ne dil dahil?)
  const concept = featureText.includes("all-inclusive") ? "Her Sey Dahil"
                : (featureText.includes("kahvalti") || featureText.includes("breakfast")) ? "Oda Kahvalti"
                : "Yarim Pansiyon";

  // Otel temasını belirle (hangi gruba uygun?)
  const theme = (featureText.includes("aile") || featureText.includes("kids")) ? "Cocuk Dostu"
              : (featureText.includes("water park") || featureText.includes("aquapark")) ? "Aquapark"
              : (nameText.includes("boutique") || nameText.includes("luxury") || featureText.includes("romantik")) ? "Balayi"
              : "Yetiskin";

  // Mesafeyi index'e göre hesapla (simülasyon)
  const distanceKm = (index % 8) + 1;

  return { amenities, concept, theme, distanceKm };
}

// Sayfanın URL'sine göre otelleri getir
function getHotelsByPage() {
  // Önce URL query parametresini kontrol et
  const cityFromQuery = getCityFromQuery();
  if (cityFromQuery && HOTEL_DATA[cityFromQuery]) {
    activeHotelsCitySlug = cityFromQuery;
    return HOTEL_DATA[cityFromQuery];
  }

  // Fallback: pathname içinde şehir adı ara
  activeHotelsCitySlug = getPathCitySlug();
  if (activeHotelsCitySlug && HOTEL_DATA[activeHotelsCitySlug]) {
    return HOTEL_DATA[activeHotelsCitySlug] || [];
  }

  if (window.location.pathname.includes('city.html')) {
    activeHotelsCitySlug = 'antalya';
    return HOTEL_DATA.antalya || [];
  }

  activeHotelsCitySlug = '';
  return [];
}

function ensureHotelPortalPanel() {
  let panel = document.getElementById('hotelPortalPanel');
  if (panel) return panel;

  panel = document.createElement('aside');
  panel.id = 'hotelPortalPanel';
  panel.className = 'hotel-portal-panel';
  panel.innerHTML = ''
    + '<div class="hotel-portal-ring" aria-hidden="true"></div>'
    + '<div class="hotel-portal-core" aria-hidden="true"></div>'
    + '<div class="hotel-portal-content">'
    + '  <p class="hotel-portal-kicker">Portal View</p>'
    + '  <h3 id="hotelPortalTitle">Otel Kesfi</h3>'
    + '  <p id="hotelPortalMeta" class="hotel-portal-meta">Kartin uzerine gelerek onizleme ac.</p>'
    + '  <div id="hotelPortalGallery" class="hotel-portal-gallery"></div>'
    + '</div>';

  document.body.appendChild(panel);

  panel.addEventListener('mouseenter', () => {
    panel.classList.add('is-hovered');
  });

  panel.addEventListener('mouseleave', () => {
    panel.classList.remove('is-hovered');
    panel.classList.remove('show');
  });

  return panel;
}

function buildHotelPortalGallery(hotel, list) {
  const source = Array.isArray(list) ? list : [];
  const leadImage = String(hotel?.image || '').trim();
  const others = source
    .filter((item) => String(item?.name || '') !== String(hotel?.name || ''))
    .slice(0, 6)
    .map((item) => ({
      name: item?.name || 'Otel',
      image: String(item?.image || '').trim() || 'img/logo.png'
    }));

  const images = [];
  if (leadImage) {
    images.push({
      name: hotel?.name || 'Secili Otel',
      image: leadImage
    });
  }

  return images.concat(others).slice(0, 6);
}

function bindHotelPortalInteractions(list) {
  const grid = document.getElementById('hotelsGrid');
  if (!grid) return;

  const cards = grid.querySelectorAll('.js-hotel-card');
  if (!cards.length) return;

  const panel = ensureHotelPortalPanel();
  const titleEl = document.getElementById('hotelPortalTitle');
  const metaEl = document.getElementById('hotelPortalMeta');
  const galleryEl = document.getElementById('hotelPortalGallery');

  let closeTimer = 0;

  const scheduleClose = () => {
    if (closeTimer) window.clearTimeout(closeTimer);
    closeTimer = window.setTimeout(() => {
      if (!panel.classList.contains('is-hovered')) {
        panel.classList.remove('show');
      }
      closeTimer = 0;
    }, 140);
  };

  const openForCard = (card) => {
    if (closeTimer) {
      window.clearTimeout(closeTimer);
      closeTimer = 0;
    }

    const raw = card.getAttribute('data-hotel-json') || '';
    if (!raw) return;

    let hotel = null;
    try {
      hotel = JSON.parse(decodeURIComponent(raw));
    } catch (_error) {
      hotel = null;
    }
    if (!hotel) return;

    const gallery = buildHotelPortalGallery(hotel, list);

    if (titleEl) titleEl.textContent = hotel.name || 'Otel Kesfi';
    if (metaEl) {
      metaEl.textContent = 'Puan: ' + (Number(hotel.rating) || 0).toFixed(1) + ' - Fiyat: ₺' + (Number(hotel.price) || 0) + ' - Portal galeri acik';
    }

    if (galleryEl) {
      galleryEl.innerHTML = gallery.map((item, index) => {
        return ''
          + '<figure class="hotel-portal-thumb ' + (index === 0 ? 'lead' : '') + '">'
          + '  <img src="' + item.image + '" alt="' + escapeUiHtml(item.name) + '">'
          + '  <figcaption>' + escapeUiHtml(item.name) + '</figcaption>'
          + '</figure>';
      }).join('');

      galleryEl.querySelectorAll('img').forEach((img) => {
        img.addEventListener('error', () => {
          img.src = 'img/logo.png';
        }, { once: true });
      });
    }

    panel.classList.add('show');
  };

  cards.forEach((card) => {
    card.addEventListener('mouseenter', () => {
      openForCard(card);
    });

    card.addEventListener('mouseleave', () => {
      scheduleClose();
    });
  });

  grid.addEventListener('mouseleave', () => {
    scheduleClose();
  });
}

// Otel listesini HTML kartlarına dönüştürüp sayfaya render et
function renderHotels(list) {
  const grid = document.getElementById("hotelsGrid");
  const listEl = document.getElementById("hotelsList");
  const target = grid || listEl; // Grid veya List view'ı hedefle
  if (!target) return;

  const session = getAuthSession();

  if (!Array.isArray(list) || list.length === 0) {
    target.innerHTML = "";
    document.dispatchEvent(new CustomEvent('hotels:rendered', { detail: { hotels: [] } }));
    return;
  }

  // Her oteli HTML kartına dönüştür
  target.innerHTML = list.map((hotel, idx) => {
    const meta = hotel.meta || {};
    const encodedHotelName = encodeURIComponent(hotel.name || "");
    const encodedHotelJson = encodeURIComponent(JSON.stringify({
      name: hotel.name,
      image: hotel.image,
      rating: hotel.rating,
      price: hotel.price,
      features: hotel.features || [],
      meta
    }));
    const memberPrice = Math.round((hotel.price || 0) * 0.92);
    const shownPrice = session && session.email ? memberPrice : hotel.price;
    const memberTag = session && session.email
      ? "<span class='member-price-badge'>Üye Fiyatı</span>"
      : "<span class='member-lock-badge'>Üyelere Özel %8</span>";
    const lastRooms = 2 + (idx % 6);
    const todayViews = 27 + ((idx * 11) % 73);

    // Otel meta bilgilerini badge'ler olarak oluştur
    const badge = [
      meta.concept ? "<span class='hotel-badge'>" + meta.concept + "</span>" : "",
      meta.theme ? "<span class='hotel-badge'>" + meta.theme + "</span>" : "",
      typeof meta.distanceKm === "number" ? "<span class='hotel-badge'>" + meta.distanceKm + " km</span>" : ""
    ].join(" ");

    // Otel kartı HTML'si
    return ""
      + "<div class='hotel-card js-hotel-card' data-hotel-json='" + encodedHotelJson + "'>"
      + "  <img src='" + hotel.image + "' alt='" + hotel.name + "'>" // Otel resmi
      + "  <div class='hotel-info'>"
      + "    <div class='hotel-heading-row'>"
      + "      <h3 class='hotel-name'>" + hotel.name + "</h3>"
      + "      " + memberTag
      + "    </div>"
      + "    <div class='hotel-rating'>" + "⭐".repeat(Math.floor(hotel.rating)) + " " + hotel.rating + "</div>"
      + "    <div class='hotel-price-wrap'>"
      + "      <div class='hotel-price'>₺" + shownPrice + "/gece</div>"
        + "      <div class='hotel-price-note'>"
        + (session && session.email
          ? "Canlı fiyat güncellemesi: " + (hotel.liveUpdatedAt || livePriceUpdatedLabel || "-") + " • Üye indirimi uygulandı"
          : "Canlı fiyat güncellemesi: " + (hotel.liveUpdatedAt || livePriceUpdatedLabel || "-") + " • Üye girişi ile daha düşük fiyat")
        + "</div>"
      + "    </div>"
      + "    <div class='hotel-badges'>" + badge + "</div>"
      + "    <ul class='hotel-features'>" + (hotel.features || []).map(f => "<li>" + f + "</li>").join("") + "</ul>" // Özellikler
      + "    <div class='hotel-persuasive-copy'>"
      + "      <span>X TL'den başlayan fiyat garantisi</span>"
      + "      <span>Son " + lastRooms + " oda</span>"
      + "      <span>Bugün " + todayViews + " kişi inceledi</span>"
      + "    </div>"
      + "    <div class='hotel-card-actions-row'>"
      + "      <button class='btn-secondary js-detail-btn' type='button'>Detay</button>"
      + "      <button class='btn-secondary js-wishlist-btn' type='button'>❤</button>"
      + "      <button class='btn-secondary js-compare-btn' type='button'>Karşılaştır</button>"
      + "    </div>"
      + "    <button class='btn-book js-book-btn' data-hotel-name='" + encodedHotelName + "' data-hotel-price='" + shownPrice + "'>Rezervasyon Yap</button>"
      + "  </div>"
      + "</div>";
  }).join("");

  // CSP nedeniyle inline onclick yerine event listener bağla
  target.querySelectorAll('.js-book-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const nameEncoded = btn.getAttribute('data-hotel-name') || '';
      const hotelName = decodeURIComponent(nameEncoded);
      const hotelPrice = Number(btn.getAttribute('data-hotel-price') || 0);
      openBooking(hotelName, hotelPrice);
    });
  });

  // Görsel yüklenmezse yedek logoyu göster
  target.querySelectorAll('.hotel-card img').forEach((img) => {
    img.addEventListener('error', () => {
      img.src = 'img/logo.png';
    }, { once: true });
  });

  bindHotelPortalInteractions(list);

  document.dispatchEvent(new CustomEvent('hotels:rendered', { detail: { hotels: list } }));
}

// Filtreleri ve sıralamayı uygula, sonuçları render et
function applyFiltersAndSort() {
  let data = [...currentHotels]; // Mevcut otellerin kopyasını al

  // Fiyat aralığına göre filtrele
  data = data.filter(h => h.price >= FILTER_STATE.minPrice && h.price <= FILTER_STATE.maxPrice);
  // Minimum yıldız puanına göre filtrele
  data = data.filter(h => h.rating >= FILTER_STATE.minRating);

  // Konsept filtresini uygula
  if (FILTER_STATE.concept) data = data.filter(h => h.meta.concept === FILTER_STATE.concept);
  // Tema filtresini uygula
  if (FILTER_STATE.theme) data = data.filter(h => h.meta.theme === FILTER_STATE.theme);

  // Tüm seçili olanakları bir otelde bulunması gerekiyor
  if (FILTER_STATE.amenities.length > 0) {
    data = data.filter(h => FILTER_STATE.amenities.every(a => h.meta.amenities.includes(a)));
  }

  // Sıralamayı uygula
  if (FILTER_STATE.sortBy === "priceAsc") data.sort((a, b) => a.price - b.price); // Fiyat artan
  if (FILTER_STATE.sortBy === "priceDesc") data.sort((a, b) => b.price - a.price); // Fiyat azalan
  if (FILTER_STATE.sortBy === "ratingDesc") data.sort((a, b) => b.rating - a.rating); // Puan yüksek
  if (FILTER_STATE.sortBy === "distanceAsc") data.sort((a, b) => a.meta.distanceKm - b.meta.distanceKm); // Mesafe yakın

  // Tavsiye edilen: puan × 2 - (fiyat / 1000) değerine göre sırala
  if (FILTER_STATE.sortBy === "recommended") {
    data.sort((a, b) => {
      const scoreA = (a.rating * 2) - (a.price / 1000);
      const scoreB = (b.rating * 2) - (b.price / 1000);
      return scoreB - scoreA; // Yüksek skora göre sırala
    });
  }

  renderHotels(data); // Sonuçları göster
}

// Otelleri yükle ve meta verileri oluştur
function loadHotels() {
  // Sayfanın URL'sine göre otelleri getir
  const raw = getHotelsByPage();
  const now = new Date();
  livePriceUpdatedLabel = now.toLocaleString('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });

  // Her otele meta verileri ekle
  currentHotels = raw.map((hotel, idx) => {
    const livePrice = getLivePrice(hotel.price, activeHotelsCitySlug, idx);
    const withPrice = {
      ...hotel,
      basePrice: hotel.price,
      price: livePrice,
      liveUpdatedAt: livePriceUpdatedLabel
    };
    const meta = inferMeta(withPrice, idx);
    return { ...withPrice, meta };
  });
  applyFiltersAndSort(); // Filtreleri uygula ve render et
}
// Tüm filtreleme UI'sını başlat ve event dinleyicileri ekle
function initAdvancedFilters() {
  // Filtre input'larını ve display öğelerini al
  const minEl = document.getElementById("minPriceInput") || document.getElementById("minPriceRange");
  const maxEl = document.getElementById("maxPriceInput") || document.getElementById("maxPriceRange");
  const minText = document.getElementById("minPriceText");
  const maxText = document.getElementById("maxPriceText");
  const ratingEl = document.getElementById("ratingFilter");
  const conceptEl = document.getElementById("conceptFilter");
  const themeEl = document.getElementById("themeFilter");
  const sortEl = document.getElementById("sortBy");
  const clearBtn = document.getElementById("clearFiltersBtn");

  if (!minEl || !maxEl) return;

  // Fiyat değerini sayıya dönüştür
  const parsePrice = (value, fallback) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };

  // Fiyat aralığını senkronize et (min > max kontrolü)
  const syncPriceText = () => {
    FILTER_STATE.minPrice = parsePrice(minEl.value, 0);
    FILTER_STATE.maxPrice = parsePrice(maxEl.value, 3000);

    // Negatif fiyatları engelle
    if (FILTER_STATE.minPrice < 0) FILTER_STATE.minPrice = 0;
    if (FILTER_STATE.maxPrice < 0) FILTER_STATE.maxPrice = 0;

    // Eğer min > max ise swapla
    if (FILTER_STATE.minPrice > FILTER_STATE.maxPrice) {
      const temp = FILTER_STATE.minPrice;
      FILTER_STATE.minPrice = FILTER_STATE.maxPrice;
      FILTER_STATE.maxPrice = temp;
      minEl.value = String(FILTER_STATE.minPrice);
      maxEl.value = String(FILTER_STATE.maxPrice);
    }
    
    // Ekranda göster
    if (minText) minText.textContent = "₺" + FILTER_STATE.minPrice;
    if (maxText) maxText.textContent = "₺" + FILTER_STATE.maxPrice;
  };

  // Minimum fiyat değiştirince
  minEl.addEventListener("input", () => {
    syncPriceText();
    applyFiltersAndSort(); // Sonuçları yenile
  });

  // Maksimum fiyat değiştirince
  maxEl.addEventListener("input", () => {
    syncPriceText();
    applyFiltersAndSort();
  });

  // Yıldız puanı filtresi değiştirince
  if (ratingEl) ratingEl.addEventListener("change", () => {
    FILTER_STATE.minRating = Number(ratingEl.value || 0);
    applyFiltersAndSort();
  });

  // Konsept filtresi değiştirince (Her Şey Dahil vb.)
  if (conceptEl) conceptEl.addEventListener("change", () => {
    FILTER_STATE.concept = conceptEl.value || "";
    applyFiltersAndSort();
  });

  // Tema filtresi değiştirince (Çocuk Dostu vb.)
  if (themeEl) themeEl.addEventListener("change", () => {
    FILTER_STATE.theme = themeEl.value || "";
    applyFiltersAndSort();
  });

  // Olanaklar checkboxları (Spa, Havuz vb.)
  const amenityChecks = document.querySelectorAll(".amenityCheck");
  amenityChecks.forEach(ch => {
    ch.addEventListener("change", () => {
      // Seçili olanakları topla
      FILTER_STATE.amenities = Array.from(document.querySelectorAll(".amenityCheck:checked")).map(x => x.value);
      applyFiltersAndSort();
    });
  });

  // Sıralama seçeneği değiştirince
  if (sortEl) sortEl.addEventListener("change", () => {
    FILTER_STATE.sortBy = sortEl.value || "recommended";
    applyFiltersAndSort();
  });

  // Tüm filtreleri temizle butonu
  if (clearBtn) clearBtn.addEventListener("click", () => {
    minEl.value = "0";
    maxEl.value = "3000";
    if (ratingEl) ratingEl.value = "0";
    if (conceptEl) conceptEl.value = "";
    if (themeEl) themeEl.value = "";
    if (sortEl) sortEl.value = "recommended";
    document.querySelectorAll(".amenityCheck").forEach(x => x.checked = false);

    // Filter state'i sıfırla
    FILTER_STATE.minPrice = 0;
    FILTER_STATE.maxPrice = 3000;
    FILTER_STATE.minRating = 0;
    FILTER_STATE.concept = "";
    FILTER_STATE.theme = "";
    FILTER_STATE.amenities = [];
    FILTER_STATE.sortBy = "recommended";

    syncPriceText();
    applyFiltersAndSort(); // Tüm otelleri göster
  });

  syncPriceText(); // İlk senkronizasyon
}
// Popüler arama önerileri
const POPULAR_SEARCHES = [
  "Antalya",
  "Bodrum",
  "Muğla",
  "İzmir",
  "Mardin"
];

// localStorage'dan son aramaları getir
function getRecentSearches() {
  try {
    return JSON.parse(localStorage.getItem("recentSearches") || "[]");
  } catch {
    return [];
  }
}

// Yapılan aramayı localStorage'a kaydet
function saveRecentSearch(value) {
  const v = (value || "").trim();
  if (!v) return; // Boş aramayı kaydetme
  
  // Aynı aramayı tekrar ekleme (normalize karşılaştırma)
  const old = getRecentSearches().filter(x => normalizeText(x) !== normalizeText(v));
  // Yeni aramayı başa ekle, maksimum 6 tut
  const next = [v, ...old].slice(0, 6);
  localStorage.setItem("recentSearches", JSON.stringify(next));
}

// Önerilecek tüm şehir ve otel adlarını getir
function getSuggestionPool() {
  const regions = Object.values(CITY_DATA).flatMap((city) => {
    const aliases = Array.isArray(city.aliases) ? city.aliases : [];
    return [city.name, city.slug, ...aliases].filter(Boolean);
  });
  
  // Tüm otelleri topla ve adlarını al
  const hotels = Object.values(HOTEL_DATA)
    .flatMap(list => Array.isArray(list) ? list : [])
    .map(h => h.name);

  // Benzersiz öneriler döndür (şehirler + otel adları)
  return Array.from(new Set([...regions, ...hotels]));
}

async function resolveCitySlugForSearch(queryText) {
  const safeText = String(queryText || '').trim();
  if (!safeText) return '';

  let citySlug = resolveCitySlug(safeText);
  if (citySlug) return citySlug;

  await syncCatalogFromApi();
  citySlug = resolveCitySlug(safeText);
  if (citySlug) return citySlug;

  try {
    const response = await fetch(buildApiUrl('/api/cities'));
    if (response.ok) {
      const rows = await response.json();
      if (Array.isArray(rows) && rows.length) {
        const normalizedInput = normalizeText(safeText);
        for (const city of rows) {
          const aliases = Array.isArray(city.aliases) ? city.aliases : [];
          const candidates = [city.slug, city.name, ...aliases]
            .filter(Boolean)
            .map((value) => normalizeText(value));

          if (candidates.some((candidate) => candidate === normalizedInput || normalizedInput.includes(candidate))) {
            return city.slug || '';
          }
        }
      }
    }
  } catch (error) {
    console.warn('Arama fallback city API cagrisinda hata olustu.', error);
  }

  return '';
}

// Çip (tag) görünüşlü düğmeleri oluştur ve göster
function renderChipList(containerId, items) {
  const el = document.getElementById(containerId);
  if (!el) return;

  // İtemleri düğmelere dönüştür
  el.innerHTML = items.map(item => {
    return "<button type='button' class='chip-btn' data-chip='" + item.replace(/"/g, "&quot;") + "'>" + item + "</button>";
  }).join("");

  // Her düğmeye tıklanırsa destination'a yazı koy
  el.querySelectorAll(".chip-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const destinationEl = document.getElementById("destination");
      if (!destinationEl) return;
      destinationEl.value = btn.getAttribute("data-chip") || "";
      hideSuggestions(); // Önerileri gizle
    });
  });
}

// Arama önerilerini gizle
function hideSuggestions() {
  const dd = document.getElementById("suggestionsDropdown");
  if (!dd) return;
  dd.classList.remove("show"); // Show sınıfını kaldır
  dd.innerHTML = ""; // İçeriği temizle
}

// Aranan metne göre öneriler göster
function showSuggestions(query) {
  const dd = document.getElementById("suggestionsDropdown");
  if (!dd) return;

  const q = normalizeText(query);
  // 2 karakterden az yazı yazılmışsa önerileri gösterme
  if (!q || q.length < 2) {
    hideSuggestions();
    return;
  }

  // Tüm önerileri al
  const pool = getSuggestionPool();
  
  // Yazıyla başlayanları (başlangıç eşleşmeleri) ve dahil olanları (içinde geçenler) ayır
  const starts = pool.filter(x => normalizeText(x).startsWith(q));
  const contains = pool.filter(x => !normalizeText(x).startsWith(q) && normalizeText(x).includes(q));
  
  // Başlangıç eşleşmeleri önce, maksimum 8 sonuç
  const results = [...starts, ...contains].slice(0, 8);

  if (results.length === 0) {
    hideSuggestions();
    return;
  }

  // Önerileri HTML'ye dönüştür
  dd.innerHTML = results.map(item => "<div class='suggestion-item' data-s='" + item.replace(/"/g, "&quot;") + "'>" + item + "</div>").join("");
  dd.classList.add("show"); // Show sınıfını ekle

  // Her öneri öğesine tıklanırsa destination'a yazı koy
  dd.querySelectorAll(".suggestion-item").forEach(row => {
    row.addEventListener("click", () => {
      const val = row.getAttribute("data-s") || "";
      const destinationEl = document.getElementById("destination");
      if (destinationEl) destinationEl.value = val;
      hideSuggestions();
    });
  });
}

// Akıllı arama sistemini başlat
function initSmartSearch() {
  const destinationEl = document.getElementById("destination");
  if (!destinationEl) return;

  // Popüler ve son aramaları yükle
  renderChipList("popularSearches", POPULAR_SEARCHES);
  renderChipList("recentSearches", getRecentSearches());

  // Her yazı yazınca öneriler göster
  destinationEl.addEventListener("input", () => {
    showSuggestions(destinationEl.value);
  });

  // Input'a focus olunca ve yeterli yazı varsa öneriler göster
  destinationEl.addEventListener("focus", () => {
    if (Date.now() - lastCatalogSyncAt > 45000) {
      syncCatalogFromApi();
    }
    if (destinationEl.value.trim().length >= 2) showSuggestions(destinationEl.value);
  });

  destinationEl.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    searchResorts();
  });

  // Input veya dropdown dışında tıklanırsa önerileri gizle
  document.addEventListener("click", (e) => {
    const box = document.getElementById("suggestionsDropdown");
    if (!box || !destinationEl) return;
    if (!box.contains(e.target) && e.target !== destinationEl) hideSuggestions();
  });
}

// Otel arama yap: şehri bul ve city.html'e yönlendir
async function searchResorts() {
  const destination = (document.getElementById("destination")?.value || "").trim();
  const checkIn = document.getElementById("checkIn")?.value || "";
  const checkOut = document.getElementById("checkOut")?.value || "";
  const guests = document.getElementById("guests")?.value || "1";
  const rooms = document.getElementById("rooms")?.value || "1";
  const product = document.getElementById("selectedProduct")?.value || "hotel";

  // Destination boşsa uyar
  if (!destination) {
    alert("Lütfen bir destinasyon seçin.");
    return;
  }

  // Aramayı son aramalara kaydet
  saveRecentSearch(destination);
  renderChipList("recentSearches", getRecentSearches()); // Chip listesini güncelle

  // Destinasyon adını şehir slug'ına dönüştür
  const matchedCity = await resolveCitySlugForSearch(destination);

  // Eşleşme bulunamadıysa uyar
  if (!matchedCity) {
    alert("\"" + destination + "\" için sayfa bulunamadı.");
    return;
  }

  // URL parametreleri oluştur
  const params = new URLSearchParams({
    city: matchedCity, // Şehir slug'ı
    q: destination,    // Orijinal arama metni
    checkIn,           // Giriş tarihi
    checkOut,          // Çıkış tarihi
    guests,            // Konuk sayısı
    rooms,             // Oda sayısı
    product            // Urun tipi
  });

  // City sayfasına yönlendir
  window.location.href = "city.html?" + params.toString();
}

// Sayfa tamamen yüklendiğinde tüm başlatma işlevlerini çalıştır
document.addEventListener("DOMContentLoaded", async () => {
  // Tema değiştirme butonunu başlat
  initThemeToggle();
  initLoginModal();
  initSignupModal();
  initAuthButtons();

  await syncCatalogFromApi();

  const pageParams = new URLSearchParams(window.location.search);
  if (pageParams.get('openSignup') === '1') {
    openSignupModal();
  } else if (pageParams.get('openLogin') === '1') {
    openLoginModal();
  }
  
  // Şehir bilgisini (başlık, açıklama, resim) render et
  renderCityPage();

  // Anasayfadaki testimonial'ları yükle
  loadTestimonials();
  loadCityTestimonials();

  const cityTestimonialPrevBtn = document.getElementById('cityTestimonialPrevBtn');
  if (cityTestimonialPrevBtn) {
    cityTestimonialPrevBtn.addEventListener('click', () => slideCityTestimonial(-1));
  }

  const cityTestimonialNextBtn = document.getElementById('cityTestimonialNextBtn');
  if (cityTestimonialNextBtn) {
    cityTestimonialNextBtn.addEventListener('click', () => slideCityTestimonial(1));
  }
  
  // Bölge kartlarını yükle
  loadRegions();
  
  // Her 5 saniyede bir hero slideri otomatik olarak kaydır
  setInterval(() => slideHero(1), 5000);

  // Akıllı arama sistemini başlat
  initSmartSearch();
  
  // Otelleri yükle
  loadHotels();
  
  // Filtreleme seçeneklerini başlat
  initAdvancedFilters();

  // Rezervasyon modalının tarih/oda değişimi dinleyicileri
  const inputs = ["bookingCheckIn", "bookingCheckOut", "roomType"];
  inputs.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener("change", updateTotalPrice); // Fiyatı güncelle
  });

  // Reservasyonları yükle ve göster
  syncReservationFilterFromUrl();
  loadReservations();
  initReservationEditModal();
  
  // Tüm rezervasyonları sil butonunu bağla
  const clearBtn = document.getElementById("clearBtn");
  if (clearBtn) {
    clearBtn.addEventListener("click", () => reservationManager.clearAll());
  }

  // About sayfasının tüm etkileşimlerini başlat
  initAboutMePage();
});

window.addEventListener('storage', async (event) => {
  if (event.key !== CATALOG_REFRESH_STORAGE_KEY) return;

  const synced = await syncCatalogFromApi();
  if (!synced) return;

  renderCityPage();
  loadRegions();
  loadHotels();
  loadCityTestimonials();
});
