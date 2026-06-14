# ── Build ──
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY prisma ./prisma
RUN npx prisma generate
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ── Runtime ──
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
# node_modules do build já trazem o Prisma Client gerado + o CLI (para migrate deploy)
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY package*.json ./
EXPOSE 3050
# aplica migrações pendentes e sobe a API
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/server.js"]
