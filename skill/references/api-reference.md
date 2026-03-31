# App Store Connect API Reference

Base URL: `https://api.appstoreconnect.apple.com`

Authentication: ES256 JWT used directly as Bearer token. No token exchange.

Rate limit: 3,500 requests/hour per API key. Check `X-Rate-Limit` response header.

---

## Apps

### List Apps

```
GET /v1/apps
```

**Useful query parameters:**
- `fields[apps]` — comma-separated list of fields to return
- `limit` — max results (default 200)
- `sort` — e.g., `bundleId`, `name`

**Response attributes:**
- `name` — app name
- `bundleId` — bundle identifier (e.g., `com.example.myapp`)
- `sku` — app SKU
- `primaryLocale` — e.g., `en-US`

**Example:**
```
GET /v1/apps?fields[apps]=name,bundleId,sku,primaryLocale&limit=200
```

---

## Sales Reports

### Download Sales Report

```
GET /v1/salesReports
```

Returns **gzip-compressed TSV** data (not JSON).

**Filter parameters (all required):**

| Parameter | Values | Notes |
|-----------|--------|-------|
| `filter[reportType]` | `SALES`, `SUBSCRIPTION`, `SUBSCRIBER`, `PRE_ORDER` | Type of report |
| `filter[reportSubType]` | `SUMMARY`, `DETAILED`, `OPT_IN` | Level of detail |
| `filter[frequency]` | `DAILY`, `WEEKLY`, `MONTHLY`, `YEARLY` | Time granularity |
| `filter[vendorNumber]` | Your vendor number | From Sales and Trends |
| `filter[reportDate]` | `YYYY-MM-DD` | Date of report |

**Example:**
```
GET /v1/salesReports?filter[reportType]=SALES&filter[reportSubType]=SUMMARY&filter[frequency]=DAILY&filter[vendorNumber]=12345678&filter[reportDate]=2026-03-30
```

**TSV columns for SALES/SUMMARY:**
Provider, Provider Country, SKU, Developer, Title, Version, Product Type Identifier, Units, Developer Proceeds, Begin Date, End Date, Customer Currency, Country Code, Currency of Proceeds, Apple Identifier, Customer Price, Promo Code, Parent Identifier, Subscription, Period, Category, CMB, Device, Supported Platforms, Proceeds Reason, Preserved Pricing, Client, Order Type

**Product Type Identifiers:**
- `1` — Free or Paid App (iPhone)
- `1F` — Free App (Universal)
- `1T` — Paid App (Universal)
- `IA1` — In-App Purchase (Consumable)
- `IA9` — In-App Purchase (Non-Consumable)
- `1A` — Auto-Renewable Subscription

**Availability:** Reports are based on Pacific Time. Daily reports are typically available the next day.

---

## Finance Reports

### Download Finance Report

```
GET /v1/financeReports
```

Returns **gzip-compressed TSV** data.

**Filter parameters:**

| Parameter | Values |
|-----------|--------|
| `filter[regionCode]` | e.g., `US`, `EU`, `JP`, `ZZ` (all regions) |
| `filter[reportDate]` | `YYYY-MM` (monthly) |
| `filter[reportType]` | `FINANCIAL` |
| `filter[vendorNumber]` | Your vendor number |

---

## Customer Reviews

### List Reviews for an App

```
GET /v1/apps/{appId}/customerReviews
```

**Query parameters:**
- `fields[customerReviews]` — `rating,title,body,reviewerNickname,createdDate,territory`
- `filter[rating]` — `1`, `2`, `3`, `4`, `5`
- `filter[territory]` — ISO country code (e.g., `US`, `GB`)
- `sort` — `createdDate`, `-createdDate`, `rating`, `-rating`
- `limit` — max 200

**Response attributes:**
```json
{
  "id": "review-id-string",
  "type": "customerReviews",
  "attributes": {
    "rating": 4,
    "title": "Great but could improve",
    "body": "Love the app but wish it had dark mode.",
    "reviewerNickname": "AppFan42",
    "createdDate": "2026-03-28T14:22:00Z",
    "territory": "USA"
  }
}
```

### List Reviews for a Specific Version

```
GET /v1/appStoreVersions/{versionId}/customerReviews
```

Same query parameters as above.

### Read a Single Review

```
GET /v1/customerReviews/{reviewId}
```

---

## Customer Review Responses

### Create / Replace a Response

```
POST /v1/customerReviewResponses
```

**Request body:**
```json
{
  "data": {
    "type": "customerReviewResponses",
    "attributes": {
      "responseBody": "Thank you for the feedback! Dark mode is coming in our next update."
    },
    "relationships": {
      "review": {
        "data": {
          "type": "customerReviews",
          "id": "review-id-string"
        }
      }
    }
  }
}
```

Each review can have **at most one** developer response. Posting again replaces it.

### Delete a Response

```
DELETE /v1/customerReviewResponses/{responseId}
```

### Get Existing Response for a Review

```
GET /v1/customerReviews/{reviewId}/response
```

---

## App Store Versions

### List Versions

```
GET /v1/apps/{appId}/appStoreVersions
```

**Query parameters:**
- `fields[appStoreVersions]` — `versionString,appStoreState,releaseType,createdDate,platform`
- `filter[appStoreState]` — e.g., `READY_FOR_SALE`, `WAITING_FOR_REVIEW`, `IN_REVIEW`
- `filter[platform]` — `IOS`, `MAC_OS`, `TV_OS`, `VISION_OS`
- `sort` — `createdDate`, `-createdDate`
- `limit` — max results

**App Store States:**
- `PREPARE_FOR_SUBMISSION` — not yet submitted
- `WAITING_FOR_REVIEW` — submitted, in queue
- `IN_REVIEW` — currently being reviewed
- `PENDING_DEVELOPER_RELEASE` — approved, waiting for developer to release
- `PROCESSING_FOR_APP_STORE` — being processed
- `READY_FOR_SALE` — live on the App Store
- `DEVELOPER_REJECTED` — developer pulled it back
- `REJECTED` — rejected by App Review
- `DEVELOPER_REMOVED_FROM_SALE` — developer removed it

---

## Analytics Report Requests

The analytics workflow is a multi-step chain:

```
Request → Reports → Instances → Segments → Download URLs
```

### 1. Create a Report Request

```
POST /v1/analyticsReportRequests
```

**Required role: Admin.** Sales and Reports role CANNOT create requests (returns 403). Only Admin can POST here.

**Request body:**
```json
{
  "data": {
    "type": "analyticsReportRequests",
    "attributes": {
      "accessType": "ONGOING"
    },
    "relationships": {
      "app": {
        "data": {
          "type": "apps",
          "id": "app-id-string"
        }
      }
    }
  }
}
```

`accessType`:
- `ONGOING` — generates daily/weekly/monthly reports automatically
- `ONE_TIME_SNAPSHOT` — historical data, no updates after creation

**IMPORTANT:** First request takes 1-2 days. If reports go unused for a long time, `stoppedDueToInactivity` becomes true and you need a new request.

### 2. List Report Requests for an App

```
GET /v1/apps/{appId}/analyticsReportRequests
```

### 3. List Reports for a Request

```
GET /v1/analyticsReportRequests/{requestId}/reports
```

**Filter by category:**
- `filter[category]` — `APP_STORE_ENGAGEMENT`, `APP_STORE_COMMERCE`, `APP_USAGE`, `FRAMEWORK_USAGE`, `PERFORMANCE`

**Response attributes:**
- `name` — report name (e.g., "App Crashes", "App Downloads", "App Sessions")
- `category` — which of the five categories

### 4. List Report Instances

```
GET /v1/analyticsReports/{reportId}/instances
```

Each instance is a snapshot for a specific date and granularity (daily, weekly, monthly).

**Response attributes:**
- `granularity` — `DAILY`, `WEEKLY`, `MONTHLY`
- `processingDate` — the date this instance covers

### 5. Get Download URLs (Segments)

```
GET /v1/analyticsReportInstances/{instanceId}/segments
```

**Response attributes:**
- `url` — direct download URL for the segment (gzip-compressed TSV)
- `checksum` — MD5 checksum for verification
- `sizeInBytes` — file size

Download the URL to get a `.gz` file containing TSV data with the report metrics.

### Report Categories and Example Reports

**APP_STORE_ENGAGEMENT:**
- App Store Impressions
- App Store Page Views
- App Store Impressions Unique Devices

**APP_STORE_COMMERCE:**
- App Downloads
- App Pre-Orders
- App Updates
- In-App Purchases
- Paying Users

**APP_USAGE:**
- App Sessions
- App Installations
- App Crashes
- Active Devices

**PERFORMANCE:**
- Disk Writes
- Hang Rate
- Launch Time
- Memory Usage
- Scrolling

**FRAMEWORK_USAGE:**
- Various framework-specific usage metrics

---

## Pagination

All list endpoints return paginated responses:
- Results include a `links` object with `next` URL if more pages exist
- Default page size varies by endpoint (typically 20-200)
- Use `limit` parameter to control page size
- Follow `links.next` URL to get subsequent pages

---

## Common Error Responses

```json
{
  "errors": [
    {
      "id": "unique-error-id",
      "status": "401",
      "code": "NOT_AUTHORIZED",
      "title": "Authentication credentials are missing or invalid.",
      "detail": "Provide a properly configured and signed bearer token..."
    }
  ]
}
```

| Status | Code | Meaning |
|--------|------|---------|
| 400 | `PARAMETER_ERROR` | Invalid query parameter or request body |
| 401 | `NOT_AUTHORIZED` | Invalid/expired JWT |
| 403 | `FORBIDDEN` | API key lacks required role |
| 404 | `NOT_FOUND` | Resource doesn't exist |
| 409 | `CONFLICT` | Duplicate resource (e.g., duplicate report request) |
| 429 | `RATE_LIMIT_EXCEEDED` | Over 3,500 requests/hour |
