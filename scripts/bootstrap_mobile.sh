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
# Generated Android apps need Internet permission and cleartext access for the
# loopback-only synthetic API. Keep both settings scoped to debug builds.
python3 - <<'PY'
from pathlib import Path
import xml.etree.ElementTree as ET

path = Path('apps/mobile/android/app/src/debug/AndroidManifest.xml')
path.parent.mkdir(parents=True, exist_ok=True)
namespace = 'http://schemas.android.com/apk/res/android'
ET.register_namespace('android', namespace)
root = ET.parse(path).getroot() if path.exists() else ET.Element('manifest')
permission = '{' + namespace + '}name'
if not any(node.get(permission) == 'android.permission.INTERNET' for node in root.findall('uses-permission')):
    ET.SubElement(root, 'uses-permission', {permission: 'android.permission.INTERNET'})
application = root.find('application')
if application is None:
    application = ET.SubElement(root, 'application')
application.set('{' + namespace + '}usesCleartextTraffic', 'true')
ET.ElementTree(root).write(path, encoding='unicode', xml_declaration=True)
PY
(cd apps/mobile && flutter pub get && flutter analyze)
echo 'Flutter project initialized. See apps/mobile/README.md for adb reverse and emulator instructions.'
