# Dockerfile — Shipyard worker
FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /app

# Workspace dependencies
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/database/package.json ./packages/database/package.json
COPY packages/shared/package.json ./packages/shared/package.json
COPY apps/worker/package.json ./apps/worker/package.json
RUN pnpm install --filter @shipyard/worker... --frozen-lockfile

# Build and package with production dependencies only
FROM deps AS build
COPY packages/database ./packages/database
COPY packages/shared ./packages/shared
COPY apps/worker ./apps/worker
RUN DATABASE_URL="postgresql://build:build@localhost:5432/build" pnpm --filter @shipyard/worker... build
RUN pnpm --filter @shipyard/worker deploy --prod --legacy /prod/worker

# Final image
FROM node:22-alpine AS runner
RUN apk add --no-cache git
ENV NODE_ENV=production
WORKDIR /app

RUN mkdir -p /app/workspaces \
    && chown -R node:node /app/workspaces
COPY --from=build --chown=node:node /prod/worker ./
COPY --from=build --chown=node:node /app/apps/worker/package.json ./package.json
USER node
CMD ["node", "dist/main.js"]
