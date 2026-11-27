# API and indexer image. Build from the repo root:
#   docker build -f backend/Dockerfile -t organic-trace-api .
# Run the API with the default command, the indexer with: node dist/src/indexer.js
FROM node:20-alpine AS build
WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json ./
RUN npm ci
COPY backend/ ./
RUN npm run build && npm prune --omit=dev

FROM node:20-alpine
ENV NODE_ENV=production
WORKDIR /app/backend
COPY --from=build /app/backend/package.json ./
COPY --from=build /app/backend/node_modules ./node_modules
COPY --from=build /app/backend/dist ./dist
# Gas report shown in /admin, and the schema for `node dist/scripts/migrate.js`
COPY backend/data ./data
COPY db /app/db
USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget -qO- http://127.0.0.1:4000/api/health || exit 1
CMD ["node", "dist/src/server.js"]
