import { Env } from './types';

/**
 * Constant-time string equality comparison to prevent timing attacks.
 */
export function timingSafeEqualString(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') {
    return false;
  }
  const enc = new TextEncoder();
  const bufA = enc.encode(a);
  const bufB = enc.encode(b);
  if (bufA.length !== bufB.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < bufA.length; i++) {
    diff |= bufA[i] ^ bufB[i];
  }
  return diff === 0;
}

/**
 * Computes an HMAC-SHA256 hexadecimal string using Web Crypto API.
 */
export async function computeHmacSha256Hex(secret: string, data: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sigBuffer = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  const hashArray = Array.from(new Uint8Array(sigBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

export interface WebhookAuthResult {
  authenticated: boolean;
  status: number;
  error?: string;
  matchedSecretSource?: string;
}

export interface WebhookRequestInput {
  rawBody: string;
  headers: Record<string, string | string[] | undefined> | Headers;
  url?: string;
}

function getHeaderValue(headers: Record<string, string | string[] | undefined> | Headers, name: string): string {
  const lowerName = name.toLowerCase();
  if ('get' in headers && typeof headers.get === 'function') {
    return (headers.get(name) || headers.get(lowerName) || '').trim();
  }
  const record = headers as Record<string, string | string[] | undefined>;
  for (const key of Object.keys(record)) {
    if (key.toLowerCase() === lowerName) {
      const val = record[key];
      if (Array.isArray(val)) return (val[0] || '').trim();
      return (val || '').trim();
    }
  }
  return '';
}

/**
 * Authoritatively verifies courier webhook requests.
 * Supports:
 * 1. HMAC-SHA256 signatures (X-Steadfast-Signature, X-Webhook-Signature, X-Signature, X-Hub-Signature-256)
 * 2. Shared secret headers (X-Webhook-Secret, X-Courier-Secret, Secret-Key, Authorization: Bearer <secret>)
 * 3. Steadfast API Key and Secret Key pairs (Api-Key + Secret-Key)
 * 4. Replay protection against stale or replayed timestamps (5-minute tolerance)
 * 5. Rejection of unauthenticated or tampered payloads prior to any order mutation
 */
export async function verifyCourierWebhookAuth(
  input: WebhookRequestInput,
  env?: Env | null,
  settings?: any
): Promise<WebhookAuthResult> {
  const { rawBody, headers } = input;

  // 1. Gather all candidate secrets from server environment & settings
  const candidateSecrets = new Set<string>();

  const envWebhookSecret = (env?.COURIER_WEBHOOK_SECRET || process.env.COURIER_WEBHOOK_SECRET || '').trim();
  if (envWebhookSecret) candidateSecrets.add(envWebhookSecret);

  const envSteadfastSecret = (env?.STEADFAST_SECRET_KEY || process.env.STEADFAST_SECRET_KEY || '').trim();
  if (envSteadfastSecret) candidateSecrets.add(envSteadfastSecret);

  const settingsSteadfastSecret = (settings?.steadfastSecretKey || '').trim();
  if (settingsSteadfastSecret) candidateSecrets.add(settingsSteadfastSecret);

  if (Array.isArray(settings?.courierWebhooks)) {
    for (const w of settings.courierWebhooks) {
      if (w.secret && typeof w.secret === 'string' && w.secret.trim()) {
        candidateSecrets.add(w.secret.trim());
      }
    }
  }

  // If no secrets are configured in environment or settings, reject all webhook requests securely
  if (candidateSecrets.size === 0) {
    console.warn('[Webhook Auth]: No webhook secret is configured on the server.');
    return {
      authenticated: false,
      status: 401,
      error: 'Unauthorized: Courier webhook authentication failed.',
    };
  }

  // 2. Extract potential signature and secret headers
  const sigHeader =
    getHeaderValue(headers, 'x-steadfast-signature') ||
    getHeaderValue(headers, 'x-webhook-signature') ||
    getHeaderValue(headers, 'x-signature') ||
    getHeaderValue(headers, 'x-hub-signature-256') ||
    getHeaderValue(headers, 'x-signature-sha256');

  const secretHeader =
    getHeaderValue(headers, 'x-webhook-secret') ||
    getHeaderValue(headers, 'x-courier-secret') ||
    getHeaderValue(headers, 'secret-key');

  const authHeader = getHeaderValue(headers, 'authorization');
  let bearerSecret = '';
  if (authHeader) {
    if (authHeader.toLowerCase().startsWith('bearer ')) {
      bearerSecret = authHeader.substring(7).trim();
    } else {
      bearerSecret = authHeader.trim();
    }
  }

  const apiKeyHeader = getHeaderValue(headers, 'api-key') || getHeaderValue(headers, 'x-api-key');

  // 3. Replay Protection: Validate timestamp if provided
  const timestampHeader =
    getHeaderValue(headers, 'x-webhook-timestamp') ||
    getHeaderValue(headers, 'x-timestamp') ||
    getHeaderValue(headers, 'x-signature-timestamp') ||
    getHeaderValue(headers, 'x-req-timestamp');

  if (timestampHeader) {
    let timestampMs: number | null = null;
    if (/^\d+$/.test(timestampHeader)) {
      const num = parseInt(timestampHeader, 10);
      timestampMs = num > 10000000000 ? num : num * 1000;
    } else {
      const parsed = Date.parse(timestampHeader);
      if (!isNaN(parsed)) {
        timestampMs = parsed;
      }
    }

    if (timestampMs === null) {
      return {
        authenticated: false,
        status: 400,
        error: 'Malformed webhook timestamp header.',
      };
    }

    const now = Date.now();
    const TOLERANCE_MS = 5 * 60 * 1000; // 5-minute tolerance
    if (Math.abs(now - timestampMs) > TOLERANCE_MS) {
      return {
        authenticated: false,
        status: 401,
        error: 'Webhook request timestamp is expired or outside the 5-minute tolerance window (replay protection).',
      };
    }
  }

  // 4. Verify HMAC-SHA256 Signature if signature header is provided
  if (sigHeader) {
    let cleanSig = sigHeader.trim();
    if (cleanSig.toLowerCase().startsWith('sha256=')) {
      cleanSig = cleanSig.substring(7).trim();
    } else if (cleanSig.toLowerCase().startsWith('sha1=')) {
      cleanSig = cleanSig.substring(5).trim();
    }

    if (!cleanSig || cleanSig.length < 16) {
      return {
        authenticated: false,
        status: 401,
        error: 'Malformed courier webhook signature header.',
      };
    }

    for (const secret of candidateSecrets) {
      // Test payload signature with raw body
      const expectedSig = await computeHmacSha256Hex(secret, rawBody);
      if (timingSafeEqualString(cleanSig.toLowerCase(), expectedSig.toLowerCase())) {
        return { authenticated: true, status: 200, matchedSecretSource: 'signature' };
      }

      // Test payload signature with timestamp prefix if timestamp header exists
      if (timestampHeader) {
        const expectedWithDot = await computeHmacSha256Hex(secret, `${timestampHeader}.${rawBody}`);
        if (timingSafeEqualString(cleanSig.toLowerCase(), expectedWithDot.toLowerCase())) {
          return { authenticated: true, status: 200, matchedSecretSource: 'timestamped_signature' };
        }
        const expectedConcat = await computeHmacSha256Hex(secret, `${timestampHeader}${rawBody}`);
        if (timingSafeEqualString(cleanSig.toLowerCase(), expectedConcat.toLowerCase())) {
          return { authenticated: true, status: 200, matchedSecretSource: 'timestamped_signature' };
        }
      }
    }

    return {
      authenticated: false,
      status: 401,
      error: 'Invalid courier webhook signature: cryptographic verification failed.',
    };
  }

  // 5. Verify Shared Secret Headers (X-Webhook-Secret, X-Courier-Secret, Secret-Key, Bearer)
  const incomingSecret = secretHeader || bearerSecret;
  if (incomingSecret) {
    // If Api-Key is also provided, check Steadfast API Key consistency
    const configuredApiKey = (env?.STEADFAST_API_KEY || process.env.STEADFAST_API_KEY || settings?.steadfastApiKey || '').trim();
    if (apiKeyHeader && configuredApiKey) {
      if (!timingSafeEqualString(apiKeyHeader, configuredApiKey)) {
        return {
          authenticated: false,
          status: 401,
          error: 'Unauthorized: Invalid courier Api-Key header.',
        };
      }
    }

    for (const secret of candidateSecrets) {
      if (timingSafeEqualString(incomingSecret, secret)) {
        return { authenticated: true, status: 200, matchedSecretSource: 'secret_header' };
      }
    }

    return {
      authenticated: false,
      status: 401,
      error: 'Unauthorized: Invalid courier webhook secret.',
    };
  }

  // 6. No signature or secret headers were provided in the request
  return {
    authenticated: false,
    status: 401,
    error: 'Unauthorized: Missing required courier webhook signature or secret header (X-Webhook-Signature, X-Steadfast-Signature, X-Webhook-Secret, or Secret-Key).',
  };
}
