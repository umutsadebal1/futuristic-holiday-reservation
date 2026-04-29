#!/usr/bin/env node
/**
 * Admin user create / promote CLI
 *
 * Kullanim ornekleri:
 *   node scripts/create-admin.js --email=ornek@gmail.com --password=Sifre123 --name="Umut Sadebal"
 *   node scripts/create-admin.js --email=ornek@gmail.com --password=Sifre123 --name="Umut" --role=patron
 *
 * Mevcut kullanici varsa parolayi gunceller ve role/yetkileri ataryazar.
 */

require('dotenv').config();
const bcrypt = require('bcrypt');
const pool = require('../db');

const ALLOWED_ROLES = ['patron', 'ust_yetkili', 'alt_yetkili', 'kullanici'];
const SIDEBAR_KEYS = ['dashboardPanel', 'citiesPanel', 'hotelsPanel', 'apisPanel', 'usersPanel'];
const BCRYPT_ROUNDS = Number(process.env.BCRYPT_ROUNDS) || 12;

function parseArgs(argv) {
  const out = {};
  for (const arg of argv) {
    const m = String(arg || '').match(/^--([^=]+)=?(.*)$/);
    if (!m) continue;
    out[m[1].toLowerCase()] = m[2];
  }
  return out;
}

function fail(message) {
  console.error('\x1b[31m[hata]\x1b[0m', message);
  process.exit(1);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const email = String(args.email || '').trim().toLowerCase();
  const password = String(args.password || '').trim();
  const name = String(args.name || '').trim() || email.split('@')[0];
  const role = ALLOWED_ROLES.includes(String(args.role || '').toLowerCase())
    ? String(args.role).toLowerCase()
    : 'patron';

  if (!email || !email.includes('@')) fail('--email=... gecerli bir email vermelisin');
  if (!password || password.length < 6) fail('--password=... en az 6 karakter olmali');

  const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const sidebarPermissions = SIDEBAR_KEYS;

  const existing = await pool.query('SELECT id, email FROM app_users WHERE LOWER(email) = $1 LIMIT 1', [email]);

  if (existing.rows.length) {
    const userId = existing.rows[0].id;
    await pool.query(
      `UPDATE app_users
         SET password_hash = $1,
             name = $2,
             role = $3,
             sidebar_permissions = $4,
             is_active = TRUE,
             updated_at = NOW()
       WHERE id = $5`,
      [hash, name, role, sidebarPermissions, userId]
    );
    console.log('\x1b[32m[ok]\x1b[0m mevcut kullanici guncellendi. id=' + userId);
  } else {
    const inserted = await pool.query(
      `INSERT INTO app_users (email, name, password_hash, role, sidebar_permissions, is_active, registered_at, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, TRUE, NOW(), NOW(), NOW())
       RETURNING id`,
      [email, name, hash, role, sidebarPermissions]
    );
    console.log('\x1b[32m[ok]\x1b[0m yeni kullanici olusturuldu. id=' + inserted.rows[0].id);
  }

  console.log('  email   :', email);
  console.log('  name    :', name);
  console.log('  role    :', role);
  console.log('  panels  :', sidebarPermissions.join(', '));
  console.log('\nartik tatilrezerve.com/admin uzerinden bu email + parolayla giris yapabilirsin.');
  process.exit(0);
}

main().catch((error) => {
  console.error('\x1b[31m[crash]\x1b[0m', error?.message || error);
  process.exit(1);
});
