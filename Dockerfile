# PDFturtle: site + API with every engine (LibreOffice, Ghostscript, Chromium, Noto fonts for Office files).
FROM node:22-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
      libreoffice-writer libreoffice-calc libreoffice-impress ghostscript chromium \
      fonts-noto-core fonts-noto-cjk fonts-noto-ui-core ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npx vite build && npm prune --omit=dev && mkdir -p /app/data && chown -R node:node /app/data

ENV NODE_ENV=production \
    PORT=8080 \
    CHROME=/usr/bin/chromium \
    PDFTURTLE_CHROME_FLAGS=--no-sandbox \
    PDFTURTLE_DB=/app/data/pdfturtle.db
USER node
EXPOSE 8080
VOLUME ["/app/data"]
CMD ["node", "--disable-warning=ExperimentalWarning", "server.mjs"]
