# Shipyard

Shipyard is a self-hosted deployment platform. You register a Git repository as a project, press **Deploy**, and Shipyard clones it, builds it in an isolated container and streams the logs to your browser.

> **Status:** under active development. Builds work end to end; running the built apps (deploy to Docker, then Kubernetes) is the next milestone. See the [roadmap](#roadmap).

## Features

- **Accounts and projects**: register / sign in (JWT), create projects from public GitHub, GitLab or Bitbucket repositories. Every project and deployment is scoped to its owner.
- **Deployments**: queued with retries (BullMQ), shallow clone, automatic detection of Node projects and their package manager (pnpm, npm, yarn), commit SHA recorded.
- **Isolated builds**: each step runs in a short-lived container: dependency install with network access but no lifecycle scripts, build with no network at all, non-root, read-only filesystem, no capabilities, memory/CPU/PID limits.
- **Live logs**: build output is streamed into the deployment logs and shown live in the web app.
- **Retry** failed deployments; permanent errors (unsupported project, missing lockfile...) fail fast without wasting retries.
- **Health checks** for the API (database and Redis) and the build runner.

## Architecture

```
web (Next.js :3000) ──HTTP/JWT──> api (NestJS :3001) ──BullMQ──> Redis
                                     │                              │
                                     └──── PostgreSQL (Prisma) <── worker
                                                                    │ HTTP + token
                                                                    v
                                                       build-runner (:8080)
                                                                    │ Docker Engine API
                                                                    v
                                                    docker-proxy (restricted access)
                                                                    │
                                                                    v
                                          ephemeral build containers (one per step)
```

1. The **web** app calls the **API** to create a deployment.
2. The API stores it as `QUEUED` and puts a job on the **Redis** queue.
3. The **worker** clones the repository, detects the project type and asks the **build-runner** to build it.
4. The build-runner runs `install` and `build` in throwaway containers through a **docker-proxy** that only exposes the Docker endpoints it needs.
5. The worker follows the build, stores its output as logs and sets the final status (`RUNNING` or `FAILED`).

## Tech stack

TypeScript everywhere, in a pnpm monorepo.

| Part | Technology |
|---|---|
| Web | Next.js 16, React 19, Tailwind CSS 4 |
| API | NestJS, class-validator, Passport JWT |
| Queue and worker | BullMQ on Redis 7 |
| Database | PostgreSQL 16 with Prisma 7 |
| Builds | Docker Engine API, `tecnativa/docker-socket-proxy` |
| Tests and CI | Vitest, oxlint / ESLint, GitHub Actions |

## Getting started

### Prerequisites

- Node.js 22+ and pnpm 12 (`corepack enable`)
- Docker with Docker Compose
- Port 5432 free (stop any local PostgreSQL service first)

### Run it

```bash
pnpm install

# Environment: copy the examples and change the secrets
cp .env.example .env                    # used by docker compose
cp apps/web/.env.example apps/web/.env.local

# Image used by the build containers (once)
pnpm build:image

# Backend: postgres, redis, migrations, api, worker, build-runner, docker-proxy
docker compose up --build -d

# Web app on http://localhost:3000
pnpm dev:web
```

Open http://localhost:3000, create an account, add a project such as `https://github.com/github/codespaces-react.git` and press **Deploy**.

> **Windows:** run `docker compose` from a path with an uppercase drive letter (`D:\shipyard`, not `d:\shipyard`); otherwise Compose's build step fails with an "additional privileges requested" error.

### Useful commands

```bash
pnpm typecheck      # TypeScript checks in every package
pnpm lint           # oxlint (api) + ESLint (web)
pnpm test           # unit tests
pnpm test:e2e       # API end-to-end tests (services mocked, no database needed)

pnpm --filter @shipyard/database migrate:dev   # create/apply a migration
```

## Repository structure

```
apps/
  api/            NestJS REST API (auth, projects, deployments, health)
  worker/         BullMQ consumer that runs the deployment pipeline
  build-runner/   Runs builds in isolated containers; build-image/ is their image
  web/            Next.js web app
packages/
  database/       Prisma schema, migrations and client
  shared/         Code shared by api, worker and build-runner
                  (URL validation, build command allowlist, queue contract)
```

## Security model

Shipyard builds untrusted code, so the pipeline is locked down at every step:

- Repository URLs are restricted to HTTPS on github.com, gitlab.com and bitbucket.org, without credentials; clones are shallow, without submodules and with no global git config.
- A lockfile is required and dependencies are installed with `--ignore-scripts`. Only an allowlist of install/build commands can ever run.
- Build containers run as a non-root user with a read-only filesystem, no Linux capabilities, resource limits and only their own workspace mounted. The build step has no network.
- Only the build-runner can reach Docker, through a proxy limited to containers, images and networks.

Container isolation is **not** a full sandbox: creating containers is equivalent to root on the host. A production setup needs a sandboxed runtime (gVisor, Kata) or Kubernetes with strict policies, plus an egress proxy limited to the package registry.

## Roadmap

- [x] Accounts, projects and ownership checks
- [x] Deployment queue with retries and persisted logs
- [x] Isolated builds in ephemeral containers
- [x] Web app: deploy, retry and live logs
- [x] CI (typecheck, lint, tests, Docker images)
- [ ] Run deployed apps on Docker behind a reverse proxy, with a URL per project *(in progress)*
- [ ] Kubernetes runtime and image registry
- [ ] Environment variables and secrets per project
- [ ] GitHub webhooks (deploy on push)
- [ ] Custom domains and HTTPS
- [ ] Observability (OpenTelemetry)

## Contributing

Project conventions, commands and security rules for contributors (and coding agents) are in [CLAUDE.md](CLAUDE.md).
