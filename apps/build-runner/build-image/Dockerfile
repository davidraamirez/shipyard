# Imagen de los contenedores de build (shipyard-build-node:22).
# Construir con: pnpm build:image
FROM node:22-alpine

RUN apk add --no-cache tini \
    && rm -f /usr/local/bin/pnpm /usr/local/bin/yarn /usr/local/bin/pnpx /usr/local/bin/yarnpkg \
    && npm install --global pnpm@12.10.1 yarn@1.22.22 \
    && npm cache clean --force

ENV CI=true
ENV npm_config_audit=false
ENV npm_config_fund=false
ENV npm_config_update_notifier=false

# El sistema de archivos del contenedor es de solo lectura: HOME y las cachés
# de pnpm/npm/yarn viven dentro del workspace y se borran con él.
ENV HOME=/workspace/.shipyard-home
ENV XDG_CACHE_HOME=/workspace/.shipyard-home/.cache
ENV XDG_DATA_HOME=/workspace/.shipyard-home/.local/share

WORKDIR /workspace

# UID 1000, el mismo usuario que clona el repositorio en el worker.
USER node

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["sh", "-c", "echo 'Build container ready'"]
