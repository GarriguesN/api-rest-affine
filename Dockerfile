# ---- Stage 1: deps + build ----
FROM node:22-alpine AS builder
WORKDIR /app

# Copy package files and install ALL deps (including dev)
COPY package*.json ./
RUN npm ci

# Copy source and build
COPY tsconfig.json ./
COPY vitest.config.ts ./
COPY eslint.config.js ./
COPY src ./src
RUN npm run build

# Prune dev dependencies from production node_modules
RUN npm prune --omit=dev

# ---- Stage 2: runtime ----
FROM node:22-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production

# Security: non-root user
RUN addgroup -S app && adduser -S app -G app

# Copy only what we need from builder
COPY --from=builder --chown=app:app /app/node_modules ./node_modules
COPY --from=builder --chown=app:app /app/dist ./dist
COPY --from=builder --chown=app:app /app/package.json ./package.json

USER app

EXPOSE 3002

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost:3002/health || exit 1

CMD ["node", "dist/server.js"]
