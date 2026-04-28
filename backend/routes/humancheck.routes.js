function registerHumancheckRoutes(app, deps) {
  const {
    authLimiter,
    RECAPTCHA_SITE_KEY,
    RECAPTCHA_SECRET_KEY,
    RECAPTCHA_MIN_SCORE,
    RECAPTCHA_ENTERPRISE_PROJECT_ID,
    RECAPTCHA_ENTERPRISE_API_KEY,
    verifyGoogleHumanCheckToken
  } = deps;

  app.get('/api/humancheck/site-config', (_req, res) => {
    const enterpriseConfigured = Boolean(RECAPTCHA_SITE_KEY && RECAPTCHA_ENTERPRISE_PROJECT_ID && RECAPTCHA_ENTERPRISE_API_KEY);
    const standardConfigured = Boolean(RECAPTCHA_SITE_KEY && RECAPTCHA_SECRET_KEY);
    const googleConfigured = enterpriseConfigured || standardConfigured;

    res.json({
      provider: enterpriseConfigured ? 'google-enterprise' : 'google',
      siteKey: RECAPTCHA_SITE_KEY || '',
      minScore: RECAPTCHA_MIN_SCORE,
      enabled: googleConfigured,
      enterprise: enterpriseConfigured
    });
  });

  app.post('/api/humancheck/verify', authLimiter, async (req, res) => {
    const token = String(req.body?.token || '').trim();
    const provider = String(req.body?.provider || '').trim().toLowerCase();
    const enterpriseConfigured = Boolean(RECAPTCHA_SITE_KEY && RECAPTCHA_ENTERPRISE_PROJECT_ID && RECAPTCHA_ENTERPRISE_API_KEY);
    const standardConfigured = Boolean(RECAPTCHA_SECRET_KEY && RECAPTCHA_SITE_KEY);
    const googleConfigured = enterpriseConfigured || standardConfigured;
    const useGoogle = provider === 'google' || provider === 'google-enterprise' || (!provider && googleConfigured);

    if (!token) {
      res.status(400).json({ message: 'Human check token zorunludur.', verified: false, provider: provider || 'local' });
      return;
    }

    if (useGoogle) {
      const result = await verifyGoogleHumanCheckToken(token, req.ip || '');
      res.status(result.verified ? 200 : 401).json(result);
      return;
    }

    const minLengthOk = token.length >= 8;
    res.json({
      verified: minLengthOk,
      score: minLengthOk ? 0.9 : 0.1,
      message: minLengthOk ? 'Human check basarili.' : 'Human check dogrulanamadi.',
      provider: 'local'
    });
  });

  // Math challenge fallback for local/blocked environments
  app.get('/api/humancheck/math-challenge', authLimiter, async (_req, res) => {
    try {
      const a = Math.floor(Math.random() * 9) + 1; // 1..9
      const b = Math.floor(Math.random() * 9) + 1;
      const expires = Date.now() + 90 * 1000; // 90 seconds
      const payload = JSON.stringify({ a, b, expires });
      const sig = require('crypto').createHmac('sha256', String(process.env.JWT_SECRET || 'dev-jwt-secret-change-me')).update(payload).digest('hex');

      res.json({ challenge: { a, b, expires, sig }, provider: 'local' });
    } catch (error) {
      res.status(500).json({ message: 'Math challenge olusturulurken hata olustu.' });
    }
  });

  app.post('/api/humancheck/verify-math', authLimiter, async (req, res) => {
    try {
      const a = Number(req.body?.a || 0);
      const b = Number(req.body?.b || 0);
      const answer = Number(req.body?.answer || NaN);
      const expires = Number(req.body?.expires || 0);
      const sig = String(req.body?.sig || '').trim();

      if (!Number.isFinite(a) || !Number.isFinite(b) || !Number.isFinite(answer) || !sig || !expires) {
        res.status(400).json({ message: 'Gecersiz math challenge verisi.' });
        return;
      }

      const now = Date.now();
      if (now > expires) {
        res.status(400).json({ message: 'Math challenge suresi doldu.', verified: false, provider: 'local' });
        return;
      }

      const payload = JSON.stringify({ a, b, expires });
      const expected = require('crypto').createHmac('sha256', String(process.env.JWT_SECRET || 'dev-jwt-secret-change-me')).update(payload).digest('hex');

      if (expected !== sig) {
        res.status(400).json({ message: 'Math challenge imzasi gecerli degil.', verified: false, provider: 'local' });
        return;
      }

      const sum = a + b;
      const ok = Number(answer) === sum;
      res.json({ verified: ok, message: ok ? 'Dogru cevap.' : 'Yanlis cevap.', provider: 'local' });
    } catch (error) {
      res.status(500).json({ message: 'Math dogrulama sırasında hata olustu.', verified: false, provider: 'local' });
    }
  });
}

module.exports = registerHumancheckRoutes;
