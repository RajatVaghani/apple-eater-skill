#!/usr/bin/env node
/**
 * Download sales and trends reports from App Store Connect.
 *
 * Usage:
 *   node asc-sales-report.mjs --vendor <vendorNumber> [options]
 *
 * Options:
 *   --vendor <number>     Vendor number (REQUIRED — find in Sales and Trends or credentials file)
 *   --type <type>         Report type: SALES | SUBSCRIPTION | SUBSCRIBER | PRE_ORDER (default: SALES)
 *   --sub-type <subtype>  Report sub-type: SUMMARY | DETAILED | OPT_IN (default: SUMMARY)
 *   --frequency <freq>    DAILY | WEEKLY | MONTHLY | YEARLY (default: DAILY)
 *   --date <YYYY-MM-DD>   Report date (default: yesterday)
 *   --config <path>       Custom credentials path
 *
 * NOTE: The /v1/salesReports endpoint returns gzip-compressed TSV data.
 * This script decompresses it and outputs as JSON rows.
 */

import {
  loadCredentials, getToken, apiRequestRaw, formatDate,
  getArg, outputJson, exitError,
} from './asc-common.mjs';
import zlib from 'zlib';

async function main() {
  const creds = loadCredentials();
  const token = getToken(creds);

  const vendorNumber = getArg('vendor') || creds.vendorNumber;
  if (!vendorNumber) {
    exitError(
      'Vendor number is required.\n' +
      'Pass --vendor <number> or include "Vendor Number: XXXXX" in your credentials file.\n' +
      'Find it in App Store Connect → Sales and Trends → top-right dropdown.'
    );
  }

  const reportType = (getArg('type') || 'SALES').toUpperCase();
  const reportSubType = (getArg('sub-type') || 'SUMMARY').toUpperCase();
  const frequency = (getArg('frequency') || 'DAILY').toUpperCase();

  let reportDate = getArg('date');
  if (!reportDate) {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    reportDate = formatDate(yesterday);
  }

  const params = new URLSearchParams();
  params.set('filter[reportType]', reportType);
  params.set('filter[reportSubType]', reportSubType);
  params.set('filter[frequency]', frequency);
  params.set('filter[vendorNumber]', vendorNumber);
  params.set('filter[reportDate]', reportDate);

  const endpoint = `/v1/salesReports?${params.toString()}`;

  try {
    const rawBuf = await apiRequestRaw(token, 'GET', endpoint);

    let tsvText;
    try {
      tsvText = zlib.gunzipSync(rawBuf).toString('utf-8');
    } catch {
      tsvText = rawBuf.toString('utf-8');
    }

    const lines = tsvText.split('\n').filter(l => l.trim());
    if (lines.length === 0) {
      outputJson({ ok: true, reportType, reportSubType, frequency, reportDate, rows: [], message: 'No data returned' });
      return;
    }

    const headers = lines[0].split('\t');
    const rows = lines.slice(1).map(line => {
      const values = line.split('\t');
      const row = {};
      headers.forEach((h, i) => { row[h.trim()] = values[i]?.trim() || ''; });
      return row;
    });

    outputJson({
      ok: true,
      reportType,
      reportSubType,
      frequency,
      reportDate,
      rowCount: rows.length,
      rows,
    });
  } catch (err) {
    if (err.message.includes('404')) {
      exitError(
        `No report available for ${reportDate} (${reportType}/${reportSubType}/${frequency}).\n` +
        'Sales reports are typically available the next day (Pacific Time).\n' +
        'Try an earlier date, or check that your vendor number is correct.'
      );
    }
    throw err;
  }
}

main().catch(err => exitError(err.message));
