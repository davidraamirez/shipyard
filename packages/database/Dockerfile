# Dockerfile — Shipyard migraciones
FROM node:22-alpine

RUN apk add --no-cache openssl
RUN corepack enable

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/database/package.json ./packages/database/package.json

RUN pnpm install --filter @shipyard/database --frozen-lockfile

COPY packages/database ./packages/database

WORKDIR /app/packages/database

CMD ["./node_modules/.bin/prisma", "migrate", "deploy"]
