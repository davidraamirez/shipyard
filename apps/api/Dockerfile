# Dockerfile — Shipyard API
FROM node:22-alpine AS base

RUN corepack enable

WORKDIR /app

# Dependencias del workspace
FROM base AS deps

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/package.json

RUN pnpm install --filter api... --frozen-lockfile

# Compilación
FROM deps AS build

COPY apps/api ./apps/api

WORKDIR /app/apps/api

ENV DATABASE_URL="postgresql://shipyard:shipyard@localhost:5432/shipyard"

RUN pnpm exec prisma generate
RUN pnpm build

# Imagen final
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/api ./apps/api

WORKDIR /app/apps/api

EXPOSE 3001

CMD ["node", "dist/main.js"]