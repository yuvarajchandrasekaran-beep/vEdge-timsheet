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

EXPOSE 8080
CMD ["node", "dist/index.js"]
