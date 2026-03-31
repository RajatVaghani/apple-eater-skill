#!/usr/bin/env node
/**
 * Manage analytics report requests from App Store Connect.
 *
 * This script handles the multi-step analytics reports workflow:
 *   1. REQUEST  — create a new report request for an app
 *   2. LIST     — list existing report requests for an app
 *   3. REPORTS  — list available reports for a request (by category)
 *   4. INSTANCES — list report instances (daily/weekly/monthly snapshots)
 *   5. DOWNLOAD — get download URLs for a report instance's segments
 *
 * Usage:
 *   node asc-analytics.mjs request <appId> [--access ONGOING|ONE_TIME_SNAPSHOT]
 *   node asc-analytics.mjs list    <appId>
 *   node asc-analytics.mjs reports <requestId> [--category APP_USAGE|APP_STORE_ENGAGEMENT|APP_STORE_COMMERCE|PERFORMANCE|FRAMEWORK_USAGE]
 *   node asc-analytics.mjs instances <reportId>
 *   node asc-analytics.mjs download  <instanceId>
 *
 * Options:
 *   --config <path>   Custom credentials path
 *
 * IMPORTANT: The first report request takes 1-2 days to generate data.
 * After that, ONGOING reports refresh daily.
 */

import {
  loadCredentials, getToken, apiRequest,
  getArg, getPositional, outputJson, exitError,
} from './asc-common.mjs';

async function main() {
  const action = getPositional(0);
  if (!action) {
    exitError(
      'Usage: node asc-analytics.mjs <action> <id> [options]\n' +
      'Actions: request, list, reports, instances, download\n' +
      'Run with just the action name for help.'
    );
  }

  const creds = loadCredentials();
  const token = getToken(creds);

  switch (action.toLowerCase()) {
    case 'request': return await doRequest(token);
    case 'list':    return await doList(token);
    case 'reports': return await doReports(token);
    case 'instances': return await doInstances(token);
    case 'download':  return await doDownload(token);
    default:
      exitError(`Unknown action: "${action}". Use: request, list, reports, instances, download`);
  }
}

async function doRequest(token) {
  const appId = getPositional(1);
  if (!appId) exitError('Usage: node asc-analytics.mjs request <appId> [--access ONGOING]');

  const accessType = (getArg('access') || 'ONGOING').toUpperCase();

  const body = {
    data: {
      type: 'analyticsReportRequests',
      attributes: { accessType },
      relationships: {
        app: { data: { type: 'apps', id: appId } },
      },
    },
  };

  let result;
  try {
    result = await apiRequest(token, 'POST', '/v1/analyticsReportRequests', body);
  } catch (err) {
    if (err.message.includes('403')) {
      exitError(
        'PERMISSION DENIED: Your API key cannot create analytics report requests.\n' +
        'This endpoint requires the ADMIN role.\n' +
        'Fix: Go to App Store Connect → Users and Access → Integrations → App Store Connect API\n' +
        '     → Create a new key with the "Admin" role → download the .p8 file → update credentials.\n' +
        'Your current key can still be used for sales reports — this only affects analytics.'
      );
    }
    if (err.message.includes('409')) {
      exitError(
        'A report request already exists for this app.\n' +
        'Use "node asc-analytics.mjs list <appId>" to see existing requests.\n' +
        'You only need one ONGOING request per app — it generates all report types automatically.'
      );
    }
    throw err;
  }
  outputJson({
    ok: true,
    action: 'request',
    requestId: result.data?.id,
    accessType,
    message: 'Report request created. First reports will be available in 1-2 days.',
    data: result.data,
  });
}

async function doList(token) {
  const appId = getPositional(1);
  if (!appId) exitError('Usage: node asc-analytics.mjs list <appId>');

  const result = await apiRequest(token, 'GET',
    `/v1/apps/${appId}/analyticsReportRequests?fields[analyticsReportRequests]=accessType,stoppedDueToInactivity`
  );

  const requests = (result.data || []).map(r => ({
    id: r.id,
    accessType: r.attributes?.accessType,
    stoppedDueToInactivity: r.attributes?.stoppedDueToInactivity || false,
  }));

  outputJson({ ok: true, action: 'list', appId, count: requests.length, requests });
}

async function doReports(token) {
  const requestId = getPositional(1);
  if (!requestId) exitError('Usage: node asc-analytics.mjs reports <requestId> [--category APP_USAGE]');

  const category = getArg('category');
  let endpoint = `/v1/analyticsReportRequests/${requestId}/reports?fields[analyticsReports]=category,name`;
  if (category) {
    endpoint += `&filter[category]=${category.toUpperCase()}`;
  }

  const result = await apiRequest(token, 'GET', endpoint);

  const reports = (result.data || []).map(r => ({
    id: r.id,
    name: r.attributes?.name,
    category: r.attributes?.category,
  }));

  outputJson({ ok: true, action: 'reports', requestId, count: reports.length, reports });
}

async function doInstances(token) {
  const reportId = getPositional(1);
  if (!reportId) exitError('Usage: node asc-analytics.mjs instances <reportId>');

  const result = await apiRequest(token, 'GET',
    `/v1/analyticsReports/${reportId}/instances?fields[analyticsReportInstances]=granularity,processingDate`
  );

  const instances = (result.data || []).map(i => ({
    id: i.id,
    granularity: i.attributes?.granularity,
    processingDate: i.attributes?.processingDate,
  }));

  outputJson({ ok: true, action: 'instances', reportId, count: instances.length, instances });
}

async function doDownload(token) {
  const instanceId = getPositional(1);
  if (!instanceId) exitError('Usage: node asc-analytics.mjs download <instanceId>');

  const result = await apiRequest(token, 'GET',
    `/v1/analyticsReportInstances/${instanceId}/segments?fields[analyticsReportSegments]=url,checksum,sizeInBytes`
  );

  const segments = (result.data || []).map(s => ({
    id: s.id,
    url: s.attributes?.url,
    checksum: s.attributes?.checksum,
    sizeInBytes: s.attributes?.sizeInBytes,
  }));

  outputJson({
    ok: true,
    action: 'download',
    instanceId,
    count: segments.length,
    segments,
    hint: 'Download each segment URL to get a gzip-compressed TSV file with the report data.',
  });
}

main().catch(err => exitError(err.message));
