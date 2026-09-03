FROM node:22-bookworm-slim

# LibreOffice enables legacy .doc/.ppt/.xls conversion before parsing.
# Chromium is intentionally not required; exports are generated natively.
RUN apt-get update && apt-get install -y --no-install-recommends \
    libreoffice-core libreoffice-writer libreoffice-impress libreoffice-calc \
    fontconfig ca-certificates poppler-utils ghostscript fonts-noto-core fonts-noto-extra \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev=false
COPY . .
RUN npm run build
# Fail the image build if deterministic Digital/Print export and preflight checks fail.
RUN npm run check
ENV NODE_ENV=production
ENV PORT=10000
EXPOSE 10000
CMD ["npm","start"]
