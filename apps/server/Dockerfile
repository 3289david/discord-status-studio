# Build from the repository root:
#   docker build -f apps/server/Dockerfile -t discord-status-studio .
FROM node:22-alpine
WORKDIR /app
COPY scripts ./scripts
COPY packages/core/src ./packages/core/src
COPY packages/ui/public ./packages/ui/public
COPY apps/server/package.json ./apps/server/package.json
COPY apps/server/src ./apps/server/src
WORKDIR /app/apps/server
RUN npm install --omit=dev --no-fund --no-audit && node ../../scripts/sync-shared.mjs server
ENV DSS_DATA_DIR=/data DSS_HOST=0.0.0.0 DSS_PORT=8787 NODE_ENV=production
VOLUME ["/data"]
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:8787/healthz || exit 1
CMD ["node", "src/cli.js", "start"]
