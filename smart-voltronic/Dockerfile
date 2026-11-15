ARG BUILD_FROM=ghcr.io/hassio-addons/base:21.0.9
FROM ${BUILD_FROM}

SHELL ["/bin/bash", "-o", "pipefail", "-c"]

# Updated Alpine base prevents the outdated musl/musl-dev revision mismatch.
# Install Node.js and supporting shell utilities
RUN apk add --no-cache bash jq nodejs-lts npm \
  || apk add --no-cache bash jq "nodejs~22" "npm~10"

# Node-RED 4.x (OK avec Node 22)
RUN npm install -g node-red@4.1.4 \
  && npm cache clean --force

# ---- installer les nodes Node-RED "embarqués" dans l'image (hors /data) ----
WORKDIR /opt
RUN apk add --no-cache --virtual .build-deps \
      build-base linux-headers python3 make g++ \
  && npm i --omit=dev --no-audit --no-fund node-red-node-serialport \
  && apk del .build-deps \
  && npm cache clean --force

# Ton addon
COPY . /addon
RUN chmod a+x /addon/run.sh

WORKDIR /addon
ENTRYPOINT ["/addon/run.sh"]
