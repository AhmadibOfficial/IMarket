# Flutter customer app
This directory contains the IMarket mobile app's Dart source. Generate Android/iOS platform files with `./scripts/bootstrap_mobile.sh` from the repository root. Flutter SDK is intentionally not vendored.

The bootstrap script adds Internet permission and cleartext HTTP access to the
Android **debug manifest only**, preserving existing manifest entries. iOS builds
require macOS/Xcode. The demo backend is not suitable for deployment.

IMK-003 buyer flow: log in with a provisioned synthetic buyer account, add catalog products, simulate cart checkout, refresh owned orders, and cancel reserved orders. Tokens, carts and retry keys remain in memory. Preserve the checkout key on uncertain failures and retry before starting another checkout. No real payments or customer details are supported. Merchant creation/publishing and fulfillment are available in the Next.js `/merchant` workspace. The API binds to host loopback; configure local device forwarding or run Flutter desktop against `--dart-define=API_URL=http://127.0.0.1:4000` where supported.

## Automated verification without a device

Preserve the existing Android scaffolding. From `apps/mobile`, run:

```sh
flutter pub get --offline
flutter analyze
flutter test
flutter build apk --debug
```

These checks require no emulator, ADB, installation or physical device. Use a
writable Flutter SDK/cache and Gradle cache; the APK build needs cached Android
and Gradle dependencies or permitted downloads. HTTP widget fixtures are
injected and use no live customers. See
[IMK008_VERIFICATION.md](../../docs/IMK008_VERIFICATION.md) for current results.
Product filters call the local API; countdowns are advisory and checkout always
asks the server to confirm eligibility.

## Optional future Android device acceptance (DEFERRED)

The historical procedure below is outside this automated milestone. No emulator
or physical device is required or used for the current continuation.


Use a workstation with writable Flutter stable SDK/cache, Android SDK and an
Android Virtual Device, Node 22+, Docker Compose and PostgreSQL client tools.
Allow local HTTP/database sockets. Run these commands from the repository root:

```sh
npm ci
docker compose up -d --wait postgres
export DATABASE_URL=postgres://imarket:local_only_change_me@127.0.0.1:5433/imarket
npm run db:migrate
npm run build -w @imarket/api
bash scripts/bootstrap_mobile.sh
flutter doctor -v
flutter emulators
flutter emulators --launch YOUR_AVD_ID
adb wait-for-device
adb reverse tcp:4000 tcp:4000
adb reverse --list
```

Provision two synthetic buyers and a synthetic merchant using the stdin-only
account tool in [AUTHENTICATION.md](../../docs/AUTHENTICATION.md). Use the web
merchant/admin review workflow for synthetic merchant inventory; never bypass
moderation. The seeded public catalog can be browsed without login. Start the
API and web in separate terminals with the same `DATABASE_URL`:

```sh
APP_DEMO_MODE=true npm run dev:api
```

```sh
npm run dev:web
```

Then run the app, explicitly routing Android localhost to host localhost through
ADB. This works with the API's loopback binding; no LAN binding is needed:

```sh
cd apps/mobile
flutter pub get
flutter analyze
flutter test
flutter run --debug --dart-define=API_URL=http://127.0.0.1:4000
```

If multiple devices are attached, use `adb -s SERIAL reverse ...` and
`flutter run -d SERIAL ...`. Reapply forwarding after restarting the emulator.
Verify `/health` in the emulator browser at `http://127.0.0.1:4000/health` before
debugging the app. No mock catalog fallback is provided.

Create a group in the merchant web workspace, copy its public ID, then join
with each buyer on web/Android. Duplicate joins must be rejected. Before the
deadline checkout creates no order; after the deadline a qualifying group
creates one owned simulated order per buyer, with repeat checkout returning the
same order. Minimum duration is one hour; expiry tests use an isolated database.
Check order details/history, cancellation and dispute submission. Use TalkBack,
200% text, a narrow emulator and web keyboard navigation to check labels,
focus order, status announcements, scrolling and reachable actions. Confirm
order history shows the persisted server total and cancellation/dispute actions
remain reachable with a long product name. These are
manual acceptance checks, not claims of completed device verification.

For mandatory database tests, create a separate disposable local database with a
name starting `imarket_test_`; set `IMARKET_TEST_DATABASE_URL` to that database
and run `npm run ci` from the root. Never use the app database for this target.
See [SOCIAL_SHOPPING.md](../../docs/SOCIAL_SHOPPING.md) for acceptance status.
