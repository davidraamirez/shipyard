# Dockerfile — Shipyard worker
FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /app

# Dependencias del workspace
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/database/package.json ./packages/database/package.json
COPY apps/worker/package.json ./apps/worker/package.json
RUN pnpm install --filter @shipyard/worker... --frozen-lockfile

# Compilación y empaquetado solo con dependencias de producción
FROM deps AS build
COPY packages/database ./packages/database
COPY apps/worker ./apps/worker
RUN DATABASE_URL="postgresql://build:build@localhost:5432/build" pnpm --filter @shipyard/worker... build
RUN pnpm --filter @shipyard/worker deploy --prod --legacy /prod/worker

# Imagen final
FROM node:22-alpine AS runner
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /prod/worker ./
USER node
CMD ["node", "dist/main.js"]
