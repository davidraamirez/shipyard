# Image for the build containers (shipyard-build-node:22).
# Build it with: pnpm build:image
FROM node:22-alpine

RUN apk add --no-cache tini \
    && rm -f /usr/local/bin/pnpm /usr/local/bin/yarn /usr/local/bin/pnpx /usr/local/bin/yarnpkg \
    && npm install --global pnpm@12.10.1 yarn@1.22.22 \
    && npm cache clean --force

ENV CI=true
ENV npm_config_audit=false
ENV npm_config_fund=false
ENV npm_config_update_notifier=false

# The container filesystem is read-only: HOME and the pnpm/npm/yarn
# caches live inside the workspace and are deleted with it.
ENV HOME=/workspace/.shipyard-home
ENV XDG_CACHE_HOME=/workspace/.shipyard-home/.cache
ENV XDG_DATA_HOME=/workspace/.shipyard-home/.local/share

WORKDIR /workspace

# UID 1000, the same user that clones the repository in the worker.
USER node

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["sh", "-c", "echo 'Build container ready'"]
