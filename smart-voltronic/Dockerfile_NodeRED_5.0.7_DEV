ARG BUILD_FROM=ghcr.io/hassio-addons/base:21.0.7
FROM ${BUILD_FROM}

SHELL ["/bin/bash", "-o", "pipefail", "-c"]

# Runtime Smart Voltronic + Node.js 24
# Node-RED 5.0.7 requires Node.js >= 22.9
RUN apk add --no-cache \
    bash \
    jq \
    tzdata \
    nodejs=24.18.1-r0 \
    npm=11.12.1-r0 \
    python3 \
    make \
    g++ \
    linux-headers

# Node-RED
RUN npm install -g --no-audit --no-fund --unsafe-perm node-red@5.0.7 \
    && npm cache clean --force

COPY . /addon
WORKDIR /addon

# Smart Voltronic local dependency
RUN npm init -y >/dev/null 2>&1 || true \
    && npm install --no-audit --no-fund --unsafe-perm ws \
    && chmod a+x /addon/run.sh

ENTRYPOINT ["/addon/run.sh"]
