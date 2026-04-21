# AGENTS.md

## Purpose
This repository is a LAN-hosted Sonar operations dashboard built with Node.js, Express, and a vanilla HTML/CSS/JS frontend. Agents should preserve the app's operational simplicity: small server, static frontend, minimal dependencies, and safe handling of local configuration/state files.

## Repo Shape
- `server.js`: Express bootstrap, static file hosting, `/health`, and API route mounting.
- `src/routes/`: Backend route handlers for dashboard data and suppression CRUD.
- `src/services/`: Sonar data access and JSON-backed suppression persistence.
- `src/sonar/`: Shared GraphQL query builders and Sonar query definitions.
- `src/utils/`: Environment parsing, LAN IP detection, and normalization helpers.
- `public/`: Static frontend pages and page-specific browser scripts.
- `data/`: Live suppression JSON files plus example seed files.

## Stack And Conventions
- Runtime: Node.js, CommonJS modules.
- Server: Express.
- Frontend: Vanilla JavaScript with static HTML pages and one script per page/view.
- Data source: Sonar GraphQL API, with server-side caching.
- Style: Favor straightforward functions, clear names, and low-complexity changes over abstraction-heavy refactors.
- Comments: The existing code uses explanatory comments generously. Match that style when adding logic that is not immediately obvious.

## Local Commands
- Install dependencies: `npm install`
- Start app: `npm start`
- Run browser tests: `npm run test:e2e`
- Run browser tests headed: `npm run test:e2e:headed`
- Open the Playwright report: `npm run test:e2e:report`

Playwright browser tests are available and should be preferred for UI verification when touching page behavior.

## Environment And Runtime Assumptions
- Copy `.env.example` to `.env` and fill in Sonar-specific credentials and IDs before running the app.
- The server defaults to `PORT=3000` and binds to `0.0.0.0` for LAN access.
- `CACHE_TTL_MS` controls in-memory API cache duration.
- Do not commit real Sonar credentials or edited secrets from `.env`.

## Data Safety Rules
- Treat `data/suppressions.json` and `data/infrastructure-suppressions.json` as live local state, not fixtures.
- Preserve existing suppression data unless the task explicitly requires changing it.
- If a task needs sample data changes, prefer editing the `*.example.json` files or documenting the expected shape instead of overwriting live suppression files.

## Change Guidance
- Keep backend changes aligned with the current architecture: route handlers in `src/routes`, Sonar fetch/transform logic in `src/services`, query construction in `src/sonar`, shared helpers in `src/utils`.
- Keep frontend changes page-oriented. Reuse shared CSS and simple DOM helpers instead of introducing frameworks or bundling.
- Treat infrastructure status flows as a coordinated set across the overview and detail pages: `good`, `warning`, `unmonitored`, `down`, and `suppressed`.
- Avoid adding heavy dependencies unless they clearly reduce maintenance cost.
- Preserve API response shapes unless the task explicitly includes coordinated frontend and backend updates.
- Be careful with cache-related changes. If suppression behavior or summary calculations change, verify whether the relevant cache invalidation helpers also need updates.

## Verification Expectations
- At minimum, run the most relevant local verification available after changes.
- Browser/UI changes should normally be verified with `npm run test:e2e` when the affected flows are covered.
- Additional verification may still include:
  - starting the server with `npm start`
  - checking for startup errors
  - verifying touched routes/pages manually when feasible
- If you add tests or scripts, run them and record the result in your handoff.
- If you cannot fully verify because Sonar credentials or network access are unavailable, say so clearly and describe what was and was not validated.

## Editing Boundaries
- Prefer targeted edits over broad rewrites.
- Do not rename files, move modules, or reorganize the project structure unless the task calls for it.
- Do not replace the vanilla frontend with a framework as part of an unrelated task.
- Do not change `.env`, live suppression JSON data, or branding assets unless the user explicitly asks.

## Coordination Notes For Future Agents
- Read `README.md` first for setup and domain context.
- Check `package.json` before assuming available scripts.
- If you touch user-visible metrics or status buckets, verify both customer and infrastructure views because they are closely related.
- If you add operational steps, new env vars, or scripts, update both `README.md` and this file in the same change.

## Default Handoff Checklist
- Summarize the user-facing behavior change.
- List any files that require follow-up configuration.
- Mention the exact verification performed.
- Call out any assumptions, especially when Sonar API access was not available locally.
