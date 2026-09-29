/**
 * Verification Suite for Courier Webhook Secret Exposure and Security Hardening Fixes
 */

import { maskCourierWebhooks } from '../src/server/router';
import { controlledMergeSettings } from '../src/server/db';
import { computePasswordSignature } from '../src/server/auth';
import { INITIAL_SETTINGS } from '../src/data/seedData';

async function runCourierSecurityTests() {
  console.log('================================================================');
  console.log('STARTING COURIER WEBHOOK SECURITY & RBAC VERIFICATION');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, title: string, detail?: string) {
    if (condition) {
      console.log(`✅ [PASS] ${title}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${title} - ${detail || 'Assertion failed'}`);
      failed++;
    }
  }

  // 1. maskCourierWebhooks unit tests
  console.log('--- 1. WEBHOOK SECRET MASKING FUNCTION ---');
  const sampleWebhooks = [
    {
      id: 'wh-1',
      name: 'Zapier Webhook',
      url: 'https://hooks.zapier.com/hooks/catch/123/abc',
      secret: 'super_secret_webhook_key_9999',
      events: ['courier.added'],
      isActive: true,
      createdAt: new Date().toISOString(),
    },
    {
      id: 'wh-2',
      name: 'Slack Alerts',
      url: 'https://hooks.slack.com/services/T00/B00/X00',
      secret: undefined,
      events: ['courier.dispatched'],
      isActive: false,
      createdAt: new Date().toISOString(),
    },
    {
      id: 'wh-3',
      name: 'Masked Webhook',
      url: 'https://example.com/webhook',
      secret: '••••••••',
      hasSecret: true,
      events: ['*'],
      isActive: true,
      createdAt: new Date().toISOString(),
    },
  ];

  const masked = maskCourierWebhooks(sampleWebhooks);

  assert(
    masked.length === 3,
    '1.1 maskCourierWebhooks preserves list length'
  );

  assert(
    masked[0].secret === '••••••••' && masked[0].hasSecret === true,
    '1.2 Webhook with real secret returns masked "••••••••" and hasSecret=true'
  );

  assert(
    !JSON.stringify(masked).includes('super_secret_webhook_key_9999'),
    '1.3 Real secret is completely absent from masked output'
  );

  assert(
    masked[1].secret === undefined && masked[1].hasSecret === false,
    '1.4 Webhook without secret returns secret=undefined and hasSecret=false'
  );

  assert(
    masked[2].secret === '••••••••' && masked[2].hasSecret === true,
    '1.5 Pre-masked webhook retains masked placeholder and hasSecret=true'
  );

  // 2. controlledMergeSettings secret preservation
  console.log('\n--- 2. STORE SETTINGS CONTROLLED MERGE SECRET PRESERVATION ---');
  const currentSettings = {
    ...INITIAL_SETTINGS,
    courierWebhooks: [
      {
        id: 'wh-1',
        name: 'Zapier Webhook',
        url: 'https://hooks.zapier.com/hooks/catch/123/abc',
        secret: 'actual_d1_stored_secret_key_12345',
        events: ['courier.added'],
        isActive: true,
        createdAt: '2026-03-01T00:00:00Z',
      },
    ],
  };

  // Client sends back masked secret '••••••••' during edit
  const mergedWithMasked = controlledMergeSettings(currentSettings, {
    courierWebhooks: [
      {
        id: 'wh-1',
        name: 'Updated Zapier Webhook Name',
        url: 'https://hooks.zapier.com/hooks/catch/123/abc',
        secret: '••••••••',
        events: ['courier.added', 'courier.dispatched'],
        isActive: true,
        createdAt: '2026-03-01T00:00:00Z',
      },
    ],
  });

  assert(
    mergedWithMasked.courierWebhooks?.[0].secret === 'actual_d1_stored_secret_key_12345',
    '2.1 controlledMergeSettings preserves existing real secret when client sends "••••••••"'
  );

  assert(
    mergedWithMasked.courierWebhooks?.[0].name === 'Updated Zapier Webhook Name',
    '2.2 Other updated fields (name, events) are updated correctly'
  );

  // Client enters a new secret
  const mergedWithNewSecret = controlledMergeSettings(currentSettings, {
    courierWebhooks: [
      {
        id: 'wh-1',
        name: 'Updated Name',
        url: 'https://hooks.zapier.com/hooks/catch/123/abc',
        secret: 'brand_new_secret_key_9999',
        events: ['courier.added'],
        isActive: true,
        createdAt: '2026-03-01T00:00:00Z',
      },
    ],
  });

  assert(
    mergedWithNewSecret.courierWebhooks?.[0].secret === 'brand_new_secret_key_9999',
    '2.3 controlledMergeSettings saves new secret when explicitly provided'
  );

  // 3. Password signature cryptographic entropy
  console.log('\n--- 3. PASSWORD SIGNATURE ENTROPY & INTEGRITY ---');
  const sampleHash1 = 'pbkdf2:100000:a1b2c3d4e5f607182930415263748596:9876543210abcdef0123456789abcdef';
  const sampleHash2 = 'pbkdf2:100000:a1b2c3d4e5f607182930415263748596:00000000000000000000000000000000';

  const sig1 = await computePasswordSignature(sampleHash1);
  const sig2 = await computePasswordSignature(sampleHash2);

  assert(
    typeof sig1 === 'string' && sig1.length === 32,
    '3.1 computePasswordSignature produces 32-hex-character (128-bit) signature'
  );

  assert(
    sig1 !== sig2,
    '3.2 Different password hashes produce different signatures even with identical salt prefix'
  );

  // 4. Live Localhost Dev Server Endpoints
  console.log('\n--- 4. DEV SERVER LIVE API ENDPOINT PROTECTION ---');
  const baseUrl = 'http://127.0.0.1:3000';

  // 4.1 GET /api/courier/webhooks without auth -> 401
  const unauthGetRes = await fetch(`${baseUrl}/api/courier/webhooks`);
  assert(
    unauthGetRes.status === 401,
    '4.1 GET /api/courier/webhooks returns HTTP 401 Unauthorized when unauthenticated'
  );

  // 4.2 GET /api/courier/webhooks/logs without auth -> 401
  const unauthLogsRes = await fetch(`${baseUrl}/api/courier/webhooks/logs`);
  assert(
    unauthLogsRes.status === 401,
    '4.2 GET /api/courier/webhooks/logs returns HTTP 401 Unauthorized when unauthenticated'
  );

  // 4.3 GET /api/settings without auth does not leak courierWebhooks
  const publicSettingsRes = await fetch(`${baseUrl}/api/settings`);
  const publicSettingsJson = await publicSettingsRes.json();
  assert(
    publicSettingsJson.success === true &&
    publicSettingsJson.settings.courierWebhooks === undefined &&
    publicSettingsJson.settings.steadfastApiKey === undefined &&
    publicSettingsJson.settings.steadfastSecretKey === undefined,
    '4.3 Public /api/settings response completely excludes courierWebhooks and courier API credentials'
  );

  // 4.4 GET /api/courier/webhooks with non-privileged staff auth -> 403 Forbidden
  const staffToken = `dev-jwt-${Buffer.from(JSON.stringify({ userId: 'user-subadmin-staff', email: 'staff@rongdhonutrade.com', role: 'sub_admin', exp: Date.now() + 86400000 })).toString('base64')}`;
  const customerGetRes = await fetch(`${baseUrl}/api/courier/webhooks`, {
    headers: { Authorization: `Bearer ${staffToken}` },
  });
  assert(
    customerGetRes.status === 403,
    '4.4 GET /api/courier/webhooks returns HTTP 403 Forbidden for accounts without courier.configure permission'
  );

  // 4.5 GET /api/courier/webhooks with admin auth -> 200 with masked secrets
  const adminToken = `dev-jwt-${Buffer.from(JSON.stringify({ userId: 'user-admin-efat', email: 'cmt413uec@gmail.com', role: 'super_admin', exp: Date.now() + 86400000 })).toString('base64')}`;
  const adminGetRes = await fetch(`${baseUrl}/api/courier/webhooks`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const adminGetJson = await adminGetRes.json();
  assert(
    adminGetRes.status === 200 && adminGetJson.success === true && Array.isArray(adminGetJson.webhooks),
    '4.5 GET /api/courier/webhooks returns HTTP 200 and webhooks array for authorized admin'
  );

  const rawSecretsExposed = (adminGetJson.webhooks || []).some((w: any) => w.secret && w.secret !== '••••••••');
  assert(
    !rawSecretsExposed,
    '4.6 Admin API response contains ZERO unmasked webhook secrets'
  );

  // 4.6 PUT /api/users/:id self-update password requires current password confirmation
  const userUpdateWithoutCurrentPw = await fetch(`${baseUrl}/api/users/user-admin-efat`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${adminToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      password: 'new_unauthorized_password_123',
    }),
  });
  assert(
    userUpdateWithoutCurrentPw.status === 400,
    '4.7 PUT /api/users/:id returns HTTP 400 when attempting self-service password update without current password'
  );

  console.log('\n================================================================');
  console.log(`FINAL RESULT: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runCourierSecurityTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
