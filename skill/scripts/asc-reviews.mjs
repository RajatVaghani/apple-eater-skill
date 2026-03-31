#!/usr/bin/env node
/**
 * List customer reviews for an app from App Store Connect.
 *
 * Usage:
 *   node asc-reviews.mjs <appId> [options]
 *
 * Options:
 *   --rating <1-5>       Filter by star rating
 *   --territory <code>   Filter by territory (e.g., US, GB, JP)
 *   --sort <field>       Sort by: createdDate | -createdDate | rating | -rating (default: -createdDate)
 *   --limit <n>          Max reviews to return (default: 50, max: 200)
 *   --config <path>      Custom credentials path
 *
 * Returns review text, rating, reviewer nickname, territory, and date.
 * Also includes the review ID which is needed for asc-reply-review.mjs.
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
      'Usage: node asc-reviews.mjs <appId> [--rating 1] [--territory US] [--sort -createdDate] [--limit 50]\n' +
      'Get app IDs from: node asc-list-apps.mjs'
    );
  }

  const creds = loadCredentials();
  const token = getToken(creds);

  const rating = getArg('rating');
  const territory = getArg('territory');
  const sort = getArg('sort') || '-createdDate';
  const limit = getArg('limit') || '50';

  const params = new URLSearchParams();
  params.set('fields[customerReviews]', 'rating,title,body,reviewerNickname,createdDate,territory');
  params.set('sort', sort);
  params.set('limit', limit);
  if (rating) params.set('filter[rating]', rating);
  if (territory) params.set('filter[territory]', territory);

  const endpoint = `/v1/apps/${appId}/customerReviews?${params.toString()}`;
  const result = await apiRequest(token, 'GET', endpoint);

  const reviews = (result.data || []).map(r => ({
    id: r.id,
    rating: r.attributes?.rating,
    title: r.attributes?.title,
    body: r.attributes?.body,
    reviewer: r.attributes?.reviewerNickname,
    territory: r.attributes?.territory,
    createdDate: r.attributes?.createdDate,
  }));

  const ratingBreakdown = {};
  for (const r of reviews) {
    const star = r.rating || 0;
    ratingBreakdown[`${star}star`] = (ratingBreakdown[`${star}star`] || 0) + 1;
  }

  outputJson({
    ok: true,
    appId,
    count: reviews.length,
    ratingBreakdown,
    reviews,
  });
}

main().catch(err => exitError(err.message));
