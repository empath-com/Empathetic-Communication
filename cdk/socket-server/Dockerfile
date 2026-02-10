FROM node:18-alpine

WORKDIR /app

# Install Python, pip, and wget (needed for debugging)
RUN apk add --no-cache python3 py3-pip wget

# Force rebuild on 2026-02-10 - CORS domain configurable via parameter
ENV REBUILD_TIMESTAMP=2026-02-10-v7

# Install Node.js dependencies
COPY package.json ./
RUN npm install

# Copy Python files and install requirements
COPY *.py ./
COPY requirements.txt ./

# Upgrade pip and setuptools, clear cache, then install requirements
RUN pip3 install --break-system-packages --upgrade pip setuptools && \
    pip3 cache purge && \
    pip3 install --break-system-packages -r requirements.txt

# Copy server files
COPY server.js ./
COPY auth.js ./

ENV AWS_DEFAULT_REGION=us-east-1

# Listen on HTTP port
EXPOSE 80

# Launch your HTTP + WebSocket server
CMD ["node", "server.js"]
