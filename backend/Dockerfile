# --- build stage ---
FROM node:20-slim AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY prisma ./prisma
# Cloud SQL is MySQL; local dev (schema.prisma as committed) targets SQLite.
# Swap the datasource provider only inside this build stage's copy of the
# schema — the source file in the repo is untouched.
RUN sed -i 's/provider = "sqlite"/provider = "mysql"/' prisma/schema.prisma

# Prisma's default MySQL mapping for a bare `String` column is VARCHAR(191)
# (SQLite has no such limit, which is why this never surfaces in local dev).
# Every free-text or JSON-encoded field gets widened to TEXT here so saving a
# longer comment/description/note — or a JSON blob like an audit-log snapshot
# or a client-send's entry-id list — doesn't 500 in production.
RUN sed -E -i \
  -e 's/^([[:space:]]*description[[:space:]]+String\??)/\1 @db.Text/' \
  -e 's/^([[:space:]]*weekNotes[[:space:]]+String\??)/\1 @db.Text/' \
  -e 's/^([[:space:]]*notes[[:space:]]+String\??)/\1 @db.Text/' \
  -e 's/^([[:space:]]*comment[[:space:]]+String\??)/\1 @db.Text/' \
  -e 's/^([[:space:]]*payload[[:space:]]+String\??)/\1 @db.Text/' \
  -e 's/^([[:space:]]*entryIds[[:space:]]+String\??)/\1 @db.Text/' \
  -e 's/^([[:space:]]*errorReport[[:space:]]+String\??)/\1 @db.Text/' \
  -e 's/^([[:space:]]*cadenceConfig[[:space:]]+String\??)/\1 @db.Text/' \
  -e 's/^([[:space:]]*beforeState[[:space:]]+String\??)/\1 @db.Text/' \
  -e 's/^([[:space:]]*afterState[[:space:]]+String\??)/\1 @db.Text/' \
  prisma/schema.prisma

COPY tsconfig.json ./
COPY src ./src

RUN npx prisma generate
RUN npm run build

# --- runtime stage ---
FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=build /app/prisma ./prisma
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/dist ./dist
COPY assets ./assets

EXPOSE 8080
CMD ["node", "dist/index.js"]
