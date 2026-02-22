# Fix Render: Use SQLite (No Paid Disk)

Turso connections are failing. **Use SQLite with the container's built-in storage** – works on free tier, no paid disk needed.

**Note:** Data is stored in the container. It persists while the instance runs, but is reset on each new deploy. The release command re-seeds the admin user automatically.

---

## Steps in Render Dashboard

### 1. Update Environment Variables

In **Environment** tab:

**Remove these** (if present):
- `TURSO_DATABASE_URL`
- `TURSO_AUTH_TOKEN`

**Add/Set these:**
- `DATABASE_URL` = `file:./dev.db`
- `SESSION_SECRET` = (your random string – keep existing or generate new)

### 2. Set Build & Release Commands

In **Settings** → **Build & Deploy**:

- **Build Command:** `npm install && npm run build`
  - Generates the Prisma client before deploy
- **Release Command:** `npx prisma migrate deploy && npm run seed`
  - Creates all tables (including `User`) and seeds the admin user on each deploy

**Important:** Both must be set. Without the release command, the database stays empty and you get "table User does not exist".

### 3. Redeploy

Click **Manual Deploy** → **Deploy latest commit**

---

## Troubleshooting

**"The table main.User does not exist"**  
→ Release command didn't run or failed. Check:
1. Release command is set exactly: `npx prisma migrate deploy && npm run seed`
2. Build command includes `npm run build` (generates Prisma client)
3. In **Logs** → filter by "Release" to see migration output
4. `DATABASE_URL` is set to `file:./dev.db`

---

## Result

- No external database, no paid disk
- Works on Render free tier
- Login with `admin@school.local` / `admin123`
- Data resets on each deploy (release command re-seeds)
