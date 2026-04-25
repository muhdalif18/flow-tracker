# ── Stage 1: Build client ─────────────────────────────────────────────────────
FROM node:20-alpine AS client-builder

WORKDIR /app/client
COPY client/package*.json ./
RUN npm install
COPY client/ ./
RUN npm run build

# ── Stage 2: Build server ─────────────────────────────────────────────────────
FROM node:20-alpine AS server-builder

WORKDIR /app/server
COPY server/package*.json ./
RUN npm install
COPY server/ ./
RUN npm run build

# ── Stage 3: Production image ─────────────────────────────────────────────────
FROM node:20-alpine

WORKDIR /app

# Copy server production deps + compiled output
COPY server/package*.json ./server/
RUN cd server && npm install --omit=dev

COPY --from=server-builder /app/server/dist ./server/dist

# Copy built React app (served as static files by Express)
COPY --from=client-builder /app/client/dist ./client/dist

# Create default data & uploads dirs (Railway volumes will override these paths)
RUN mkdir -p /data /uploads

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["node", "server/dist/index.js"]
