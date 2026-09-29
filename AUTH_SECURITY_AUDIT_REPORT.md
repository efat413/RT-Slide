# Authentication & Authorization Security Audit
**Target:** RTBFF (Rongdhonu Trade) — Cloudflare Workers backend
**Scope:** Authentication and Authorization only (per engagement scope). No other vulnerability classes assessed.
**Files reviewed:** `src/worker.ts`, `src/server/router.ts` (4,375 lines), `src/server/auth.ts`, `src/server/permissions.ts`, `src/server/db.ts`, `src/server/webhookAuth.ts`, `src/server/types.ts`, `schema.sql`, `migrations/*.sql`, `scripts/provision-super-admin.ts`
**Method:** Full manual line-by-line review of every `/api/*` route handler, every `requireAuth`/`hasPermission`/`requirePermission` call site, the JWT-like token implementation, password hashing, and the password-reset flow. Every finding below was verified directly against the code (file path + line quoted); no finding is speculative.

---

## Summary Table

| # | Finding | Area | Severity |
|---|---|---|---|
| 1 | `GET /api/courier/webhooks` leaks webhook secrets with no authentication | Authorization / Secret Disclosure | **Critical** |
| 2 | Timing side-channel on `/api/auth/forgot-password` allows account enumeration | Authentication / Enumeration | **Medium** |
| 3 | Self-service password & email change via `PUT /api/users/:id` bypasses current-password confirmation | Authentication / Session Hijacking Persistence | **Medium** |
| 4 | Session-invalidation signature (`pwdSig`) has only 8 bits of entropy | Authentication / Session Invalidation | **Low-Medium** |
| 5 | `getUserByEmailOrUsername` matches on non-unique `name` column | Authentication / Account Confusion | **Low (Informational)** |

No SQL injection, no missing-auth on any admin CRUD route, no broken RBAC on the super-admin boundary, no IDOR on orders/users, no session fixation, and no password-hashing weaknesses were found — these areas are implemented correctly and are documented in the "Verified Secure" section at the end so the reviewer can see what was checked and ruled out, per the "avoid false positives" instruction.

---

## 1. CRITICAL — Courier webhook secrets disclosed to unauthenticated users

**File:** `src/server/router.ts`, lines 3983–3993

```javascript
if (path === '/api/courier/webhooks' && method === 'GET') {
  try {
    const settings = await getStoreSettings(env.DB);
    return jsonResponse({
      success: true,
      webhooks: Array.isArray(settings.courierWebhooks) ? settings.courierWebhooks : [],
    });
  } catch (err: any) {
    return jsonResponse({ success: false, error: err?.message || 'Failed to load courier webhooks' }, 500);
  }
}
```

Unlike every other `/api/courier/webhooks*` route (`POST`, `/test`, `/trigger`), this `GET` handler has **no `requireAuth` call at all**. It returns the full `CourierWebhookConfig[]` array verbatim, and that type (`src/types.ts` lines 93–104) includes a `secret` field:

```typescript
export interface CourierWebhookConfig {
  id: string;
  name: string;
  url: string;
  secret?: string; // Optional token / signature secret
  events: (...)[];
  isActive: boolean;
  ...
}
```

That same `secret` is one of the values `verifyCourierWebhookAuth` (`src/server/webhookAuth.ts`, lines 96–101) trusts to authenticate **inbound** courier webhook calls that mutate orders:

```javascript
if (Array.isArray(settings?.courierWebhooks)) {
  for (const w of settings.courierWebhooks) {
    if (w.secret && typeof w.secret === 'string' && w.secret.trim()) {
      candidateSecrets.add(w.secret.trim());
    }
  }
}
```

### Exploitation scenario
1. Attacker sends `GET https://rongdhonutrade.com/api/courier/webhooks` with no cookie/token.
2. Response includes the configured webhook secret(s) in plaintext.
3. Attacker replays that secret in a forged webhook call, e.g.:
   ```
   POST /api/webhook
   X-Webhook-Secret: <stolen secret>
   Content-Type: application/json

   { "invoice": "<any real order number>", "status": "delivered" }
   ```
4. `verifyCourierWebhookAuth` accepts the request (secret matches), and the handler (`src/server/router.ts` lines 3927–3944) executes:
   ```javascript
   if (normalized.isDelivered && matchedOrder.paymentStatus !== 'PAID' && matchedOrder.paymentStatus !== 'Paid') {
     updates.paymentStatus = 'Paid';
   }
   await updateOrderInD1(env.DB, matchedOrder.id, updates);
   ```
   The attacker can now mark **any** order (identified only by its public order number / waybill / consignment ID — all of which are exposed to the customer who placed the order, or guessable) as `Paid` and `Delivered` without ever paying, or disrupt legitimate order tracking by forging arbitrary courier statuses.

### Impact
Full compromise of the webhook trust boundary: forged "payment received" / "delivered" events, COD fraud (mark unpaid COD orders as paid to release goods), and order-status tampering — all achievable by an anonymous, unauthenticated attacker with a single GET request.

### Recommended fix
```javascript
if (path === '/api/courier/webhooks' && method === 'GET') {
  const { auth, errorResponse } = await requireAuth(request, env);
  if (errorResponse) return errorResponse;
  const canManage = auth!.role === 'super_admin' || hasPermission(auth!, 'courier.configure') || hasPermission(auth!, 'settings.manage');
  if (!canManage) {
    return jsonResponse({ success: false, error: 'Forbidden' }, 403);
  }
  const settings = await getStoreSettings(env.DB);
  const webhooks = (settings.courierWebhooks || []).map(w => ({ ...w, secret: w.secret ? '••••••••' : undefined }));
  return jsonResponse({ success: true, webhooks });
}
```
Require the same `courier.configure`/`settings.manage` gate used by the sibling `POST`/`test`/`trigger` routes, and mask the `secret` field the same way `maskSettings()` already masks `steadfastApiKey`/`steadfastSecretKey` elsewhere in this file.

---

## 2. MEDIUM — Timing side-channel enables account enumeration on password reset

**File:** `src/server/router.ts`, lines 1358–1421 (`/api/auth/forgot-password`)

The code explicitly tries to prevent enumeration and comments say so, but the implementation still leaks account existence through response latency:

```javascript
// Case 2 — Account does NOT exist
if (!user || !user.email) {
  // Perform simulated cryptographic digest to prevent timing analysis
  await crypto.subtle.digest('SHA-256', new TextEncoder().encode(rawEmail + ':anti_enum_salt'));
  return jsonResponse(genericSuccessResponse, 200);
}

// Case 1 — Account exists
const tokenBytes = new Uint8Array(32);
crypto.getRandomValues(tokenBytes);
const rawToken = bufferToHex(tokenBytes.buffer);
const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(rawToken));
const tokenHash = bufferToHex(hashBuffer);
const expiresAt = Date.now() + 60 * 60 * 1000;
if (env.DB) {
  await createPasswordResetToken(env.DB, user.id, tokenHash, expiresAt);
}
const appUrl = resolveAppUrl(env, request.url);
const resetUrl = `${appUrl}/reset-password?token=${encodeURIComponent(rawToken)}`;
const emailResult = await sendPasswordResetEmail(env, user.email, resetUrl); // <-- awaited outbound HTTP call to Resend
...
return jsonResponse(genericSuccessResponse, 200);
```

The "non-existent account" branch performs one local `SHA-256` digest and returns immediately. The "existent account" branch performs a D1 write **and awaits a live outbound HTTPS call to `api.resend.com`** (`sendPasswordResetEmail`, `src/server/router.ts` lines 890–928) before responding. A network round-trip to a third-party API is orders of magnitude slower and more variable than one local hash operation.

### Exploitation scenario
An attacker scripts repeated calls to `/api/auth/forgot-password` with candidate emails and measures response latency (even a handful of samples per email is enough to distinguish "fast path" from "slow path" given the Resend API call typically adds 100–500ms+). This defeats the "identical generic response" anti-enumeration design and lets an attacker build a list of valid registered emails (customers, sub-admins, or — critically — probe whether a specific admin email is a valid account) for follow-on credential-stuffing or phishing.

### Impact
Account enumeration against the password-reset endpoint despite the code's explicit intent to prevent it; facilitates targeted attacks against known-valid accounts (including staff/admin emails).

### Recommended fix
Do not let the response wait on the email-provider call. Use `ctx.waitUntil()` (available in the Worker `fetch` signature) to fire-and-forget the email send after the response is already queued, so both branches return in comparable time:
```javascript
// after creating the token record
ctx?.waitUntil(sendPasswordResetEmail(env, user.email, resetUrl));
return jsonResponse(genericSuccessResponse, 200);
```
(This requires threading `ctx` from `worker.ts` into `handleApiRequest`.) Alternatively, add an artificial delay to the "account exists" branch matched to the historical p95 latency of the email call, though the `waitUntil` approach is strictly better.

---

## 3. MEDIUM — Self-service account update lets a user change their own password/email without confirming the current password

**File:** `src/server/router.ts`, lines 2657–2700 (`PUT/PATCH /api/users/:id`)

```javascript
if (method === 'PUT' || method === 'PATCH') {
  const { auth, errorResponse } = await requireAuth(request, env);
  if (errorResponse) return errorResponse;

  const targetUser = await env.DB.prepare('SELECT id, email, role FROM users WHERE id = ?').bind(usrId).first(...);
  ...
  const isSelf = auth!.dbUser.id === usrId;
  const isTargetSuperAdmin = isProtectedSuperAdmin(targetUser, env);

  if (isTargetSuperAdmin && auth!.role !== 'super_admin') { ... }
  if (!isSelf) {
    const permErr = requirePermission(auth!, 'user.manage');
    if (permErr) return permErr;
  }

  const body = (await request.json()) as any;
  const updates = body.updates || body.user || body;

  // Self-updates cannot alter role or permissions without super_admin
  if (isSelf && auth!.role !== 'super_admin') {
    delete updates.role;
    delete updates.permissions;
    delete updates.permissions_json;
  }
  ...
  const updated = await updateUserInD1(env.DB, usrId, updates); // <-- updates.password, updates.email pass through untouched
```

`updateUserInD1` (`src/server/db.ts` lines 1357–1358) will hash and persist any `password` in `updates`, and will update `email` if present — with **no requirement to supply the current password**, unlike the dedicated `/api/auth/change-password` route (`src/server/router.ts` lines 1581–1608) which explicitly re-verifies `currentPassword` before allowing a change:

```javascript
// /api/auth/change-password — the "correct" pattern, for comparison
const isCurrentValid = await verifyPassword(currentPassword, auth!.dbUser.password || '');
if (!isCurrentValid) {
  return jsonResponse({ success: false, error: 'Current password does not match...' }, 400);
}
```

Any authenticated user (customer, sub_admin, admin) can call:
```
PUT /api/users/<their-own-id>
{ "password": "attackerchosenpassword", "email": "attacker@evil.com" }
```
and it succeeds with no re-authentication step.

### Exploitation scenario
This is a persistence/account-takeover amplifier rather than a standalone bypass: if an attacker obtains a valid session by any transient means (a leaked/logged `auth_token`, a brief shoulder-surfing/unattended-device opportunity, a stolen backup, or a future XSS that can ride the session via same-origin fetch even though the cookie itself is `HttpOnly`), they can use this endpoint to **silently rotate the victim's password and email to values only the attacker knows**, converting a temporary compromise into a permanent one — and the legitimate owner receives no password re-confirmation challenge to stop it. This is materially weaker than the dedicated change-password flow that exists elsewhere in the same codebase, which shows the intended control was simply not applied consistently to this endpoint.

### Impact
Downgrades session-hijack containment: a momentary session compromise becomes permanent account takeover, bypassing the re-authentication control the application already implements elsewhere.

### Recommended fix
In the `isSelf` branch, require `currentPassword` verification before honoring a `password` or `email` change, mirroring `/api/auth/change-password`:
```javascript
if (isSelf && (updates.password || updates.email)) {
  const currentPassword = String(body.currentPassword || '').trim();
  const ok = currentPassword && await verifyPassword(currentPassword, auth!.dbUser.password || '');
  if (!ok) {
    return jsonResponse({ success: false, error: 'Current password confirmation is required to change your password or email.' }, 400);
  }
}
```

---

## 4. LOW-MEDIUM — Session-invalidation signature (`pwdSig`) has only ~8 bits of entropy

**Files:** `src/server/router.ts` lines 1209–1216 (token creation), lines 596–603 (`requireAuth` verification)

Token creation:
```javascript
const token = await createAuthToken(
  {
    userId: userRow.id,
    email: userRow.email,
    role: userRow.role,
    pwdSig: (userRow.password || '').slice(0, 16),
  },
  secret
);
```

`userRow.password` is the stored hash in the format `pbkdf2:100000:<32-hex-char-salt>:<64-hex-char-hash>` (`src/server/auth.ts` line 90). The literal prefix `pbkdf2:100000:` is exactly **14 characters**, so `.slice(0, 16)` captures that fixed 14-character prefix plus only the **first 2 hex characters of the random salt** — i.e. one byte, 8 bits, 256 possible values.

Verification in `requireAuth`:
```javascript
if (dbUser.password && tokenUser.pwdSig && tokenUser.pwdSig !== dbUser.password.slice(0, 16)) {
  return { errorResponse: jsonResponse({ ...'Session invalidated or password was changed...' }, 401) };
}
```

### Exploitation scenario
This mechanism exists specifically to invalidate old session tokens the instant a password changes. Because only 8 bits of the new salt are compared, there is a **1-in-256 chance that after a legitimate password change, an old stolen token remains valid** (the new salt's first byte coincidentally matches the old `pwdSig`). This is a probabilistic weakening of a security control whose entire purpose is deterministic invalidation — it is real and measurable (not theoretical): re-hashing the same password repeatedly and comparing `pwdSig` prefixes will demonstrate collisions at the expected ~0.39% rate per change.

### Impact
Reduces the reliability of session invalidation-on-password-change, the primary defense against "I think my account was compromised, so I changed my password" — in roughly 1 of every 256 password changes, a previously stolen token is not revoked.

### Recommended fix
Use a value with real entropy tied to the actual credential, e.g. a SHA-256 of the full password hash (or just take the full hash, or a dedicated random `token_version`/`session_epoch` column bumped on every password change):
```javascript
pwdSig: bufferToHex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(userRow.password || ''))).slice(0, 32)
```
This uses the entire stored hash as input, so any change to the salt or derived hash changes the signature with overwhelming probability instead of a 1/256 chance.

---

## 5. LOW / INFORMATIONAL — Login/identity lookup matches on a non-unique `name` column

**Files:** `schema.sql` line 103 (no `UNIQUE` on `users.name`), `src/server/db.ts` lines 1317–1321

```javascript
export async function getUserByEmailOrUsername(db: D1Database, identifier: string): Promise<UserRow | null> {
  const clean = identifier.toLowerCase().trim();
  const query = 'SELECT * FROM users WHERE LOWER(TRIM(email)) = ? OR LOWER(TRIM(name)) = ? OR id = ? LIMIT 1';
  return db.prepare(query).bind(clean, clean, identifier).first<UserRow>();
}
```

`users.name` (`schema.sql` line 103: `name TEXT NOT NULL`) has no uniqueness constraint, yet `/api/auth/login` (`src/server/router.ts` line 1160) accepts a `usernameOrEmail` field and resolves it through this same function, matching on `name` as an alternative to `email`. Self-registration (`/api/auth/register`, line 1264) lets any customer choose an arbitrary display `name`, including one identical (case-insensitively) to an existing admin's display name.

This is **not independently exploitable as a login bypass** (a matching `name` does not let you log in as someone else — you still need that account's correct password, verified against the row SQLite happens to return), but it does mean:
- If an admin ever logs in using their display name instead of email, and a customer has registered with a colliding name, the row returned by `LIMIT 1` is not deterministic and could resolve to the wrong account, causing confusing login failures / support friction.
- It's a data-hygiene gap that should be closed before it becomes load-bearing for something else.

### Recommended fix
Either drop `name` from the login-identifier lookup (require email/username on a genuinely unique column), or add a `UNIQUE` constraint on `name`/`username` at the schema level.

---

## Verified Secure (checked and ruled out — listed per "avoid false positives")

The following were specifically checked against the code and found to be implemented correctly. Documented so the scope of this review is clear.

- **Password hashing:** PBKDF2-HMAC-SHA256, 100,000 iterations, 16-byte random salt per password, constant-time comparison on verify (`src/server/auth.ts` lines 100–172). Legacy plaintext comparison path was fully removed (line 175: `return false;`).
- **JWT/token generation & validation:** HMAC-SHA256 signed, `alg` pinned and checked (`header.alg !== 'HS256'` rejected), signature verified via `crypto.subtle.verify` before the payload is trusted, `exp` checked server-side (`src/server/auth.ts` lines 178–260).
- **Signing secret handling:** `getAuthSecret()` fails closed in production if `ADMIN_SECRET` is unset (throws `SERVER_CONFIGURATION_ERROR`); the previously-noted D1-settings-based fallback was removed, per the comment in `verifyAuthToken` (`src/server/auth.ts` lines 270–287).
- **Brute-force protection / rate limiting:** All auth-sensitive endpoints (login, register, forgot-password, reset-password, order tracking, reviews, orders) use an atomic, D1-backed, fail-closed rate limiter (`consumeRateLimit`/`atomicIncrement`, `src/server/router.ts` lines 401–470) that increments **before** the protected operation runs, preventing race-condition bypass, and returns HTTP 503 rather than silently allowing requests through if the D1 rate-limit store is unreachable.
- **Login timing attack (user-not-found path):** A dummy `verifyPassword` call against a fixed fake hash is executed when no matching user is found (`src/server/router.ts` line 1180), equalizing PBKDF2 cost between "user exists, wrong password" and "user doesn't exist" — correctly implemented (only the *forgot-password* endpoint, finding #2 above, has the timing gap).
- **Password reset token security:** 32-byte (256-bit) `crypto.getRandomValues` token, only the SHA-256 hash is stored in D1, 60-minute expiry, atomic single-use claim via `UPDATE ... WHERE used_at IS NULL AND expires_at > ? RETURNING ...` which closes the TOCTOU race a naive check-then-update would have (`src/server/db.ts` lines 1460–1503).
- **Session fixation:** A new signed token is minted on every login/register/password-change; the `HttpOnly`, `SameSite=Lax` (or `None` only under a narrowly-scoped dev/preview condition), `Secure`-when-HTTPS cookie (`buildAuthCookieHeader`, lines 213–241) is the sole authoritative credential (Authorization-header Bearer is documented as a test-script fallback only). No user-supplied session identifier is ever accepted or reused.
- **RBAC / Super Admin boundary:** `resolveEffectiveRole()` only honors a stored `super_admin` role if the account's email is also present in the server-side `SUPER_ADMIN_EMAILS` allow-list (`src/server/permissions.ts` lines 789–799) — a compromised D1 row alone cannot mint super-admin privileges. `SUPER_ADMIN_ONLY_PERMISSIONS` (`permission.manage`, `user.manage`, `user.delete`) are hard-blocked from ever being set `true` for non-super-admin accounts in `resolveUserPermissions()` (lines 727–731), independent of what is stored in `permissions_json` — verified this cannot be bypassed by direct API payload manipulation on the permissions-update route (`src/server/router.ts` lines 1729–1734 explicitly reject any attempt to set a super-admin-only key).
- **Vertical privilege escalation via user-management routes:** Creating/promoting to `super_admin`, editing a super-admin's role/permissions, and deleting a super-admin account are all independently blocked for non-super-admin callers at three separate routes (`POST /api/users`, `PUT/PATCH /api/users/:id`, `DELETE /api/users/:id` — lines 2631–2637, 2665–2705, 2735–2745).
- **IDOR on orders:** Customers can only view their own orders (matched server-side by `dbUser.id === order.userId` or verified account email — never a client-supplied ID), and unauthenticated tracking requires both the order identifier **and** a matching phone number, with rate limiting and enumeration-safe generic error responses (`src/server/router.ts` lines 3059–3067, 3205–3215).
- **Route protection / middleware enforcement:** every state-changing route was checked for a `requireAuth` + `requirePermission`/`hasPermission` gate; the only missing gate found is finding #1 above. CSRF defense-in-depth (`Origin` header validation on all non-GET/HEAD requests that aren't machine-to-machine webhook endpoints, lines 963–971) is applied consistently.
- **Courier inbound webhook authentication:** HMAC-SHA256 signature verification with constant-time comparison, replay protection via a 5-minute timestamp tolerance window, and fail-closed behavior when no secret is configured (`src/server/webhookAuth.ts`) — the *design* is sound; it is undermined only by finding #1 (the secret itself is disclosed elsewhere).

---

## Priority Remediation Order
1. **Finding #1** (Critical) — patch immediately; this is a live, unauthenticated data-exfiltration-to-fraud chain.
2. **Finding #3** (Medium) — closes a real session-hijack-to-takeover amplifier; small, low-risk code change.
3. **Finding #2** (Medium) — requires threading `ctx.waitUntil` through the router; moderate effort.
4. **Finding #4** (Low-Medium) — one-line change to the `pwdSig` derivation.
5. **Finding #5** (Informational) — schema hygiene, no urgency.
