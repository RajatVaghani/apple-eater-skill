#!/usr/bin/env node
/**
 * List all apps on the App Store Connect account.
 *
 * Usage:
 *   node asc-list-apps.mjs [--config <path>]
 *
 * Returns each app's ID, name, bundleId, sku, and primary locale.
 * The app ID is needed for most other scripts.
 */

import {
  loadCredentials, getToken, apiRequest, outputJson, exitError,
} from './asc-common.mjs';

async function main() {
  const creds = loadCredentials();
  const token = getToken(creds);

  const endpoint = '/v1/apps?fields[apps]=name,bundleId,sku,primaryLocale&limit=200';
  const result = await apiRequest(token, 'GET', endpoint);

  const apps = (result.data || []).map(app => ({
    id: app.id,
    name: app.attributes?.name || null,
    bundleId: app.attributes?.bundleId || null,
    sku: app.attributes?.sku || null,
    primaryLocale: app.attributes?.primaryLocale || null,
  }));

  outputJson({ ok: true, count: apps.length, apps });
}

main().catch(err => exitError(err.message));
