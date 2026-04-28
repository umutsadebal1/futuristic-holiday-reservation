function registerMaintenanceRoutes(app, deps) {
  const {
    pool,
    MAINTENANCE_MODE,
    MAINTENANCE_MESSAGE,
    MAINTENANCE_TOKEN_TTL,
    MAINTENANCE_TOKEN_TTL_SECONDS,
    MAINTENANCE_BOOTSTRAP_KEY,
    hashMaintenanceKey,
    generateMaintenanceKey,
    issueMaintenanceToken,
    verifyMaintenanceToken,
    extractMaintenanceToken,
    buildMaintenanceCookie,
    clearMaintenanceCookie,
    requireAuth,
    requireRole,
    USER_ROLES,
    toPositiveInteger,
    handleApiError
  } = deps;

  app.get('/api/maintenance/status', (_req, res) => {
    res.json({
      enabled: MAINTENANCE_MODE,
      message: MAINTENANCE_MESSAGE || 'Bakim modu aktif. Erisim anahtari gerekir.'
    });
  });

  app.get('/api/maintenance/session', (req, res) => {
    const token = extractMaintenanceToken(req);
    const decoded = token ? verifyMaintenanceToken(token) : null;
    res.json({ valid: Boolean(decoded) });
  });

  app.post('/api/maintenance/verify', async (req, res) => {
    try {
      const rawKey = String(req.body?.key || '').trim();
      if (!rawKey) {
        res.status(400).json({ message: 'Erisim anahtari zorunludur.' });
        return;
      }

      const keyHash = hashMaintenanceKey(rawKey);
      const result = await pool.query(
        `
          SELECT id, is_active, expires_at
          FROM maintenance_access_keys
          WHERE key_hash = $1
          LIMIT 1
        `,
        [keyHash]
      );

      if (!result.rows.length) {
        const bootstrapKey = String(MAINTENANCE_BOOTSTRAP_KEY || '').trim();
        if (bootstrapKey && rawKey === bootstrapKey) {
          await pool.query(
            `
              INSERT INTO maintenance_access_keys (key_hash, label)
              VALUES ($1, $2)
              ON CONFLICT (key_hash) DO NOTHING
            `,
            [keyHash, 'Bootstrap']
          );

          const fallback = await pool.query(
            `
              SELECT id, is_active, expires_at
              FROM maintenance_access_keys
              WHERE key_hash = $1
              LIMIT 1
            `,
            [keyHash]
          );

          if (!fallback.rows.length) {
            res.status(401).json({ message: 'Gecersiz erisim anahtari.' });
            return;
          }

          result.rows = fallback.rows;
        } else {
          res.status(401).json({ message: 'Gecersiz erisim anahtari.' });
          return;
        }
      }

      const row = result.rows[0];
      if (row.is_active === false) {
        res.status(403).json({ message: 'Bu anahtar devre disi birakildi.' });
        return;
      }

      if (row.expires_at && new Date(row.expires_at).getTime() <= Date.now()) {
        res.status(403).json({ message: 'Bu anahtarin suresi dolmus.' });
        return;
      }

      await pool.query(
        `
          UPDATE maintenance_access_keys
          SET last_used_at = NOW()
          WHERE id = $1
        `,
        [row.id]
      );

      const token = issueMaintenanceToken(row);
      if (typeof buildMaintenanceCookie === 'function') {
        res.setHeader('Set-Cookie', buildMaintenanceCookie(token, MAINTENANCE_TOKEN_TTL_SECONDS));
      }
      res.json({ token, expiresIn: MAINTENANCE_TOKEN_TTL });
    } catch (error) {
      handleApiError(res, error);
    }
  });

  app.post('/api/maintenance/logout', (_req, res) => {
    if (typeof clearMaintenanceCookie === 'function') {
      res.setHeader('Set-Cookie', clearMaintenanceCookie());
    }
    res.json({ ok: true });
  });

  app.get('/api/admin/maintenance-keys', requireAuth, requireRole([USER_ROLES.PATRON, USER_ROLES.UST_YETKILI]), async (_req, res) => {
    try {
      const result = await pool.query(
        `
          SELECT id, label, is_active, created_at, last_used_at, expires_at
          FROM maintenance_access_keys
          ORDER BY created_at DESC
        `
      );

      res.json({ keys: result.rows.map((row) => ({
        id: row.id,
        label: row.label || '',
        isActive: row.is_active === true,
        createdAt: row.created_at ? new Date(row.created_at).toISOString() : '',
        lastUsedAt: row.last_used_at ? new Date(row.last_used_at).toISOString() : '',
        expiresAt: row.expires_at ? new Date(row.expires_at).toISOString() : ''
      })) });
    } catch (error) {
      handleApiError(res, error);
    }
  });

  app.post('/api/admin/maintenance-keys', requireAuth, requireRole([USER_ROLES.PATRON, USER_ROLES.UST_YETKILI]), async (req, res) => {
    try {
      const label = String(req.body?.label || '').trim();
      const expiresAt = req.body?.expiresAt ? new Date(req.body.expiresAt) : null;
      const expiresAtValue = expiresAt && !Number.isNaN(expiresAt.getTime()) ? expiresAt.toISOString() : null;

      let rawKey = '';
      let createdRow = null;

      for (let attempt = 0; attempt < 3; attempt += 1) {
        rawKey = generateMaintenanceKey();
        const keyHash = hashMaintenanceKey(rawKey);

        const inserted = await pool.query(
          `
            INSERT INTO maintenance_access_keys (key_hash, label, expires_at)
            VALUES ($1, $2, $3)
            ON CONFLICT (key_hash) DO NOTHING
            RETURNING id, label, is_active, created_at, expires_at
          `,
          [keyHash, label, expiresAtValue]
        );

        if (inserted.rows.length) {
          createdRow = inserted.rows[0];
          break;
        }
      }

      if (!createdRow) {
        res.status(500).json({ message: 'Anahtar olusturulamadi, tekrar deneyin.' });
        return;
      }

      res.status(201).json({
        key: rawKey,
        keyInfo: {
          id: createdRow.id,
          label: createdRow.label || '',
          isActive: createdRow.is_active === true,
          createdAt: createdRow.created_at ? new Date(createdRow.created_at).toISOString() : '',
          expiresAt: createdRow.expires_at ? new Date(createdRow.expires_at).toISOString() : ''
        }
      });
    } catch (error) {
      handleApiError(res, error);
    }
  });

  app.put('/api/admin/maintenance-keys/:id/disable', requireAuth, requireRole([USER_ROLES.PATRON, USER_ROLES.UST_YETKILI]), async (req, res) => {
    try {
      const keyId = toPositiveInteger(req.params.id);
      if (!keyId) {
        res.status(400).json({ message: 'Gecerli bir anahtar id girin.' });
        return;
      }

      const updated = await pool.query(
        `
          UPDATE maintenance_access_keys
          SET is_active = FALSE
          WHERE id = $1
          RETURNING id, label, is_active, created_at, last_used_at, expires_at
        `,
        [keyId]
      );

      if (!updated.rows.length) {
        res.status(404).json({ message: 'Anahtar bulunamadi.' });
        return;
      }

      const row = updated.rows[0];
      res.json({
        message: 'Anahtar devre disi birakildi.',
        key: {
          id: row.id,
          label: row.label || '',
          isActive: row.is_active === true,
          createdAt: row.created_at ? new Date(row.created_at).toISOString() : '',
          lastUsedAt: row.last_used_at ? new Date(row.last_used_at).toISOString() : '',
          expiresAt: row.expires_at ? new Date(row.expires_at).toISOString() : ''
        }
      });
    } catch (error) {
      handleApiError(res, error);
    }
  });
}

module.exports = registerMaintenanceRoutes;
