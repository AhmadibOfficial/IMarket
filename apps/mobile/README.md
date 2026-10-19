# Flutter customer app
This directory contains the IMarket mobile app's Dart source. Generate Android/iOS platform files with `./scripts/bootstrap_mobile.sh` from the repository root. Flutter SDK is intentionally not vendored.

Android emulator command: `flutter run --dart-define=API_URL=http://10.0.2.2:4000` (development only). The NestJS local demo API must be running. iOS builds require macOS/Xcode. Cleartext HTTP may require a **debug-only** manifest override on Android; production must use HTTPS and the demo backend is not suitable for deployment.
