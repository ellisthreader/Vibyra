ARG NODE_IMAGE=node:22-bookworm-slim
FROM ${NODE_IMAGE}
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates openssl procps iptables util-linux python3 make g++ \
    && rm -rf /var/lib/apt/lists/* && groupadd -g 1001 project && useradd -u 1001 -g 1001 -m project \
    && mkdir -p /tmp/project && chown 1001:1001 /tmp/project
WORKDIR /opt/vibyra
COPY src ./src
COPY entrypoint.sh ./entrypoint.sh
RUN chmod 755 entrypoint.sh && chmod -R go-w /opt/vibyra
ENTRYPOINT ["/opt/vibyra/entrypoint.sh"]
