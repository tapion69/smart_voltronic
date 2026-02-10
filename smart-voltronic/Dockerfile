ARG BUILD_FROM=ghcr.io/home-assistant/amd64-base:latest
FROM ${BUILD_FROM}

RUN apk add --no-cache nodejs npm jq bash
RUN npm install -g --unsafe-perm node-red@3.1.9 && npm cache clean --force

# Le contexte = le dossier smart-voltronic/
COPY . /addon

# ✅ évite /addon/run.sh: Permission denied
RUN chmod a+x /addon/run.sh

WORKDIR /addon
CMD ["/addon/run.sh"]
