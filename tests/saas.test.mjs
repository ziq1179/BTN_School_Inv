// Integration tests — boot a real (embedded) Postgres, migrate, seed, then exercise
// the live HTTP API. Run with: npm test
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import EmbeddedPostgres from 'embedded-postgres';
import { execSync } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = fileURLToPath(new URL('..', import.meta.url));

const DB_DIR = mkdtempSync(join(tmpdir(), 'schoolinv-test-pg-'));
process.env.SESSION_SECRET = 'test-secret-test-secret';
process.env.NODE_ENV = 'test';

let pg;
let server;
let BASE;
const jars = {};
const jar = (name) => (jars[name] ||= {});
const cookieHeader = (name) => Object.entries(jar(name)).map(([k, v]) => `${k}=${v}`).join('; ');
const storeCookies = (name, res) => {
  for (const line of res.headers.getSetCookie?.() || []) {
    const [pair] = line.split(';');
    const i = pair.indexOf('=');
    jar(name)[pair.slice(0, i)] = pair.slice(i + 1);
  }
};
const api = async (name, method, path, body) => {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(Object.keys(jar(name)).length ? { Cookie: cookieHeader(name) } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  storeCookies(name, res);
  let data = null;
  try { data = await res.json(); } catch { /* ignore */ }
  return { status: res.status, data };
};

before(async () => {
  const port = 55000 + Math.floor(Math.random() * 1000);
  pg = new EmbeddedPostgres({
    databaseDir: DB_DIR,
    user: 'postgres',
    password: 'postgres',
    port,
    persistent: false,
  });
  await pg.initialise();
  await pg.start();
  process.env.DATABASE_URL = `postgresql://postgres:postgres@localhost:${port}/postgres`;
  process.env.DIRECT_URL = process.env.DATABASE_URL;
  execSync('npx prisma migrate deploy', {
    env: process.env,
    stdio: 'pipe',
    cwd: ROOT,
  });
  execSync('node prisma/seed.js', {
    env: process.env,
    stdio: 'pipe',
    cwd: ROOT,
  });

  const { default: app } = await import('../src/app.js');
  server = app.listen(0);
  await once(server, 'listening');
  BASE = `http://localhost:${server.address().port}`;
}, { timeout: 120000 });

after(async () => {
  if (server) await new Promise((r) => server.close(r));
  if (pg) await pg.stop();
  rmSync(DB_DIR, { recursive: true, force: true });
});

test('health endpoint is public', async () => {
  const r = await api('anon', 'GET', '/api/health');
  assert.equal(r.status, 200);
  assert.equal(r.data.status, 'ok');
});

test('unauthenticated requests are rejected', async () => {
  const r = await api('anon', 'GET', '/api/items');
  assert.equal(r.status, 401);
});

test('seed tenant admin can log in and sees seeded items', async () => {
  const login = await api('admin', 'POST', '/api/auth/login', { email: 'admin@school.local', password: 'admin123' });
  assert.equal(login.data?.success, true);
  assert.equal(login.data?.data?.role, 'ADMIN');
  const items = await api('admin', 'GET', '/api/items');
  assert.ok((items.data?.data?.length ?? 0) >= 3, 'seeded items visible');
});

test('viewer (if seeded) cannot create items', async () => {
  const login = await api('staff', 'POST', '/api/auth/login', { email: 'staff@school.local', password: 'staff123' });
  assert.equal(login.data?.success, true);
  // STAFF can create (role 2 >= 2), so switch to a fresh viewer via admin
  const created = await api('admin', 'POST', '/api/users', { email: 'viewer@school.local', password: 'viewer123', role: 'VIEWER', name: 'View Only' });
  assert.equal(created.status, 201);
  const vLogin = await api('viewer', 'POST', '/api/auth/login', { email: 'viewer@school.local', password: 'viewer123' });
  assert.equal(vLogin.data?.success, true);
  const blocked = await api('viewer', 'POST', '/api/items', { name: 'Nope', categoryId: 1 });
  assert.equal(blocked.status, 403);
});

test('self-serve signup creates an isolated FREE tenant', async () => {
  const signup = await api('beta', 'POST', '/api/auth/signup', {
    schoolName: 'Beta Test School',
    name: 'Beta Owner',
    email: 'owner@beta-test.school',
    password: 'beta-password-123',
  });
  assert.equal(signup.status, 201);
  assert.equal(signup.data?.data?.tenant?.plan, 'FREE');

  const items = await api('beta', 'GET', '/api/items');
  assert.equal(items.data?.data?.length, 0);
  const categories = await api('beta', 'GET', '/api/categories');
  assert.equal(categories.data?.data?.length, 0);
});

test('categories and items are isolated between tenants', async () => {
  const cat = await api('beta', 'POST', '/api/categories', { name: 'Beta Books', description: 'x' });
  assert.equal(cat.status, 201);
  const betaCatId = cat.data?.data?.id;
  const item = await api('beta', 'POST', '/api/items', { name: 'Beta Notebook', categoryId: betaCatId, salePrice: 100, stock: 5 });
  assert.equal(item.status, 201);

  const adminItems = await api('admin', 'GET', '/api/items?search=Beta');
  assert.equal(adminItems.data?.data?.length, 0, 'tenant 1 cannot see beta items');
});

test('sale decrements stock and oversell is rejected', async () => {
  const before = await api('admin', 'GET', '/api/items?search=BUN-SH-32');
  const item = before.data?.data?.[0];
  assert.ok(item, 'seeded BUN-SH-32 found');
  const sale = await api('admin', 'POST', `/api/items/${item.id}/sale`, { quantity: 2, price: 600, reference: 'TEST-1' });
  assert.equal(sale.status, 200);
  assert.equal(sale.data?.data?.item?.stock, item.stock - 2);

  const oversell = await api('admin', 'POST', `/api/items/${item.id}/sale`, { quantity: 99999, price: 600 });
  assert.equal(oversell.status, 400);

  const after = await api('admin', 'GET', `/api/items/${item.id}`);
  assert.equal(after.data?.data?.stock, item.stock - 2, 'stock unchanged after rejected sale');
});

test('FREE plan user limit blocks the 4th user', async () => {
  await api('beta', 'POST', '/api/users', { email: 'b1@beta-test.school', password: 'beta1234', role: 'STAFF', name: 'B1' });
  const second = await api('beta', 'POST', '/api/users', { email: 'b2@beta-test.school', password: 'beta1234', role: 'STAFF', name: 'B2' });
  assert.equal(second.status, 201, 'second extra user allowed (3 total)');
  const third = await api('beta', 'POST', '/api/users', { email: 'b3@beta-test.school', password: 'beta1234', role: 'VIEWER', name: 'B3' });
  assert.equal(third.status, 403);
  assert.equal(third.data?.code, 'PLAN_LIMIT');
});

test('AI endpoints are gated to PRO (403 for FREE)', async () => {
  const chat = await api('beta', 'POST', '/api/ai/chat', { question: 'what is low in stock?' });
  assert.equal(chat.status, 403);
  assert.equal(chat.data?.code, 'AI_REQUIRES_PRO');
});

test('billing status reflects plan and usage', async () => {
  const status = await api('beta', 'GET', '/api/billing/status');
  assert.equal(status.status, 200);
  assert.equal(status.data?.data?.plan, 'FREE');
  assert.equal(status.data?.data?.maxItems, 50);
  assert.equal(status.data?.data?.maxUsers, 3);
  assert.equal(status.data?.data?.usage?.users, 3);
});

test('tenant branding is isolated', async () => {
  const adminPut = await api('admin', 'PUT', '/api/settings', { schoolName: 'Tenant One School' });
  assert.equal(adminPut.status, 200);
  const betaSettings = await api('beta', 'GET', '/api/settings');
  assert.equal(betaSettings.data?.data?.schoolName, 'Beta Test School');
  const adminSettings = await api('admin', 'GET', '/api/settings');
  assert.equal(adminSettings.data?.data?.schoolName, 'Tenant One School');
});
