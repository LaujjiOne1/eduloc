# --- Étape build : dépendances, client Prisma, compilation NestJS -------------------------------------------------
FROM node:22-alpine AS builder
WORKDIR /app
RUN apk add --no-cache python3 make g++
COPY package*.json ./
RUN npm install
COPY . .
RUN npx prisma generate && npm run build

# --- Étape finale : dist/, node_modules (le CLI prisma sert aux migrations de déploiement) et client généré ---------
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
# OCR des justificatifs scannés (lot 6, spec §14.5) : Tesseract (fra + eng) et poppler (pdftoppm) pour rasteriser les PDF.
# Noms des paquets Alpine (équivalents des tesseract-ocr-fra / -eng de Debian).
RUN apk add --no-cache openssl tesseract-ocr tesseract-ocr-data-fra tesseract-ocr-data-eng poppler-utils
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts
# Stockage local de développement (STORAGE_DRIVER=local) : dossier inscriptible par l'utilisateur non root.
RUN mkdir -p /app/.storage && chown -R node:node /app/.storage
USER node
EXPOSE 3000
# L'état du matching (Ollama) est distinct : /health répond 200 même sans Ollama (spec §14.5).
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:3000/health || exit 1
# Les migrations ne s'exécutent PAS au démarrage du conteneur : étape de déploiement distincte
#   docker compose run --rm api npx prisma migrate deploy
CMD ["node", "dist/main.js"]
