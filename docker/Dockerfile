# 基于 openshell 官方 base，只加 ant
FROM ghcr.io/nvidia/openshell-community/sandboxes/base:latest

ARG ANT_VERSION=1.9.2

USER root

RUN apt-get update && apt-get install -y --no-install-recommends bash jq && \
    ARCH=$(dpkg --print-architecture) && \
    TARBALL="ant_${ANT_VERSION}_linux_${ARCH}.tar.gz" && \
    ASSET_ID=$(curl -fsSL \
      -H 'Accept: application/vnd.github.v3+json' \
      "https://api.github.com/repos/anthropics/anthropic-cli/releases/tags/v${ANT_VERSION}" \
      | jq -r ".assets[] | select(.name == \"${TARBALL}\") | .id") && \
    curl -fsSL -L \
      -H 'Accept: application/octet-stream' \
      "https://api.github.com/repos/anthropics/anthropic-cli/releases/assets/${ASSET_ID}" \
      | tar -xz -C /usr/local/bin ant && \
    chmod +x /usr/local/bin/ant && \
    apt-get purge -y jq && apt-get autoremove -y && rm -rf /var/lib/apt/lists/*

USER sandbox
WORKDIR /sandbox