# Website image. Build from the repo root:
#   docker build -f frontend/Dockerfile --build-arg API_URL=http://api:4000 -t organic-trace-web .
# API_URL is needed at build time (the /api rewrite is compiled in) and at run time (trace page).
FROM node:20-alpine AS build
WORKDIR /app
ARG API_URL=http://api:4000
ENV API_URL=$API_URL NEXT_TELEMETRY_DISABLED=1
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM node:20-alpine
WORKDIR /app
ARG API_URL=http://api:4000
ENV NODE_ENV=production API_URL=$API_URL NEXT_TELEMETRY_DISABLED=1 PORT=3000
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/next.config.ts ./
USER node
EXPOSE 3000
CMD ["node_modules/.bin/next", "start"]
