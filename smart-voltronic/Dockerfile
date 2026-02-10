ARG BUILD_FROM=ghcr.io/hassio-addons/base:15.0.7
FROM ${BUILD_FROM}

SHELL ["/bin/bash", "-o", "pipefail", "-c"]

# IMPORTANT: installer une version LTS (22) et pas Node 24
RUN apk add --no-cache bash jq nodejs-lts npm \
  || apk add --no-cache bash jq "nodejs~22" "npm~10"

# Node-RED 4.x (supporte Node >=18, recommande Node 22)
RUN npm install -g --unsafe-perm node-red@4.1.4 \
  && npm cache clean --force

COPY . /addon
RUN chmod a+x /addon/run.sh

WORKDIR /addon
CMD ["/addon/run.sh"]
