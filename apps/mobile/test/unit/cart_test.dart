import 'package:flutter_test/flutter_test.dart';
import 'package:imarket_customer/cart.dart';

void main() {
  test('quantities, kobo totals, removal and clearing', () {
    final cart = ShoppingCart();
    cart.add('a', stock: 3);
    cart.add('a', stock: 3);
    cart.add('b', stock: 1);
    expect(cart.count, 3);
    expect(cart.total([{'id': 'a', 'price_kobo': '12550'}, {'id': 'b', 'price_kobo': 99}]), 25199);
    cart.removeOne('a');
    expect(cart['a'], 1);
    cart.removeOne('b');
    cart.removeOne('missing');
    expect(cart['b'], isNull);
    cart.clear();
    expect(cart.isEmpty, isTrue);
  });
  test('rejects invalid IDs, unavailable stock and quantity limits', () {
    final cart = ShoppingCart();
    expect(cart.add(' ', stock: 2), isFalse);
    expect(cart.add('a', stock: -1), isFalse);
    expect(cart.add('a', stock: 0), isFalse);
    expect(cart.add('a', stock: 1), isTrue);
    expect(cart.add('a', stock: 1), isFalse);
    for (var i = 0; i < 10; i++) { cart.add('b', stock: 20); }
    expect(cart.add('b', stock: 20), isFalse);
    expect(cart['b'], 10);
    expect(cart.count, 11);
  });
}
