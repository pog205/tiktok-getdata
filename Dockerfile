# Sử dụng image Node chính thức
FROM node:18-slim

# Cài các dependencies cần cho Chromium
RUN apt-get update && apt-get install -y \
    chromium \
    libnss3 \
    libxss1 \
    libasound2 \
    fonts-liberation \
    libatk-bridge2.0-0 \
    libgtk-3-0 \
    wget \
    gnupg \
    ca-certificates \
    --no-install-recommends && \
    rm -rf /var/lib/apt/lists/*

# Tạo thư mục app
WORKDIR /app

# Copy package.json trước để cache node_modules
COPY package*.json ./

# Cài dependency
RUN npm install

# Copy toàn bộ source
COPY . .

# Puppeteer config: chỉ định Chromium path
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV NODE_ENV=production
ENV PORT=3000

# Expose port
EXPOSE 3000

# Start app
CMD ["node", "tiktok-api-server.js"]