# Repository Guidelines

## Project Structure & Module Organization
Source lives in `src/`, with `index.tsx` hosting the Hono Worker entrypoint, `renderer.tsx` defining the server-side rendering helper, `client.ts` handling front-end interactivity, and `style.css` providing the shared styles. Static assets belong in `public/` so Vite can serve them directly; generated bundles land in `dist/` after a build. Deployment-specific metadata (Wrangler bindings, Vite config, tsconfig) stays in the workspace root—extend these files instead of scattering inline configs throughout modules.

## Build, Test, and Development Commands
* `npm install` — install Worker, Vite, and Wrangler dependencies.
* `npm run dev` — start the Vite dev server plus Wrangler Worker preview; ideal for iterative UI work.
* `npm run build` — create the production bundle used for previews and deployments.
* `npm run preview` — run the optimized bundle locally to verify Cloudflare-compatible output.
* `npm run deploy` — build and push to Cloudflare via Wrangler; confirm environment variables first.
* `npm run cf-typegen` — regenerate `CloudflareBindings` so TypeScript understands runtime bindings before editing handlers.

## Coding Style & Naming Conventions
Use TypeScript with ECMAScript modules and JSX; favor functional components and explicit `export default` only for Worker entrypoints. Stick to 2-space indentation, single quotes in TSX, and kebab-case for CSS class names (`.chat-panel`). Co-locate UI state helpers next to their renderer when the logic is single-purpose; otherwise create a descriptive module under `src/` (e.g., `src/hooks/use-consent.ts`). Avoid ambient globals—inject bindings through Hono’s context typing or props.

## Testing Guidelines
No automated tests ship yet, so add Vitest (works seamlessly with Vite) before landing behavior-heavy changes. Place suites under `src/__tests__/` or alongside modules using the `*.test.ts` suffix. Mock Hono’s `Context` to exercise handlers without making requests, and stub DOM APIs through `@vitest/browser` when verifying client behaviors. Target repeatable coverage on consent-stage flows (form submission, fatigue indicator math) before shipping features that alter user interaction.

## Commit & Pull Request Guidelines
History is new, so follow a concise, imperative style such as `feat: add consent fatigue indicator` or `fix: sanitize command input`. Reference linked issues in the body and describe user-visible changes plus verification steps. Pull requests should include: purpose summary, screenshots or GIFs for UI mutations, testing notes (`npm run preview`, Vitest results), and any deployment considerations (new bindings, secrets). Keep diffs focused; open follow-up PRs for unrelated refactors.
