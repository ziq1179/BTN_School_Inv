# Deploy in 3 Steps (Simple Guide)

Follow these in order. **Skip any step you’ve already done.**

---

## Step 1: Run Locally (5 min)

1. Open a terminal in the project folder.
2. Run:
   ```bash
   npm install
   npx prisma migrate dev
   npm run seed
   npm start
   ```
3. In your browser, go to **http://localhost:3000**
4. Log in: `admin@school.local` / `admin123`
5. If that works, you’re ready for the next step.

---

## Step 2: Push to GitHub (3 min)

1. Create a repo at [github.com/new](https://github.com/new) (e.g. `school-inventory`).
2. In the project folder, run:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/school-inventory.git
   git push -u origin main
   ```
   *(Replace `YOUR_USERNAME` and `school-inventory` with your values.)*

---

## Step 3: Deploy to Netlify (10 min)

### A. Create Turso database

1. Install Turso CLI: https://docs.turso.tech/cli/installation  
   *(On Windows: `winget install tursodatabase.turso` or download from the site.)*

2. Sign up and log in:
   ```bash
   turso auth login
   ```

3. Create the database (pick one):

   **Option A – You have data in `prisma/dev.db`:**  
   ```bash
   sqlite3 prisma/dev.db "PRAGMA journal_mode='wal'; PRAGMA wal_checkpoint(truncate);"
   copy prisma\dev.db school-inventory.db
   turso db import school-inventory.db
   ```

   **Option B – No sqlite3 or fresh start:**  
   ```bash
   turso db create school-inventory
   turso db shell school-inventory < prisma\migrations\20260221201634_init_inventory_schema\migration.sql
   turso db shell school-inventory < prisma\migrations\20260222081758_add_users\migration.sql
   ```
   Add to `.env`: `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` (from step 4 below), then run `npm run seed` to create the admin user.

4. Get the URL and token (save these for Netlify):
   ```bash
   turso db show school-inventory --url
   turso db tokens create school-inventory
   ```

### B. Connect to Netlify

1. Go to [app.netlify.com](https://app.netlify.com) and sign in.
2. Click **“Add new site”** → **“Import an existing project”**.
3. Choose **GitHub** and select your repo.
4. Leave the build settings as they are (Netlify will use `netlify.toml`).
5. Click **“Add environment variables”** and add:
   - `TURSO_DATABASE_URL` → value from `turso db show school-inventory --url`
   - `TURSO_AUTH_TOKEN` → value from `turso db tokens create school-inventory`
   - `SESSION_SECRET` → any long random string (e.g. `my-secret-key-12345-change-me`)
6. Click **Deploy site**.

When the deploy finishes, Netlify will show your site URL.

---

## Troubleshooting

| Problem | What to do |
|---------|------------|
| `sqlite3` not found | Use **Option B** in Step 3A above: `turso db create` and apply migrations, then run seed. |
| `turso` not found | Install the Turso CLI and restart the terminal. |
| Build fails on Netlify | Check Netlify build logs. Ensure `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` are set. |
| Login doesn’t work | Run `npm run seed` with Turso env vars set so the admin user exists in Turso. |

---

## Summary

- **Local:** `npm start` → http://localhost:3000  
- **GitHub:** Push the code.  
- **Netlify:** Connect the repo, add env vars, deploy.  
- **Turso:** Create DB, import data, use URL + token in Netlify.
