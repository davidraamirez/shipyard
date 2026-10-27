FROM node:22-alpine AS build

WORKDIR /app

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/build-runner/package.json ./apps/build-runner/package.json
COPY apps/build-runner/tsconfig.json ./apps/build-runner/tsconfig.json
COPY apps/build-runner/src ./apps/build-runner/src

RUN pnpm install --filter @shipyard/build-runner... --frozen-lockfile
RUN pnpm --filter @shipyard/build-runner build

FROM node:22-alpine AS runner

ENV NODE_ENV=production
ENV PORT=8080

WORKDIR /app

RUN addgroup -S runner && adduser -S runner -G runner

COPY --from=build --chown=runner:runner \
  /app/apps/build-runner/dist ./dist

USER runner

EXPOSE 8080

CMD ["node", "dist/main.js"]
