# Turso + Netlify: Connection Issue

## The Problem

Netlify runs your API as **AWS Lambda** functions. Turso connections from Lambda often fail with:

```
Client network socket disconnected before secure TLS connection was established
```

This is a known issue: Lambda's network environment can drop connections before the TLS handshake completes. It affects many serverless + Turso setups.

---

## Recommended Fix: Deploy to Render Instead

**Render** runs your app on a persistent server (not Lambda). Turso connections work reliably.

### Steps (about 5 minutes)

1. **Go to [render.com](https://render.com)** → Sign in with GitHub
2. **New** → **Web Service**
3. Connect your `school-inventory` repo
4. Render may auto-detect from `render.yaml`. If not, set:
   - **Build:** `npm install && npx prisma generate`
   - **Start:** `npm start`
5. **Environment variables** (same as Netlify):
   - `TURSO_DATABASE_URL` = your Turso URL
   - `TURSO_AUTH_TOKEN` = your Turso token
   - `SESSION_SECRET` = a random string
6. Click **Create Web Service**
7. After deploy, use your Render URL (e.g. `https://school-inventory-xxx.onrender.com`)

---

## Alternative: Try Turso in us-east-1

Netlify/Lambda often runs in `us-east-1`. Your Turso DB might be in `aws-as-northeast-1`. Creating the DB in `us-east-1` can sometimes help:

1. In [Turso dashboard](https://app.turso.tech), create a new group in `aws-us-east-1`
2. Create a new database in that group
3. Re-apply migrations and seed
4. Update `TURSO_DATABASE_URL` in Netlify

This may or may not fix the issue—Lambda + Turso remains flaky for some users.
