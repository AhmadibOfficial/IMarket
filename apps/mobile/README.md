# Flutter customer app
This directory contains the IMarket mobile app's Dart source. Generate Android/iOS platform files with `./scripts/bootstrap_mobile.sh` from the repository root. Flutter SDK is intentionally not vendored.

Android emulator command: `flutter run --dart-define=API_URL=http://10.0.2.2:4000` (development only). The NestJS local demo API must be running. iOS builds require macOS/Xcode. Cleartext HTTP may require a **debug-only** manifest override on Android; production must use HTTPS and the demo backend is not suitable for deployment.

IMK-003 buyer flow: log in with a provisioned synthetic buyer account, add catalog products, simulate cart checkout, refresh owned orders, and cancel reserved orders. Tokens, carts and retry keys remain in memory. Preserve the checkout key on uncertain failures and retry before starting another checkout. No real payments or customer details are supported. Merchant creation/publishing and fulfillment are available in the Next.js `/merchant` workspace. The API binds to host loopback; configure local device forwarding or run Flutter desktop against `--dart-define=API_URL=http://127.0.0.1:4000` where supported.
