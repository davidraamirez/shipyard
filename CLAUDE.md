# CLAUDE.md

Shipyard is a self-hosted deployment platform: users register Git repositories as projects and trigger deployments that are cloned, built in isolation, and (eventually) deployed to Kubernetes.

## Architecture

```
web (Next.js :3000) ──HTTP/JWT──> api (NestJS :3001) ──BullMQ "deployments"──> Redis
                                     │                                          │
                                     └──────── PostgreSQL (Prisma) <──────── worker
                                                                                │ HTTP + Bearer token
                                                                                v
                                                                   build-runner (:8080)
                                                                                │ (planned) docker run
                                                                                v
                                                                   shipyard-build-node:22
```

Deployment lifecycle: `POST /deployments` creates a `Deployment` (QUEUED) and enqueues a job (3 attempts, exponential backoff) → worker sets BUILDING, shallow-clones into `/app/workspaces/<deploymentId>`, detects the project type, requests a build from the build-runner, sets RUNNING, or FAILED after the last attempt. Every step is written to `DeploymentLog`.

**Current state:** the build-runner's `POST /build` returns 501 (not implemented), so every deployment currently ends FAILED. `apps/worker/src/build-container.ts` (an isolated `docker run`) is implemented and tested, but nothing calls it yet. The web app has no Deploy button or logs view yet. See the roadmap in `C:\Users\ramir\.claude\plans\vamos-a-planificar-la-cryptic-owl.md` if present.

## Repository map

| Path | Package | Responsibility |
|---|---|---|
| `apps/api` | `@shipyard/api` | NestJS REST API: `auth/` (register/login, JWT 15m, `JwtAuthGuard`), `projects/` (CRUD scoped to the owner), `deployments/` (enqueue, retry, list, logs), `prisma/` (`PrismaService`). |
| `apps/worker` | `@shipyard/worker` | BullMQ consumer. `deployment.processor.ts` orchestrates; `git.ts` clones; `project-detector.ts` detects Node + package manager; `build.ts`/`build-strategy.ts` build commands; `build-runner-client.ts` calls the runner. |
| `apps/build-runner` | `@shipyard/build-runner` | Minimal `node:http` server. `GET /health`, `POST /build` (token auth, body limit, strict command allowlist in `build-request.ts`, workspace checks). |
| `apps/worker/build-image` | — | Image `shipyard-build-node:22` used for sandboxed builds. |
| `apps/web` | `@shipyard/web` | Next.js 16 + React 19 + Tailwind 4 client pages: login, projects list/new/detail. API calls through `src/lib/api.ts`. |
| `packages/database` | `@shipyard/database` | Prisma 7 schema + migrations; exports the generated client and `createPrismaAdapter()`. |
| `packages/types` | `@shipyard/types` | Shared types (currently unused). |

## Commands

```bash
pnpm install
cp .env.example .env            # also apps/api/.env, apps/worker/.env, apps/web/.env.local for local dev
docker compose up --build       # postgres, redis, migrate, api, worker, build-runner
docker build -t shipyard-build-node:22 apps/worker/build-image

pnpm dev:api | dev:worker | dev:web
pnpm --filter @shipyard/database generate       # regenerate Prisma client after schema changes
pnpm --filter @shipyard/database migrate:dev    # create/apply a migration (needs DATABASE_URL)

pnpm --filter @shipyard/api test        # unit tests (Vitest)
pnpm --filter @shipyard/api test:e2e    # e2e (*.e2e-spec.ts)
pnpm --filter @shipyard/api lint        # oxlint
pnpm --filter @shipyard/worker test
pnpm --filter @shipyard/build-runner exec vitest run
```

## Conventions

- ESM everywhere (`"type": "module"`): relative imports use the `.js` extension, even in `.ts` files.
- Code identifiers and commits are in English (Conventional Commits: `feat(api): ...`). **User-facing and log messages are in Spanish.** Keep that split.
- Tests live next to the code: `*.spec.ts` (unit), `*.e2e-spec.ts` (API e2e). Use Vitest.
- Ownership: never fetch a project or deployment by id alone. Always filter by `userId` inside the Prisma query (`where: { id, userId }` or `project: { userId }`), and return 404 (not 403) when nothing matches.
- API input is validated with class-validator DTOs; the global `ValidationPipe` uses `whitelist` + `forbidNonWhitelisted`.
- After editing `schema.prisma`, create a migration (never edit applied migrations) and regenerate the client.

## Security invariants (do not weaken)

- Repository URLs: HTTPS only, hosts restricted to github.com/gitlab.com/bitbucket.org, no credentials, port, query or fragment, path `/<owner>/<repo>.git`. This is enforced in both the API validator and the worker's `git.ts`.
- Git clone: `--depth 1`, no submodules, `file`/`ext` protocols disabled, no global or system git config, no terminal prompt.
- Builds: a lockfile is required; installs always use `--ignore-scripts`; the build-runner accepts only the exact command/argument combinations in `ALLOWED_COMMANDS`.
- Workspace paths must resolve strictly inside `/app/workspaces` (see the `workspace-path.ts` files), and deployment ids must be UUIDs.
- Build containers: `--network none`, memory/CPU/PID limits, non-root user. The build-runner container is `read_only`, `cap_drop: ALL`, `no-new-privileges`.
- Never commit `.env` files; secrets come from env (`JWT_SECRET`, `REDIS_PASSWORD`, `BUILD_RUNNER_TOKEN`, ...).

## Gotchas

- `apps/web` uses Next.js 16, which has breaking changes. Read `apps/web/AGENTS.md` and the docs in `node_modules/next/dist/docs/` before changing web code.
- The Prisma client is generated into `packages/database/src/generated/prisma` (git-ignored) and consumed from `dist/`. Run `pnpm --filter @shipyard/database build` before building or running the api/worker.
- The worker hardcodes `/app/workspaces`, so cloning only works inside the container (or on a machine where that path exists).
- API config comes from env via `ConfigService`: `PORT` (default 3001), `WEB_ORIGIN` (comma-separated CORS origins, default `http://localhost:3000`), `REDIS_*`, `JWT_SECRET`, `DATABASE_URL`.
- The web app stores the JWT in `sessionStorage` (`shipyard_access_token`); there is no refresh token.
