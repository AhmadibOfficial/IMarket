import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:imarket_customer/main.dart';

void main() {
  testWidgets('IMarket starts with synthetic safety notice and no mutations', (tester) async {
    final requests = <http.Request>[];
    final client = MockClient((request) async {
      requests.add(request);
      return http.Response('[]', 200);
    });
    addTearDown(client.close);
    await tester.pumpWidget(IMarketApp(client: client));
    await tester.pumpAndSettle();
    expect(find.text('iMarket'), findsOneWidget);
    expect(find.textContaining('DEVELOPMENT DEMO'), findsOneWidget);
    expect(requests.map((r) => r.url.path), unorderedEquals(['/api/products', '/api/groups']));
    expect(requests.every((r) => r.method == 'GET' && !r.headers.containsKey('authorization')), isTrue);
    expect(tester.takeException(), isNull);
  });
}
