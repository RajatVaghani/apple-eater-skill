/**
 * Shared utilities for App Store Connect helper scripts.
 * Handles credential loading, ES256 JWT signing (used directly as Bearer token),
 * and authenticated API requests.
 *
 * Zero external dependencies — uses only Node built-ins.
 *
 * KEY DIFFERENCE from Apple Search Ads:
 *   ASA  → sign JWT → exchange at OAuth endpoint → use access_token
 *   ASC  → sign JWT → use JWT directly as Bearer token (no exchange step)
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import https from 'https';

const DEFAULT_CONFIG_DIR = '/data/.openclaw/shared-files/apple-eater';
const ASC_BASE = 'https://api.appstoreconnect.apple.com';

// ── Credential Loading ───────────────────────────────────────────────

/**
 * Find and parse the credentials file.
 *
 * Resolution order:
 *   1. Explicit path passed as argument
 *   2. --config <path> CLI flag
 *   3. ASC_CONFIG_PATH environment variable
 *   4. ~/.openclaw/openclaw.json → env.ASC_CONFIG_PATH
 *   5. Default directory: /data/.openclaw/shared-files/apple-eater/
 *
 * The credentials file must contain these values (any text format):
 *   - Issuer ID   (from App Store Connect → Users and Access → Integrations → Keys)
 *   - Key ID      (shown next to the key you created)
 *   - P8 Path     (path to the downloaded .p8 private key file)
 *   - Vendor Number (from App Store Connect → Sales and Trends, or Payments and Financial Reports)
 */
export function loadCredentials(customPath) {
  const configPath = customPath
    || process.argv.find((a, i) => process.argv[i - 1] === '--config')
    || process.env.ASC_CONFIG_PATH
    || resolveFromOpenclawConfig()
    || null;

  let filePath = null;

  if (configPath) {
    if (!fs.existsSync(configPath)) {
      throw new Error(`Config path not found: ${configPath}`);
    }
    const stat = fs.statSync(configPath);
    if (stat.isDirectory()) {
      filePath = findCredentialFile(configPath);
    } else {
      filePath = configPath;
    }
  } else {
    if (!fs.existsSync(DEFAULT_CONFIG_DIR)) {
      throw new Error(
        `Credentials directory not found: ${DEFAULT_CONFIG_DIR}\n` +
        `Please run the setup process first. Create a credentials file at:\n` +
        `${DEFAULT_CONFIG_DIR}/credentials.md\n` +
        `See the skill SKILL.md for the required format.`
      );
    }
    filePath = findCredentialFile(DEFAULT_CONFIG_DIR);
  }

  const content = fs.readFileSync(filePath, 'utf-8');

  const extract = (pattern) => {
    const match = content.match(pattern);
    return match ? match[1].trim() : null;
  };

  const issuerId = extract(/issuer\s*id[:\s]+([^\n]+)/i);
  const keyId = extract(/key\s*id[:\s]+([^\n]+)/i);
  const p8Path = extract(/p8\s*(?:path|file)[:\s]+([^\n]+)/i);
  const vendorNumber = extract(/vendor\s*(?:number|id)[:\s]+([^\n]+)/i);

  const missing = [];
  if (!issuerId) missing.push('Issuer ID');
  if (!keyId) missing.push('Key ID');
  if (!p8Path) missing.push('P8 Path');

  if (missing.length > 0) {
    throw new Error(
      `Missing credentials: ${missing.join(', ')}\n` +
      `File checked: ${filePath}\n` +
      `Make sure each value is on its own line like: "Issuer ID: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"`
    );
  }

  const resolvedP8Path = path.isAbsolute(p8Path)
    ? p8Path
    : path.resolve(path.dirname(filePath), p8Path);

  if (!fs.existsSync(resolvedP8Path)) {
    throw new Error(`P8 private key file not found at: ${resolvedP8Path}`);
  }

  return { issuerId, keyId, p8Path: resolvedP8Path, vendorNumber, _filePath: filePath };
}

function findCredentialFile(dir) {
  const files = fs.readdirSync(dir).filter(f =>
    f.endsWith('.md') || f.endsWith('.txt') || f.endsWith('.json')
  );
  if (files.length === 0) {
    throw new Error(`No credential files found in ${dir}`);
  }
  const preferred = files.find(f => /credential/i.test(f)) || files[0];
  return path.join(dir, preferred);
}

function resolveFromOpenclawConfig() {
  const candidates = [
    path.join(process.env.HOME || '', '.openclaw', 'openclaw.json'),
    '/data/.openclaw/openclaw.json',
  ];
  for (const p of candidates) {
    try {
      if (!fs.existsSync(p)) continue;
      const config = JSON.parse(fs.readFileSync(p, 'utf-8'));
      if (config.env?.ASC_CONFIG_PATH) return config.env.ASC_CONFIG_PATH;
    } catch { /* skip */ }
  }
  return null;
}

// ── JWT Signing (ES256) ──────────────────────────────────────────────

function base64url(input) {
  const buf = typeof input === 'string' ? Buffer.from(input) : input;
  return buf.toString('base64url');
}

/**
 * Convert a DER-encoded ECDSA signature to raw r||s format (64 bytes).
 * Node's crypto.sign() returns DER; JWTs need raw concatenated r+s.
 */
function derToRaw(der) {
  let offset = 2;
  const rLen = der[offset + 1];
  offset += 2;
  let r = der.slice(offset, offset + rLen);
  offset += rLen;
  const sLen = der[offset + 1];
  offset += 2;
  let s = der.slice(offset, offset + sLen);

  if (r.length > 32) r = r.slice(r.length - 32);
  if (s.length > 32) s = s.slice(s.length - 32);
  if (r.length < 32) r = Buffer.concat([Buffer.alloc(32 - r.length), r]);
  if (s.length < 32) s = Buffer.concat([Buffer.alloc(32 - s.length), s]);

  return Buffer.concat([r, s]);
}

/**
 * Build and sign a JWT for App Store Connect API.
 *
 * This JWT is used DIRECTLY as the Bearer token — no token exchange needed.
 * Max lifetime: 20 minutes.
 */
export function buildJWT(credentials) {
  const privateKey = fs.readFileSync(credentials.p8Path, 'utf-8');

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'ES256', kid: credentials.keyId, typ: 'JWT' };
  const payload = {
    iss: credentials.issuerId,
    iat: now,
    exp: now + 1200, // 20 minutes (Apple's max)
    aud: 'appstoreconnect-v1',
  };

  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;

  const sign = crypto.createSign('SHA256');
  sign.update(signingInput);
  sign.end();
  const signature = sign.sign(privateKey);
  const rawSig = derToRaw(signature);

  return `${signingInput}.${base64url(rawSig)}`;
}

// ── Token Management ─────────────────────────────────────────────────

let _cachedToken = null;
let _cachedTokenExpiry = 0;

/**
 * Get a valid JWT token. Caches and reuses until near expiry.
 */
export function getToken(credentials) {
  if (_cachedToken && Date.now() < _cachedTokenExpiry) {
    return _cachedToken;
  }
  _cachedToken = buildJWT(credentials);
  _cachedTokenExpiry = Date.now() + (1200 - 60) * 1000; // refresh 1 min early
  return _cachedToken;
}

// ── API Requests ─────────────────────────────────────────────────────

/**
 * Make an authenticated request to the App Store Connect API.
 *
 * @param {string} token - JWT bearer token
 * @param {string} method - HTTP method
 * @param {string} endpoint - Path starting with /v1/... or full URL
 * @param {object|null} body - JSON body for POST/PATCH requests
 * @returns {Promise<object>} Parsed JSON response
 */
export async function apiRequest(token, method, endpoint, body) {
  const url = endpoint.startsWith('http') ? endpoint : `${ASC_BASE}${endpoint}`;
  const headers = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

  const data = method === 'GET'
    ? await httpsGet(url, headers)
    : await httpsRequest(url, method, body ? JSON.stringify(body) : '', headers);

  try {
    return JSON.parse(data);
  } catch {
    throw new Error(`Failed to parse API response: ${data.substring(0, 500)}`);
  }
}

/**
 * Make an authenticated GET that returns raw data (for gzip-encoded sales reports).
 */
export async function apiRequestRaw(token, method, endpoint) {
  const url = endpoint.startsWith('http') ? endpoint : `${ASC_BASE}${endpoint}`;
  const headers = {
    'Authorization': `Bearer ${token}`,
    'Accept': 'application/a-gzip',
  };
  return httpsGetRaw(url, headers);
}

// ── Date Helpers ─────────────────────────────────────────────────────

export function formatDate(date) {
  return date.toISOString().split('T')[0];
}

export function getDateRange(days) {
  const end = new Date();
  end.setDate(end.getDate() - 1);
  const start = new Date();
  start.setDate(start.getDate() - days);
  return { startDate: formatDate(start), endDate: formatDate(end) };
}

// ── CLI Helpers ──────────────────────────────────────────────────────

export function getArg(name) {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1 || idx + 1 >= process.argv.length) return null;
  return process.argv[idx + 1];
}

export function getFlag(name) {
  return process.argv.includes(`--${name}`);
}

export function getPositional(index) {
  const cleaned = [];
  const rawArgs = process.argv.slice(2);
  for (let i = 0; i < rawArgs.length; i++) {
    if (rawArgs[i].startsWith('--')) {
      i++;
      continue;
    }
    cleaned.push(rawArgs[i]);
  }
  return cleaned[index] || null;
}

export function outputJson(data) {
  console.log(JSON.stringify(data, null, 2));
}

export function exitError(message) {
  console.error(JSON.stringify({ ok: false, error: { message } }, null, 2));
  process.exit(1);
}

// ── HTTP Helpers (zero-dependency) ───────────────────────────────────

function httpsGet(url, headers) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: 'GET',
      headers,
    };
    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        } else {
          resolve(data);
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

function httpsGetRaw(url, headers) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: 'GET',
      headers,
    };
    const req = https.request(options, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        if (res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode}: ${buf.toString('utf-8').substring(0, 500)}`));
        } else {
          resolve(buf);
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

function httpsRequest(url, method, body, headers) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method,
      headers: {
        ...headers,
        'Content-Length': Buffer.byteLength(body),
      },
    };
    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        } else {
          resolve(data);
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}
