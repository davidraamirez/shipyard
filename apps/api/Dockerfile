# Dockerfile — Shipyard API
FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /app

# Dependencias del workspace
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/database/package.json ./packages/database/package.json
COPY apps/api/package.json ./apps/api/package.json
RUN pnpm install --filter api... --frozen-lockfile

# Compilación y empaquetado solo con dependencias de producción
FROM deps AS build
COPY packages/database ./packages/database
COPY apps/api ./apps/api
RUN DATABASE_URL="postgresql://build:build@localhost:5432/build" pnpm --filter api... build
RUN pnpm --filter api deploy --prod --legacy /prod/api

# Imagen final
FROM node:22-alpine AS runner
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /prod/api ./
USER node
EXPOSE 3001
CMD ["node", "dist/main.js"]
