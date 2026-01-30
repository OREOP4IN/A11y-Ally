FROM node:20-slim

WORKDIR /usr/src/app

# Install Chromium + runtime deps for headless Chrome
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    ca-certificates \
    dumb-init \
    fonts-liberation \
    fonts-noto-color-emoji \
    fonts-dejavu-core \
    libnss3 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libasound2 \
    libpangocairo-1.0-0 \
    libpango-1.0-0 \
    libgtk-3-0 \
    && rm -rf /var/lib/apt/lists/*

# Cloud Run best practice: use /tmp for temp + caches
ENV TMPDIR=/tmp

# Help pa11y/puppeteer find Chromium
ENV CHROME_PATH=/usr/bin/chromium
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# (Optional) Reduce noisy fontconfig warnings
ENV FONTCONFIG_PATH=/etc/fonts

# Install deps first (better layer caching)
COPY package*.json ./
RUN npm ci --omit=dev

# Copy app source
COPY . .

# Create non-root user and give access to app + /tmp
RUN useradd -m -u 10001 nodeuser \
    && chown -R nodeuser:nodeuser /usr/src/app /tmp

USER nodeuser

ENV NODE_ENV=production

# Use dumb-init as PID 1 for cleaner child process handling (pa11y spawns chrome)
ENTRYPOINT ["dumb-init", "--"]

# Cloud Run provides PORT; your server.js must listen on process.env.PORT
CMD ["npm", "start"]
