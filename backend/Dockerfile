## Multi-stage Dockerfile for splitter-backend (NodeNext ESM + Prisma)

### Stage 1: build
FROM node:20-bullseye-slim AS builder
WORKDIR /app

# Install dependencies with Docker layer caching.
COPY package*.json ./
RUN npm ci --ignore-scripts

# Copy source, generate Prisma client, then compile TypeScript.
COPY . .
RUN npx prisma generate
RUN npm run build

# Keep only production dependencies for the runtime image.
RUN npm prune --production

### Stage 2: runtime
FROM node:20-bullseye-slim
WORKDIR /app
ENV NODE_ENV=production

# Copy production dependencies and compiled app.
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/package*.json ./

# docker-compose publishes this port as http://localhost:8080.
EXPOSE 8080

CMD ["node", "dist/server.js"]
