# syntax = docker/dockerfile:1

FROM docker.io/library/node:24-slim AS build
WORKDIR /app
# better-sqlite3 compiles from source when no prebuilt binary matches
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@11.9.0 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY astro.config.mjs tsconfig.json ./
COPY src/ src/
COPY README.md ./
RUN pnpm exec astro build
RUN pnpm prune --prod

FROM docker.io/library/node:24-slim
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8080 DATABASE_PATH=/data/app.db
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/dist dist
COPY --from=build /app/README.md README.md
CMD ["node", "dist/server/entry.mjs"]
