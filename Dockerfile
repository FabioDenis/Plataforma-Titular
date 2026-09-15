# ---- Stage 1: deps — production dependencies only -------------------------
# Installs only runtime dependencies once; the resulting node_modules is the
# one that ships in the final image (no esbuild, tsx, vite or firebase-tools).
FROM node:22-bookworm-slim AS deps
WORKDIR /app
# Manifests only, so this layer caches independently of any source change.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# ---- Stage 2: build — full install + esbuild server bundle ----------------
# esbuild is a devDependency, so this stage needs a full `npm ci`. It produces
# dist/server.cjs (CJS, --packages=external: bare imports stay as require()
# and are resolved from the runtime stage's node_modules).
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
# Server entrypoint and server sources only — no client build happens here.
COPY server.ts ./
COPY server/ ./server/
# Required by the bundle graph: server.ts imports src/data/sampleNews.ts,
# which imports src/types.ts (type-only). Nothing else from src/ is used.
COPY src/data/ ./src/data/
COPY src/types.ts ./src/types.ts
RUN npm run build:server

# ---- Stage 3: runtime — minimal production API image ----------------------
# No dev dependencies, no client bundle, no secrets: only the compiled server,
# its production node_modules, and package.json for provenance.
FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
USER node
EXPOSE 8080
CMD ["node", "dist/server.cjs"]
