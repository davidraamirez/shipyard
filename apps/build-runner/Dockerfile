FROM node:22-alpine AS build

WORKDIR /app

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json ./packages/shared/package.json
COPY apps/build-runner/package.json ./apps/build-runner/package.json

RUN pnpm install --filter @shipyard/build-runner... --frozen-lockfile

COPY packages/shared ./packages/shared
COPY apps/build-runner/tsconfig.json ./apps/build-runner/tsconfig.json
COPY apps/build-runner/src ./apps/build-runner/src

RUN pnpm --filter @shipyard/build-runner... build
# Production dependencies only (@shipyard/shared, no external dependencies)
RUN pnpm --filter @shipyard/build-runner deploy --prod --legacy /prod/build-runner

FROM node:22-alpine AS runner

ENV NODE_ENV=production
ENV PORT=8080

WORKDIR /app

RUN addgroup -S runner && adduser -S runner -G runner

COPY --from=build --chown=runner:runner /prod/build-runner ./

USER runner

EXPOSE 8080

CMD ["node", "dist/main.js"]
