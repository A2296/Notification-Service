FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts

COPY app.js ./
COPY src ./src
COPY scripts ./scripts
COPY docs ./docs
COPY Notification-Service-Dashboard/frontend ./Notification-Service-Dashboard/frontend

ENV NODE_ENV=production
ENV PORT=5000
EXPOSE 5000

USER node

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- "http://localhost:${PORT}/health" || exit 1

CMD ["node", "src/server.js"]
