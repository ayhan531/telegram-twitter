# Stage 1: build the XActions n8n community node. It's not published on
# npm and its `xactions` dependency has native modules (better-sqlite3)
# that need Python/gcc to compile — none of which exist in n8n's hardened
# final image (package manager stripped for security), so we build here
# on a normal Alpine Node image that has them, then copy the finished
# artifact into the hardened image in stage 2.
FROM node:24-alpine AS builder
RUN apk add --no-cache git python3 make g++
RUN git clone --depth 1 --filter=blob:none --sparse https://github.com/nirholas/XActions.git /tmp/xactions-src \
    && cd /tmp/xactions-src \
    && git sparse-checkout set integrations/n8n \
    && mkdir -p /build/n8n-nodes-xactions \
    && cp -r /tmp/xactions-src/integrations/n8n/. /build/n8n-nodes-xactions/ \
    && rm -rf /tmp/xactions-src \
    && cd /build/n8n-nodes-xactions \
    && npm install --omit=dev \
    && npm run build

# Stage 2: real n8n image + the prebuilt node, no build tools needed here.
FROM n8nio/n8n:latest
COPY --from=builder --chown=node:node /build/n8n-nodes-xactions /home/node/.n8n/nodes/node_modules/n8n-nodes-xactions
RUN cd /home/node/.n8n/nodes && npm init -y
