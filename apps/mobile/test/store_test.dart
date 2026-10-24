import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:imarket_customer/main.dart';

final product = {
  'id': 'p1',
  'name': 'Demo rice',
  'description': 'Synthetic description',
  'category': 'Food',
  'price_kobo': 12550,
  'group_price_kobo': 10001,
  'stock_demo': 2
};
final order = {
  'id': 'o1',
  'name': 'Demo rice',
  'quantity': 1,
  'total_kobo': '9001',
  'lifecycle': 'reserved',
  'description': 'Owned order details',
  'timeline': [
    {'id': 'event1', 'action': 'order.processing', 'created_at': '2026-01-02'}
  ],
  'created_at': '2026-01-01'
};

class Api {
  final requests = <http.Request>[];
  List<dynamic> products = [product], orders = [], disputes = [];
  int joinStatus = 200,
      checkoutStatus = 200,
      groupStatus = 200,
      readStatus = 200;
  List<dynamic> notices = [
    {
      'id': 'event1',
      'order_id': 'o1',
      'action': 'order.processing',
      'created_at': '2026-01-02',
      'read_at': null
    }
  ];
  Map<String, dynamic> settlement = {'id': 'o1'};
  Completer<http.Response>? pending;
  http.Response reply(dynamic body, [int status = 200]) =>
      http.Response(jsonEncode(body), status);
  late final client = MockClient((r) async {
    requests.add(r);
    switch (r.url.path) {
      case '/api/groups':
        return reply([
          {
            'id': 'g1',
            'product_name': 'Rice team',
            'members': 1,
            'min_members': 2,
            'max_members': 4,
            'state': 'open',
            'group_price_kobo': 9001,
            'expires_at': '2026-01-01T00:00:00Z'
          }
        ], groupStatus);
      case '/api/products':
        return pending == null ? reply(products) : await pending!.future;
      case '/api/auth/login':
        return reply({'accessToken': 'synthetic-token'});
      case '/api/auth/logout':
        return reply({});
      case '/api/notifications':
        return reply(notices);
      case '/api/notifications/event1/read':
        return reply({'id': 'event1', 'read_at': '2026-01-03'}, readStatus);
      case '/api/orders':
        return reply(orders);
      case '/api/orders/o1':
        return reply(order);
      case '/api/demo-orders/o1/cancel':
        orders = [
          {...order, 'lifecycle': 'cancelled'}
        ];
        return reply(
            {'id': 'o1', 'lifecycle': 'cancelled', 'paymentCaptured': false});
      case '/api/disputes':
        if (r.method == 'POST') {
          disputes = [
            {
              'status': 'open',
              'order_id': 'o1',
              ...jsonDecode(r.body) as Map<String, dynamic>
            }
          ];
        }
        return reply(disputes);
      case '/api/groups/g1/checkout':
        if (settlement['id'] != null) {
          orders = [order];
        }
        return reply(settlement);
      case '/api/cart-checkout':
        if (checkoutStatus != 200) {
          return reply({'message': 'Try again'}, checkoutStatus);
        }
        orders = [order];
        return reply([order]);
    }
    if (r.url.path.endsWith('/join')) {
      return reply(
          {'message': joinStatus == 404 ? 'Unknown group' : 'Group expired'},
          joinStatus);
    }
    throw StateError('Unexpected request ${r.method} ${r.url.path}');
  });
}

Future<void> start(WidgetTester t, Api a, {bool narrow = false}) async {
  if (!narrow) {
    t.view.physicalSize = const Size(1000, 3200);
    t.view.devicePixelRatio = 1;
    addTearDown(t.view.resetPhysicalSize);
    addTearDown(t.view.resetDevicePixelRatio);
  }
  await t.pumpWidget(IMarketApp(client: a.client));
  await t.pumpAndSettle();
}

Future<void> reveal(WidgetTester t, Finder finder) async {
  await t.pumpAndSettle();

  if (finder.evaluate().isEmpty) {
    // Identify the application's main ListView, not a dialog scrollable.
    final mainList = find.byType(ListView).first;

    final mainScrollable = find
        .descendant(
          of: mainList,
          matching: find.byType(Scrollable),
        )
        .first;

    final state = t.state<ScrollableState>(mainScrollable);

    // The requested widget may be ABOVE the previous scroll position.
    // Restart from the top before searching down the list.
    state.position.jumpTo(state.position.minScrollExtent);
    await t.pumpAndSettle();

    if (finder.evaluate().isEmpty) {
      await t.scrollUntilVisible(
        finder,
        180,
        scrollable: mainScrollable,
        maxScrolls: 60,
      );
    }
  }

  expect(
    finder,
    findsOneWidget,
    reason: 'Required accessible widget must exist.',
  );

  // Position the actual widget comfortably inside its viewport.
  await Scrollable.ensureVisible(
    t.element(finder),
    alignment: 0.3,
  );

  await t.pumpAndSettle();
}

Future<void> tap(WidgetTester t, String label) async {
  final finder = find.text(label);

  await reveal(t, finder);

  expect(
    finder,
    findsOneWidget,
    reason: 'Expected accessible action: $label',
  );

  await t.tap(finder);
  await t.pumpAndSettle();
}

Future<void> login(WidgetTester t) async {
  await reveal(t, find.widgetWithText(TextField, 'Synthetic buyer alias'));
  await t.enterText(
      find.widgetWithText(TextField, 'Synthetic buyer alias'), 'buyer_demo');
  await reveal(t, find.widgetWithText(TextField, 'Password'));
  await t.enterText(
      find.widgetWithText(TextField, 'Password'), 'synthetic-password');
  await tap(t, 'Log in');
}

void main() {
  testWidgets(
      'private notifications and owned timeline use authenticated requests',
      (t) async {
    final a = Api();
    a.orders = [order];
    await start(t, a);
    expect(find.text('Private notifications'), findsNothing);
    await login(t);
    await tap(t, 'Private notifications');
    expect(find.text('order.processing · Order o1'), findsOneWidget);
    await tap(t, 'Mark read');
    final read = a.requests
        .lastWhere((r) => r.url.path == '/api/notifications/event1/read');
    expect(read.method, 'POST');
    expect(read.headers['authorization'], 'Bearer synthetic-token');
    expect(find.text('Read'), findsOneWidget);
    await tap(t, 'Close');
    await tap(t, 'Demo rice × 1');
    expect(
        find.textContaining('order.processing · 2026-01-02'), findsOneWidget);
    await tap(t, 'Close');
    expect(t.takeException(), isNull);
    await t.pumpWidget(const SizedBox());
  });
  testWidgets(
      'notification read failures retain unread activity and support retry',
      (t) async {
    final a = Api();
    a.readStatus = 503;
    await start(t, a);
    await login(t);
    await tap(t, 'Private notifications');
    await tap(t, 'Mark read');
    expect(find.text('Unable to mark notification read. Please retry.'),
        findsOneWidget);
    expect(find.text('Mark read'), findsOneWidget);
    a.readStatus = 200;
    await tap(t, 'Mark read');
    expect(find.text('Read'), findsOneWidget);
    expect(find.text('Mark read'), findsNothing);
    await tap(t, 'Close');
    expect(t.takeException(), isNull);
  });
  testWidgets('empty private notification center can close without a mutation',
      (t) async {
    final a = Api();
    a.notices = [];
    await start(t, a);
    await login(t);
    await tap(t, 'Private notifications');
    expect(find.text('No recorded activity.'), findsOneWidget);
    expect(find.text('Mark read'), findsNothing);
    await tap(t, 'Close');
    expect(a.requests.where((r) => r.url.path.endsWith('/read')), isEmpty);
    expect(t.takeException(), isNull);
  });
  testWidgets('startup lists inline details and guards anonymous mutations',
      (t) async {
    final a = Api();
    await start(t, a);
    expect(find.text('iMarket'), findsOneWidget);
    expect(find.text('Synthetic description'), findsOneWidget);
    expect(find.text('Single: ₦125.50'), findsOneWidget);
    expect(find.text('Team: ₦100.01'), findsOneWidget);
    expect(
        t
            .widget<FilledButton>(
                find.widgetWithText(FilledButton, 'Join invitation'))
            .onPressed,
        isNull);
    expect(
        t
            .widget<FilledButton>(
                find.widgetWithText(FilledButton, 'Simulate checkout / retry'))
            .onPressed,
        isNull);
    expect(a.requests.every((r) => r.method == 'GET'), isTrue);
  });
  testWidgets('cart stock limit, quantity, totals, removal and clear',
      (t) async {
    await start(t, Api());
    await tap(t, 'Add to cart: Demo rice');
    await tap(t, 'Add to cart: Demo rice');
    expect(find.text('Cart: 2 items'), findsOneWidget);
    expect(find.text('Cart total: ₦251.00'), findsOneWidget);
    expect(
        t
            .widget<FilledButton>(
                find.widgetWithText(FilledButton, 'Add to cart: Demo rice'))
            .onPressed,
        isNull);
    await tap(t, 'Remove one: Demo rice');
    expect(find.text('Cart total: ₦125.50'), findsOneWidget);
    await tap(t, 'Clear cart');
    expect(find.text('Cart: 0 items'), findsOneWidget);
  });
  testWidgets('invitation and group joining send authenticated alias only',
      (t) async {
    final a = Api();
    await start(t, a);
    await login(t);
    await t.enterText(
        find.widgetWithText(TextField, 'Invitation group ID'), 'g1');
    await tap(t, 'Join invitation');
    await tap(t, 'Join group');
    final joins =
        a.requests.where((r) => r.url.path.endsWith('/join')).toList();
    expect(joins.length, 2);
    for (final r in joins) {
      expect(r.headers['authorization'], 'Bearer synthetic-token');
      expect(jsonDecode(r.body), {'demoAlias': 'buyer_demo'});
    }
  });
  for (final status in [404, 409]) {
    testWidgets('invalid or expired group reports rejection $status',
        (t) async {
      final a = Api()..joinStatus = status;
      await start(t, a);
      await login(t);
      await t.enterText(
          find.widgetWithText(TextField, 'Invitation group ID'), 'invalid');
      await tap(t, 'Join invitation');
      expect(find.text(status == 404 ? 'Unknown group' : 'Group expired'),
          findsOneWidget);
      expect(find.text('Demo rice × 1'), findsNothing);
    });
  }
  testWidgets(
      'group checkout displays server price and sends no client discount',
      (t) async {
    final a = Api();
    await start(t, a);
    await login(t);
    expect(find.textContaining('₦90.01'), findsOneWidget);
    await tap(t, 'Simulate group checkout / retry');
    final r = a.requests.singleWhere((r) => r.url.path.endsWith('/checkout'));
    expect(jsonDecode(r.body), isEmpty);
    expect(r.headers['authorization'], 'Bearer synthetic-token');
    expect(
        find.text('Simulated group order. No payment taken.'), findsOneWidget);
    expect(find.text('Demo rice × 1'), findsOneWidget);
    expect(find.textContaining('Server total: ₦90.01'), findsOneWidget);
  });
  testWidgets('failed settlement creates no order', (t) async {
    final a = Api()..settlement = {'state': 'failed'};
    await start(t, a);
    await login(t);
    await tap(t, 'Simulate group checkout / retry');
    expect(find.text('Group is failed; no order created.'), findsOneWidget);
    expect(find.text('Demo rice × 1'), findsNothing);
  });
  testWidgets(
      'checkout quantities, history, order detail navigation and logout',
      (t) async {
    final a = Api();
    await start(t, a);
    await login(t);
    await tap(t, 'Add to cart: Demo rice');
    await tap(t, 'Simulate checkout / retry');
    final body = jsonDecode(a.requests
        .singleWhere((r) => r.url.path == '/api/cart-checkout')
        .body) as Map;
    expect(body.keys, unorderedEquals(['items', 'idempotencyKey']));
    expect(body['items'], [
      {'productId': 'p1', 'quantity': 1}
    ]);
    expect(find.text('Cart: 0 items'), findsOneWidget);
    await tap(t, 'Demo rice × 1');
    expect(find.textContaining('Owned order details'), findsOneWidget);
    await tap(t, 'Close');
    expect(find.byType(AlertDialog), findsNothing);
    await tap(t, 'Log out');
    expect(find.text('Demo rice × 1'), findsNothing);
  });
  testWidgets('ambiguous checkout error locks cart and retries same key',
      (t) async {
    final a = Api()..checkoutStatus = 500;
    await start(t, a);
    await login(t);
    await tap(t, 'Add to cart: Demo rice');
    await tap(t, 'Simulate checkout / retry');
    expect(find.text('Try again'), findsOneWidget);
    expect(
        t
            .widget<FilledButton>(
                find.widgetWithText(FilledButton, 'Add to cart: Demo rice'))
            .onPressed,
        isNull);
    a.checkoutStatus = 200;
    await tap(t, 'Simulate checkout / retry');
    final bodies = a.requests
        .where((r) => r.url.path == '/api/cart-checkout')
        .map((r) => jsonDecode(r.body))
        .toList();
    expect(bodies.length, 2);
    expect(bodies[0], bodies[1]);
  });
  testWidgets(
      'owned order cancellation refreshes history with no payment request',
      (t) async {
    final a = Api()..orders = [order];
    await start(t, a);
    await login(t);
    await tap(t, 'Cancel');
    final cancellation = a.requests
        .singleWhere((r) => r.url.path == '/api/demo-orders/o1/cancel');
    expect(cancellation.method, 'POST');
    expect(cancellation.headers['authorization'], 'Bearer synthetic-token');
    expect(jsonDecode(cancellation.body), isEmpty);
    expect(find.textContaining('cancelled · o1'), findsOneWidget);
    expect(find.textContaining('Server total: ₦90.01'), findsOneWidget);
    expect(find.widgetWithText(TextButton, 'Cancel'), findsNothing);
    expect(t.takeException(), isNull);
  });
  testWidgets(
      'dispute navigation validates evidence and submits record-only request',
      (t) async {
    final a = Api()..orders = [order];
    await start(t, a);
    await login(t);
    await tap(t, 'Open dispute');
    await tap(t, 'Submit');
    expect(find.text('Enter at least 3 characters'), findsNWidgets(2));
    expect(
        a.requests
            .where((r) => r.method == 'POST' && r.url.path == '/api/disputes'),
        isEmpty);
    await t.enterText(
        find.widgetWithText(TextFormField, 'Reason'), 'Demo damage');
    await t.enterText(find.widgetWithText(TextFormField, 'Synthetic evidence'),
        'Synthetic text');
    await tap(t, 'Request refund review (record only)');
    await tap(t, 'Submit');
    expect(
        jsonDecode(a.requests
            .singleWhere(
                (r) => r.method == 'POST' && r.url.path == '/api/disputes')
            .body),
        {
          'orderId': 'o1',
          'reason': 'Demo damage',
          'evidence': 'Synthetic text',
          'refundRequested': true
        });
    expect(find.text('Dispute: open'), findsOneWidget);
    expect(
        t
            .widget<TextButton>(find.widgetWithText(TextButton, 'Open dispute'))
            .onPressed,
        isNull);
    expect(t.takeException(), isNull);
  });
  testWidgets('owned order actions remain reachable at 200 percent text',
      (t) async {
    t.view.physicalSize = const Size(320, 740);
    t.view.devicePixelRatio = 1;
    addTearDown(t.view.resetPhysicalSize);
    addTearDown(t.view.resetDevicePixelRatio);
    t.platformDispatcher.textScaleFactorTestValue = 2;
    addTearDown(t.platformDispatcher.clearTextScaleFactorTestValue);
    final a = Api()
      ..orders = [
        {...order, 'name': 'Synthetic long product name for narrow screens'}
      ];
    await start(t, a, narrow: true);
    await login(t);
    await tap(t, 'Cancel');
    expect(a.requests.where((r) => r.url.path == '/api/demo-orders/o1/cancel'),
        hasLength(1));
    await tap(t, 'Open dispute');
    expect(find.byType(AlertDialog), findsOneWidget);
    expect(t.takeException(), isNull);
    await tap(t, 'Cancel');
  });
  testWidgets('loading transitions to empty catalog', (t) async {
    final a = Api()
      ..pending = Completer<http.Response>()
      ..products = [];
    t.view.physicalSize = const Size(1000, 3200);
    t.view.devicePixelRatio = 1;
    addTearDown(t.view.resetPhysicalSize);
    addTearDown(t.view.resetDevicePixelRatio);
    await t.pumpWidget(IMarketApp(client: a.client));
    await t.pump();
    expect(find.byType(CircularProgressIndicator), findsOneWidget);
    a.pending!.complete(a.reply([]));
    await t.pumpAndSettle();
    expect(find.byType(CircularProgressIndicator), findsNothing);
    expect(
        find.text(
            'No products found. Adjust filters or refresh the local API.'),
        findsOneWidget);
  });
  testWidgets('group failure preserves catalog and recovers through refresh',
      (t) async {
    final a = Api()..groupStatus = 503;
    await start(t, a);
    expect(find.text('Demo rice'), findsOneWidget);
    expect(find.textContaining('Groups unavailable.'), findsOneWidget);
    expect(find.textContaining('Rice team'), findsNothing);
    await tap(t, 'Add to cart: Demo rice');
    expect(find.text('Cart: 1 items'), findsOneWidget);
    a.groupStatus = 200;
    await t.tap(find.byTooltip('Refresh catalog and groups'));
    await t.pumpAndSettle();
    expect(find.textContaining('Rice team'), findsOneWidget);
  });
  testWidgets('catalog failure recovers through refresh', (t) async {
    final a = Api()..pending = Completer<http.Response>();
    t.view.physicalSize = const Size(1000, 3200);
    t.view.devicePixelRatio = 1;
    addTearDown(t.view.resetPhysicalSize);
    addTearDown(t.view.resetDevicePixelRatio);
    await t.pumpWidget(IMarketApp(client: a.client));
    await t.pump();
    a.pending!.complete(a.reply({'message': 'Unavailable'}, 503));
    await t.pumpAndSettle();
    expect(
        find.text(
            'Connect the local IMarket API and Postgres to load demo catalog.'),
        findsOneWidget);
    a.pending = null;
    await t.tap(find.byTooltip('Refresh catalog and groups'));
    await t.pumpAndSettle();
    expect(find.text('Demo rice'), findsOneWidget);
  });
  testWidgets(
      'accessible labels and live status at narrow width with enlarged text',
      (t) async {
    t.view.physicalSize = const Size(320, 740);
    t.view.devicePixelRatio = 1;
    addTearDown(t.view.resetPhysicalSize);
    addTearDown(t.view.resetDevicePixelRatio);
    t.platformDispatcher.textScaleFactorTestValue = 1.5;
    addTearDown(t.platformDispatcher.clearTextScaleFactorTestValue);
    final semantics = t.ensureSemantics();
    // Semantics are disposed explicitly at test completion.
    await start(t, Api(), narrow: true);
    await reveal(t, find.widgetWithText(TextField, 'Synthetic buyer alias'));
    expect(find.bySemanticsLabel('Synthetic buyer alias'), findsOneWidget);
    expect(find.byTooltip('Refresh catalog and groups'), findsOneWidget);
    await reveal(
        t,
        find.text(
            'This app is a local demo. No real purchases or payment plans.'));
    expect(
        t
            .widgetList<Semantics>(find.byType(Semantics))
            .any((s) => s.properties.liveRegion == true),
        isTrue);
    await tap(t, 'Add to cart: Demo rice');
    await reveal(t, find.text('Cart: 1 items'));
    expect(find.text('Cart: 1 items'), findsOneWidget);
    expect(t.takeException(), isNull);
    semantics.dispose();
  });
  testWidgets('catalog filters reach the API with encoded literal values',
      (t) async {
    final a = Api();
    await start(t, a);
    final search = find.widgetWithText(TextField, 'Search products');
    await reveal(t, search);
    await t.enterText(search, 'rice & beans');
    final category = find.widgetWithText(TextField, 'Category');
    await reveal(t, category);
    await t.enterText(category, 'Food');
    await tap(t, 'Filter products');
    final request = a.requests.lastWhere((r) => r.url.path == '/api/products');
    expect(
        request.url.queryParameters, {'q': 'rice & beans', 'category': 'Food'});
    expect(request.method, 'GET');
    expect(t.takeException(), isNull);
  });
  testWidgets('countdown uses injected time and never authorizes checkout',
      (t) async {
    final a = Api();
    t.view.physicalSize = const Size(1000, 3200);
    t.view.devicePixelRatio = 1;
    addTearDown(t.view.resetPhysicalSize);
    addTearDown(t.view.resetDevicePixelRatio);
    await t.pumpWidget(IMarketApp(
        client: a.client, now: () => DateTime.utc(2025, 12, 31, 23, 59, 30)));
    await t.pumpAndSettle();
    expect(find.textContaining('30 seconds remaining'), findsOneWidget);
    expect(a.requests.every((r) => r.method == 'GET'), isTrue);
    await t.pumpWidget(const SizedBox());
  });
}
