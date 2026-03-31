#!/usr/bin/env node
/**
 * List App Store versions for an app.
 *
 * Usage:
 *   node asc-app-versions.mjs <appId> [--state <state>] [--platform <platform>] [--config <path>]
 *
 * Options:
 *   --state <state>       Filter by state: READY_FOR_SALE | PREPARE_FOR_SUBMISSION |
 *                          WAITING_FOR_REVIEW | IN_REVIEW | DEVELOPER_REJECTED |
 *                          PENDING_DEVELOPER_RELEASE | PROCESSING_FOR_APP_STORE | etc.
 *   --platform <platform> Filter by platform: IOS | MAC_OS | TV_OS | VISION_OS
 *   --limit <n>           Max results (default: 20)
 *   --config <path>       Custom credentials path
 *
 * Returns version string, state, release type, creation date, and platform.
 */

import {
  loadCredentials, getToken, apiRequest,
  getArg, getPositional, outputJson, exitError,
} from './asc-common.mjs';

async function main() {
  const appId = getPositional(0);
  if (!appId) {
    exitError(
      'Missing app ID.\n' +
      'Usage: node asc-app-versions.mjs <appId> [--state READY_FOR_SALE] [--platform IOS]\n' +
      'Get app IDs from: node asc-list-apps.mjs'
    );
  }

  const creds = loadCredentials();
  const token = getToken(creds);

  const state = getArg('state');
  const platform = getArg('platform');
  const limit = getArg('limit') || '20';

  const params = new URLSearchParams();
  params.set('fields[appStoreVersions]', 'versionString,appStoreState,releaseType,createdDate,platform');
  params.set('sort', '-createdDate');
  params.set('limit', limit);
  if (state) params.set('filter[appStoreState]', state.toUpperCase());
  if (platform) params.set('filter[platform]', platform.toUpperCase());

  const endpoint = `/v1/apps/${appId}/appStoreVersions?${params.toString()}`;
  const result = await apiRequest(token, 'GET', endpoint);

  const versions = (result.data || []).map(v => ({
    id: v.id,
    versionString: v.attributes?.versionString,
    state: v.attributes?.appStoreState,
    releaseType: v.attributes?.releaseType,
    platform: v.attributes?.platform,
    createdDate: v.attributes?.createdDate,
  }));

  const liveVersion = versions.find(v => v.state === 'READY_FOR_SALE');

  outputJson({
    ok: true,
    appId,
    count: versions.length,
    liveVersion: liveVersion || null,
    versions,
  });
}

main().catch(err => exitError(err.message));
