#!/usr/bin/env node
/**
 * Verify App Store Connect setup by checking credentials and testing API access.
 *
 * Usage:
 *   node asc-setup-check.mjs [--config <path>]
 *
 * Runs four checks:
 *   1. Credential file can be found and parsed
 *   2. P8 private key file is valid
 *   3. JWT can be signed with ES256
 *   4. API responds to a test call (list apps)
 */

import {
  loadCredentials, buildJWT, getToken, apiRequest, outputJson, exitError,
} from './asc-common.mjs';
import fs from 'fs';

async function main() {
  const results = { steps: [] };

  // Step 1: Load credentials
  let creds;
  try {
    creds = loadCredentials();
    results.steps.push({
      step: 'Load credentials',
      status: 'OK',
      details: `Found: issuerId=${creds.issuerId.substring(0, 12)}..., keyId=${creds.keyId}`,
    });
  } catch (err) {
    results.steps.push({ step: 'Load credentials', status: 'FAIL', details: err.message });
    outputJson(results);
    process.exit(1);
  }

  // Step 2: Check P8 file
  try {
    const p8 = fs.readFileSync(creds.p8Path, 'utf-8');
    if (p8.includes('BEGIN') && p8.includes('PRIVATE KEY')) {
      results.steps.push({
        step: 'P8 file check',
        status: 'OK',
        details: `Valid P8 at ${creds.p8Path} (${p8.length} chars)`,
      });
    } else {
      results.steps.push({
        step: 'P8 file check',
        status: 'WARN',
        details: 'File exists but may not be a valid P8 — missing BEGIN/END markers',
      });
    }
  } catch (err) {
    results.steps.push({ step: 'P8 file check', status: 'FAIL', details: `Cannot read P8: ${err.message}` });
    outputJson(results);
    process.exit(1);
  }

  // Step 3: JWT signing
  let token;
  try {
    token = getToken(creds);
    const parts = token.split('.');
    if (parts.length === 3) {
      results.steps.push({
        step: 'JWT signing',
        status: 'OK',
        details: `ES256 JWT generated (${token.length} chars)`,
      });
    } else {
      throw new Error('JWT does not have 3 parts');
    }
  } catch (err) {
    results.steps.push({
      step: 'JWT signing',
      status: 'FAIL',
      details: err.message,
      hint: 'Make sure the P8 file is an EC private key (ES256). RSA keys will not work.',
    });
    outputJson(results);
    process.exit(1);
  }

  // Step 4: Test API access — list apps
  try {
    const result = await apiRequest(token, 'GET', '/v1/apps?limit=1&fields[apps]=name,bundleId');
    const count = result?.data?.length || 0;
    const appName = result?.data?.[0]?.attributes?.name || '(none)';
    results.steps.push({
      step: 'API access test',
      status: 'OK',
      details: `Successfully called /v1/apps — found app: "${appName}"`,
    });
  } catch (err) {
    const hint = err.message.includes('401')
      ? 'Token rejected. Check your Issuer ID, Key ID, and P8 file. Make sure the key is not revoked.'
      : err.message.includes('403')
        ? 'Access forbidden. Your API key may not have the right role. Needs at least "App Manager" or "Admin".'
        : null;
    results.steps.push({
      step: 'API access test',
      status: 'FAIL',
      details: err.message,
      ...(hint && { hint }),
    });
  }

  const allOk = results.steps.every(s => s.status === 'OK');
  results.overall = allOk
    ? 'SETUP COMPLETE — All checks passed ✓'
    : 'SETUP INCOMPLETE — See failed steps above';

  outputJson(results);
  process.exit(allOk ? 0 : 1);
}

main().catch(err => exitError(err.message));
