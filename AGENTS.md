# Repository Guidelines

## Project Structure & Module Organization
Two Cloudflare Worker payment demos sit in `payment-app-by-factors-api/` and `payment-app-by-oidc/`. Each Worker follows the same layout: `src/index.ts` configures Hono, `src/routes/` exposes HTTP handlers, `src/services/` wraps Okta/FAPI calls, `src/utils/` stores helpers, and `src/views/` renders the payment UI. Reference flows and decision docs live in `docs/`. Provisioning code for Okta (apps, policies, demo users) sits in `terraform/` with accompanying state and variable files.

## Build, Test, and Development Commands
- `cd payment-app-by-factors-api && npm install && npm run dev` (swap the folder for OIDC) runs Wrangler locally with hot reload.
- `npm run typecheck` inside either Worker invokes strict `tsc --noEmit` to catch regressions.
- `npm run deploy` publishes to Cloudflare; confirm secrets with `wrangler secret list` before deploying.
- `cd terraform && terraform init && terraform plan` validates IaC changes; follow with `terraform apply` only after reviewing the plan output.

## Coding Style & Naming Conventions
Stick to TypeScript, ES2022 modules, and the strict compiler flags defined in `tsconfig.json`. Use 2-space indentation, camelCase for variables, and PascalCase for exported types/services. Keep functions pure inside `routes/`, push side effects into `services/`, and reuse view helpers instead of embedding HTML strings in handlers. Run your formatter (Prettier or VS Code defaults) before opening a PR.

## Testing Guidelines
Automated tests are not yet configured, so rely on `npm run typecheck`, manual scenario walks via `wrangler dev`, and Okta sandbox accounts. When you introduce a test runner, colocate specs as `*.test.ts` beside the feature (e.g., `src/routes/payment.test.ts`) and mock Okta endpoints or drive flows through Miniflare to avoid real traffic. Document any new scripts in `package.json` so other agents can reproduce them.

## Commit & Pull Request Guidelines
Recent history favors short, imperative subjects (“Add payment UI with form and status display”, “Fix polling to execute immediately on start”). Follow that pattern, limit subjects to ~72 characters, and describe Terraform or secret-handling changes in the body. Pull requests should summarize scope, list verification commands, link related docs or issues, and attach screenshots/GIFs when UI markup in `src/views/` changes.

## Security & Configuration Tips
Never hard-code Okta domains, client IDs, or secrets. Configure Workers with `wrangler secret put OKTA_CLIENT_ID` / `OKTA_CLIENT_SECRET` and keep Terraform credentials only in `terraform.tfvars` (do not commit overrides). Rotate API tokens before demos, clear KV namespaces when seeding fake transactions, and double-check that `wrangler.toml` contains only non-sensitive defaults before pushing.
