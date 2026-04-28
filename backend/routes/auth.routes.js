function registerAuthRoutes(app, deps) {
  const {
    authLimiter,
    registerUser,
    loginUser,
    getUserById,
    issueAuthTokens,
    requireAuth,
    toPositiveInteger,
    mapUserRow,
    revokeRefreshTokensForUser,
    pool,
    handleApiError
  } = deps;

  app.post('/api/auth/register', authLimiter, async (req, res) => {
    try {
      const user = await registerUser(req.body || {});
      const userRow = await getUserById(user.id);
      const tokens = userRow ? await issueAuthTokens(userRow) : null;
      res.status(201).json({ message: 'Kullanici kaydedildi.', user, tokens });
    } catch (error) {
      handleApiError(res, error);
    }
  });

  app.post('/api/auth/login', authLimiter, async (req, res) => {
    try {
      const user = await loginUser(req.body || {});
      const userRow = await getUserById(user.id);
      const tokens = userRow ? await issueAuthTokens(userRow) : null;
      res.json({ message: 'Giris basarili.', user, tokens });
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

      const user = await getUserById(target.id);
      res.json({ message: 'Cikis yapildi.', user: user ? mapUserRow(user) : null });
    } catch (error) {
      handleApiError(res, error);
    }
  });
}

module.exports = registerAuthRoutes;
