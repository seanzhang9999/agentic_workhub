FROM node:22-bookworm-slim
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*
RUN npm install -g @larksuite/cli@latest && lark-cli --version
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --omit=dev
COPY src ./src
COPY scripts ./scripts
RUN mkdir -p /data/lark-cli /data/gateway /app/tmp && chmod +x /app/scripts/*.sh
ENV NODE_ENV=production PORT=8787 LARKSUITE_CLI_CONFIG_DIR=/data/lark-cli RECEIPT_DB_PATH=/data/gateway/receipts.sqlite
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD curl -fsS http://127.0.0.1:8787/healthz || exit 1
CMD ["node", "src/index.js"]
