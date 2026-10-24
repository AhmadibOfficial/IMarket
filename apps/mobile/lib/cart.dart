/// Local display quantities only; the API validates stock and checkout prices.
class ShoppingCart {
  final Map<String, int> _items = {};
  int? operator [](Object? id) => _items[id];
  Iterable<MapEntry<String, int>> get entries => _items.entries;
  bool get isEmpty => _items.isEmpty;
  bool get isNotEmpty => _items.isNotEmpty;
  int get count => _items.values.fold(0, (sum, quantity) => sum + quantity);

  bool add(String id, {required int stock}) {
    final quantity = _items[id] ?? 0;
    if (id.trim().isEmpty || stock < 1 || quantity >= stock || quantity >= 10) {
      return false;
    }
    _items[id] = quantity + 1;
    return true;
  }

  void removeOne(String id) {
    final quantity = _items[id] ?? 0;
    if (quantity <= 1) {
      _items.remove(id);
    } else {
      _items[id] = quantity - 1;
    }
  }

  num total(List<Map<String, dynamic>> products) => products.fold<num>(
      0, (sum, product) => sum +
          (num.tryParse('${product['price_kobo']}') ?? 0) *
              (_items[product['id']] ?? 0));
  void clear() => _items.clear();
}
