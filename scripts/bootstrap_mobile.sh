#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
command -v flutter >/dev/null || { echo 'Flutter SDK required'; exit 1; }
if [[ ! -d apps/mobile/android ]]; then
  tmpdir="$(mktemp -d)"
  trap 'rm -rf "$tmpdir"' EXIT
  flutter create --platforms=android,ios --project-name imarket_customer "$tmpdir/imarket_customer"
  cp -R "$tmpdir/imarket_customer/android" apps/mobile/android
  cp -R "$tmpdir/imarket_customer/ios" apps/mobile/ios
fi
(cd apps/mobile && flutter pub get && flutter analyze)
echo 'Flutter project initialized. Run from apps/mobile with flutter run --dart-define=API_URL=http://10.0.2.2:4000'
