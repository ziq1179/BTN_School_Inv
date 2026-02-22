# Your Simple Checklist

Check off as you go.

---

## Right now (on your computer)

- [ ] **1.** Open terminal in the project folder  
- [ ] **2.** Run: `npm install` then `npm start`  
- [ ] **3.** Open http://localhost:3000 and log in with `admin@school.local` / `admin123`  
- [ ] **4.** Create a GitHub account (if needed): github.com  
- [ ] **5.** Create a new repo on GitHub (e.g. "school-inventory")  
- [ ] **6.** Run these (replace with your repo URL):
   ```
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
   git push -u origin main
   ```

---

## Turso (database in the cloud)

- [ ] **7.** Install Turso CLI: https://docs.turso.tech/cli/installation  
- [ ] **8.** Run: `turso auth login` (sign up if needed)  
- [ ] **9.** Run: `turso db create school-inventory`  
- [ ] **10.** Run these 2 commands to apply schema:
   ```
   turso db shell school-inventory < prisma\migrations\20260221201634_init_inventory_schema\migration.sql
   turso db shell school-inventory < prisma\migrations\20260222081758_add_users\migration.sql
   ```
- [ ] **11.** Get URL: `turso db show school-inventory --url` (copy the output)  
- [ ] **12.** Get token: `turso db tokens create school-inventory` (copy the output)  
- [ ] **13.** Add to `.env`:
   ```
   TURSO_DATABASE_URL=paste_url_here
   TURSO_AUTH_TOKEN=paste_token_here
   ```
- [ ] **14.** Run: `npm run seed` (creates admin user in Turso)

---

## Netlify (hosting)

- [ ] **15.** Go to app.netlify.com and sign in (use GitHub)  
- [ ] **16.** Click "Add new site" → "Import an existing project" → GitHub  
- [ ] **17.** Select your repo → Deploy (wait for it to finish)  
- [ ] **18.** Go to Site settings → Environment variables → Add these 3:
   - `TURSO_DATABASE_URL` = (from step 11)
   - `TURSO_AUTH_TOKEN` = (from step 12)
   - `SESSION_SECRET` = (any random string, e.g. mysecret123)
- [ ] **19.** Trigger a new deploy (Deploys → Trigger deploy → Deploy site)

---

## Done

- [ ] **20.** Open your Netlify URL and log in with `admin@school.local` / `admin123`

---

**More details?** See `DEPLOY_SIMPLE.md`
