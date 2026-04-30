function registerPublicRoutes(app, deps) {
  const {
    pool,
    requireAuth,
    USER_ROLES,
    normalizeUserRole,
    toPositiveInteger,
    listDatesBetween,
    releaseInventory,
    createReservation,
    mapReservationRow,
    getApiIntegrations,
    getCitiesWithCounts,
    getHotels,
    slugify,
    handleApiError
  } = deps;

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  app.get('/api/external-services/status', async (_req, res) => {
    try {
      const integrations = await getApiIntegrations();
      res.json({
        services: integrations.map((item) => ({
          id: item.id,
          name: item.name,
          isEnabled: item.isEnabled,
          status: item.lastStatus,
          message: item.lastMessage,
          checkedAt: item.lastCheckedAt
        }))
      });
    } catch (error) {
      handleApiError(res, error);
    }
  });

  app.get('/api/campaigns', async (_req, res) => {
    try {
      const result = await pool.query(
        `
          SELECT id, code, title, discount_type, discount_value, min_total, start_at, end_at, is_active
          FROM campaigns
          WHERE is_active = TRUE
            AND (start_at IS NULL OR start_at <= NOW())
            AND (end_at IS NULL OR end_at >= NOW())
          ORDER BY id DESC
        `
      );

      res.json({
        campaigns: result.rows.map((row) => ({
          id: row.id,
          code: row.code,
          title: row.title,
          discountType: row.discount_type,
          discountValue: Number(row.discount_value) || 0,
          minTotal: Number(row.min_total) || 0,
          startAt: row.start_at ? new Date(row.start_at).toISOString() : '',
          endAt: row.end_at ? new Date(row.end_at).toISOString() : ''
        }))
      });
    } catch (error) {
      handleApiError(res, error);
    }
  });

  app.post('/api/reservations', requireAuth, async (req, res) => {
    try {
      const reservation = await createReservation(req.body || {}, req.auth);
      res.status(201).json({ message: 'Rezervasyon olusturuldu.', reservation: mapReservationRow(reservation) });
    } catch (error) {
      handleApiError(res, error);
    }
  });

  app.get('/api/reservations', requireAuth, async (req, res) => {
    try {
      const isAdmin = [USER_ROLES.PATRON, USER_ROLES.UST_YETKILI].includes(normalizeUserRole(req.auth?.role));
      const targetUserId = isAdmin && toPositiveInteger(req.query.userId)
        ? toPositiveInteger(req.query.userId)
        : toPositiveInteger(req.auth?.userId);

      const result = await pool.query(
        `
          SELECT *
          FROM reservations
          WHERE user_id = $1
          ORDER BY created_at DESC
        `,
        [targetUserId]
      );

      res.json({ reservations: result.rows.map(mapReservationRow) });
    } catch (error) {
      handleApiError(res, error);
    }
  });

  app.put('/api/reservations/:id/cancel', requireAuth, async (req, res) => {
    try {
      const reservationId = toPositiveInteger(req.params.id);
      if (!reservationId) {
        res.status(400).json({ message: 'Gecerli bir rezervasyon id girin.' });
        return;
      }

      const existingResult = await pool.query('SELECT * FROM reservations WHERE id = $1 LIMIT 1', [reservationId]);
      if (!existingResult.rows.length) {
        res.status(404).json({ message: 'Rezervasyon bulunamadi.' });
        return;
      }

      const existing = existingResult.rows[0];
      const ownerId = Number(existing.user_id) || 0;
      const actorId = toPositiveInteger(req.auth?.userId);
      const isAdmin = [USER_ROLES.PATRON, USER_ROLES.UST_YETKILI].includes(normalizeUserRole(req.auth?.role));

      if (!isAdmin && ownerId !== actorId) {
        res.status(403).json({ message: 'Sadece kendi rezervasyonunuzu iptal edebilirsiniz.' });
        return;
      }

      if (String(existing.status || '').toLowerCase() === 'cancelled') {
        res.json({ message: 'Rezervasyon zaten iptal edilmis.', reservation: mapReservationRow(existing) });
        return;
      }

      const reason = String(req.body?.reason || 'Kullanici tarafindan iptal edildi.').trim();
      const dates = listDatesBetween(existing.check_in, existing.check_out);

      await pool.query('BEGIN');
      try {
        if (existing.room_type_id) {
          await releaseInventory({ roomTypeId: existing.room_type_id, dates });
        }

        const updatedResult = await pool.query(
          `
            UPDATE reservations
            SET status = 'cancelled', cancel_reason = $1, updated_at = NOW()
            WHERE id = $2
            RETURNING *
          `,
          [reason, reservationId]
        );

        await pool.query(
          `
            INSERT INTO reservation_status_logs (reservation_id, old_status, new_status, note, actor_user_id)
            VALUES ($1, $2, 'cancelled', $3, $4)
          `,
          [reservationId, existing.status || 'confirmed', reason, actorId || null]
        );

        await pool.query('COMMIT');
        res.json({ message: 'Rezervasyon iptal edildi.', reservation: mapReservationRow(updatedResult.rows[0]) });
      } catch (error) {
        await pool.query('ROLLBACK');
        throw error;
      }
    } catch (error) {
      handleApiError(res, error);
    }
  });

  app.get('/api/bootstrap', async (_req, res) => {
    try {
      const [cities, hotels] = await Promise.all([getCitiesWithCounts(), getHotels()]);
      res.json({ cities, hotels });
    } catch (error) {
      handleApiError(res, error);
    }
  });

  app.get('/api/cities', async (_req, res) => {
    try {
      const cities = await getCitiesWithCounts();
      res.json(cities);
    } catch (error) {
      handleApiError(res, error);
    }
  });

  app.get('/api/hotels', async (req, res) => {
    try {
      const hotels = await getHotels(req.query.citySlug || req.query.city || '');
      res.json(hotels);
    } catch (error) {
      handleApiError(res, error);
    }
  });

  app.get('/api/cities/:slug/hotels', async (req, res) => {
    try {
      const slug = slugify(req.params.slug || '');
      if (!slug) {
        res.status(400).json({ message: 'Gecerli bir sehir slug degeri girin.' });
        return;
      }

      const hotels = await getHotels(slug);
      res.json(hotels);
    } catch (error) {
      handleApiError(res, error);
    }
  });

  // ── İletişim Formu ──────────────────────────────────────────────────────────
  app.post('/api/contact', async (req, res) => {
    try {
      const name    = String(req.body?.name    || '').trim();
      const email   = String(req.body?.email   || '').trim();
      const subject = String(req.body?.subject || '').trim();
      const message = String(req.body?.message || '').trim();

      if (!name || !email || !message) {
        res.status(400).json({ message: 'Ad, e-posta ve mesaj zorunludur.' });
        return;
      }

      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        res.status(400).json({ message: 'Geçerli bir e-posta adresi girin.' });
        return;
      }

      await pool.query(
        `INSERT INTO contact_requests (name, email, subject, message) VALUES ($1, $2, $3, $4)`,
        [name, email, subject, message]
      );

      res.status(201).json({ message: 'Mesajınız alındı. En kısa sürede dönüş yapacağız.' });
    } catch (error) {
      handleApiError(res, error);
    }
  });
}

module.exports = registerPublicRoutes;
