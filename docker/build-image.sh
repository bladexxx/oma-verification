#!/bin/bash
set -euo pipefail

ANT_VERSION="${1:-1.9.2}"
IMAGE_NAME="ant-worker:${ANT_VERSION}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "Building ${IMAGE_NAME} (ant v${ANT_VERSION})..."
podman build \
  --build-arg "ANT_VERSION=${ANT_VERSION}" \
  -t "$IMAGE_NAME" \
  -f "${SCRIPT_DIR}/Dockerfile" \
  "${SCRIPT_DIR}"

echo ""
echo "✓ Image built: ${IMAGE_NAME}"
echo ""
echo "Verify:"
echo "  podman run --rm ${IMAGE_NAME} --version"
echo ""
echo "Use with openshell:"
echo "  openshell sandbox create --from ${IMAGE_NAME} ..."
