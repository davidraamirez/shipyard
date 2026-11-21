FROM node:22-alpine

RUN apk add --no-cache tini \
    && rm -f /usr/local/bin/pnpm /usr/local/bin/yarn /usr/local/bin/pnpx /usr/local/bin/yarnpkg \
    && npm install --global pnpm@12.10.1 yarn@1.22.22 \
    && addgroup -S builder \
    && adduser -S builder -G builder

ENV CI=true
ENV npm_config_audit=false
ENV npm_config_fund=false

WORKDIR /workspace

USER builder

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["sh", "-lc", "echo 'Build container ready'"]
