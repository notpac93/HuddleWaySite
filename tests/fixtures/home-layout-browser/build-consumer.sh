#!/usr/bin/env bash
# Builds the normal consumer app against local sample services and emulators.
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
cd "$ROOT_DIR"
flutter build web --target lib/main_consumer.dart --debug --no-pub \
  --output "${CONSUMER_BUILD_DIR:-/tmp/huddleway-canvas-real-app}" \
  --dart-define=APP_AUDIENCE=consumer --dart-define=APP_FLAVOR=dev \
  --dart-define=CAPTURE_MODE=true \
  --dart-define=CAPTURE_FIRESTORE_PORT="${CAPTURE_FIRESTORE_PORT:-8181}" \
  --dart-define=CAPTURE_AUTH_PORT="${CAPTURE_AUTH_PORT:-9099}" \
  --dart-define=FIRESTORE_PERSISTENCE_ENABLED=false \
  --dart-define=TENANT_ID=layout-fixture \
  --dart-define=CAPTURE_TENANT_ID=layout-fixture \
  --dart-define=CAPTURE_PROGRAM_NAME=HuddleWay \
  --dart-define=BACKEND_URL=http://127.0.0.1:8893 \
  --dart-define=DYNAMIC_ROUTES_ENABLED=true \
  --dart-define=CRM_PREVIEW_PARENT_ORIGINS=http://127.0.0.1:8892 \
  --dart-define=APP_SOURCE_COMMIT="$(git rev-parse HEAD)" \
  --dart-define=APP_RELEASE_ID=local-canvas-20261102
