# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Core Development
- `npm run dev` - Start development server with Turbopack
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint checks

### Database Operations
- `npm run prisma:push` - Push Prisma schema to database
- `npm run db:migrate` - Run Prisma migrations
- `npm run db:seed` - Seed database with initial data

### Path Generation
- `npm run dev:path` - Generate type-safe path definitions with pathpida

### Infrastructure
- `docker-compose up -d` - Start Keycloak and PostgreSQL services
- `docker-compose down` - Stop services

## Architecture Overview

### Authentication Flow
This application implements a Keycloak-based authentication system with OAuth 2.0 Token Exchange:

1. **NextAuth.js Integration** (`src/auth.ts`): Configured with Keycloak provider, stores access tokens in session
2. **Middleware Protection** (`src/middleware.ts`): Protects routes using NextAuth middleware
3. **Server Actions** (`src/app/actions.ts`): Handles login/logout operations

### Token Exchange Implementation
The core feature is RFC 8693 OAuth Token Exchange:

1. **API Endpoint** (`src/app/api/token-exchange/route.ts`): Implements token exchange with Keycloak
2. **Client Component** (`src/components/TokenExchangeClient.tsx`): Interactive UI for token exchange demo
3. **JWT Utilities** (`src/lib/token-utils.ts`): Client-side JWT decoding and clipboard utilities

### Key Data Flow
- User authenticates via Keycloak → Access token stored in NextAuth session
- Token Exchange UI reads session token → Displays original token details
- User selects scope/audience → API calls Keycloak token exchange endpoint
- New token returned → Displayed with decoded payload comparison

## Environment Configuration

Required environment variables:
```
KEYCLOAK_CLIENT_ID=your-client-id
KEYCLOAK_CLIENT_SECRET=your-client-secret  
KEYCLOAK_URL=http://localhost:8080/realms/your-realm
NEXTAUTH_SECRET=your-nextauth-secret
NEXTAUTH_URL=http://localhost:3000
```

## Technology Stack Integration

### NextAuth.js v5 Beta
- Uses session callbacks to inject access tokens
- JWT callback handles token refresh from account object
- Custom Keycloak provider configuration with specific scope/token endpoints

### Keycloak Integration
- Token exchange requires specific Keycloak realm configuration
- Uses Basic Auth with client credentials for token exchange requests
- Supports scope downgrading and audience restriction

### Type Safety
- pathpida generates type-safe route definitions in `src/lib/$path.ts`
- Custom TypeScript interfaces for JWT payload structure
- Proper typing for NextAuth session extensions

## Development Notes

### Token Exchange Specifics
- Audience parameter may interfere with scope downgrading
- Token exchange follows RFC 8693 specification exactly
- Error handling includes both HTTP status and Keycloak error details

### Session Management
- Access tokens stored in NextAuth session (security consideration for production)
- Session provider wraps entire application in layout
- Middleware handles route protection automatically

### UI Components
- Japanese language interface for demo purposes
- Clipboard functionality with fallback for non-secure contexts
- Real-time JWT payload decoding and comparison views

## Code Style Guidelines
- コメントを記載する時は必ず`/** */`を使用すること
- 仕様についてコメントを残す時は参考となるドキュメントのURLを記載すること