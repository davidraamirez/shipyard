# Dockerfile — Shipyard API
FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /app

# Workspace dependencies
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/database/package.json ./packages/database/package.json
COPY packages/shared/package.json ./packages/shared/package.json
COPY apps/api/package.json ./apps/api/package.json
RUN pnpm install --filter api... --frozen-lockfile

# Build and package with production dependencies only
FROM deps AS build
COPY packages/database ./packages/database
COPY packages/shared ./packages/shared
COPY apps/api ./apps/api
RUN DATABASE_URL="postgresql://build:build@localhost:5432/build" pnpm --filter api... build
RUN pnpm --filter api deploy --prod --legacy /prod/api

# Final image
FROM node:22-alpine AS runner
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /prod/api ./
USER node
EXPOSE 3001
CMD ["node", "dist/main.js"]
