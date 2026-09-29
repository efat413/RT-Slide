# Cloudflare & D1 Deployment Guide — Rongdhonu Trade

All necessary production files for your website and Cloudflare D1 integration have been prepared and tested.

## 🗄️ Cloudflare Configuration
- **Worker Name**: `rongdhonutrade` (matches Cloudflare Workers Builds CI)
- **Database Name**: `rongdhonu-db`
- **Database ID**: `3276795d-5593-42c0-8e14-947f3ab1172b`
- **Binding Name**: `DB` (accessed via `env.DB`)

All shared e-commerce data (Products, Categories, Orders, Stock, Sliders, and Store Settings) is managed directly through Cloudflare D1 as the single source of truth across all devices and browsers.

---

## 🚀 How to Deploy & Apply D1 Database Migrations

### Step 1: Apply D1 Migrations to Production Database
Run the official Cloudflare D1 migrations command to create all tables (`products`, `categories`, `orders`, `sliders`, `store_settings`, `coupons`, `reviews`, `users`) and seed the initial catalog idempotently:

```bash
# Apply migrations to the production Cloudflare D1 database:
npx wrangler d1 migrations apply rongdhonu-db --remote

# Or run the npm script:
npm run d1:migrate
```

### Step 2: Build & Deploy
#### Option A: Automated Git CI (Cloudflare Workers Builds)
1. Commit and push this repository to your connected GitHub/GitLab repository.
2. Cloudflare Workers Builds automatically builds (`npm run build`) and deploys the Worker named `rt`.
3. In Cloudflare Dashboard: **Workers & Pages > Overview > rt > Settings > Bindings**:
   - Ensure D1 Database binding is bound:
     - Variable name: `DB`
     - D1 Database: `rongdhonu-db` (`3276795d-5593-42c0-8e14-947f3ab1172b`)

#### Option B: Deploy with Wrangler CLI
```bash
# 1. Authenticate with your Cloudflare Account:
npx wrangler login

# 2. Apply migrations to production D1 database:
npx wrangler d1 migrations apply rongdhonu-db --remote

# 3. Build & Deploy Worker:
npm run deploy
```

---

## 🔍 Troubleshooting: Error 10181 ("database not found")
If Cloudflare reports `D1 binding 'DB' references database '3276795d-5593-42c0-8e14-947f3ab1172b' which was not found [code: 10181]`:
1. **Account Isolation**: Cloudflare D1 databases are account-scoped. If you have more than one Cloudflare account (e.g. personal vs company, or multiple email logins), the D1 database `3276795d-5593-42c0-8e14-947f3ab1172b` was created in Account A, but the Worker `rt` / CI Token is deploying to Account B.
2. **Resolution**:
   - Run `npx wrangler d1 list` to verify which account ID owns `rongdhonu-db`.
   - Ensure the CI deployment API token (`CLOUDFLARE_API_TOKEN`) or Workers Builds project is created under that exact same Cloudflare account.
   - Alternatively, add `"account_id": "<YOUR_ACCOUNT_ID>"` in `wrangler.json` to lock the deployment to the correct account.

---

## 🔧 Troubleshooting: "This project is disconnected from your Git account"
If your Cloudflare build fails with:
```
This project is disconnected from your Git account, this may cause deployments to fail. Refer to https://developers.cloudflare.com/pages/platform/git-integration/#this-project-is-disconnected-from-your-git-account-this-may-cause-deployments-to-fail
```

### Solution 1: Re-authorize Cloudflare Pages on GitHub (Recommended)
1. **GitHub App Permissions**:
   - Open **GitHub** > click your avatar in the top-right > **Settings**.
   - In the left sidebar, click **Applications** > **Installed GitHub Apps**.
   - Find **Cloudflare Pages** and click **Configure**.
   - Under **Repository access**, ensure your repository is selected and access is granted. Click **Save**.
2. **Cloudflare Dashboard Reconnection**:
   - Go to [Cloudflare Dashboard](https://dash.cloudflare.com/) > **Workers & Pages**.
   - Select your project (`rt`).
   - Go to **Settings** > **Builds & deployments** > **Source**.
   - Click **Reconnect** or **Manage Git Connection** and re-link your GitHub repository and default branch (`main`).
   - Go to the **Deployments** tab and click **Retry deployment**.

### Solution 2: Direct Deploy with Wrangler (Bypasses Git webhook)
Deploy directly from your terminal or command line without relying on the GitHub OAuth webhook:
```bash
# 1. Login to Cloudflare:
npx wrangler login

# 2. Deploy directly:
npm run deploy
```

---

## 🚚 Steadfast Courier API Integration: Setting API Credentials

When booking a parcel via Steadfast Courier, the server uses your Steadfast merchant credentials to create parcels and generate waybills. You can set them up using either of the following two methods:

### Method 1: In the Admin Panel (Easiest — No Terminal Required)
1. Log in to the Admin Dashboard using your configured administrator credentials.
2. Navigate to **Store Settings** &rarr; scroll to **Steadfast Courier API Settings** (or go to **Courier APIs** &rarr; edit **Steadfast Courier**).
3. Paste your **API Key** and **Secret Key** from your [Steadfast Merchant Portal](https://portal.steadfast.com.bd/).
4. Click **Test Connection & Balance** to verify your balance.
5. Click **Save Store Settings**. The keys are saved directly into your Cloudflare D1 database and automatically used for all future order dispatches.

*Tip: You can also enter the keys directly inside the parcel dispatch modal whenever you book an order.*

### Method 2: In Cloudflare Worker Secrets (Recommended for Enterprise/Production)
You can store your credentials as encrypted environment secrets in your Cloudflare Worker:

```bash
# 1. (REQUIRED) Set Admin Authentication Secret (must be a strong random secret):
npx wrangler secret put ADMIN_SECRET

# 2. Set the Steadfast API Key:
npx wrangler secret put STEADFAST_API_KEY
# Enter your Steadfast API key when prompted and press Enter

# 3. Set the Steadfast Secret Key:
npx wrangler secret put STEADFAST_SECRET_KEY
# Enter your Steadfast secret key when prompted and press Enter
```

Alternatively, configure them in the **Cloudflare Dashboard**:
1. Go to **Workers & Pages** &rarr; select **rt** &rarr; **Settings** &rarr; **Variables and Secrets**.
2. Click **Add** under **Environment Variables / Secrets**:
   - `ADMIN_SECRET`: *(REQUIRED: Cloudflare Worker Secret used for HMAC session token signing; fails closed if unconfigured)*
   - `STEADFAST_API_KEY`: *(Your Steadfast merchant API Key)*
   - `STEADFAST_SECRET_KEY`: *(Your Steadfast merchant Secret Key)*
3. Click **Deploy**.

