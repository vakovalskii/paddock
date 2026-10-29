FROM node:22-bookworm-slim

ARG CODEX_VERSION=0.165.0

RUN apt-get update \
 && apt-get install -y --no-install-recommends git ripgrep curl ca-certificates python3 jq less procps \
 && rm -rf /var/lib/apt/lists/* \
 && npm install -g @openai/codex@${CODEX_VERSION} \
 && npm cache clean --force \
 && userdel -r node \
 && useradd -m -u 1000 -s /bin/bash codex \
 && mkdir -p /workspace /home/codex/.codex \
 && chown -R codex:codex /workspace /home/codex

COPY --chown=codex:codex config.toml paddock.rules /opt/codex/
COPY entrypoint.sh /usr/local/bin/entrypoint.sh

USER codex
WORKDIR /workspace
ENV CODEX_HOME=/home/codex/.codex

EXPOSE 4500
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["codex", "app-server", "--listen", "ws://0.0.0.0:4500"]
