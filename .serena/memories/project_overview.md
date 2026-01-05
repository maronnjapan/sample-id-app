# Project Overview: sample-id-app

## Purpose
Auth0 → AWS EventBridge → SQS → Lambda integration for user event processing.
Includes a Cloudflare Workers demo app (resource-app) with Auth0 authentication.

## Tech Stack
- **Infrastructure as Code**: Terraform (Auth0 + AWS providers)
- **Tool Management**: mise
- **Frontend/Backend**: Cloudflare Workers, Vike (React SSR), Hono, Drizzle ORM, ts-rest
- **Language**: TypeScript
- **Auth**: Auth0 with Auth.js integration

## Directory Structure
- `auth0/` - Terraform for Auth0 Event Stream configuration
- `aws/` - Terraform for EventBridge, SQS, Lambda, CloudWatch resources
- `resource-app/` - Cloudflare Workers application (Vike + Hono + Drizzle)
- `docs/` - Documentation images

## Architecture
```
Auth0 Event Stream → AWS EventBridge → SQS → Lambda → External APIs
                                          ↓ (3 failures)
                                        DLQ (manual reprocessing)
```
