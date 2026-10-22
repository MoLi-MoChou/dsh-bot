# Mochou web version: the same UI as the desktop app, served by the Node host in a
# normal browser behind a password page (app/src/web.mjs).
#
#   docker build -t mochou .
#   docker run -d -p 8290:8290 -e MOCHOU_PASSWORD=... -v mochou-data:/data mochou
FROM node:22-bookworm-slim

# bubblewrap confines the Bots' shell commands (DSH falls back to Landlock where a
# container cannot use it); git, curl and python3 are there for the Bots to use.
RUN apt-get update \
 && apt-get install -y --no-install-recommends bubblewrap ca-certificates curl git python3 tini \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /opt/mochou
COPY core/ core/
COPY app/package.json app/package-lock.json app/.npmrc app/
COPY app/scripts/ app/scripts/
COPY app/engine/ app/engine/
# Electron, the window build and the packager are dev dependencies: not installed.
RUN cd app && npm ci --omit=dev --no-audit --no-fund && npm cache clean --force
COPY app/src/ app/src/
COPY app/assets/ app/assets/
COPY NOTICE LICENSE ./

ENV NODE_ENV=production \
    MOCHOU_DATA=/data \
    MOCHOU_WORKSPACE=/data/workspace \
    MOCHOU_WEB_HOST=0.0.0.0 \
    MOCHOU_WEB_PORT=8290
RUN mkdir -p /data/workspace && chown -R node:node /data
USER node
VOLUME ["/data"]
EXPOSE 8290
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "app/src/web.mjs"]
