# --- Build stage: compila TS y genera el cliente Prisma ---
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY prisma ./prisma
RUN npx prisma generate
COPY . .
RUN npm run build

# --- Runtime stage: imagen mínima, dependencias de prod, usuario no-root ---
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
# Usuario dedicado sin privilegios: limita el radio de daño si el contenedor cae.
RUN addgroup -S app && adduser -S app -G app
COPY package*.json ./
RUN npm ci --omit=dev
COPY prisma ./prisma
RUN npx prisma generate
COPY --from=build /app/dist ./dist
USER app
EXPOSE 3000
# Aplica migraciones pendientes y arranca. `migrate deploy` es no-interactivo (prod).
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
