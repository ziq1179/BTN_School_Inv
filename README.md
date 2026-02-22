# School Inventory Management System

**BY THE NUMB3RS** — Manage school uniforms, books, and inventory with categories, transactions, sales tracking, and user roles.

## Tech Stack

- **Backend:** Node.js, Express, Prisma (SQLite / Turso)
- **Frontend:** Vanilla JS, Chart.js
- **Auth:** Cookie sessions, bcrypt, role-based access (ADMIN, MANAGER, STAFF, VIEWER)

## Quick Start (Local)

```bash
# Install
npm install

# Database setup
cp .env.example .env
npx prisma migrate dev
npm run seed

# Run
npm start
```

Default login: `admin@school.local` / `admin123`

---

## Deploy to GitHub

1. **Create a new repository** on [GitHub](https://github.com/new).

2. **Initialize and push** from your project folder:

```bash
git init
git add .
git commit -m "Initial commit: School Inventory System"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
git push -u origin main
```

3. Ensure `.env` is **not** committed (it's in `.gitignore`). Set secrets in your hosting provider.

---

## Deploy to Netlify

### Option A: Connect GitHub (recommended)

1. Push your code to GitHub (see above).
2. Go to [Netlify](https://app.netlify.com) → **Add new site** → **Import an existing project**.
3. Choose your GitHub repo and branch.
4. Build settings (usually auto-detected from `netlify.toml`):
   - **Build command:** `npm run build`
   - **Publish directory:** `public`
   - **Functions directory:** `netlify/functions`
5. Add **Environment variables** in Netlify:
   - `DATABASE_URL` — see [Database on Netlify](#database-on-netlify) below
   - `SESSION_SECRET` — a long random string for production
   - `NODE_ENV` — `production`

### Option B: Netlify CLI

```bash
npm install -g netlify-cli
netlify login
netlify init
netlify deploy --prod
```

Add the same environment variables in Netlify Dashboard → Site settings → Environment variables.

### Database on Netlify: Use Turso

Netlify runs serverless — SQLite files don't persist. Use **Turso** (SQLite-compatible, free tier):

1. **Install Turso CLI** and sign up: [turso.tech](https://turso.tech) → [CLI Installation](https://docs.turso.tech/cli/installation)
   ```bash
   turso auth login
   ```

2. **Create database** (import creates it) and get credentials:
   ```bash
   # Option A: Import existing data (DB name = filename without .db)
   sqlite3 prisma/dev.db "PRAGMA journal_mode='wal'; PRAGMA wal_checkpoint(truncate);"
   cp prisma/dev.db school-inventory.db
   turso db import school-inventory.db

   # Option B: Fresh DB — create empty, apply migrations in order, then seed
   turso db create school-inventory
   turso db shell school-inventory < prisma/migrations/20260221201634_init_inventory_schema/migration.sql
   turso db shell school-inventory < prisma/migrations/20260222081758_add_users/migration.sql
   # Then run: TURSO_DATABASE_URL=... TURSO_AUTH_TOKEN=... npm run seed
   ```

3. **Get URL and token** for the database (replace `school-inventory` if you used a different name):
   ```bash
   turso db show school-inventory --url
   turso db tokens create school-inventory
   ```

5. **Add env vars** in Netlify:
   - `TURSO_DATABASE_URL` — from `turso db show school-inventory --url` (e.g. `libsql://school-inventory-xxx.turso.io`)
   - `TURSO_AUTH_TOKEN` — from `turso db tokens create school-inventory`
   - `SESSION_SECRET` — a strong random string

When both `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` are set, the app uses Turso instead of SQLite.

---

## Deploy to Render (SQLite-friendly)

[Render](https://render.com) supports persistent disks, so SQLite works without changes.

1. Push to GitHub.
2. Go to [Render Dashboard](https://dashboard.render.com) → **New** → **Web Service**.
3. Connect your repo and configure:
   - **Build command:** `npm install && npx prisma generate`
   - **Start command:** `npm start`
   - **Instance type:** Free
4. Add environment variables:
   - `DATABASE_URL` — `file:./data/sqlite.db` (use a path on the persistent disk)
   - `SESSION_SECRET` — a strong random value
5. Optionally add a **Persistent Disk** at `/data` and set `DATABASE_URL="file:./data/sqlite.db"` so data persists across deploys.

---

## Environment Variables

| Variable             | Description                                                      |
|----------------------|------------------------------------------------------------------|
| `DATABASE_URL`       | Local SQLite URL (e.g. `file:./dev.db`) — used for migrations    |
| `TURSO_DATABASE_URL` | Turso libSQL URL (e.g. `libsql://db-org.turso.io`) — production  |
| `TURSO_AUTH_TOKEN`   | Turso auth token — required when using Turso                     |
| `SESSION_SECRET`     | Secret for cookie signing (required in prod)                     |
| `NODE_ENV`           | `development` or `production`                                    |
| `PORT`               | Port for local server (default: 3000)                            |

---

## License

ISC
