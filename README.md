# Apple Eater — App Store Connect Intelligence

An AI agent skill that connects to the **App Store Connect API** to monitor app performance, download sales data, read customer reviews, and — uniquely — **reply to reviews** on your behalf.

Built for the [Claw HQ](https://openclawhq.app) platform. Works with any OpenClaw-compatible agent.

## What It Does

| Capability | Description |
|-----------|-------------|
| **Sales Reports** | Daily, weekly, monthly sales and subscription data |
| **Customer Reviews** | Read reviews filtered by rating, territory, date |
| **Review Responses** | Draft and post developer replies to reviews |
| **Analytics Reports** | Engagement, commerce, usage, performance, frameworks |
| **Version Tracking** | App Store version states, release history |
| **App Listing** | All apps on the account with IDs and metadata |

## Installation

### Prerequisites

- Node.js 18+
- An App Store Connect API key (see setup below)

### Install via Claw HQ

```bash
# From the Claw HQ platform, install through the Skills marketplace
# or use the CLI:
codex skills:install apple-eater
```

### Manual Installation

Clone into your agent's skills directory:

```bash
git clone https://github.com/RajatVaghani/apple-eater-skill.git apple-eater
```

## First-Time Setup

### 1. Create an API Key

1. Go to [App Store Connect](https://appstoreconnect.apple.com) → Users and Access → Integrations → App Store Connect API
2. Click "+" to generate a new key
3. Choose role: **Admin** (full access) or **Sales and Reports** (read-only data)
4. Download the `.p8` private key file (one-time download — save it!)
5. Note the **Key ID** and **Issuer ID**

### 2. Save Credentials

Create `/data/.openclaw/shared-files/apple-eater/credentials.md`:

```markdown
# App Store Connect API Credentials

- Issuer ID: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
- Key ID: XXXXXXXXXX
- P8 Path: /data/.openclaw/shared-files/apple-eater/AuthKey_XXXXXXXXXX.p8
- Vendor Number: 12345678
```

Copy your `.p8` file to the path specified above.

### 3. Verify

```bash
node skill/scripts/asc-setup-check.mjs
```

## How Authentication Works

App Store Connect uses **ES256 JWT** tokens:

1. Build a JWT signed with your `.p8` key (ES256 algorithm)
2. Use the JWT directly as `Authorization: Bearer <jwt>`
3. No token exchange step — simpler than Apple Search Ads

Tokens are valid for up to 20 minutes. Scripts auto-generate fresh tokens.

## Bundled Scripts

| Script | Purpose | Example |
|--------|---------|---------|
| `asc-setup-check.mjs` | Verify credentials & API access | `node scripts/asc-setup-check.mjs` |
| `asc-list-apps.mjs` | List all apps | `node scripts/asc-list-apps.mjs` |
| `asc-sales-report.mjs` | Sales & subscription reports | `node scripts/asc-sales-report.mjs --vendor 12345` |
| `asc-reviews.mjs` | Read customer reviews | `node scripts/asc-reviews.mjs <appId> --rating 1` |
| `asc-reply-review.mjs` | Reply to a review | `node scripts/asc-reply-review.mjs <reviewId> "text"` |
| `asc-app-versions.mjs` | Version history | `node scripts/asc-app-versions.mjs <appId>` |
| `asc-analytics.mjs` | Analytics report workflow | `node scripts/asc-analytics.mjs request <appId>` |

All scripts output structured JSON and accept `--config <path>` for custom credential locations.

## Repository Structure

```
apple-eater/
├── README.md                          # This file
└── skill/
    ├── SKILL.md                       # Agent-facing skill documentation
    ├── scripts/
    │   ├── asc-common.mjs             # Shared: credentials, JWT, API helpers
    │   ├── asc-setup-check.mjs        # Verify setup
    │   ├── asc-list-apps.mjs          # List apps
    │   ├── asc-sales-report.mjs       # Sales reports
    │   ├── asc-analytics.mjs          # Analytics reports (multi-step)
    │   ├── asc-reviews.mjs            # Customer reviews
    │   ├── asc-reply-review.mjs       # Reply to reviews
    │   └── asc-app-versions.mjs       # Version history
    └── references/
        └── api-reference.md           # App Store Connect API endpoint docs
```

## Example Agent Prompts

- "How did my app do yesterday?"
- "Show me the latest 1-star reviews"
- "Draft a reply to this negative review"
- "Compare this month's downloads to last month"
- "Which countries generate the most revenue?"
- "Is my latest version live on the App Store?"
- "Set up analytics reporting for my app"
- "What's the subscription churn rate?"

## Security

- Private keys (`.p8` files) are never exposed in chat or logs
- JWT tokens expire in 20 minutes
- Review responses require explicit user approval before posting
- No data is stored outside your environment

---

Built by [Claw HQ](https://openclawhq.app) — the managed AI agent platform for app developers.
