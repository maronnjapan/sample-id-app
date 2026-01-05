# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Auth0 → AWS EventBridge → SQS → Lambda integration for processing user events. The system streams Auth0 events (e.g., user.updated) to AWS EventBridge, queues them in SQS, and processes them via Lambda to call external APIs.

Includes a demo Cloudflare Workers application (`resource-app/`) with Auth0 authentication.

## Architecture

```
Auth0 Event Stream → AWS EventBridge → SQS (main queue) → Lambda → External APIs
                                              ↓ (after 3 failures)
                                       SQS (DLQ) → manual reprocessing
```

## Development Commands

### Initial Setup
```bash
mise run setup    # Install tools (Terraform, AWS CLI, Wrangler, Auth0 CLI) and configure providers
```

### Auth0 Terraform (`auth0/`)
```bash
cd auth0
terraform init && terraform apply
```

### AWS Terraform (`aws/`)
```bash
cd aws
bash update-eventbus.sh           # Link Auth0 event source to EventBridge
terraform init && terraform apply
```

### Cloudflare Workers App (`resource-app/`)
```bash
cd resource-app
pnpm install
pnpm run dev              # Development server
pnpm run build            # Build for production
pnpm run deploy           # Build and deploy to Cloudflare Workers
pnpm run drizzle:generate # Generate Drizzle migrations
pnpm run drizzle:migrate  # Apply migrations to local D1
bash setup-deploy.sh      # Full setup and deploy (creates D1, Auth0 app, deploys)
```

## Tech Stack

- **Infrastructure**: Terraform with Auth0 and AWS providers
- **Tool Management**: mise (see `.mise.toml` for versions)
- **resource-app**: Cloudflare Workers, Vike (React SSR), Hono, Drizzle ORM, ts-rest, Auth.js

## AWS Component Configuration

| Component | Key Settings |
|-----------|-------------|
| SQS Main Queue | visibility_timeout=90s, retention=4d, maxReceiveCount=3 |
| SQS DLQ | retention=14d |
| Lambda | timeout=15s, memory=128MB, runtime=nodejs20.x |
| EventBridge | Captures `aws.partner/auth0.com/*` events |

## Lambda Implementation Notes

- Success: normal return (message auto-deleted from SQS)
- Failure: throw exception (SQS redelivers after 90s, max 3 retries before DLQ)
- External API timeout: 10s
