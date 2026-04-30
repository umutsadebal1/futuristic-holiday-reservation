function registerAdminRoutes(app, deps) {
  const {
    pool,
    requireAuth,
    requireRole,
    USER_ROLES,
    toBoolean,
    toPositiveInteger,
    normalizeUserRole,
    sanitizeSidebarPermissions,
    mapApiModuleRow,
    getUsers,
    getActiveUsers,
    getUserById,
    mapUserRow,
    getCitiesWithCounts,
    mapCityRow,
    buildCityPayload,
    resolveCityId,
    buildHotelPayload,
    mapHotelRow,
    resolveUploadCategory,
    upload,
    getApiIntegrations,
    buildIntegrationPayload,
    getApiIntegrationById,
    checkApiIntegration,
    mapIntegrationRow,
    handleApiError
    ,
    insertActivityLog
  } = deps;

  app.use('/api/admin', requireAuth, requireRole([USER_ROLES.PATRON, USER_ROLES.UST_YETKILI, USER_ROLES.ALT_YETKILI]));

  app.get('/api/admin/users', async (_req, res) => {
    try {
      const [users, activeUsers] = await Promise.all([getUsers(), getActiveUsers()]);
      res.json({
        registeredUsers: users,
        activeUsers,
        summary: {
          totalRegistered: users.length,
          totalActive: activeUsers.length
        }
      });
    } catch (error) {
      handleApiError(res, error);
    }
  });

  app.get('/api/admin/users/registered', async (_req, res) => {
    try {
      const users = await getUsers();
      res.json({ users });
    } catch (error) {
      handleApiError(res, error);
    }
  });

  app.get('/api/admin/users/active', async (_req, res) => {
    try {
      const users = await getActiveUsers();
      res.json({ users });
    } catch (error) {
      handleApiError(res, error);
    }
  });

  app.put('/api/admin/users/:id/access', async (req, res) => {
    try {
      const targetUserId = toPositiveInteger(req.params.id);
      if (!targetUserId) {
        res.status(400).json({ message: 'Gecerli bir kullanici id degeri girin.' });
        return;
      }

      const actor = req.auth?.userId ? await getUserById(req.auth.userId) : null;
      if (!actor) {
        res.status(401).json({ message: 'Yetki atamasi icin gecerli bir oturum gerekli.' });
        return;
      }

      const actorRole = normalizeUserRole(actor.role, USER_ROLES.KULLANICI);
      if (actorRole !== USER_ROLES.PATRON) {
        res.status(403).json({ message: 'Bu islemi yalnizca patron yetkisi yapabilir.' });
        return;
      }

      const targetUser = await getUserById(targetUserId);
      if (!targetUser) {
        res.status(404).json({ message: 'Kullanici bulunamadi.' });
        return;
      }

      const role = normalizeUserRole(req.body?.role, normalizeUserRole(targetUser.role, USER_ROLES.KULLANICI));
      const sidebarPermissions = sanitizeSidebarPermissions(req.body?.sidebarPermissions, role);

      await pool.query(
        `
          UPDATE app_users
          SET
            role = $1,
            sidebar_permissions = $2,
            updated_at = NOW()
          WHERE id = $3
        `,
        [role, sidebarPermissions, targetUserId]
      );

      const updated = await getUserById(targetUserId);
      const mapped = updated ? mapUserRow(updated) : null;
      try { await insertActivityLog({ actorUserId: req.auth?.userId, actorEmail: req.auth?.email, action: 'update_user_access', targetType: 'user', targetId: targetUserId, details: { role, sidebarPermissions } }); } catch (_) {}
      res.json({ message: 'Kullanici yetkileri guncellendi.', user: mapped });
    } catch (error) {
      handleApiError(res, error);
    }
  });

  app.delete('/api/admin/users/:id', async (req, res) => {
    try {
      const targetUserId = toPositiveInteger(req.params.id);
      if (!targetUserId) {
        res.status(400).json({ message: 'Gecerli bir kullanici id degeri girin.' });
        return;
      }

      const actor = req.auth?.userId ? await getUserById(req.auth.userId) : null;
      if (!actor) {
        res.status(401).json({ message: 'Bu islem icin gecerli bir oturum gerekli.' });
        return;
      }

      const actorRole = normalizeUserRole(actor.role, USER_ROLES.KULLANICI);
      if (actorRole !== USER_ROLES.PATRON) {
        res.status(403).json({ message: 'Kullanici silme islemini yalnizca patron yetkisi yapabilir.' });
        return;
      }

      if (Number(actor.id) === targetUserId) {
        res.status(400).json({ message: 'Kendinizi silemezsiniz.' });
        return;
      }

      const targetUser = await getUserById(targetUserId);
      if (!targetUser) {
        res.status(404).json({ message: 'Kullanici bulunamadi.' });
        return;
      }

      await pool.query('DELETE FROM app_users WHERE id = $1', [targetUserId]);
      try { await insertActivityLog({ actorUserId: req.auth?.userId, actorEmail: req.auth?.email, action: 'delete_user', targetType: 'user', targetId: targetUserId, details: { email: targetUser.email, name: targetUser.name } }); } catch (_) {}
      res.json({ message: 'Kullanici silindi.', userId: targetUserId });
    } catch (error) {
      handleApiError(res, error);
    }
  });

  app.get('/api/admin/modules', async (_req, res) => {
    try {
      const result = await pool.query(
        `
          SELECT id, module_key, display_name, is_active, note, updated_at
          FROM api_management
          ORDER BY id ASC
        `
      );

      res.json({ modules: result.rows.map(mapApiModuleRow) });
    } catch (error) {
      handleApiError(res, error);
    }
  });

  app.put('/api/admin/modules/:moduleKey', requireRole([USER_ROLES.PATRON, USER_ROLES.UST_YETKILI, USER_ROLES.ALT_YETKILI]), async (req, res) => {
    try {
      const moduleKey = String(req.params.moduleKey || '').trim().toLowerCase();
      if (!moduleKey) {
        res.status(400).json({ message: 'Gecerli bir modul anahtari girin.' });
        return;
      }

      const isActive = toBoolean(req.body?.isActive, true);
      const note = String(req.body?.note || '').trim();

      const updated = await pool.query(
        `
          UPDATE api_management
          SET is_active = $1, note = $2, updated_at = NOW()
          WHERE module_key = $3
          RETURNING id, module_key, display_name, is_active, note, updated_at
        `,
        [isActive, note, moduleKey]
      );

      if (!updated.rows.length) {
        res.status(404).json({ message: 'Modul bulunamadi.' });
        return;
      }

      const moduleObj = mapApiModuleRow(updated.rows[0]);
      try { await insertActivityLog({ actorUserId: req.auth?.userId, actorEmail: req.auth?.email, action: 'toggle_module', targetType: 'module', targetId: null, details: { moduleKey, isActive: moduleObj.isActive } }); } catch (_) {}
      res.json({ message: 'Modul durumu guncellendi.', module: moduleObj });
    } catch (error) {
      handleApiError(res, error);
    }
  });

  app.get('/api/admin/activity', async (_req, res) => {
    try {
      const result = await pool.query(
        `
          SELECT id, actor_user_id, actor_email, action, target_type, target_id, details, created_at
          FROM admin_activity_logs
          ORDER BY created_at DESC
          LIMIT 50
        `
      );

      res.json({ logs: result.rows.map((r) => ({ id: r.id, actorUserId: r.actor_user_id, actorEmail: r.actor_email, action: r.action, targetType: r.target_type, targetId: r.target_id, details: r.details || {}, createdAt: r.created_at })) });
    } catch (error) {
      handleApiError(res, error);
    }
  });

  app.get('/api/admin/dashboard-insights', async (_req, res) => {
    try {
      const [recentResult, userActivityResult, reservationActivityResult, reservationStatusResult] = await Promise.all([
        pool.query(
          `
            SELECT record_type, record_name, record_time
            FROM (
              SELECT 'Sehir'::text AS record_type, c.name::text AS record_name, COALESCE(c.updated_at, c.created_at) AS record_time
              FROM cities c

              UNION ALL

              SELECT 'Otel'::text AS record_type, h.name::text AS record_name, COALESCE(h.updated_at, h.created_at) AS record_time
              FROM hotels h

              UNION ALL

              SELECT
                'Kullanici'::text AS record_type,
                TRIM(COALESCE(u.name, '') || CASE WHEN COALESCE(u.email, '') <> '' THEN ' (' || u.email || ')' ELSE '' END)::text AS record_name,
                COALESCE(u.last_active_at, u.last_login_at, u.updated_at, u.registered_at, u.created_at) AS record_time
              FROM app_users u

              UNION ALL

              SELECT 'API Modul'::text AS record_type, m.display_name::text AS record_name, COALESCE(m.updated_at, NOW()) AS record_time
              FROM api_management m

              UNION ALL

              SELECT 'API Baglantisi'::text AS record_type, i.name::text AS record_name, COALESCE(i.updated_at, i.created_at) AS record_time
              FROM api_integrations i

              UNION ALL

              SELECT
                'Rezervasyon'::text AS record_type,
                (COALESCE(h.name, 'Rezervasyon #' || r.id::text) || ' [' || COALESCE(r.status, 'confirmed') || ']')::text AS record_name,
                COALESCE(r.updated_at, r.created_at) AS record_time
              FROM reservations r
              LEFT JOIN hotels h ON h.id = r.hotel_id
            ) records
            WHERE record_time IS NOT NULL
            ORDER BY record_time DESC
            LIMIT 5
          `
        ),
        pool.query(
          `
            WITH days AS (
              SELECT generate_series((CURRENT_DATE - INTERVAL '6 day')::date, CURRENT_DATE::date, INTERVAL '1 day')::date AS day
            ),
            login_counts AS (
              SELECT DATE(last_login_at) AS day, COUNT(*)::int AS count
              FROM app_users
              WHERE last_login_at IS NOT NULL
                AND last_login_at >= (CURRENT_DATE - INTERVAL '6 day')
              GROUP BY DATE(last_login_at)
            ),
            logout_counts AS (
              SELECT DATE(last_active_at) AS day, COUNT(*)::int AS count
              FROM app_users
              WHERE is_active = FALSE
                AND last_active_at IS NOT NULL
                AND last_active_at >= (CURRENT_DATE - INTERVAL '6 day')
              GROUP BY DATE(last_active_at)
            )
            SELECT
              TO_CHAR(days.day, 'DD.MM') AS label,
              COALESCE(login_counts.count, 0)::int AS logins,
              COALESCE(logout_counts.count, 0)::int AS logouts
            FROM days
            LEFT JOIN login_counts ON login_counts.day = days.day
            LEFT JOIN logout_counts ON logout_counts.day = days.day
            ORDER BY days.day ASC
          `
        ),
        pool.query(
          `
            WITH days AS (
              SELECT generate_series((CURRENT_DATE - INTERVAL '6 day')::date, CURRENT_DATE::date, INTERVAL '1 day')::date AS day
            ),
            created_counts AS (
              SELECT DATE(created_at) AS day, COUNT(*)::int AS count
              FROM reservations
              WHERE created_at IS NOT NULL
                AND created_at >= (CURRENT_DATE - INTERVAL '6 day')
              GROUP BY DATE(created_at)
            ),
            cancelled_counts AS (
              SELECT DATE(updated_at) AS day, COUNT(*)::int AS count
              FROM reservations
              WHERE updated_at IS NOT NULL
                AND updated_at >= (CURRENT_DATE - INTERVAL '6 day')
                AND LOWER(COALESCE(status, '')) LIKE 'cancel%'
              GROUP BY DATE(updated_at)
            )
            SELECT
              TO_CHAR(days.day, 'DD.MM') AS label,
              COALESCE(created_counts.count, 0)::int AS created,
              COALESCE(cancelled_counts.count, 0)::int AS cancelled
            FROM days
            LEFT JOIN created_counts ON created_counts.day = days.day
            LEFT JOIN cancelled_counts ON cancelled_counts.day = days.day
            ORDER BY days.day ASC
          `
        ),
        pool.query(
          `
            SELECT COALESCE(status, 'unknown')::text AS status, COUNT(*)::int AS count
            FROM reservations
            GROUP BY COALESCE(status, 'unknown')
            ORDER BY count DESC, status ASC
          `
        )
      ]);

      res.json({
        recentRecords: recentResult.rows.map((row) => ({
          type: row.record_type,
          name: row.record_name,
          time: row.record_time ? new Date(row.record_time).toISOString() : ''
        })),
        userActivity: userActivityResult.rows.map((row) => ({
          label: row.label,
          logins: Number(row.logins) || 0,
          logouts: Number(row.logouts) || 0
        })),
        reservationActivity: reservationActivityResult.rows.map((row) => ({
          label: row.label,
          created: Number(row.created) || 0,
          cancelled: Number(row.cancelled) || 0
        })),
        reservationStatus: reservationStatusResult.rows.map((row) => ({
          status: String(row.status || 'unknown'),
          count: Number(row.count) || 0
        }))
      });
    } catch (error) {
      handleApiError(res, error);
    }
  });

  app.post('/api/admin/cities', async (req, res) => {
    try {
      const payload = buildCityPayload(req.body || {});

      const inserted = await pool.query(
        `
          INSERT INTO cities (slug, name, description, image, hero_image, hero_background, region_class, show_in_regions, aliases, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
          RETURNING id
        `,
        [
          payload.slug,
          payload.name,
          payload.description,
          payload.image,
          payload.heroImage,
          payload.heroBackground,
          payload.regionClass,
          payload.showInRegions,
          payload.aliases
        ]
      );

      const createdId = inserted.rows[0].id;
      const cityRows = await pool.query(
        `
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
          WHERE c.id = $1
          GROUP BY c.id
        `,
        [createdId]
      );

      const cityObj = mapCityRow(cityRows.rows[0]);
      // log
      try { await insertActivityLog({ actorUserId: req.auth?.userId, actorEmail: req.auth?.email, action: 'create_city', targetType: 'city', targetId: cityObj.id, details: { name: cityObj.name, slug: cityObj.slug } }); } catch (_) {}
      res.status(201).json({ message: 'Sehir eklendi.', city: cityObj });
    } catch (error) {
      handleApiError(res, error);
    }
  });

  app.put('/api/admin/cities/:id', async (req, res) => {
    try {
      const cityId = toPositiveInteger(req.params.id);
      if (!cityId) {
        res.status(400).json({ message: 'Gecerli bir sehir id degeri girin.' });
        return;
      }

      const existing = await pool.query('SELECT * FROM cities WHERE id = $1', [cityId]);
      if (!existing.rows.length) {
        res.status(404).json({ message: 'Sehir bulunamadi.' });
        return;
      }

      const row = existing.rows[0];
      const payload = buildCityPayload({
        name: req.body?.name ?? row.name,
        slug: req.body?.slug ?? row.slug,
        description: req.body?.description ?? row.description,
        image: String(req.body?.image || '').trim() ? req.body.image : row.image,
        heroImage: req.body?.heroImage ?? row.hero_image,
        heroBackground: req.body?.heroBackground ?? row.hero_background,
        regionClass: req.body?.regionClass ?? row.region_class,
        showInRegions: req.body?.showInRegions ?? row.show_in_regions,
        aliases: req.body?.aliases ?? row.aliases
      });

      await pool.query(
        `
          UPDATE cities
          SET
            slug = $1,
            name = $2,
            description = $3,
            image = $4,
            hero_image = $5,
            hero_background = $6,
            region_class = $7,
            show_in_regions = $8,
            aliases = $9,
            updated_at = NOW()
          WHERE id = $10
        `,
        [
          payload.slug,
          payload.name,
          payload.description,
          payload.image,
          payload.heroImage,
          payload.heroBackground,
          payload.regionClass,
          payload.showInRegions,
          payload.aliases,
          cityId
        ]
      );

      const cityRows = await pool.query(
        `
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
          WHERE c.id = $1
          GROUP BY c.id
        `,
        [cityId]
      );

      res.json({ message: 'Sehir guncellendi.', city: mapCityRow(cityRows.rows[0]) });
    try { await insertActivityLog({ actorUserId: req.auth?.userId, actorEmail: req.auth?.email, action: 'update_city', targetType: 'city', targetId: cityId, details: { name: (req.body?.name || null) } }); } catch (_) {}
    } catch (error) {
      handleApiError(res, error);
    }
  });

  app.delete('/api/admin/cities/:id', async (req, res) => {
    try {
      const cityId = toPositiveInteger(req.params.id);
      if (!cityId) {
        res.status(400).json({ message: 'Gecerli bir sehir id degeri girin.' });
        return;
      }

      const deleted = await pool.query('DELETE FROM cities WHERE id = $1 RETURNING id, name', [cityId]);
      if (!deleted.rows.length) {
        res.status(404).json({ message: 'Sehir bulunamadi.' });
        return;
      }

      try { await insertActivityLog({ actorUserId: req.auth?.userId, actorEmail: req.auth?.email, action: 'delete_city', targetType: 'city', targetId: cityId, details: { name: deleted.rows[0]?.name } }); } catch (_) {}

      res.json({ message: 'Sehir silindi.', city: deleted.rows[0] });
    } catch (error) {
      handleApiError(res, error);
    }
  });

  app.post('/api/admin/hotels', async (req, res) => {
    try {
      const cityId = await resolveCityId(req.body?.cityId, req.body?.citySlug);
      if (!cityId) {
        res.status(400).json({ message: 'Gecerli bir sehir secimi zorunludur.' });
        return;
      }

      const payload = buildHotelPayload(req.body || {});
      const inserted = await pool.query(
        `
          INSERT INTO hotels (city_id, name, image, rating, price, features, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6, NOW())
          RETURNING id
        `,
        [cityId, payload.name, payload.image, payload.rating, payload.price, payload.features]
      );

      const hotelRows = await pool.query(
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
          WHERE h.id = $1
        `,
        [inserted.rows[0].id]
      );

      res.status(201).json({ message: 'Otel eklendi.', hotel: mapHotelRow(hotelRows.rows[0]) });
    try { await insertActivityLog({ actorUserId: req.auth?.userId, actorEmail: req.auth?.email, action: 'create_hotel', targetType: 'hotel', targetId: hotelRows.rows[0]?.id, details: { name: hotelRows.rows[0]?.name, cityId: hotelRows.rows[0]?.city_id } }); } catch (_) {}
    } catch (error) {
      handleApiError(res, error);
    }
  });

  app.put('/api/admin/hotels/:id', async (req, res) => {
    try {
      const hotelId = toPositiveInteger(req.params.id);
      if (!hotelId) {
        res.status(400).json({ message: 'Gecerli bir otel id degeri girin.' });
        return;
      }

      const existing = await pool.query('SELECT * FROM hotels WHERE id = $1', [hotelId]);
      if (!existing.rows.length) {
        res.status(404).json({ message: 'Otel bulunamadi.' });
        return;
      }

      const row = existing.rows[0];
      const cityId = await resolveCityId(req.body?.cityId, req.body?.citySlug) || row.city_id;
      if (!cityId) {
        res.status(400).json({ message: 'Gecerli bir sehir secimi zorunludur.' });
        return;
      }

      const payload = buildHotelPayload({
        name: req.body?.name ?? row.name,
        image: String(req.body?.image || '').trim() ? req.body.image : row.image,
        rating: req.body?.rating ?? row.rating,
        price: req.body?.price ?? row.price,
        features: req.body?.features ?? row.features
      });

      await pool.query(
        `
          UPDATE hotels
          SET
            city_id = $1,
            name = $2,
            image = $3,
            rating = $4,
            price = $5,
            features = $6,
            updated_at = NOW()
          WHERE id = $7
        `,
        [cityId, payload.name, payload.image, payload.rating, payload.price, payload.features, hotelId]
      );

      const hotelRows = await pool.query(
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
          WHERE h.id = $1
        `,
        [hotelId]
      );

      res.json({ message: 'Otel guncellendi.', hotel: mapHotelRow(hotelRows.rows[0]) });
    try { await insertActivityLog({ actorUserId: req.auth?.userId, actorEmail: req.auth?.email, action: 'update_hotel', targetType: 'hotel', targetId: hotelId, details: { name: req.body?.name || null } }); } catch (_) {}
    } catch (error) {
      handleApiError(res, error);
    }
  });

  app.delete('/api/admin/hotels/:id', async (req, res) => {
    try {
      const hotelId = toPositiveInteger(req.params.id);
      if (!hotelId) {
        res.status(400).json({ message: 'Gecerli bir otel id degeri girin.' });
        return;
      }

      const deleted = await pool.query('DELETE FROM hotels WHERE id = $1 RETURNING id, name', [hotelId]);
      if (!deleted.rows.length) {
        res.status(404).json({ message: 'Otel bulunamadi.' });
        return;
      }

      try { await insertActivityLog({ actorUserId: req.auth?.userId, actorEmail: req.auth?.email, action: 'delete_hotel', targetType: 'hotel', targetId: hotelId, details: { name: deleted.rows[0]?.name } }); } catch (_) {}

      res.json({ message: 'Otel silindi.', hotel: deleted.rows[0] });
    } catch (error) {
      handleApiError(res, error);
    }
  });

  app.post(['/api/admin/uploads/cities', '/api/admin/uploads/hotels'], requireRole([USER_ROLES.PATRON, USER_ROLES.UST_YETKILI]), upload.single('image'), async (req, res) => {
    try {
      if (!req.file) {
        res.status(400).json({ message: 'Yuklenecek bir gorsel secin.' });
        return;
      }

      const category = resolveUploadCategory(req);
      const relativePath = 'uploads/' + category + '/' + req.file.filename;
      res.status(201).json({
        message: 'Gorsel yuklendi.',
        file: {
          originalName: req.file.originalname,
          size: req.file.size,
          mimetype: req.file.mimetype,
          path: relativePath
        }
      });
    } catch (error) {
      handleApiError(res, error);
    }
  });

  app.get('/api/admin/integrations', async (_req, res) => {
    try {
      const integrations = await getApiIntegrations();
      res.json({ integrations });
    } catch (error) {
      handleApiError(res, error);
    }
  });

  app.post('/api/admin/integrations', async (req, res) => {
    try {
      const payload = buildIntegrationPayload(req.body || {});

      const inserted = await pool.query(
        `
          INSERT INTO api_integrations (name, base_url, health_path, is_enabled, last_status, last_message, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6, NOW())
          RETURNING id
        `,
        [
          payload.name,
          payload.baseUrl,
          payload.healthPath,
          payload.isEnabled,
          payload.isEnabled ? 'unknown' : 'disabled',
          payload.isEnabled ? 'Kontrol bekleniyor.' : 'Baglanti pasif durumda.'
        ]
      );

      const created = await getApiIntegrationById(inserted.rows[0].id);
      res.status(201).json({ message: 'API baglantisi eklendi.', integration: created });
    } catch (error) {
      handleApiError(res, error);
    }
  });

  app.post('/api/admin/integrations/check-all', async (_req, res) => {
    try {
      const integrations = await getApiIntegrations();
      const checked = [];

      for (const integration of integrations) {
        const next = await checkApiIntegration(integration);
        if (next) checked.push(next);
      }

      const summary = {
        total: checked.length,
        online: checked.filter((item) => item.lastStatus === 'online').length,
        offline: checked.filter((item) => item.lastStatus === 'offline').length,
        disabled: checked.filter((item) => item.lastStatus === 'disabled').length,
        unknown: checked.filter((item) => item.lastStatus === 'unknown').length
      };

      res.json({ message: 'Tum API baglantilari kontrol edildi.', integrations: checked, summary });
    } catch (error) {
      handleApiError(res, error);
    }
  });

  app.post('/api/admin/integrations/:id/check', async (req, res) => {
    try {
      const integrationId = toPositiveInteger(req.params.id);
      if (!integrationId) {
        res.status(400).json({ message: 'Gecerli bir API id degeri girin.' });
        return;
      }

      const integration = await getApiIntegrationById(integrationId);
      if (!integration) {
        res.status(404).json({ message: 'API baglantisi bulunamadi.' });
        return;
      }

      const checked = await checkApiIntegration(integration);
      res.json({ message: 'API baglantisi kontrol edildi.', integration: checked });
    } catch (error) {
      handleApiError(res, error);
    }
  });

  app.put('/api/admin/integrations/:id', async (req, res) => {
    try {
      const integrationId = toPositiveInteger(req.params.id);
      if (!integrationId) {
        res.status(400).json({ message: 'Gecerli bir API id degeri girin.' });
        return;
      }

      const existing = await getApiIntegrationById(integrationId);
      if (!existing) {
        res.status(404).json({ message: 'API baglantisi bulunamadi.' });
        return;
      }

      const payload = buildIntegrationPayload(req.body || {}, existing);
      const nextStatus = payload.isEnabled
        ? (existing.lastStatus === 'disabled' ? 'unknown' : existing.lastStatus)
        : 'disabled';
      const nextMessage = payload.isEnabled
        ? (existing.lastStatus === 'disabled' ? 'Kontrol bekleniyor.' : existing.lastMessage)
        : 'Baglanti pasif durumda.';

      await pool.query(
        `
          UPDATE api_integrations
          SET
            name = $1,
            base_url = $2,
            health_path = $3,
            is_enabled = $4,
            last_status = $5,
            last_message = $6,
            updated_at = NOW()
          WHERE id = $7
        `,
        [
          payload.name,
          payload.baseUrl,
          payload.healthPath,
          payload.isEnabled,
          nextStatus,
          nextMessage,
          integrationId
        ]
      );

      const updated = await getApiIntegrationById(integrationId);
      res.json({ message: 'API baglantisi guncellendi.', integration: updated });
    } catch (error) {
      handleApiError(res, error);
    }
  });

  app.delete('/api/admin/integrations/:id', async (req, res) => {
    try {
      const integrationId = toPositiveInteger(req.params.id);
      if (!integrationId) {
        res.status(400).json({ message: 'Gecerli bir API id degeri girin.' });
        return;
      }

      const deleted = await pool.query(
        `
          DELETE FROM api_integrations
          WHERE id = $1
          RETURNING
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
        `,
        [integrationId]
      );

      if (!deleted.rows.length) {
        res.status(404).json({ message: 'API baglantisi bulunamadi.' });
        return;
      }

      res.json({ message: 'API baglantisi kaldirildi.', integration: mapIntegrationRow(deleted.rows[0]) });
    } catch (error) {
      handleApiError(res, error);
    }
  });

  // ── Rezervasyon Yönetimi ────────────────────────────────────────────────────
  app.get('/api/admin/reservations', async (req, res) => {
    try {
      const statusFilter = String(req.query.status || '').trim().toLowerCase();
      const rows = statusFilter
        ? (await pool.query(
            `SELECT r.*, u.name AS user_name, u.email AS user_email, h.name AS hotel_name
             FROM reservations r
             LEFT JOIN app_users u ON u.id = r.user_id
             LEFT JOIN hotels    h ON h.id = r.hotel_id
             WHERE r.status = $1
             ORDER BY r.created_at DESC LIMIT 500`,
            [statusFilter]
          )).rows
        : (await pool.query(
            `SELECT r.*, u.name AS user_name, u.email AS user_email, h.name AS hotel_name
             FROM reservations r
             LEFT JOIN app_users u ON u.id = r.user_id
             LEFT JOIN hotels    h ON h.id = r.hotel_id
             ORDER BY r.created_at DESC LIMIT 500`
          )).rows;

      res.json({
        reservations: rows.map((row) => ({
          id: row.id,
          userId: row.user_id,
          userName: row.user_name || '',
          userEmail: row.user_email || '',
          hotelId: row.hotel_id,
          hotelName: row.hotel_name || '',
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
        }))
      });
    } catch (error) {
      handleApiError(res, error);
    }
  });

  app.put('/api/admin/reservations/:id/status', async (req, res) => {
    try {
      const reservationId = toPositiveInteger(req.params.id);
      if (!reservationId) {
        res.status(400).json({ message: 'Geçerli bir rezervasyon ID girin.' });
        return;
      }

      const newStatus = String(req.body?.status || '').trim().toLowerCase();
      const allowed = ['confirmed', 'cancelled', 'completed', 'pending'];
      if (!allowed.includes(newStatus)) {
        res.status(400).json({ message: 'Geçersiz durum. İzin verilenler: ' + allowed.join(', ') });
        return;
      }

      const note = String(req.body?.note || '').trim() || 'Admin tarafından güncellendi.';
      const actorId = toPositiveInteger(req.auth?.userId);

      const existing = await pool.query('SELECT * FROM reservations WHERE id = $1 LIMIT 1', [reservationId]);
      if (!existing.rows.length) {
        res.status(404).json({ message: 'Rezervasyon bulunamadı.' });
        return;
      }

      const oldStatus = existing.rows[0].status;
      await pool.query('BEGIN');
      try {
        const updated = await pool.query(
          `UPDATE reservations SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
          [newStatus, reservationId]
        );
        await pool.query(
          `INSERT INTO reservation_status_logs (reservation_id, old_status, new_status, note, actor_user_id)
           VALUES ($1, $2, $3, $4, $5)`,
          [reservationId, oldStatus, newStatus, note, actorId || null]
        );
        await pool.query('COMMIT');
        res.json({ message: 'Rezervasyon durumu güncellendi.', reservation: updated.rows[0] });
      } catch (err) {
        await pool.query('ROLLBACK');
        throw err;
      }
    } catch (error) {
      handleApiError(res, error);
    }
  });

  // ── İletişim Talepleri ──────────────────────────────────────────────────────
  app.get('/api/admin/contact-requests', async (_req, res) => {
    try {
      const result = await pool.query(
        `SELECT * FROM contact_requests ORDER BY created_at DESC LIMIT 500`
      );
      res.json({
        contactRequests: result.rows.map((row) => ({
          id: row.id,
          name: row.name,
          email: row.email,
          subject: row.subject || '',
          message: row.message,
          status: row.status,
          createdAt: row.created_at ? new Date(row.created_at).toISOString() : '',
        }))
      });
    } catch (error) {
      handleApiError(res, error);
    }
  });

  app.put('/api/admin/contact-requests/:id/status', async (req, res) => {
    try {
      const id = toPositiveInteger(req.params.id);
      if (!id) { res.status(400).json({ message: 'Geçerli bir ID girin.' }); return; }

      const newStatus = String(req.body?.status || 'read').trim().toLowerCase();
      const result = await pool.query(
        `UPDATE contact_requests SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING id`,
        [newStatus, id]
      );
      if (!result.rows.length) { res.status(404).json({ message: 'Talep bulunamadı.' }); return; }
      res.json({ message: 'Durum güncellendi.' });
    } catch (error) {
      handleApiError(res, error);
    }
  });

  app.delete('/api/admin/contact-requests/:id', async (req, res) => {
    try {
      const id = toPositiveInteger(req.params.id);
      if (!id) { res.status(400).json({ message: 'Geçerli bir ID girin.' }); return; }

      const result = await pool.query(
        `DELETE FROM contact_requests WHERE id = $1 RETURNING id`,
        [id]
      );
      if (!result.rows.length) { res.status(404).json({ message: 'Talep bulunamadı.' }); return; }
      res.json({ message: 'Talep silindi.' });
    } catch (error) {
      handleApiError(res, error);
    }
  });
}

module.exports = registerAdminRoutes;
