FROM python:3.13-slim

WORKDIR /app

# Install Node.js 22 LTS and wget
RUN apt-get update && apt-get install -y curl wget && \
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && \
    apt-get install -y nodejs && \
    rm -rf /var/lib/apt/lists/*

# Force rebuild on 2026-05-21
ENV REBUILD_TIMESTAMP=2026-05-21-v1

# Install Node.js dependencies
COPY socket-server/package.json ./
RUN npm install

# Copy Python files and install requirements
COPY socket-server/*.py ./
COPY socket-server/helpers/ ./helpers/
COPY socket-server/requirements.txt ./
COPY shared/ ./shared/

RUN pip install --upgrade pip setuptools && \
    pip cache purge && \
    pip install -r requirements.txt

# Copy server files
COPY socket-server/server.js ./
COPY socket-server/auth.js ./
COPY socket-server/novaOutputProcessor.js ./

ENV AWS_DEFAULT_REGION=us-east-1

# Listen on HTTP port
EXPOSE 80

# Launch HTTP + WebSocket server
CMD ["node", "server.js"]
