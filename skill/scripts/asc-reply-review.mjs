#!/usr/bin/env node
/**
 * Reply to a customer review on the App Store.
 *
 * Usage:
 *   node asc-reply-review.mjs <reviewId> <responseText>
 *   node asc-reply-review.mjs <reviewId> --delete
 *
 * Arguments:
 *   reviewId      — The customer review ID (get from asc-reviews.mjs)
 *   responseText  — The developer reply text
 *
 * Options:
 *   --delete       Delete an existing response instead of creating one
 *   --config       Custom credentials path
 *
 * IMPORTANT:
 *   - Each review can have at most ONE developer response
 *   - Posting a new response replaces any existing one
 *   - Responses may take up to 24 hours to appear on the App Store
 *   - ALWAYS get user approval before posting a response
 */

import {
  loadCredentials, getToken, apiRequest,
  getPositional, getFlag, outputJson, exitError,
} from './asc-common.mjs';

async function main() {
  const reviewId = getPositional(0);
  if (!reviewId) {
    exitError(
      'Missing review ID.\n' +
      'Usage: node asc-reply-review.mjs <reviewId> <responseText>\n' +
      '       node asc-reply-review.mjs <reviewId> --delete\n' +
      'Get review IDs from: node asc-reviews.mjs <appId>'
    );
  }

  const creds = loadCredentials();
  const token = getToken(creds);

  if (getFlag('delete')) {
    return await doDelete(token, reviewId);
  }

  const responseText = getPositional(1);
  if (!responseText) {
    exitError(
      'Missing response text.\n' +
      'Usage: node asc-reply-review.mjs <reviewId> "Your response here"'
    );
  }

  const body = {
    data: {
      type: 'customerReviewResponses',
      attributes: {
        responseBody: responseText,
      },
      relationships: {
        review: {
          data: { type: 'customerReviews', id: reviewId },
        },
      },
    },
  };

  const result = await apiRequest(token, 'POST', '/v1/customerReviewResponses', body);

  outputJson({
    ok: true,
    action: 'reply',
    reviewId,
    responseId: result.data?.id,
    responseBody: result.data?.attributes?.responseBody,
    message: 'Response submitted. It may take up to 24 hours to appear on the App Store.',
  });
}

async function doDelete(token, reviewId) {
  // First get the existing response for this review
  const review = await apiRequest(token, 'GET',
    `/v1/customerReviews/${reviewId}/response`
  );

  const responseId = review.data?.id;
  if (!responseId) {
    exitError('No existing response found for this review.');
  }

  await apiRequest(token, 'DELETE', `/v1/customerReviewResponses/${responseId}`, null);

  outputJson({
    ok: true,
    action: 'delete',
    reviewId,
    responseId,
    message: 'Developer response deleted.',
  });
}

main().catch(err => exitError(err.message));
