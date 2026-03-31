#!/usr/bin/env node
/**
 * Find reviews that need a developer response (or already have one).
 *
 * Usage:
 *   node asc-review-status.mjs <appId> [options]
 *
 * Options:
 *   --from <YYYY-MM-DD>   Start date (default: 30 days ago)
 *   --to <YYYY-MM-DD>     End date (default: today)
 *   --status <status>     Filter: unanswered | answered | all (default: unanswered)
 *   --rating <1-5>        Filter by star rating (e.g., --rating 1 for 1-star only)
 *   --territory <code>    Filter by territory (e.g., US, GB)
 *   --limit <n>           Max reviews per API page (default: 200)
 *   --config <path>       Custom credentials path
 *
 * Examples:
 *   # All unanswered reviews from the last 30 days
 *   node asc-review-status.mjs 1234567890
 *
 *   # Unanswered 1-star reviews from March 2026
 *   node asc-review-status.mjs 1234567890 --from 2026-03-01 --to 2026-03-31 --rating 1
 *
 *   # All reviews that HAVE a developer response
 *   node asc-review-status.mjs 1234567890 --status answered
 *
 *   # Everything in a date range
 *   node asc-review-status.mjs 1234567890 --status all --from 2026-01-01
 */

import {
  loadCredentials, getToken, apiRequest, formatDate,
  getArg, getPositional, outputJson, exitError,
} from './asc-common.mjs';

async function main() {
  const appId = getPositional(0);
  if (!appId) {
    exitError(
      'Missing app ID.\n' +
      'Usage: node asc-review-status.mjs <appId> [--from 2026-03-01] [--to 2026-03-31] [--status unanswered]\n' +
      'Get app IDs from: node asc-list-apps.mjs'
    );
  }

  const creds = loadCredentials();
  const token = getToken(creds);

  const status = (getArg('status') || 'unanswered').toLowerCase();
  if (!['unanswered', 'answered', 'all'].includes(status)) {
    exitError('--status must be one of: unanswered, answered, all');
  }

  const rating = getArg('rating');
  const territory = getArg('territory');
  const limit = getArg('limit') || '200';

  const now = new Date();
  const defaultFrom = new Date();
  defaultFrom.setDate(defaultFrom.getDate() - 30);

  const fromDate = getArg('from') || formatDate(defaultFrom);
  const toDate = getArg('to') || formatDate(now);

  const fromTs = new Date(fromDate + 'T00:00:00Z').getTime();
  const toTs = new Date(toDate + 'T23:59:59Z').getTime();

  const unanswered = [];
  const answered = [];
  let nextUrl = buildInitialUrl(appId, rating, territory, limit);
  let totalFetched = 0;
  let pagesScanned = 0;
  let stoppedEarly = false;

  while (nextUrl) {
    const result = await apiRequest(token, 'GET', nextUrl, null);
    pagesScanned++;

    // Build a map from reviewId → response object.
    // Apple's API quirk: review.relationships.response has `links` but NOT `data`,
    // so we can't go review→response. Instead, each response in `included` has
    // relationships.review.data.id pointing back to the review it belongs to.
    const responseByReviewId = buildResponseMap(result.included || []);

    for (const review of (result.data || [])) {
      const createdDate = review.attributes?.createdDate;
      if (!createdDate) continue;

      const reviewTs = new Date(createdDate).getTime();

      if (reviewTs < fromTs) {
        stoppedEarly = true;
        break;
      }
      if (reviewTs > toTs) continue;

      totalFetched++;

      const responseData = responseByReviewId[review.id] || null;

      const entry = {
        id: review.id,
        rating: review.attributes?.rating,
        title: review.attributes?.title,
        body: review.attributes?.body,
        reviewer: review.attributes?.reviewerNickname,
        territory: review.attributes?.territory,
        createdDate,
      };

      if (responseData) {
        entry.developerResponse = {
          id: responseData.id,
          responseBody: responseData.attributes?.responseBody,
          lastModifiedDate: responseData.attributes?.lastModifiedDate,
        };
        answered.push(entry);
      } else {
        unanswered.push(entry);
      }
    }

    if (stoppedEarly) break;

    nextUrl = result.links?.next || null;
  }

  let reviews;
  if (status === 'unanswered') reviews = unanswered;
  else if (status === 'answered') reviews = answered;
  else reviews = [...unanswered, ...answered].sort((a, b) =>
    new Date(b.createdDate) - new Date(a.createdDate)
  );

  const ratingBreakdown = {};
  for (const r of reviews) {
    const star = r.rating || 0;
    ratingBreakdown[`${star}star`] = (ratingBreakdown[`${star}star`] || 0) + 1;
  }

  outputJson({
    ok: true,
    appId,
    dateRange: { from: fromDate, to: toDate },
    filter: status,
    summary: {
      totalInRange: unanswered.length + answered.length,
      unanswered: unanswered.length,
      answered: answered.length,
      responseRate: (unanswered.length + answered.length) > 0
        ? `${Math.round((answered.length / (unanswered.length + answered.length)) * 100)}%`
        : 'N/A',
    },
    ratingBreakdown,
    count: reviews.length,
    reviews,
  });
}

function buildInitialUrl(appId, rating, territory, limit) {
  const params = new URLSearchParams();
  params.set('fields[customerReviews]', 'rating,title,body,reviewerNickname,createdDate,territory');
  params.set('fields[customerReviewResponses]', 'responseBody,lastModifiedDate');
  params.set('include', 'response');
  params.set('sort', '-createdDate');
  params.set('limit', limit);
  if (rating) params.set('filter[rating]', rating);
  if (territory) params.set('filter[territory]', territory);
  return `/v1/apps/${appId}/customerReviews?${params.toString()}`;
}

/**
 * Build a map: reviewId → response object.
 *
 * Each customerReviewResponse in `included` has:
 *   relationships.review.data.id  → the review it belongs to
 *
 * We key the map by that review ID so we can look up:
 *   "does this review have a response?"
 */
function buildResponseMap(included) {
  const map = {};
  for (const item of included) {
    if (item.type === 'customerReviewResponses') {
      const reviewId = item.relationships?.review?.data?.id;
      if (reviewId) {
        map[reviewId] = item;
      }
    }
  }
  return map;
}

main().catch(err => exitError(err.message));
