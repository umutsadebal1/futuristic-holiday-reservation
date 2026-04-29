const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const fs = require('fs/promises');
const fsSync = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const vm = require('vm');
const selfsigned = require('selfsigned');
const pool = require('./db');
const registerRoutes = require('./routes/register-routes');
require('dotenv').config();

const app = express();
const PORT = Number(process.env.PORT) || 5000;
const HTTPS_PORT = Number(process.env.HTTPS_PORT) || 5443;
const HTTPS_ENABLED = String(process.env.HTTPS_ENABLED || 'true').trim().toLowerCase() !== 'false';
const CERT_DIR = path.join(__dirname, 'certs');
const CERT_FILE = path.join(CERT_DIR, 'server.cert');
const KEY_FILE = path.join(CERT_DIR, 'server.key');
const JWT_SECRET = String(process.env.JWT_SECRET || '').trim() || 'dev-jwt-secret-change-me';
const JWT_EXPIRES_IN = String(process.env.JWT_EXPIRES_IN || '8h').trim();
const BCRYPT_ROUNDS = Number(process.env.BCRYPT_ROUNDS) || 12;
const REQUIRE_HTTPS = String(process.env.REQUIRE_HTTPS || '').trim().toLowerCase() === 'true';
const RECAPTCHA_SECRET_KEY = String(process.env.RECAPTCHA_SECRET_KEY || '').trim();
const RECAPTCHA_SITE_KEY = String(process.env.RECAPTCHA_SITE_KEY || '').trim();
const RECAPTCHA_MIN_SCORE = Number(process.env.RECAPTCHA_MIN_SCORE) || 0.5;
const RECAPTCHA_ENTERPRISE_PROJECT_ID = String(process.env.RECAPTCHA_ENTERPRISE_PROJECT_ID || '').trim();
const RECAPTCHA_ENTERPRISE_API_KEY = String(process.env.RECAPTCHA_ENTERPRISE_API_KEY || '').trim();
const RECAPTCHA_EXPECTED_ACTION = String(process.env.RECAPTCHA_EXPECTED_ACTION || 'admin_login').trim() || 'admin_login';
const MAINTENANCE_MODE = String(process.env.MAINTENANCE_MODE || '').trim().toLowerCase() === 'true';
const MAINTENANCE_MESSAGE = String(process.env.MAINTENANCE_MESSAGE || '').trim();
const MAINTENANCE_TOKEN_TTL = String(process.env.MAINTENANCE_TOKEN_TTL || '12h').trim();
const MAINTENANCE_BOOTSTRAP_KEY = String(process.env.MAINTENANCE_BOOTSTRAP_KEY || '').trim();

app.use(cors({
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Maintenance-Token']
}));
app.use(express.json());
app.set('trust proxy', 1);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Cok fazla giris denemesi yapildi. Lutfen daha sonra tekrar deneyin.' }
});

const uploadRoot = path.join(__dirname, 'uploads');
const cityUploadDir = path.join(uploadRoot, 'cities');
const hotelUploadDir = path.join(uploadRoot, 'hotels');
const FRONTEND_DIR = path.join(__dirname, '..', 'frontend');
const MAINTENANCE_PUBLIC_PATHS = new Set([
  '/maintenance.html',
  '/assets/css/maintenance.css',
  '/assets/js/maintenance.js',
  '/img/logo.png',
  '/img/anthero.jpg',
  '/img/bodhero.jpg',
  '/img/burhero.jpg',
  '/img/diyhero.jpg',
  '/img/rizhero.jpg',
  '/img/istreg.jpg',
  '/favicon.ico',
  '/coreapi',
  '/coreapi/health'
]);
const MAINTENANCE_COOKIE_NAME = 'maintenanceAccessToken';

function parseTtlSeconds(value, fallback = 12 * 3600) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return fallback;
  const match = raw.match(/^(\d+)\s*([smhd])?$/);
  if (!match) {
    const direct = Number(raw);
    return Number.isFinite(direct) && direct > 0 ? Math.floor(direct) : fallback;
  }
  const amount = Number(match[1]);
  const unit = match[2] || 's';
  const multiplier = unit === 'd' ? 86400 : unit === 'h' ? 3600 : unit === 'm' ? 60 : 1;
  return amount * multiplier;
}

const MAINTENANCE_TOKEN_TTL_SECONDS = parseTtlSeconds(process.env.MAINTENANCE_TOKEN_TTL, 12 * 3600);

function parseCookieHeader(req) {
  const header = String(req?.headers?.cookie || '');
  if (!header) return {};
  const out = {};
  header.split(';').forEach((pair) => {
    const idx = pair.indexOf('=');
    if (idx < 0) return;
    const key = pair.slice(0, idx).trim();
    if (!key) return;
    const value = pair.slice(idx + 1).trim();
    try {
      out[key] = decodeURIComponent(value);
    } catch (_e) {
      out[key] = value;
    }
  });
  return out;
}

function buildMaintenanceCookie(token, ttlSeconds) {
  const parts = [
    `${MAINTENANCE_COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    `Max-Age=${Math.max(60, Math.floor(ttlSeconds))}`,
    'HttpOnly',
    'SameSite=Lax'
  ];
  if (REQUIRE_HTTPS) parts.push('Secure');
  return parts.join('; ');
}

function clearMaintenanceCookie() {
  const parts = [
    `${MAINTENANCE_COOKIE_NAME}=`,
    'Path=/',
    'Max-Age=0',
    'HttpOnly',
    'SameSite=Lax'
  ];
  if (REQUIRE_HTTPS) parts.push('Secure');
  return parts.join('; ');
}

function resolveUploadCategory(req) {
  const pathText = String(req.path || req.originalUrl || '').toLowerCase();
  if (pathText.includes('/uploads/cities')) return 'cities';
  return 'hotels';
}

const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const category = resolveUploadCategory(req);
    if (category === 'cities') {
      cb(null, cityUploadDir);
      return;
    }
    cb(null, hotelUploadDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const safeExt = ext && ext.length <= 6 ? ext : '.jpg';
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, unique + safeExt);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024
  },
  fileFilter: (_req, file, cb) => {
    const mime = String(file.mimetype || '').toLowerCase();
    if (!mime.startsWith('image/')) {
      cb(new Error('Yalnizca gorsel dosyalari yuklenebilir.'));
      return;
    }
    cb(null, true);
  }
});

if (REQUIRE_HTTPS) {
  app.use((req, res, next) => {
    if (req.secure || req.headers['x-forwarded-proto'] === 'https') {
      next();
      return;
    }

    res.status(426).json({ message: 'Guvenli baglanti (HTTPS) zorunludur.' });
  });
}

app.use('/api', maintenanceGuard);
app.use('/api', moduleKillSwitchMiddleware);
app.use(staticMaintenanceGate);
app.use('/uploads', express.static(uploadRoot));

const CLEAN_URL_ROUTES = {
  '/admin':         'admin-login.html',
  '/login':         'admin-login.html',
  '/admin-login':   'admin-login.html',
  '/panel':         'admin.html',
  '/admin-panel':   'admin.html',
  '/dashboard':     'admin.html',
  '/hakkimda':      'aboutme.html',
  '/about':         'aboutme.html',
  '/rezervasyonlar': 'reservations.html',
  '/rezervasyon':   'reservations.html',
  '/sehir':         'city.html',
  '/city':          'city.html'
};

Object.entries(CLEAN_URL_ROUTES).forEach(([url, file]) => {
  app.get(url, (_req, res) => res.sendFile(path.join(FRONTEND_DIR, file)));
});

app.get('/sehir/:slug', (_req, res) => res.sendFile(path.join(FRONTEND_DIR, 'city.html')));
app.get('/city/:slug',  (_req, res) => res.sendFile(path.join(FRONTEND_DIR, 'city.html')));

app.get('/index.html', (_req, res) => res.redirect(301, '/'));

const APP_BOOTED_AT = Date.now();
const coreApiInfo = (req) => ({
  name: 'TatilRezerve Core Backend API',
  status: 'online',
  version: '1.0.0',
  scheme: req.protocol,
  host: req.headers.host || '',
  uptimeSeconds: Math.round((Date.now() - APP_BOOTED_AT) / 1000),
  timestamp: new Date().toISOString()
});
app.get('/coreapi', (req, res) => res.json(coreApiInfo(req)));
app.get('/coreapi/health', (req, res) => res.json(coreApiInfo(req)));

const HTML_REDIRECT_OVERRIDES = {
  '/admin.html':       '/admin-panel',
  '/admin-login.html': '/admin'
};

app.get(/^\/[^/.]+\.html$/, (req, res, next) => {
  if (req.path === '/maintenance.html') { next(); return; }
  const base = HTML_REDIRECT_OVERRIDES[req.path] || req.path.replace(/\.html$/, '');
  const qIndex = req.url.indexOf('?');
  const queryString = qIndex >= 0 ? req.url.substring(qIndex) : '';
  res.redirect(301, base + queryString);
});

app.use(express.static(FRONTEND_DIR, { index: 'index.html', extensions: ['html'] }));
app.get('/', (_req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, 'index.html'));
});

const DEFAULT_HERO_BACKGROUND = 'linear-gradient(135deg, rgba(11, 137, 105, 0.667), rgba(4, 102, 132, 0.7))';
const USER_ROLES = {
  PATRON: 'patron',
  UST_YETKILI: 'ust_yetkili',
  ALT_YETKILI: 'alt_yetkili',
  KULLANICI: 'kullanici'
};
const SIDEBAR_PERMISSION_KEYS = ['dashboardPanel', 'citiesPanel', 'hotelsPanel', 'apisPanel', 'usersPanel'];

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function slugify(value) {
  const normalized = normalizeText(value)
    .replace(/ı/g, 'i')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c');

  return normalized
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function parseArrayField(value) {
  if (Array.isArray(value)) {
    return value
      .map((entry) => String(entry || '').trim())
      .filter(Boolean);
  }

  if (typeof value === 'string') {
    return value
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  return [];
}

function toPositiveInteger(value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return 0;
  return parsed;
}

function toSafeRating(value, fallback = 4.2) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.min(5, Math.round(parsed * 10) / 10));
}

function toSafePrice(value, fallback = 750) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Math.round(parsed);
}

function legacyHashPassword(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

async function hashPassword(value) {
  return bcrypt.hash(String(value || ''), BCRYPT_ROUNDS);
}

async function verifyPassword(plainPassword, storedHash) {
  const rawHash = String(storedHash || '').trim();
  if (!rawHash) return false;

  if (rawHash.startsWith('$2a$') || rawHash.startsWith('$2b$') || rawHash.startsWith('$2y$')) {
    return bcrypt.compare(String(plainPassword || ''), rawHash);
  }

  return legacyHashPassword(plainPassword) === rawHash;
}

function signAccessToken(user) {
  return jwt.sign(
    {
      sub: String(user.id),
      email: user.email,
      role: normalizeUserRole(user.role),
      permissions: sanitizeSidebarPermissions(user.sidebar_permissions, user.role)
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

function hashMaintenanceKey(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

function generateMaintenanceKey() {
  const raw = crypto.randomBytes(20).toString('hex');
  return 'TRZ-' + raw;
}

function issueMaintenanceToken(keyRow) {
  return jwt.sign(
    {
      sub: 'maintenance',
      scope: 'maintenance',
      keyId: Number(keyRow?.id) || 0
    },
    JWT_SECRET,
    { expiresIn: MAINTENANCE_TOKEN_TTL }
  );
}

function verifyMaintenanceToken(token) {
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded?.scope !== 'maintenance') return null;
    return decoded;
  } catch (_error) {
    return null;
  }
}

function hashSessionToken(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

async function issueAuthTokens(userRow) {
  const accessToken = signAccessToken(userRow);
  const refreshToken = crypto.randomBytes(32).toString('hex');
  const refreshTokenHash = hashSessionToken(refreshToken);
  const expiresAt = new Date(Date.now() + (7 * 24 * 60 * 60 * 1000));

  await pool.query(
    `
      INSERT INTO auth_refresh_tokens (user_id, token_hash, expires_at)
      VALUES ($1, $2, $3)
    `,
    [userRow.id, refreshTokenHash, expiresAt.toISOString()]
  );

  return {
    accessToken,
    refreshToken,
    tokenType: 'Bearer',
    expiresIn: JWT_EXPIRES_IN
  };
}

async function revokeRefreshTokensForUser(userId) {
  const id = toPositiveInteger(userId);
  if (!id) return;

  await pool.query(
    `
      UPDATE auth_refresh_tokens
      SET revoked_at = NOW()
      WHERE user_id = $1 AND revoked_at IS NULL
    `,
    [id]
  );
}

function extractBearerToken(req) {
  const authHeader = String(req.headers?.authorization || '').trim();
  if (!authHeader.toLowerCase().startsWith('bearer ')) return '';
  return authHeader.slice(7).trim();
}

function extractMaintenanceToken(req) {
  const headerToken = String(req.headers?.['x-maintenance-token'] || '').trim();
  if (headerToken) return headerToken;
  const cookies = parseCookieHeader(req);
  const cookieToken = String(cookies[MAINTENANCE_COOKIE_NAME] || '').trim();
  if (cookieToken) return cookieToken;
  return extractBearerToken(req);
}

function requireAuth(req, res, next) {
  const token = extractBearerToken(req);
  if (!token) {
    res.status(401).json({ message: 'Bu islem icin giris yapmaniz gerekiyor.' });
    return;
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.auth = {
      userId: toPositiveInteger(decoded?.sub),
      email: String(decoded?.email || '').trim().toLowerCase(),
      role: normalizeUserRole(decoded?.role),
      permissions: sanitizeSidebarPermissions(decoded?.permissions, decoded?.role)
    };
    next();
  } catch (_error) {
    res.status(401).json({ message: 'Gecersiz veya suresi dolmus oturum.' });
  }
}

function requireRole(allowedRoles) {
  const allowed = Array.isArray(allowedRoles) ? allowedRoles.map((role) => normalizeUserRole(role)) : [];

  return (req, res, next) => {
    const currentRole = normalizeUserRole(req.auth?.role, USER_ROLES.KULLANICI);
    if (!allowed.includes(currentRole)) {
      res.status(403).json({ message: 'Bu islem icin yetkiniz bulunmuyor.' });
      return;
    }
    next();
  };
}

function normalizeUserRole(value, fallback = USER_ROLES.KULLANICI) {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === USER_ROLES.PATRON) return USER_ROLES.PATRON;
  if (raw === USER_ROLES.UST_YETKILI) return USER_ROLES.UST_YETKILI;
  if (raw === USER_ROLES.ALT_YETKILI) return USER_ROLES.ALT_YETKILI;
  if (raw === USER_ROLES.KULLANICI) return USER_ROLES.KULLANICI;
  return fallback;
}

function getDefaultSidebarPermissionsForRole(role) {
  const safeRole = normalizeUserRole(role);
  if (safeRole === USER_ROLES.PATRON) {
    return [...SIDEBAR_PERMISSION_KEYS];
  }

  if (safeRole === USER_ROLES.UST_YETKILI) {
    return ['dashboardPanel', 'citiesPanel', 'hotelsPanel', 'usersPanel'];
  }

  return ['dashboardPanel'];
}

function sanitizeSidebarPermissions(input, role) {
  const safeRole = normalizeUserRole(role);
  if (safeRole === USER_ROLES.PATRON) {
    return [...SIDEBAR_PERMISSION_KEYS];
  }

  const items = parseArrayField(input);
  const allowed = new Set(SIDEBAR_PERMISSION_KEYS);
  const seen = new Set();
  const next = [];

  items.forEach((entry) => {
    const key = String(entry || '').trim();
    if (!allowed.has(key) || seen.has(key)) return;
    seen.add(key);
    next.push(key);
  });

  if (!next.length) {
    return getDefaultSidebarPermissionsForRole(safeRole);
  }

  return next;
}

function toBoolean(value, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['1', 'true', 'yes', 'on', 'evet'].includes(normalized)) return true;
    if (['0', 'false', 'no', 'off', 'hayir'].includes(normalized)) return false;
  }

  return fallback;
}

function normalizeBaseUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';

  try {
    const parsed = new URL(raw);
    if (!['http:', 'https:'].includes(parsed.protocol)) return '';
    return parsed.toString().replace(/\/+$/, '');
  } catch (_error) {
    return '';
  }
}

function normalizeHealthPath(value) {
  const raw = String(value || '').trim();
  if (!raw) return '/api/health';
  if (/^https?:\/\//i.test(raw)) return raw;
  return raw.startsWith('/') ? raw : '/' + raw;
}

function buildIntegrationCheckUrl(baseUrl, healthPath) {
  const safeBase = String(baseUrl || '').trim().replace(/\/+$/, '');
  const safePath = normalizeHealthPath(healthPath);
  if (/^https?:\/\//i.test(safePath)) return safePath;
  return safeBase + safePath;
}

function buildIntegrationPayload(input, existing = null) {
  const fallback = existing || {};

  const name = String(input?.name ?? fallback.name ?? '').trim();
  if (!name) {
    const error = new Error('API adi zorunludur.');
    error.status = 400;
    throw error;
  }

  const baseUrl = normalizeBaseUrl(input?.baseUrl ?? fallback.baseUrl ?? '');
  if (!baseUrl) {
    const error = new Error('Gecerli bir API adresi girin. Ornek: http://localhost:5000');
    error.status = 400;
    throw error;
  }

  return {
    name,
    baseUrl,
    healthPath: normalizeHealthPath(input?.healthPath ?? fallback.healthPath ?? '/api/health'),
    isEnabled: toBoolean(input?.isEnabled, toBoolean(fallback.isEnabled, true))
  };
}

function sanitizeAliases(input, slug, name) {
  const candidates = [slug, name, ...parseArrayField(input)];
  const seen = new Set();
  const aliases = [];

  candidates.forEach((entry) => {
    const text = String(entry || '').trim();
    if (!text) return;
    const key = normalizeText(text);
    if (seen.has(key)) return;
    seen.add(key);
    aliases.push(text);
  });

  return aliases;
}

function buildCityPayload(input) {
  const name = String(input?.name || '').trim();
  if (!name) {
    const error = new Error('Sehir adi zorunludur.');
    error.status = 400;
    throw error;
  }

  const slug = slugify(input?.slug || name);
  if (!slug) {
    const error = new Error('Gecerli bir sehir slug degeri olusturulamadi.');
    error.status = 400;
    throw error;
  }

  return {
    slug,
    name,
    description: String(input?.description || '').trim(),
    image: String(input?.image || 'img/logo.png').trim() || 'img/logo.png',
    heroImage: String(input?.heroImage || '').trim(),
    heroBackground: String(input?.heroBackground || DEFAULT_HERO_BACKGROUND).trim() || DEFAULT_HERO_BACKGROUND,
    regionClass: String(input?.regionClass || 'bottom-right').trim() || 'bottom-right',
    showInRegions: toBoolean(input?.showInRegions, false),
    aliases: sanitizeAliases(input?.aliases, slug, name)
  };
}

function buildHotelPayload(input) {
  const name = String(input?.name || '').trim();
  if (!name) {
    const error = new Error('Otel adi zorunludur.');
    error.status = 400;
    throw error;
  }

  return {
    name,
    image: String(input?.image || 'img/logo.png').trim() || 'img/logo.png',
    rating: toSafeRating(input?.rating),
    price: toSafePrice(input?.price),
    features: parseArrayField(input?.features)
  };
}

function mapApiModuleRow(row) {
  return {
    id: row.id,
    moduleKey: row.module_key,
    displayName: row.display_name,
    isActive: row.is_active === true,
    note: row.note || '',
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : ''
  };
}

function resolveModuleKeyFromPath(pathname) {
  const safePath = String(pathname || '').toLowerCase();

  if (safePath.startsWith('/api/auth/')) return 'auth';
  if (safePath.startsWith('/api/admin/')) return 'admin';
  if (safePath.startsWith('/api/cities')) return 'cities';
  if (safePath.startsWith('/api/hotels') || safePath.includes('/hotels')) return 'hotels';
  if (safePath.startsWith('/api/reservations')) return 'reservations';
  if (safePath.startsWith('/api/campaigns')) return 'campaigns';
  if (safePath.startsWith('/api/humancheck')) return 'humancheck';
  if (safePath.startsWith('/api/external-services')) return 'external_services';
  if (safePath.startsWith('/api/bootstrap')) return 'gateway';
  return 'gateway';
}

async function getModuleControl(moduleKey) {
  const result = await pool.query(
    `
      SELECT id, module_key, display_name, is_active, note, updated_at
      FROM api_management
      WHERE module_key = $1
      LIMIT 1
    `,
    [moduleKey]
  );

  return result.rows[0] ? mapApiModuleRow(result.rows[0]) : null;
}

async function moduleKillSwitchMiddleware(req, res, next) {
  const pathName = String(req.path || '').toLowerCase();
  const apiPath = pathName.startsWith('/api/')
    ? pathName
    : '/api' + (pathName.startsWith('/') ? pathName : '/' + pathName);

  if (apiPath === '/api/health'
    || apiPath.startsWith('/api/admin/modules')
    || apiPath.startsWith('/api/maintenance')) {
    next();
    return;
  }

  const moduleKey = resolveModuleKeyFromPath(apiPath);
  if (!moduleKey) {
    next();
    return;
  }

  const moduleControl = await getModuleControl(moduleKey);
  if (moduleControl && moduleControl.isActive === false) {
    res.status(503).json({
      message: 'Bu servis gecici olarak durduruldu.',
      module: moduleControl.moduleKey,
      displayName: moduleControl.displayName
    });
    return;
  }

  next();
}

function maintenanceGuard(req, res, next) {
  if (!MAINTENANCE_MODE) {
    next();
    return;
  }

  if (req.method === 'OPTIONS') {
    next();
    return;
  }

  const pathName = String(req.path || '').toLowerCase();
  const apiPath = pathName.startsWith('/api/')
    ? pathName
    : '/api' + (pathName.startsWith('/') ? pathName : '/' + pathName);

  if (apiPath.startsWith('/api/maintenance') || apiPath === '/api/health') {
    next();
    return;
  }

  const token = extractMaintenanceToken(req);
  const decoded = token ? verifyMaintenanceToken(token) : null;
  if (!decoded) {
    res.status(503).json({ message: 'Bakim modu aktif. Erisim anahtari gerekli.' });
    return;
  }

  next();
}

function staticMaintenanceGate(req, res, next) {
  if (!MAINTENANCE_MODE) {
    next();
    return;
  }

  const rawPath = String(req.path || '/');
  const pathName = rawPath.toLowerCase();

  if (pathName.startsWith('/api/') || pathName === '/api') {
    next();
    return;
  }

  if (MAINTENANCE_PUBLIC_PATHS.has(pathName)) {
    next();
    return;
  }

  const token = extractMaintenanceToken(req);
  const decoded = token ? verifyMaintenanceToken(token) : null;
  if (decoded) {
    next();
    return;
  }

  const ext = path.extname(pathName);
  const looksLikeHtml = !ext || ext === '.html' || ext === '.htm' || pathName === '/';
  if (looksLikeHtml) {
    res.status(503);
    res.setHeader('Cache-Control', 'no-store');
    res.sendFile(path.join(FRONTEND_DIR, 'maintenance.html'));
    return;
  }

  res.status(503).end();
}

function mapCityRow(row) {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description || '',
    image: row.image || 'img/logo.png',
    heroImage: row.hero_image || '',
    heroBackground: row.hero_background || DEFAULT_HERO_BACKGROUND,
    regionClass: row.region_class || 'bottom-right',
    showInRegions: row.show_in_regions !== false,
    aliases: Array.isArray(row.aliases) ? row.aliases : [],
    hotelsCount: Number(row.hotels_count) || 0
  };
}

function mapHotelRow(row) {
  return {
    id: row.id,
    cityId: row.city_id,
    citySlug: row.city_slug,
    cityName: row.city_name,
    name: row.name,
    image: row.image || 'img/logo.png',
    rating: Number(row.rating) || 0,
    price: Number(row.price) || 0,
    features: Array.isArray(row.features) ? row.features : []
  };
}

function mapIntegrationRow(row) {
  return {
    id: row.id,
    name: row.name,
    baseUrl: row.base_url,
    healthPath: row.health_path || '/api/health',
    isEnabled: row.is_enabled !== false,
    lastStatus: row.last_status || 'unknown',
    lastMessage: row.last_message || '',
    lastCheckedAt: row.last_checked_at ? new Date(row.last_checked_at).toISOString() : '',
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : '',
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : ''
  };
}

function mapUserRow(row) {
  const role = normalizeUserRole(row.role, USER_ROLES.KULLANICI);
  const sidebarPermissions = sanitizeSidebarPermissions(row.sidebar_permissions, role);
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role,
    sidebarPermissions,
    registeredAt: row.registered_at ? new Date(row.registered_at).toISOString() : '',
    lastLoginAt: row.last_login_at ? new Date(row.last_login_at).toISOString() : '',
    lastActiveAt: row.last_active_at ? new Date(row.last_active_at).toISOString() : '',
    isActive: row.is_active === true,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : '',
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : ''
  };
}

function handleApiError(res, error) {
  if (error?.status) {
    res.status(error.status).json({ message: error.message });
    return;
  }

  if (error?.code === '23505') {
    res.status(409).json({ message: 'Ayni slug veya kayit zaten mevcut.' });
    return;
  }

  console.error(error);
  res.status(500).json({ message: 'Sunucu hatasi olustu.' });
}

async function ensureSchema() {
  await pool.query('CREATE TABLE IF NOT EXISTS cities (id SERIAL PRIMARY KEY);');

  const cityAlterStatements = [
    'ALTER TABLE cities ADD COLUMN IF NOT EXISTS slug TEXT;',
    'ALTER TABLE cities ADD COLUMN IF NOT EXISTS name TEXT;',
    "ALTER TABLE cities ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT '';",
    "ALTER TABLE cities ADD COLUMN IF NOT EXISTS image TEXT NOT NULL DEFAULT 'img/logo.png';",
    "ALTER TABLE cities ADD COLUMN IF NOT EXISTS hero_image TEXT NOT NULL DEFAULT '';",
    `ALTER TABLE cities ADD COLUMN IF NOT EXISTS hero_background TEXT NOT NULL DEFAULT '${DEFAULT_HERO_BACKGROUND.replace(/'/g, "''")}';`,
    "ALTER TABLE cities ADD COLUMN IF NOT EXISTS region_class TEXT NOT NULL DEFAULT 'bottom-right';",
    'ALTER TABLE cities ADD COLUMN IF NOT EXISTS show_in_regions BOOLEAN NOT NULL DEFAULT TRUE;',
    "ALTER TABLE cities ADD COLUMN IF NOT EXISTS aliases TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];",
    'ALTER TABLE cities ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();',
    'ALTER TABLE cities ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();'
  ];

  for (const statement of cityAlterStatements) {
    await pool.query(statement);
  }

  await pool.query('CREATE TABLE IF NOT EXISTS hotels (id SERIAL PRIMARY KEY);');

  const hotelAlterStatements = [
    'ALTER TABLE hotels ADD COLUMN IF NOT EXISTS city_id INTEGER REFERENCES cities(id) ON DELETE CASCADE;',
    'ALTER TABLE hotels ADD COLUMN IF NOT EXISTS name TEXT;',
    "ALTER TABLE hotels ADD COLUMN IF NOT EXISTS image TEXT NOT NULL DEFAULT 'img/logo.png';",
    'ALTER TABLE hotels ADD COLUMN IF NOT EXISTS rating NUMERIC(2,1) NOT NULL DEFAULT 4.2;',
    'ALTER TABLE hotels ADD COLUMN IF NOT EXISTS price INTEGER NOT NULL DEFAULT 750;',
    "ALTER TABLE hotels ADD COLUMN IF NOT EXISTS features TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];",
    'ALTER TABLE hotels ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();',
    'ALTER TABLE hotels ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();'
  ];

  for (const statement of hotelAlterStatements) {
    await pool.query(statement);
  }

  await pool.query('CREATE TABLE IF NOT EXISTS app_users (id SERIAL PRIMARY KEY);');

  const userAlterStatements = [
    'ALTER TABLE app_users ADD COLUMN IF NOT EXISTS name TEXT;',
    'ALTER TABLE app_users ADD COLUMN IF NOT EXISTS email TEXT;',
    "ALTER TABLE app_users ADD COLUMN IF NOT EXISTS password_hash TEXT NOT NULL DEFAULT '';",
    `ALTER TABLE app_users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT '${USER_ROLES.KULLANICI}';`,
    "ALTER TABLE app_users ADD COLUMN IF NOT EXISTS sidebar_permissions TEXT[] NOT NULL DEFAULT ARRAY['dashboardPanel']::TEXT[];",
    'ALTER TABLE app_users ADD COLUMN IF NOT EXISTS registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW();',
    'ALTER TABLE app_users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;',
    'ALTER TABLE app_users ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ;',
    'ALTER TABLE app_users ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT FALSE;',
    'ALTER TABLE app_users ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();',
    'ALTER TABLE app_users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();'
  ];

  for (const statement of userAlterStatements) {
    await pool.query(statement);
  }

  await pool.query(`ALTER TABLE app_users ALTER COLUMN role SET DEFAULT '${USER_ROLES.KULLANICI}';`);

  await pool.query('CREATE TABLE IF NOT EXISTS api_integrations (id SERIAL PRIMARY KEY);');

  const integrationAlterStatements = [
    'ALTER TABLE api_integrations ADD COLUMN IF NOT EXISTS name TEXT;',
    'ALTER TABLE api_integrations ADD COLUMN IF NOT EXISTS base_url TEXT;',
    "ALTER TABLE api_integrations ADD COLUMN IF NOT EXISTS health_path TEXT NOT NULL DEFAULT '/api/health';",
    'ALTER TABLE api_integrations ADD COLUMN IF NOT EXISTS is_enabled BOOLEAN NOT NULL DEFAULT TRUE;',
    "ALTER TABLE api_integrations ADD COLUMN IF NOT EXISTS last_status TEXT NOT NULL DEFAULT 'unknown';",
    "ALTER TABLE api_integrations ADD COLUMN IF NOT EXISTS last_message TEXT NOT NULL DEFAULT '';",
    'ALTER TABLE api_integrations ADD COLUMN IF NOT EXISTS last_checked_at TIMESTAMPTZ;',
    'ALTER TABLE api_integrations ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();',
    'ALTER TABLE api_integrations ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();'
  ];

  for (const statement of integrationAlterStatements) {
    await pool.query(statement);
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS api_management (
      id SERIAL PRIMARY KEY,
      module_key TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      note TEXT NOT NULL DEFAULT '',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS auth_refresh_tokens (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      revoked_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  const refreshTokenAlterStatements = [
    'ALTER TABLE auth_refresh_tokens ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES app_users(id) ON DELETE CASCADE;',
    "ALTER TABLE auth_refresh_tokens ADD COLUMN IF NOT EXISTS token_hash TEXT NOT NULL DEFAULT '';",
    "ALTER TABLE auth_refresh_tokens ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days');",
    'ALTER TABLE auth_refresh_tokens ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ;',
    'ALTER TABLE auth_refresh_tokens ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();'
  ];

  for (const statement of refreshTokenAlterStatements) {
    await pool.query(statement);
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS room_types (
      id SERIAL PRIMARY KEY,
      hotel_id INTEGER NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      capacity INTEGER NOT NULL DEFAULT 2,
      base_price INTEGER NOT NULL DEFAULT 750,
      total_inventory INTEGER NOT NULL DEFAULT 12,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  const roomTypeAlterStatements = [
    'ALTER TABLE room_types ADD COLUMN IF NOT EXISTS hotel_id INTEGER REFERENCES hotels(id) ON DELETE CASCADE;',
    "ALTER TABLE room_types ADD COLUMN IF NOT EXISTS name TEXT NOT NULL DEFAULT 'Standard';",
    'ALTER TABLE room_types ADD COLUMN IF NOT EXISTS capacity INTEGER NOT NULL DEFAULT 2;',
    'ALTER TABLE room_types ADD COLUMN IF NOT EXISTS base_price INTEGER NOT NULL DEFAULT 750;',
    'ALTER TABLE room_types ADD COLUMN IF NOT EXISTS total_inventory INTEGER NOT NULL DEFAULT 12;',
    'ALTER TABLE room_types ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;',
    'ALTER TABLE room_types ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();',
    'ALTER TABLE room_types ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();'
  ];

  for (const statement of roomTypeAlterStatements) {
    await pool.query(statement);
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS availability_calendar (
      id SERIAL PRIMARY KEY,
      hotel_id INTEGER NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
      room_type_id INTEGER NOT NULL REFERENCES room_types(id) ON DELETE CASCADE,
      available_date DATE NOT NULL,
      total_inventory INTEGER NOT NULL DEFAULT 12,
      booked_inventory INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (room_type_id, available_date)
    );
  `);

  const availabilityAlterStatements = [
    'ALTER TABLE availability_calendar ADD COLUMN IF NOT EXISTS hotel_id INTEGER REFERENCES hotels(id) ON DELETE CASCADE;',
    'ALTER TABLE availability_calendar ADD COLUMN IF NOT EXISTS room_type_id INTEGER REFERENCES room_types(id) ON DELETE CASCADE;',
    'ALTER TABLE availability_calendar ADD COLUMN IF NOT EXISTS available_date DATE;',
    'ALTER TABLE availability_calendar ADD COLUMN IF NOT EXISTS total_inventory INTEGER NOT NULL DEFAULT 12;',
    'ALTER TABLE availability_calendar ADD COLUMN IF NOT EXISTS booked_inventory INTEGER NOT NULL DEFAULT 0;',
    'ALTER TABLE availability_calendar ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();',
    'ALTER TABLE availability_calendar ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();'
  ];

  for (const statement of availabilityAlterStatements) {
    await pool.query(statement);
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS pricing_rates (
      id SERIAL PRIMARY KEY,
      hotel_id INTEGER NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
      room_type_id INTEGER REFERENCES room_types(id) ON DELETE SET NULL,
      start_date DATE NOT NULL,
      end_date DATE NOT NULL,
      nightly_price INTEGER NOT NULL,
      currency TEXT NOT NULL DEFAULT 'TRY',
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  const pricingRateAlterStatements = [
    'ALTER TABLE pricing_rates ADD COLUMN IF NOT EXISTS hotel_id INTEGER REFERENCES hotels(id) ON DELETE CASCADE;',
    'ALTER TABLE pricing_rates ADD COLUMN IF NOT EXISTS room_type_id INTEGER REFERENCES room_types(id) ON DELETE SET NULL;',
    'ALTER TABLE pricing_rates ADD COLUMN IF NOT EXISTS start_date DATE;',
    'ALTER TABLE pricing_rates ADD COLUMN IF NOT EXISTS end_date DATE;',
    'ALTER TABLE pricing_rates ADD COLUMN IF NOT EXISTS nightly_price INTEGER NOT NULL DEFAULT 750;',
    "ALTER TABLE pricing_rates ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'TRY';",
    'ALTER TABLE pricing_rates ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;',
    'ALTER TABLE pricing_rates ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();',
    'ALTER TABLE pricing_rates ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();'
  ];

  for (const statement of pricingRateAlterStatements) {
    await pool.query(statement);
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS campaigns (
      id SERIAL PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      discount_type TEXT NOT NULL DEFAULT 'percent',
      discount_value NUMERIC(10,2) NOT NULL DEFAULT 10,
      min_total INTEGER NOT NULL DEFAULT 0,
      start_at TIMESTAMPTZ,
      end_at TIMESTAMPTZ,
      usage_limit INTEGER,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS reservations (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      hotel_id INTEGER NOT NULL REFERENCES hotels(id) ON DELETE RESTRICT,
      room_type_id INTEGER REFERENCES room_types(id) ON DELETE SET NULL,
      check_in DATE NOT NULL,
      check_out DATE NOT NULL,
      guest_count INTEGER NOT NULL DEFAULT 1,
      nights INTEGER NOT NULL DEFAULT 1,
      base_amount INTEGER NOT NULL DEFAULT 0,
      discount_amount INTEGER NOT NULL DEFAULT 0,
      total_amount INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'confirmed',
      coupon_code TEXT,
      cancel_reason TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  const reservationAlterStatements = [
    'ALTER TABLE reservations ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES app_users(id) ON DELETE CASCADE;',
    'ALTER TABLE reservations ADD COLUMN IF NOT EXISTS hotel_id INTEGER REFERENCES hotels(id) ON DELETE RESTRICT;',
    'ALTER TABLE reservations ADD COLUMN IF NOT EXISTS room_type_id INTEGER REFERENCES room_types(id) ON DELETE SET NULL;',
    'ALTER TABLE reservations ADD COLUMN IF NOT EXISTS check_in DATE;',
    'ALTER TABLE reservations ADD COLUMN IF NOT EXISTS check_out DATE;',
    'ALTER TABLE reservations ADD COLUMN IF NOT EXISTS guest_count INTEGER NOT NULL DEFAULT 1;',
    'ALTER TABLE reservations ADD COLUMN IF NOT EXISTS nights INTEGER NOT NULL DEFAULT 1;',
    'ALTER TABLE reservations ADD COLUMN IF NOT EXISTS base_amount INTEGER NOT NULL DEFAULT 0;',
    'ALTER TABLE reservations ADD COLUMN IF NOT EXISTS discount_amount INTEGER NOT NULL DEFAULT 0;',
    'ALTER TABLE reservations ADD COLUMN IF NOT EXISTS total_amount INTEGER NOT NULL DEFAULT 0;',
    "ALTER TABLE reservations ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'confirmed';",
    'ALTER TABLE reservations ADD COLUMN IF NOT EXISTS coupon_code TEXT;',
    'ALTER TABLE reservations ADD COLUMN IF NOT EXISTS cancel_reason TEXT;',
    'ALTER TABLE reservations ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();',
    'ALTER TABLE reservations ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();'
  ];

  for (const statement of reservationAlterStatements) {
    await pool.query(statement);
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS reservation_status_logs (
      id SERIAL PRIMARY KEY,
      reservation_id INTEGER NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
      old_status TEXT,
      new_status TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      actor_user_id INTEGER REFERENCES app_users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS coupon_redemptions (
      id SERIAL PRIMARY KEY,
      campaign_id INTEGER REFERENCES campaigns(id) ON DELETE SET NULL,
      user_id INTEGER NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      reservation_id INTEGER REFERENCES reservations(id) ON DELETE SET NULL,
      code TEXT NOT NULL,
      discount_amount INTEGER NOT NULL DEFAULT 0,
      redeemed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  const couponRedemptionAlterStatements = [
    'ALTER TABLE coupon_redemptions ADD COLUMN IF NOT EXISTS campaign_id INTEGER REFERENCES campaigns(id) ON DELETE SET NULL;',
    'ALTER TABLE coupon_redemptions ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES app_users(id) ON DELETE CASCADE;',
    'ALTER TABLE coupon_redemptions ADD COLUMN IF NOT EXISTS reservation_id INTEGER REFERENCES reservations(id) ON DELETE SET NULL;',
    "ALTER TABLE coupon_redemptions ADD COLUMN IF NOT EXISTS code TEXT NOT NULL DEFAULT '';",
    'ALTER TABLE coupon_redemptions ADD COLUMN IF NOT EXISTS discount_amount INTEGER NOT NULL DEFAULT 0;',
    'ALTER TABLE coupon_redemptions ADD COLUMN IF NOT EXISTS redeemed_at TIMESTAMPTZ NOT NULL DEFAULT NOW();'
  ];

  for (const statement of couponRedemptionAlterStatements) {
    await pool.query(statement);
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS wishlists (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      hotel_id INTEGER NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (user_id, hotel_id)
    );
  `);

  const wishlistAlterStatements = [
    'ALTER TABLE wishlists ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES app_users(id) ON DELETE CASCADE;',
    'ALTER TABLE wishlists ADD COLUMN IF NOT EXISTS hotel_id INTEGER REFERENCES hotels(id) ON DELETE CASCADE;',
    'ALTER TABLE wishlists ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();'
  ];

  for (const statement of wishlistAlterStatements) {
    await pool.query(statement);
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS notification_preferences (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL UNIQUE REFERENCES app_users(id) ON DELETE CASCADE,
      email_enabled BOOLEAN NOT NULL DEFAULT TRUE,
      sms_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      promo_enabled BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  const notificationPreferenceAlterStatements = [
    'ALTER TABLE notification_preferences ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES app_users(id) ON DELETE CASCADE;',
    'ALTER TABLE notification_preferences ADD COLUMN IF NOT EXISTS email_enabled BOOLEAN NOT NULL DEFAULT TRUE;',
    'ALTER TABLE notification_preferences ADD COLUMN IF NOT EXISTS sms_enabled BOOLEAN NOT NULL DEFAULT FALSE;',
    'ALTER TABLE notification_preferences ADD COLUMN IF NOT EXISTS promo_enabled BOOLEAN NOT NULL DEFAULT TRUE;',
    'ALTER TABLE notification_preferences ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();',
    'ALTER TABLE notification_preferences ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();'
  ];

  for (const statement of notificationPreferenceAlterStatements) {
    await pool.query(statement);
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS contact_requests (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      subject TEXT NOT NULL DEFAULT '',
      message TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'new',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  const contactRequestAlterStatements = [
    "ALTER TABLE contact_requests ADD COLUMN IF NOT EXISTS name TEXT NOT NULL DEFAULT '';",
    "ALTER TABLE contact_requests ADD COLUMN IF NOT EXISTS email TEXT NOT NULL DEFAULT '';",
    "ALTER TABLE contact_requests ADD COLUMN IF NOT EXISTS subject TEXT NOT NULL DEFAULT '';",
    "ALTER TABLE contact_requests ADD COLUMN IF NOT EXISTS message TEXT NOT NULL DEFAULT '';",
    "ALTER TABLE contact_requests ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'new';",
    'ALTER TABLE contact_requests ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();',
    'ALTER TABLE contact_requests ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();'
  ];

  for (const statement of contactRequestAlterStatements) {
    await pool.query(statement);
  }

  const cityRows = await pool.query('SELECT id, name, slug FROM cities ORDER BY id ASC');
  const usedSlugs = new Set();

  for (const city of cityRows.rows) {
    let nextSlug = slugify(city.slug || city.name || '');
    if (!nextSlug) nextSlug = `city-${city.id}`;

    const base = nextSlug;
    let index = 2;
    while (usedSlugs.has(nextSlug)) {
      nextSlug = `${base}-${index}`;
      index += 1;
    }
    usedSlugs.add(nextSlug);

    if (city.slug !== nextSlug) {
      await pool.query('UPDATE cities SET slug = $1, updated_at = NOW() WHERE id = $2', [nextSlug, city.id]);
    }
  }

  await pool.query('CREATE UNIQUE INDEX IF NOT EXISTS cities_slug_unique_idx ON cities(slug);');
  await pool.query('CREATE INDEX IF NOT EXISTS hotels_city_id_idx ON hotels(city_id);');
  await pool.query('CREATE INDEX IF NOT EXISTS api_integrations_enabled_idx ON api_integrations(is_enabled);');
  await pool.query('CREATE UNIQUE INDEX IF NOT EXISTS app_users_email_unique_idx ON app_users(email);');
  await pool.query('CREATE INDEX IF NOT EXISTS app_users_active_idx ON app_users(is_active);');
  await pool.query('CREATE INDEX IF NOT EXISTS app_users_role_idx ON app_users(role);');
  await pool.query('CREATE INDEX IF NOT EXISTS auth_refresh_tokens_user_id_idx ON auth_refresh_tokens(user_id);');
  await pool.query('CREATE INDEX IF NOT EXISTS room_types_hotel_id_idx ON room_types(hotel_id);');
  await pool.query('CREATE INDEX IF NOT EXISTS availability_calendar_hotel_date_idx ON availability_calendar(hotel_id, available_date);');
  await pool.query('CREATE INDEX IF NOT EXISTS pricing_rates_hotel_dates_idx ON pricing_rates(hotel_id, start_date, end_date);');
  await pool.query('CREATE INDEX IF NOT EXISTS reservations_user_id_idx ON reservations(user_id);');
  await pool.query('CREATE INDEX IF NOT EXISTS reservations_status_idx ON reservations(status);');
  await pool.query('CREATE INDEX IF NOT EXISTS coupon_redemptions_user_id_idx ON coupon_redemptions(user_id);');
  await pool.query('CREATE INDEX IF NOT EXISTS contact_requests_status_idx ON contact_requests(status);');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS admin_activity_logs (
      id SERIAL PRIMARY KEY,
      actor_user_id INTEGER REFERENCES app_users(id) ON DELETE SET NULL,
      actor_email TEXT,
      action TEXT NOT NULL,
      target_type TEXT,
      target_id INTEGER,
      details JSONB DEFAULT '{}'::JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query('CREATE INDEX IF NOT EXISTS admin_activity_logs_actor_idx ON admin_activity_logs(actor_user_id);');
  await pool.query('CREATE INDEX IF NOT EXISTS admin_activity_logs_action_idx ON admin_activity_logs(action);');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS maintenance_access_keys (
      id SERIAL PRIMARY KEY,
      key_hash TEXT NOT NULL UNIQUE,
      label TEXT NOT NULL DEFAULT '',
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_used_at TIMESTAMPTZ,
      expires_at TIMESTAMPTZ
    );
  `);

  await pool.query('CREATE INDEX IF NOT EXISTS maintenance_access_keys_active_idx ON maintenance_access_keys(is_active);');

  if (MAINTENANCE_BOOTSTRAP_KEY) {
    await pool.query(
      `
        INSERT INTO maintenance_access_keys (key_hash, label)
        VALUES ($1, $2)
        ON CONFLICT (key_hash) DO NOTHING
      `,
      [hashMaintenanceKey(MAINTENANCE_BOOTSTRAP_KEY), 'Bootstrap']
    );
  }

  const moduleSeedRows = [
    ['gateway', 'API Gateway', true, 'Gateway ve ortak endpointler'],
    ['auth', 'Kimlik / Auth', true, 'Giris ve kayit akislari'],
    ['admin', 'Admin Panel API', true, 'Yonetim endpointleri'],
    ['cities', 'Sehir API', true, 'Sehir katalog endpointleri'],
    ['hotels', 'Otel API', true, 'Otel katalog endpointleri'],
    ['reservations', 'Rezervasyon API', true, 'Rezervasyon endpointleri'],
    ['campaigns', 'Kampanya API', true, 'Kupon ve kampanya endpointleri'],
    ['humancheck', 'Human Check API', true, 'Bot koruma endpointleri'],
    ['external_services', 'Harici Servis API', true, 'Dis servis entegrasyon endpointleri']
  ];

  for (const moduleRow of moduleSeedRows) {
    await pool.query(
      `
        INSERT INTO api_management (module_key, display_name, is_active, note, updated_at)
        VALUES ($1, $2, $3, $4, NOW())
        ON CONFLICT (module_key)
        DO UPDATE SET
          display_name = EXCLUDED.display_name,
          note = EXCLUDED.note,
          updated_at = NOW()
      `,
      moduleRow
    );
  }

  await pool.query("DELETE FROM api_management WHERE module_key = 'core';");

  await pool.query(
    `
      UPDATE app_users
      SET role = $1
      WHERE role IS NULL OR role NOT IN ($2, $3, $4, $5)
    `,
    [USER_ROLES.KULLANICI, USER_ROLES.PATRON, USER_ROLES.UST_YETKILI, USER_ROLES.ALT_YETKILI, USER_ROLES.KULLANICI]
  );

  await pool.query(
    `
      UPDATE app_users
      SET sidebar_permissions = ARRAY['dashboardPanel']::TEXT[]
      WHERE sidebar_permissions IS NULL OR CARDINALITY(sidebar_permissions) = 0
    `
  );

  const patronCountResult = await pool.query('SELECT COUNT(*)::int AS count FROM app_users WHERE role = $1', [USER_ROLES.PATRON]);
  const patronCount = Number(patronCountResult.rows[0]?.count) || 0;

  if (patronCount === 0) {
    const firstUserResult = await pool.query('SELECT id FROM app_users ORDER BY id ASC LIMIT 1');
    const firstUserId = firstUserResult.rows[0]?.id;
    if (firstUserId) {
      await pool.query(
        `
          UPDATE app_users
          SET role = $1, sidebar_permissions = $2, updated_at = NOW()
          WHERE id = $3
        `,
        [USER_ROLES.PATRON, SIDEBAR_PERMISSION_KEYS, firstUserId]
      );
    }
  }
}

async function loadFrontendSeedData() {
  const citiesFile = path.join(__dirname, '..', 'frontend', 'assets', 'js', 'cities.js');
  const hotelsFile = path.join(__dirname, '..', 'frontend', 'assets', 'js', 'hotels.js');

  const tryRead = async (file) => {
    try { return await fs.readFile(file, 'utf8'); } catch (_e) { return ''; }
  };

  const [citiesCode, hotelsCode] = await Promise.all([tryRead(citiesFile), tryRead(hotelsFile)]);
  if (!citiesCode && !hotelsCode) {
    return { cities: {}, hotelsByCity: {} };
  }

  const sandbox = { window: {} };
  vm.createContext(sandbox);
  if (citiesCode) vm.runInContext(citiesCode, sandbox, { filename: 'cities.js' });
  if (hotelsCode) vm.runInContext(hotelsCode, sandbox, { filename: 'hotels.js' });

  return {
    cities: sandbox.window.CITIES || {},
    hotelsByCity: sandbox.window.HOTELS_BY_CITY || {}
  };
}

async function seedCatalogIfEmpty() {
  const cityCountResult = await pool.query('SELECT COUNT(*)::int AS count FROM cities');
  const cityCount = Number(cityCountResult.rows[0]?.count) || 0;
  if (cityCount > 0) return;

  const { cities, hotelsByCity } = await loadFrontendSeedData();
  const entries = Object.entries(cities || {});
  if (!entries.length) return;

  await pool.query('BEGIN');

  try {
    const cityIdBySlug = new Map();

    for (const [sourceSlug, city] of entries) {
      const payload = buildCityPayload({
        slug: city?.slug || sourceSlug,
        name: city?.name || sourceSlug,
        description: city?.description || '',
        image: city?.image || 'img/logo.png',
        heroBackground: city?.heroBackground || DEFAULT_HERO_BACKGROUND,
        regionClass: city?.regionClass || 'bottom-right',
        showInRegions: true,
        aliases: Array.isArray(city?.aliases) ? city.aliases : [sourceSlug, city?.name || sourceSlug]
      });

      const inserted = await pool.query(
        `
          INSERT INTO cities (slug, name, description, image, hero_background, region_class, show_in_regions, aliases)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          RETURNING id, slug
        `,
        [
          payload.slug,
          payload.name,
          payload.description,
          payload.image,
          payload.heroBackground,
          payload.regionClass,
          payload.showInRegions,
          payload.aliases
        ]
      );

      cityIdBySlug.set(inserted.rows[0].slug, inserted.rows[0].id);
    }

    for (const [sourceSlug, hotels] of Object.entries(hotelsByCity || {})) {
      const citySlug = slugify(sourceSlug);
      const cityId = cityIdBySlug.get(citySlug);
      if (!cityId || !Array.isArray(hotels)) continue;

      for (const hotel of hotels) {
        const payload = buildHotelPayload(hotel || {});
        await pool.query(
          `
            INSERT INTO hotels (city_id, name, image, rating, price, features)
            VALUES ($1, $2, $3, $4, $5, $6)
          `,
          [cityId, payload.name, payload.image, payload.rating, payload.price, payload.features]
        );
      }
    }

    await pool.query('COMMIT');
    console.log('Ilk katalog verisi frontend static dosyalarindan DB ye aktarildi.');
  } catch (error) {
    await pool.query('ROLLBACK');
    throw error;
  }
}

async function getCitiesWithCounts() {
  const result = await pool.query(`
    SELECT
      c.id,
      c.slug,
      c.name,
      c.description,
      c.image,
      c.hero_image,
      c.hero_background,
      c.region_class,
      c.show_in_regions,
      c.aliases,
      COALESCE(COUNT(h.id), 0)::int AS hotels_count
    FROM cities c
    LEFT JOIN hotels h ON h.city_id = c.id
    GROUP BY c.id
    ORDER BY c.id ASC
  `);

  return result.rows.map(mapCityRow);
}

async function getHotels(citySlug = '') {
  const normalizedSlug = slugify(citySlug || '');

  if (normalizedSlug) {
    const result = await pool.query(
      `
        SELECT
          h.id,
          h.city_id,
          h.name,
          h.image,
          h.rating,
          h.price,
          h.features,
          c.slug AS city_slug,
          c.name AS city_name
        FROM hotels h
        INNER JOIN cities c ON c.id = h.city_id
        WHERE c.slug = $1
        ORDER BY h.id ASC
      `,
      [normalizedSlug]
    );

    return result.rows.map(mapHotelRow);
  }

  const result = await pool.query(`
    SELECT
      h.id,
      h.city_id,
      h.name,
      h.image,
      h.rating,
      h.price,
      h.features,
      c.slug AS city_slug,
      c.name AS city_name
    FROM hotels h
    INNER JOIN cities c ON c.id = h.city_id
    ORDER BY h.id ASC
  `);

  return result.rows.map(mapHotelRow);
}

async function resolveCityId(cityIdInput, citySlugInput) {
  const cityId = toPositiveInteger(cityIdInput);
  if (cityId) return cityId;

  const slug = slugify(citySlugInput || '');
  if (!slug) return 0;

  const cityResult = await pool.query('SELECT id FROM cities WHERE slug = $1', [slug]);
  return cityResult.rows[0]?.id || 0;
}

async function getApiIntegrations() {
  const result = await pool.query(`
    SELECT
      id,
      name,
      base_url,
      health_path,
      is_enabled,
      last_status,
      last_message,
      last_checked_at,
      created_at,
      updated_at
    FROM api_integrations
    ORDER BY id ASC
  `);

  return result.rows.map(mapIntegrationRow);
}

async function getApiIntegrationById(integrationId) {
  const id = toPositiveInteger(integrationId);
  if (!id) return null;

  const result = await pool.query(
    `
      SELECT
        id,
        name,
        base_url,
        health_path,
        is_enabled,
        last_status,
        last_message,
        last_checked_at,
        created_at,
        updated_at
      FROM api_integrations
      WHERE id = $1
      LIMIT 1
    `,
    [id]
  );

  return result.rows[0] ? mapIntegrationRow(result.rows[0]) : null;
}

async function updateApiIntegrationStatus(integrationId, status, message) {
  const id = toPositiveInteger(integrationId);
  if (!id) return null;

  await pool.query(
    `
      UPDATE api_integrations
      SET
        last_status = $1,
        last_message = $2,
        last_checked_at = NOW(),
        updated_at = NOW()
      WHERE id = $3
    `,
    [String(status || 'unknown'), String(message || ''), id]
  );

  return getApiIntegrationById(id);
}

async function checkApiIntegration(integration) {
  if (!integration || !integration.id) {
    return null;
  }

  if (!integration.isEnabled) {
    return updateApiIntegrationStatus(integration.id, 'disabled', 'Baglanti pasif durumda.');
  }

  const requestUrl = buildIntegrationCheckUrl(integration.baseUrl, integration.healthPath);
  if (typeof fetch !== 'function') {
    return updateApiIntegrationStatus(integration.id, 'unknown', 'Sunucuda fetch destegi yok.');
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 4500);

  try {
    const response = await fetch(requestUrl, {
      method: 'GET',
      signal: controller.signal
    });

    if (response.ok) {
      return updateApiIntegrationStatus(integration.id, 'online', 'HTTP ' + response.status + ' - Baglanti basarili.');
    }

    return updateApiIntegrationStatus(integration.id, 'offline', 'HTTP ' + response.status + ' - Baglanti hatasi.');
  } catch (error) {
    const message = error?.name === 'AbortError'
      ? 'Baglanti zaman asimina ugradi.'
      : String(error?.message || 'Baglanti kurulamadi.');

    return updateApiIntegrationStatus(integration.id, 'offline', message);
  } finally {
    clearTimeout(timeoutId);
  }
}

async function verifyGoogleHumanCheckToken(token, remoteIp) {
  const safeToken = String(token || '').trim();
  if (!safeToken) {
    return {
      verified: false,
      score: 0,
      message: 'Google reCAPTCHA token degeri zorunludur.',
      provider: 'google'
    };
  }

  const enterpriseConfigured = Boolean(RECAPTCHA_SITE_KEY && RECAPTCHA_ENTERPRISE_PROJECT_ID && RECAPTCHA_ENTERPRISE_API_KEY);
  if (enterpriseConfigured) {
    const endpoint = 'https://recaptchaenterprise.googleapis.com/v1/projects/'
      + encodeURIComponent(RECAPTCHA_ENTERPRISE_PROJECT_ID)
      + '/assessments?key='
      + encodeURIComponent(RECAPTCHA_ENTERPRISE_API_KEY);

    const eventPayload = {
      token: safeToken,
      siteKey: RECAPTCHA_SITE_KEY,
      expectedAction: RECAPTCHA_EXPECTED_ACTION
    };

    if (remoteIp) {
      eventPayload.userIpAddress = remoteIp;
    }

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ event: eventPayload })
      });

      const result = await response.json().catch(() => ({}));
      const tokenProperties = result?.tokenProperties || {};
      const riskAnalysis = result?.riskAnalysis || {};

      const isTokenValid = tokenProperties.valid === true;
      const invalidReason = String(tokenProperties.invalidReason || '').trim();
      const tokenAction = String(tokenProperties.action || '').trim();
      const actionMatches = !RECAPTCHA_EXPECTED_ACTION || !tokenAction || tokenAction === RECAPTCHA_EXPECTED_ACTION;
      const hasScore = Number.isFinite(Number(riskAnalysis.score));
      const score = hasScore ? Number(riskAnalysis.score) : null;
      const reasons = Array.isArray(riskAnalysis.reasons)
        ? riskAnalysis.reasons.map((entry) => String(entry || '').trim()).filter(Boolean)
        : [];

      let verified = isTokenValid && actionMatches;
      if (verified && hasScore) {
        verified = score >= RECAPTCHA_MIN_SCORE;
      }

      if (!response.ok) {
        verified = false;
        if (!reasons.length) {
          reasons.push('HTTP_' + response.status);
        }
      }

      let message = 'Google reCAPTCHA enterprise dogrulamasi basarisiz.';
      if (verified) {
        message = hasScore
          ? 'Google reCAPTCHA enterprise dogrulamasi basarili (score uygun).'
          : 'Google reCAPTCHA enterprise dogrulamasi basarili.';
      } else if (!isTokenValid && invalidReason) {
        message = 'Google reCAPTCHA enterprise dogrulamasi basarisiz: ' + invalidReason;
      } else if (!actionMatches) {
        message = 'Google reCAPTCHA action degeri beklenen islem ile uyusmuyor.';
      } else if (reasons.length > 0) {
        message = 'Google reCAPTCHA enterprise dogrulamasi basarisiz: ' + reasons.join(', ');
      }

      return {
        verified,
        score: score ?? 0,
        message,
        provider: 'google-enterprise',
        reasons
      };
    } catch (error) {
      return {
        verified: false,
        score: 0,
        message: String(error?.message || 'Google reCAPTCHA enterprise servisine erisilemedi.'),
        provider: 'google-enterprise'
      };
    }
  }

  if (!RECAPTCHA_SECRET_KEY) {
    return {
      verified: false,
      score: 0,
      message: 'Google reCAPTCHA secret anahtari tanimli degil.',
      provider: 'google'
    };
  }

  const payload = new URLSearchParams();
  payload.set('secret', RECAPTCHA_SECRET_KEY);
  payload.set('response', safeToken);
  if (remoteIp) {
    payload.set('remoteip', remoteIp);
  }

  try {
    const response = await fetch('https://www.google.com/recaptcha/api/siteverify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: payload.toString()
    });

    const result = await response.json().catch(() => ({}));
    const hasScore = Number.isFinite(Number(result?.score));
    const score = hasScore ? Number(result.score) : null;
    const reasons = Array.isArray(result?.['error-codes']) ? result['error-codes'] : [];

    let success = result?.success === true;
    if (success && hasScore) {
      success = score >= RECAPTCHA_MIN_SCORE;
    }

    let message = 'Google reCAPTCHA dogrulamasi basarisiz.';
    if (success) {
      message = hasScore
        ? 'Google reCAPTCHA dogrulamasi basarili (score uygun).'
        : 'Google reCAPTCHA dogrulamasi basarili.';
    } else if (reasons.length > 0) {
      message = 'Google reCAPTCHA dogrulamasi basarisiz: ' + reasons.join(', ');
    }

    return {
      verified: success,
      score: score ?? 0,
      message,
      provider: 'google',
      reasons
    };
  } catch (error) {
    return {
      verified: false,
      score: 0,
      message: String(error?.message || 'Google reCAPTCHA servisine erisilemedi.'),
      provider: 'google'
    };
  }
}

async function seedApiIntegrationsIfEmpty() {
  const appUrl = process.env.APP_URL;
  if (!appUrl) return;

  const { rows } = await pool.query('SELECT COUNT(*) FROM api_integrations');
  if (parseInt(rows[0].count, 10) > 0) return;

  await pool.query(
    `INSERT INTO api_integrations (name, base_url, health_path, is_enabled, last_status, last_checked_at)
     VALUES ($1, $2, $3, true, 'unknown', NOW())`,
    ['TatilRez Core API', appUrl, '/coreapi/health']
  );
  console.log('[seed] Core API integration registered:', appUrl);
}

async function getUsers() {
  const result = await pool.query(`
    SELECT
      id,
      name,
      email,
      role,
      sidebar_permissions,
      registered_at,
      last_login_at,
      last_active_at,
      is_active,
      created_at,
      updated_at
    FROM app_users
    ORDER BY id ASC
  `);

  return result.rows.map(mapUserRow);
}

async function getActiveUsers() {
  const result = await pool.query(`
    SELECT
      id,
      name,
      email,
      role,
      sidebar_permissions,
      registered_at,
      last_login_at,
      last_active_at,
      is_active,
      created_at,
      updated_at
    FROM app_users
    WHERE is_active = TRUE
    ORDER BY COALESCE(last_active_at, last_login_at, registered_at) DESC, id ASC
  `);

  return result.rows.map(mapUserRow);
}

async function getUserByEmail(email) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!normalizedEmail) return null;

  const result = await pool.query(
    `
      SELECT
        id,
        name,
        email,
        role,
        sidebar_permissions,
        password_hash,
        registered_at,
        last_login_at,
        last_active_at,
        is_active,
        created_at,
        updated_at
      FROM app_users
      WHERE LOWER(email) = $1
      LIMIT 1
    `,
    [normalizedEmail]
  );

  return result.rows[0] || null;
}

async function getUserById(userId) {
  const id = toPositiveInteger(userId);
  if (!id) return null;

  const result = await pool.query(
    `
      SELECT
        id,
        name,
        email,
        role,
        sidebar_permissions,
        password_hash,
        registered_at,
        last_login_at,
        last_active_at,
        is_active,
        created_at,
        updated_at
      FROM app_users
      WHERE id = $1
      LIMIT 1
    `,
    [id]
  );

  return result.rows[0] || null;
}

async function markUserActive(userId, isActive) {
  const id = toPositiveInteger(userId);
  if (!id) return null;

  await pool.query(
    `
      UPDATE app_users
      SET
        is_active = $1,
        last_active_at = NOW(),
        updated_at = NOW()
      WHERE id = $2
    `,
    [Boolean(isActive), id]
  );

  return getUserById(id);
}

async function registerUser(payload) {
  const name = String(payload?.name || '').trim();
  const email = String(payload?.email || '').trim().toLowerCase();
  const password = String(payload?.password || '');

  if (!name) {
    const error = new Error('Ad soyad zorunludur.');
    error.status = 400;
    throw error;
  }

  if (!email) {
    const error = new Error('E-posta zorunludur.');
    error.status = 400;
    throw error;
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    const error = new Error('Gecerli bir e-posta adresi girin.');
    error.status = 400;
    throw error;
  }

  if (password.length < 6) {
    const error = new Error('Sifre en az 6 karakter olmali.');
    error.status = 400;
    throw error;
  }

  const existing = await getUserByEmail(email);
  if (existing) {
    const error = new Error('Bu e-posta adresi zaten kullaniliyor.');
    error.status = 409;
    throw error;
  }

  const userCountResult = await pool.query('SELECT COUNT(*)::int AS count FROM app_users');
  const userCount = Number(userCountResult.rows[0]?.count) || 0;
  const role = userCount === 0 ? USER_ROLES.PATRON : USER_ROLES.KULLANICI;
  const sidebarPermissions = getDefaultSidebarPermissionsForRole(role);

  const passwordHash = await hashPassword(password);

  const result = await pool.query(
    `
      INSERT INTO app_users (name, email, password_hash, role, sidebar_permissions, registered_at, last_login_at, last_active_at, is_active, updated_at)
      VALUES ($1, $2, $3, $4, $5, NOW(), NOW(), NOW(), TRUE, NOW())
      RETURNING
        id,
        name,
        email,
        role,
        sidebar_permissions,
        registered_at,
        last_login_at,
        last_active_at,
        is_active,
        created_at,
        updated_at
    `,
    [name, email, passwordHash, role, sidebarPermissions]
  );

  return result.rows[0] ? mapUserRow(result.rows[0]) : null;
}

async function loginUser(payload) {
  const email = String(payload?.email || '').trim().toLowerCase();
  const password = String(payload?.password || '');

  if (!email || !password) {
    const error = new Error('E-posta ve sifre zorunludur.');
    error.status = 400;
    throw error;
  }

  const existing = await getUserByEmail(email);
  if (!existing) {
    const error = new Error('Kullanici bulunamadi.');
    error.status = 404;
    throw error;
  }

  const passwordMatches = await verifyPassword(password, existing.password_hash);
  if (!passwordMatches) {
    const error = new Error('E-posta veya sifre hatali.');
    error.status = 401;
    throw error;
  }

  if (!String(existing.password_hash || '').startsWith('$2')) {
    const migratedHash = await hashPassword(password);
    await pool.query(
      `
        UPDATE app_users
        SET password_hash = $1, updated_at = NOW()
        WHERE id = $2
      `,
      [migratedHash, existing.id]
    );
  }

  await pool.query(
    `
      UPDATE app_users
      SET
        last_login_at = NOW(),
        last_active_at = NOW(),
        is_active = TRUE,
        updated_at = NOW()
      WHERE id = $1
    `,
    [existing.id]
  );

  const userRow = await getUserById(existing.id);
  return userRow ? mapUserRow(userRow) : null;
}

async function resolveActorUser(input) {
  const actorId = toPositiveInteger(input?.actorUserId || input?.userId || input?.id);
  const actorEmail = String(input?.actorEmail || input?.email || '').trim().toLowerCase();

  if (actorId) {
    return getUserById(actorId);
  }

  if (actorEmail) {
    return getUserByEmail(actorEmail);
  }

  return null;
}

function listDatesBetween(checkIn, checkOut) {
  const start = new Date(checkIn + 'T00:00:00Z');
  const end = new Date(checkOut + 'T00:00:00Z');
  const days = [];
  for (let cursor = new Date(start); cursor < end; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    days.push(cursor.toISOString().slice(0, 10));
  }
  return days;
}

function calculateNights(checkIn, checkOut) {
  const days = listDatesBetween(checkIn, checkOut);
  return days.length;
}

async function resolveNightlyPrice({ hotelId, roomTypeId, checkIn }) {
  const rateResult = await pool.query(
    `
      SELECT nightly_price
      FROM pricing_rates
      WHERE hotel_id = $1
        AND ($2::int IS NULL OR room_type_id = $2)
        AND is_active = TRUE
        AND start_date <= $3::date
        AND end_date >= $3::date
      ORDER BY updated_at DESC, id DESC
      LIMIT 1
    `,
    [hotelId, roomTypeId || null, checkIn]
  );

  if (rateResult.rows.length) {
    return Number(rateResult.rows[0].nightly_price) || 0;
  }

  if (roomTypeId) {
    const roomTypeResult = await pool.query('SELECT base_price FROM room_types WHERE id = $1 LIMIT 1', [roomTypeId]);
    if (roomTypeResult.rows.length) {
      return Number(roomTypeResult.rows[0].base_price) || 0;
    }
  }

  const hotelResult = await pool.query('SELECT price FROM hotels WHERE id = $1 LIMIT 1', [hotelId]);
  return Number(hotelResult.rows[0]?.price) || 0;
}

async function resolveCampaignDiscount({ code, baseAmount, userId }) {
  const normalizedCode = String(code || '').trim().toUpperCase();
  if (!normalizedCode) {
    return { campaignId: null, code: '', discountAmount: 0 };
  }

  const campaignResult = await pool.query(
    `
      SELECT id, code, discount_type, discount_value, min_total, usage_limit
      FROM campaigns
      WHERE UPPER(code) = $1
        AND is_active = TRUE
        AND (start_at IS NULL OR start_at <= NOW())
        AND (end_at IS NULL OR end_at >= NOW())
      LIMIT 1
    `,
    [normalizedCode]
  );

  if (!campaignResult.rows.length) {
    const error = new Error('Kupon bulunamadi veya aktif degil.');
    error.status = 400;
    throw error;
  }

  const campaign = campaignResult.rows[0];
  if ((Number(campaign.min_total) || 0) > baseAmount) {
    const error = new Error('Bu kupon icin minimum tutar kosulu saglanmadi.');
    error.status = 400;
    throw error;
  }

  if (campaign.usage_limit) {
    const usageCountResult = await pool.query(
      'SELECT COUNT(*)::int AS count FROM coupon_redemptions WHERE campaign_id = $1',
      [campaign.id]
    );
    const count = Number(usageCountResult.rows[0]?.count) || 0;
    if (count >= Number(campaign.usage_limit)) {
      const error = new Error('Bu kuponun kullanim limiti doldu.');
      error.status = 400;
      throw error;
    }
  }

  const userUsedResult = await pool.query(
    'SELECT COUNT(*)::int AS count FROM coupon_redemptions WHERE campaign_id = $1 AND user_id = $2',
    [campaign.id, userId]
  );
  if ((Number(userUsedResult.rows[0]?.count) || 0) > 0) {
    const error = new Error('Bu kuponu daha once kullandiniz.');
    error.status = 400;
    throw error;
  }

  const discountType = String(campaign.discount_type || 'percent').toLowerCase();
  const discountValue = Number(campaign.discount_value) || 0;
  const rawDiscount = discountType === 'amount'
    ? discountValue
    : (baseAmount * discountValue / 100);

  return {
    campaignId: campaign.id,
    code: campaign.code,
    discountAmount: Math.max(0, Math.min(baseAmount, Math.round(rawDiscount)))
  };
}

async function ensureAvailabilityRows({ hotelId, roomTypeId, dates }) {
  for (const dateValue of dates) {
    const existingResult = await pool.query(
      `
        SELECT id, total_inventory, booked_inventory
        FROM availability_calendar
        WHERE room_type_id = $1 AND available_date = $2::date
        LIMIT 1
      `,
      [roomTypeId, dateValue]
    );

    if (!existingResult.rows.length) {
      const roomTypeResult = await pool.query('SELECT total_inventory FROM room_types WHERE id = $1 LIMIT 1', [roomTypeId]);
      const totalInventory = Number(roomTypeResult.rows[0]?.total_inventory) || 12;
      await pool.query(
        `
          INSERT INTO availability_calendar (hotel_id, room_type_id, available_date, total_inventory, booked_inventory, updated_at)
          VALUES ($1, $2, $3::date, $4, 0, NOW())
        `,
        [hotelId, roomTypeId, dateValue, totalInventory]
      );
    }
  }
}

async function reserveInventory({ roomTypeId, dates }) {
  for (const dateValue of dates) {
    const updateResult = await pool.query(
      `
        UPDATE availability_calendar
        SET booked_inventory = booked_inventory + 1, updated_at = NOW()
        WHERE room_type_id = $1
          AND available_date = $2::date
          AND booked_inventory < total_inventory
        RETURNING id
      `,
      [roomTypeId, dateValue]
    );

    if (!updateResult.rows.length) {
      const error = new Error('Secilen tarihte musaitlik kalmadi: ' + dateValue);
      error.status = 409;
      throw error;
    }
  }
}

async function releaseInventory({ roomTypeId, dates }) {
  for (const dateValue of dates) {
    await pool.query(
      `
        UPDATE availability_calendar
        SET booked_inventory = GREATEST(booked_inventory - 1, 0), updated_at = NOW()
        WHERE room_type_id = $1 AND available_date = $2::date
      `,
      [roomTypeId, dateValue]
    );
  }
}

async function createReservation(payload, authUser) {
  const userId = toPositiveInteger(authUser?.userId);
  const hotelId = toPositiveInteger(payload?.hotelId);
  const roomTypeId = toPositiveInteger(payload?.roomTypeId);
  const checkIn = String(payload?.checkIn || '').trim();
  const checkOut = String(payload?.checkOut || '').trim();
  const guestCount = Math.max(1, Number(payload?.guestCount) || 1);
  const couponCode = String(payload?.couponCode || '').trim();

  if (!userId) {
    const error = new Error('Rezervasyon icin giris yapmaniz gerekiyor.');
    error.status = 401;
    throw error;
  }
  if (!hotelId || !roomTypeId || !checkIn || !checkOut) {
    const error = new Error('hotelId, roomTypeId, checkIn ve checkOut alanlari zorunludur.');
    error.status = 400;
    throw error;
  }

  const nights = calculateNights(checkIn, checkOut);
  if (nights <= 0) {
    const error = new Error('Gecerli bir tarih araligi secin.');
    error.status = 400;
    throw error;
  }

  const nightlyPrice = await resolveNightlyPrice({ hotelId, roomTypeId, checkIn });
  const baseAmount = Math.round(nightlyPrice * nights);
  const campaignDiscount = await resolveCampaignDiscount({ code: couponCode, baseAmount, userId });
  const discountAmount = campaignDiscount.discountAmount;
  const totalAmount = Math.max(0, baseAmount - discountAmount);
  const dates = listDatesBetween(checkIn, checkOut);

  await pool.query('BEGIN');
  try {
    await ensureAvailabilityRows({ hotelId, roomTypeId, dates });
    await reserveInventory({ roomTypeId, dates });

    const reservationResult = await pool.query(
      `
        INSERT INTO reservations (
          user_id, hotel_id, room_type_id, check_in, check_out, guest_count,
          nights, base_amount, discount_amount, total_amount, status, coupon_code, updated_at
        )
        VALUES ($1, $2, $3, $4::date, $5::date, $6, $7, $8, $9, $10, 'confirmed', $11, NOW())
        RETURNING *
      `,
      [userId, hotelId, roomTypeId, checkIn, checkOut, guestCount, nights, baseAmount, discountAmount, totalAmount, campaignDiscount.code || null]
    );

    const reservation = reservationResult.rows[0];

    await pool.query(
      `
        INSERT INTO reservation_status_logs (reservation_id, old_status, new_status, note, actor_user_id)
        VALUES ($1, NULL, 'confirmed', 'Rezervasyon olusturuldu.', $2)
      `,
      [reservation.id, userId]
    );

    if (campaignDiscount.campaignId) {
      await pool.query(
        `
          INSERT INTO coupon_redemptions (campaign_id, user_id, reservation_id, code, discount_amount)
          VALUES ($1, $2, $3, $4, $5)
        `,
        [campaignDiscount.campaignId, userId, reservation.id, campaignDiscount.code, discountAmount]
      );
    }

    await pool.query('COMMIT');
    return reservation;
  } catch (error) {
    await pool.query('ROLLBACK');
    throw error;
  }
}

function mapReservationRow(row) {
  return {
    id: row.id,
    userId: row.user_id,
    hotelId: row.hotel_id,
    roomTypeId: row.room_type_id,
    checkIn: row.check_in,
    checkOut: row.check_out,
    guestCount: row.guest_count,
    nights: row.nights,
    baseAmount: Number(row.base_amount) || 0,
    discountAmount: Number(row.discount_amount) || 0,
    totalAmount: Number(row.total_amount) || 0,
    status: row.status,
    couponCode: row.coupon_code || '',
    cancelReason: row.cancel_reason || '',
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : '',
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : ''
  };
}

async function insertActivityLog({ actorUserId = null, actorEmail = '', action = '', targetType = '', targetId = null, details = {} } = {}) {
  try {
    await pool.query(
      `
        INSERT INTO admin_activity_logs (actor_user_id, actor_email, action, target_type, target_id, details)
        VALUES ($1, $2, $3, $4, $5, $6)
      `,
      [actorUserId || null, actorEmail || null, String(action || ''), String(targetType || ''), targetId || null, details || {}]
    );
  } catch (error) {
    console.error('Activity log write failed:', error?.message || error);
  }
}

registerRoutes(app, {
  pool,
  authLimiter,
  upload,
  requireAuth,
  requireRole,
  USER_ROLES,
  RECAPTCHA_SITE_KEY,
  RECAPTCHA_SECRET_KEY,
  RECAPTCHA_MIN_SCORE,
  RECAPTCHA_ENTERPRISE_PROJECT_ID,
  RECAPTCHA_ENTERPRISE_API_KEY,
  RECAPTCHA_EXPECTED_ACTION,
  MAINTENANCE_MODE,
  MAINTENANCE_MESSAGE,
  MAINTENANCE_TOKEN_TTL,
  MAINTENANCE_TOKEN_TTL_SECONDS,
  MAINTENANCE_BOOTSTRAP_KEY,
  MAINTENANCE_COOKIE_NAME,
  buildMaintenanceCookie,
  clearMaintenanceCookie,
  verifyGoogleHumanCheckToken,
  hashMaintenanceKey,
  generateMaintenanceKey,
  issueMaintenanceToken,
  verifyMaintenanceToken,
  extractMaintenanceToken,
  normalizeUserRole,
  sanitizeSidebarPermissions,
  toBoolean,
  toPositiveInteger,
  slugify,
  listDatesBetween,
  releaseInventory,
  createReservation,
  mapReservationRow,
  mapUserRow,
  mapCityRow,
  mapHotelRow,
  mapIntegrationRow,
  mapApiModuleRow,
  registerUser,
  loginUser,
  getUserById,
  issueAuthTokens,
  revokeRefreshTokensForUser,
  getUsers,
  getActiveUsers,
  getCitiesWithCounts,
  getHotels,
  buildCityPayload,
  resolveCityId,
  buildHotelPayload,
  resolveUploadCategory,
  getApiIntegrations,
  buildIntegrationPayload,
  getApiIntegrationById,
  checkApiIntegration,
  handleApiError,
  insertActivityLog
});

async function ensureSelfSignedCert() {
  if (!fsSync.existsSync(CERT_DIR)) {
    fsSync.mkdirSync(CERT_DIR, { recursive: true });
  }

  const certExists = fsSync.existsSync(CERT_FILE) && fsSync.existsSync(KEY_FILE);
  if (certExists) {
    return {
      cert: fsSync.readFileSync(CERT_FILE, 'utf8'),
      key: fsSync.readFileSync(KEY_FILE, 'utf8'),
      generated: false
    };
  }

  const attrs = [
    { name: 'commonName', value: 'localhost' },
    { name: 'organizationName', value: 'TatilRezerve' },
    { name: 'countryName', value: 'TR' }
  ];

  const pems = await selfsigned.generate(attrs, {
    keySize: 2048,
    days: 825,
    extensions: [
      {
        name: 'subjectAltName',
        altNames: [
          { type: 2, value: 'localhost' },
          { type: 2, value: 'tatilrezerve.local' },
          { type: 7, ip: '127.0.0.1' }
        ]
      }
    ]
  });

  fsSync.writeFileSync(CERT_FILE, pems.cert, 'utf8');
  fsSync.writeFileSync(KEY_FILE, pems.private, 'utf8');

  return { cert: pems.cert, key: pems.private, generated: true };
}

async function startServer() {
  try {
    await fs.mkdir(cityUploadDir, { recursive: true });
    await fs.mkdir(hotelUploadDir, { recursive: true });
    await ensureSchema();
    await seedCatalogIfEmpty();
    await seedApiIntegrationsIfEmpty();

    const httpServer = http.createServer(app);
    httpServer.listen(PORT, () => {
      console.log(`HTTP  ready  on http://localhost:${PORT}`);
    });

    if (HTTPS_ENABLED) {
      try {
        const { cert, key, generated } = await ensureSelfSignedCert();
        if (generated) {
          console.log(`[cert] self-signed sertifika olusturuldu: ${CERT_FILE}`);
        }
        const httpsServer = https.createServer({ cert, key }, app);
        httpsServer.listen(HTTPS_PORT, () => {
          console.log(`HTTPS ready  on https://localhost:${HTTPS_PORT}`);
          console.log('[https] self-signed sertifika kullaniliyor; tarayicinin ilk uyarisini onaylayin.');
        });
      } catch (httpsError) {
        console.error('[https] sertifika ile baslatilamadi:', httpsError?.message || httpsError);
      }
    }

    console.log(`[boot] MAINTENANCE_MODE=${MAINTENANCE_MODE} BOOTSTRAP_KEY_SET=${Boolean(MAINTENANCE_BOOTSTRAP_KEY)}`);
  } catch (error) {
    console.error('Sunucu baslatilirken hata olustu:', error);
    process.exit(1);
  }
}

startServer();