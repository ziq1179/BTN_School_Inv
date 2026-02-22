# Fix 502 on Netlify Login

A 502 usually means the serverless function crashed. Do these steps:

---

## 1. Set env vars with correct scope

In Netlify: **Site configuration** → **Environment variables**

Add these and set **scope** to **"Functions"** or **"All"** (not just "Build"):

| Variable | Value |
|----------|-------|
| `TURSO_DATABASE_URL` | `libsql://school-inventory-xxxxx.turso.io` |
| `TURSO_AUTH_TOKEN` | your-token-from-turso-dashboard |
| `SESSION_SECRET` | any-long-random-string |

If scope is only "Build", functions won't get the vars at runtime and will crash.

---

## 2. Trigger a new deploy

After changing env vars:

1. Go to **Deploys**
2. Click **Trigger deploy** → **Deploy site**

---

## 3. Check function logs

1. Go to **Functions** in the Netlify dashboard
2. Click your `api` function
3. Open **Logs** or **Real-time logs**
4. Try logging in again and watch for errors

---

## 4. Verify env vars

In **Site configuration** → **Environment variables** → **Options** → **Show values**, confirm:

- No extra spaces in URL or token
- URL starts with `libsql://`
- Token is the full string from Turso

---

## 5. Test health endpoint

Open: `https://bythenumb3r.netlify.app/api/health`

- If it returns JSON → routing works; the issue is likely in auth or DB
- If 502 → the function itself is failing (often env vars)
