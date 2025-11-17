ARG BUILD_FROM=ghcr.io/hassio-addons/base:15.0.1
FROM ${BUILD_FROM}

# Set shell
SHELL ["/bin/bash", "-o", "pipefail", "-c"]

# Install Node.js 18
RUN \
    apk add --no-cache \
        nodejs=~18 \
        npm=~9 \
    && npm install -g npm@latest

# Copy application files
WORKDIR /app
COPY package*.json ./
COPY src ./src
COPY config.json ./

# Install dependencies
RUN npm ci --only=production

# Copy run script
COPY run.sh /
RUN chmod a+x /run.sh

CMD [ "/run.sh" ]
