function registerAuthRoutes(app, deps) {
  const {
    authLimiter,
    registerUser,
    loginUser,
    googleAuthUser,
    verifyGoogleIdToken,
    getUserById,
    issueAuthTokens,
    requireAuth,
    toPositiveInteger,
    mapUserRow,
    revokeRefreshTokensForUser,
    buildAuthCookie,
    clearAuthCookie,
    pool,
    handleApiError
  } = deps;

  const JWT_EXPIRES_IN_MS = 8 * 60 * 60;       // 8 saat (saniye)
  const REFRESH_EXPIRES_IN_MS = 7 * 24 * 60 * 60; // 7 gün (saniye)

  function setAuthCookies(res, tokens) {
    res.setHeader('Set-Cookie', [
      buildAuthCookie('authAccessToken',  tokens.accessToken,  JWT_EXPIRES_IN_MS),
      buildAuthCookie('authRefreshToken', tokens.refreshToken, REFRESH_EXPIRES_IN_MS)
    ]);
  }

  function clearAuthCookies(res) {
    res.setHeader('Set-Cookie', [
      clearAuthCookie('authAccessToken'),
      clearAuthCookie('authRefreshToken')
    ]);
  }

  app.post('/api/auth/register', authLimiter, async (req, res) => {
    try {
      const user = await registerUser(req.body || {});
      const userRow = await getUserById(user.id);
      if (userRow) {
        const tokens = await issueAuthTokens(userRow);
        setAuthCookies(res, tokens);
      }
      res.status(201).json({ message: 'Kullanici kaydedildi.', user });
    } catch (error) {
      handleApiError(res, error);
    }
  });

  app.post('/api/auth/login', authLimiter, async (req, res) => {
    try {
      const user = await loginUser(req.body || {});
      const userRow = await getUserById(user.id);
      if (userRow) {
        const tokens = await issueAuthTokens(userRow);
        setAuthCookies(res, tokens);
      }
      res.json({ message: 'Giris basarili.', user });
    } catch (error) {
      handleApiError(res, error);
    }
  });

  app.get('/api/auth/me', requireAuth, async (req, res) => {
    try {
      const userId = toPositiveInteger(req.auth?.userId);
      const user = userId ? await getUserById(userId) : null;

      if (!user) {
        res.status(404).json({ message: 'Kullanici bulunamadi.' });
        return;
      }

      res.json({ user: mapUserRow(user) });
    } catch (error) {
      handleApiError(res, error);
    }
  });

  app.post('/api/auth/logout', requireAuth, async (req, res) => {
    try {
      const userId = toPositiveInteger(req.auth?.userId);
      const target = userId ? await getUserById(userId) : null;

      if (!target) {
        clearAuthCookies(res);
        res.status(404).json({ message: 'Kullanici bulunamadi.' });
        return;
      }

      await revokeRefreshTokensForUser(target.id);

      await pool.query(
        `
          UPDATE app_users
          SET
            is_active = FALSE,
            last_active_at = NOW(),
            updated_at = NOW()
          WHERE id = $1
        `,
        [target.id]
      );

      clearAuthCookies(res);
      const user = await getUserById(target.id);
      res.json({ message: 'Cikis yapildi.', user: user ? mapUserRow(user) : null });
    } catch (error) {
      handleApiError(res, error);
    }
  });

  app.post('/api/auth/google', authLimiter, async (req, res) => {
    try {
      const credential = String(req.body?.credential || '').trim();
      if (!credential) {
        res.status(400).json({ message: 'Google kimlik belgesi zorunludur.' });
        return;
      }

      const googlePayload = await verifyGoogleIdToken(credential);
      const googleId = String(googlePayload.sub || '').trim();
      const email = String(googlePayload.email || '').trim().toLowerCase();
      const name = String(googlePayload.name || googlePayload.email || '').trim();

      if (!googleId || !email) {
        res.status(400).json({ message: 'Google hesabından kimlik bilgisi alınamadı.' });
        return;
      }

      const userRow = await googleAuthUser({ googleId, email, name });
      if (!userRow) {
        res.status(500).json({ message: 'Kullanıcı işlemi başarısız.' });
        return;
      }

      const tokens = await issueAuthTokens(userRow);
      setAuthCookies(res, tokens);
      res.json({ message: 'Google ile giriş başarılı.', user: mapUserRow(userRow) });
    } catch (error) {
      handleApiError(res, error);
    }
  });
}

module.exports = registerAuthRoutes;
