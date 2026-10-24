import 'dart:convert';
import 'dart:async';
import 'cart.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:http/http.dart' as http;

const apiUrl = String.fromEnvironment('API_URL', defaultValue: 'http://10.0.2.2:4000');
class ApiFailure implements Exception {
  final int status; final String message;
  ApiFailure(this.status,this.message);
  @override String toString()=>message;
}
const navy = Color(0xff102649);
const brightBlue = Color(0xff245af0);
const green = Color(0xff1e9d85);
void main() => runApp(const IMarketApp());

class IMarketApp extends StatelessWidget {
  const IMarketApp({super.key, this.client, this.now});
  final http.Client? client;
  final DateTime Function()? now;
  @override
  Widget build(BuildContext context) => MaterialApp(
    debugShowCheckedModeBanner: false,
    title: 'IMarket Demo',
    theme: ThemeData(useMaterial3: true, colorScheme: ColorScheme.fromSeed(seedColor: brightBlue), scaffoldBackgroundColor: const Color(0xfff8faff)),
    home: StoreScreen(client: client, now: now),
  );
}

class StoreScreen extends StatefulWidget {
  const StoreScreen({super.key, this.client, this.now});
  final http.Client? client;
  final DateTime Function()? now;
  @override
  State<StoreScreen> createState() => _StoreScreenState();
}
class _StoreScreenState extends State<StoreScreen> {
  List<Map<String, dynamic>> products = [];
  final search = TextEditingController(), category = TextEditingController();
  Timer? countdown;
  bool loading = true;
  bool busy = false;
  String token = '';
  String? checkoutKey;
  final alias = TextEditingController();
  final password = TextEditingController();
  final cart = ShoppingCart();
  late final http.Client client;
  List<dynamic> groups = [];
  final invitation = TextEditingController();
  List<dynamic> orders = [];
  List<dynamic> disputes = [];
  @override
  void dispose() { countdown?.cancel(); search.dispose(); category.dispose(); if(widget.client == null) client.close(); alias.dispose(); password.dispose(); invitation.dispose(); super.dispose(); }
  Future<dynamic> request(String path, [Map<String,dynamic>? body]) async {
    final headers = {'content-type':'application/json', if(token.isNotEmpty) 'authorization':'Bearer $token'};
    final uri = Uri.parse('$apiUrl$path');
    final r = await (body == null ? client.get(uri, headers:headers) : client.post(uri,headers:headers,body:jsonEncode(body))).timeout(const Duration(seconds:10));
    final data = jsonDecode(r.body);
    if(r.statusCode < 200 || r.statusCode >= 300) throw ApiFailure(r.statusCode,(data is Map ? data['message'] : 'Request rejected').toString());
    return data;
  }
  Future<void> action(Future<void> Function() work) async {
    setState(() {busy=true;});
    try {await work();} catch(e) {if(mounted) setState(() {note=e.toString();});}
    finally {if(mounted) setState(() {busy=false;});}
  }
  Future<void> refreshOrders() async {
    final result = await request('/api/orders');
    final protection = await request('/api/disputes');
    if(mounted) setState(() {orders=result as List;disputes=protection as List;});
  }
  Future<void> openDispute(String orderId) async {
    final reason=TextEditingController(), evidence=TextEditingController();
    final formKey=GlobalKey<FormState>();
    bool refund=false;
    final payload=await showDialog<Map<String,dynamic>>(context:context,builder:(dialogContext)=>StatefulBuilder(builder:(context,update)=>AlertDialog(
      title:const Text('Open a dispute'),
      content:SingleChildScrollView(child:Form(key:formKey,child:Column(mainAxisSize:MainAxisSize.min,children:[
        const Text('Synthetic text evidence only. Refund requests are records; no money moves.'),
        TextFormField(controller:reason,maxLength:2000,decoration:const InputDecoration(labelText:'Reason'),validator:(v)=>(v??'').trim().length<3?'Enter at least 3 characters':null),
        TextFormField(controller:evidence,maxLength:4000,maxLines:4,decoration:const InputDecoration(labelText:'Synthetic evidence'),validator:(v)=>(v??'').trim().length<3?'Enter at least 3 characters':null),
        CheckboxListTile(value:refund,onChanged:(v)=>update(()=>refund=v??false),title:const Text('Request refund review (record only)')),
      ]))),
      actions:[TextButton(onPressed:()=>Navigator.pop(dialogContext),child:const Text('Cancel')),FilledButton(onPressed:(){if(formKey.currentState!.validate())Navigator.pop(dialogContext,{'orderId':orderId,'reason':reason.text,'evidence':evidence.text,'refundRequested':refund});},child:const Text('Submit'))],
    )));
    // Dialog controllers may still be read during the route closing animation.
    await Future<void>.delayed(const Duration(milliseconds:300));
    reason.dispose(); evidence.dispose();
    if(payload!=null && mounted)await action(() async {await request('/api/disputes',payload);await refreshOrders();});
  }
  Future<void> orderDetails(String id) async {
    await action(() async {
      final detail=await request('/api/orders/$id');
      if(!mounted)return;
      await showDialog<void>(context:context,builder:(context)=>AlertDialog(title:Text(detail['name'].toString()),content:SingleChildScrollView(child:Text("${detail['description']}\n${detail['lifecycle']}\nCreated ${detail['created_at']}")),actions:[TextButton(onPressed:()=>Navigator.pop(context),child:const Text('Close'))]));
    });
  }
  String note = 'This app is a local demo. No real purchases or payment plans.';
  @override
  void initState() { super.initState(); client = widget.client ?? http.Client(); countdown=Timer.periodic(const Duration(seconds:1), (_) {if(mounted && groups.isNotEmpty)setState(() {});}); load(); }
  Future<void> load() async {
    await Future.wait([loadProducts(), loadGroups()]);
  }
  Future<void> loadProducts() async {
    try {
      final query=Uri(queryParameters:{if(search.text.isNotEmpty)'q':search.text,if(category.text.isNotEmpty)'category':category.text}).query;
      final result = await request('/api/products${query.isEmpty?'':'?$query'}');
      final catalog = (result as List).map((p) => Map<String,dynamic>.from(p as Map)).toList();
      if(mounted) setState(() {products = catalog; loading = false;});
    } catch (_) {
      if(mounted) setState(() {loading = false; note = 'Connect the local IMarket API and Postgres to load demo catalog.';});
    }
  }
  Future<void> loadGroups() async {
    try {
      final result = await request('/api/groups');
      if(mounted) setState(() {groups = result as List;});
    } catch (_) {
      if(mounted) setState(() {groups = []; note = 'Groups unavailable. Refresh to retry. Product browsing remains available.';});
    }
  }
  int remaining(String deadline) => ((DateTime.tryParse(deadline)?.difference(widget.now?.call() ?? DateTime.now()).inSeconds ?? 0).clamp(0, 604800));
  String ngn(num valueKobo) => '₦${(valueKobo / 100).toStringAsFixed(2)}';
  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(backgroundColor: Colors.white, title:const Text('iMarket', style:TextStyle(fontSize:24,fontWeight:FontWeight.w900,color:navy)), actions:[IconButton(tooltip:'Refresh catalog and groups',onPressed:load,icon:const Icon(Icons.refresh))]),
    body: RefreshIndicator(onRefresh:load,child:ListView(padding:const EdgeInsets.all(20),children:[
      Container(padding:const EdgeInsets.all(13),decoration:BoxDecoration(color:const Color(0xfffff4db),borderRadius:BorderRadius.circular(12)),child:const Text('🚧 DEVELOPMENT DEMO · No real orders, seller offers, or financing',style:TextStyle(fontSize:11,fontWeight:FontWeight.w800))),
      const SizedBox(height:20),
      Container(padding:const EdgeInsets.all(25),decoration:BoxDecoration(gradient:const LinearGradient(colors:[navy,Color(0xff24518a)]),borderRadius:BorderRadius.circular(22)),child:const Column(crossAxisAlignment:CrossAxisAlignment.start,children:[Text('SHOP SMARTER, TOGETHER',style:TextStyle(color:Color(0xffa3ebd9),fontSize:10,letterSpacing:1.5,fontWeight:FontWeight.w700)),SizedBox(height:12),Text('Better deals.\nStronger communities.',style:TextStyle(color:Colors.white,fontSize:30,fontWeight:FontWeight.w800)),SizedBox(height:12),Text('Discover a new way to shop and form buying teams.',style:TextStyle(color:Color(0xffd7e4fb),fontSize:13))])),
      if(token.isEmpty) ...[
        TextField(controller:alias,decoration:const InputDecoration(labelText:'Synthetic buyer alias')),
        TextField(controller:password,obscureText:true,decoration:const InputDecoration(labelText:'Password')),
        FilledButton(onPressed:busy?null:()=>action(() async {
          final session=await request('/api/auth/login',{'alias':alias.text,'password':password.text});
          password.clear(); if(!mounted)return;
          setState(() {token=session['accessToken'];}); await refreshOrders();
        }),child:const Text('Log in')),
      ] else FilledButton(onPressed:busy?null:()=>action(() async {
        try {await request('/api/auth/logout',{});} finally {if(mounted)setState(() {token='';orders=[];disputes=[];cart.clear();checkoutKey=null;});}
      }),child:const Text('Log out')),
      const Text('Shop together',style:TextStyle(fontSize:23,fontWeight:FontWeight.bold)),
      const Text('Share public group IDs only. Buyer login is required. Discounts apply after confirmation at the deadline. No payment is taken.'),
      TextField(controller:invitation,decoration:const InputDecoration(labelText:'Invitation group ID')),
      FilledButton(onPressed:busy||token.isEmpty?null:()=>action(() async {await request('/api/groups/${Uri.encodeComponent(invitation.text)}/join',{'demoAlias':alias.text});await load();}),child:const Text('Join invitation')),
      ...groups.map((g)=>Card(child:Padding(padding:const EdgeInsets.all(16),child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
        Text('${g['product_name']} · ${g['members']}/${g['min_members']} needed · capacity ${g['max_members']}'),
        Text('${g['state']} · ${ngn(num.parse(g['group_price_kobo'].toString()))} · ends ${g['expires_at']} · ${remaining(g['expires_at'].toString())} seconds remaining; server confirms eligibility'),
        Wrap(children:[
          TextButton(onPressed:busy||token.isEmpty?null:()=>action(() async {await request('/api/groups/${g['id']}/join',{'demoAlias':alias.text});await load();}),child:const Text('Join group')),
          TextButton(onPressed:busy?null:()=>action(() async {await Clipboard.setData(ClipboardData(text:g['id'].toString()));if(mounted)setState(() {note='Public invitation group ID copied.';});}),child:const Text('Copy invitation ID')),
          TextButton(onPressed:busy||token.isEmpty?null:()=>action(() async {final o=await request('/api/groups/${g['id']}/checkout',{});if(mounted)setState(() {note=o['id']!=null?'Simulated group order. No payment taken.':'Group is ${o['state']}; no order created.';});await refreshOrders();await load();}),child:const Text('Simulate group checkout / retry')),
        ]),
      ])))),
      Padding(padding:const EdgeInsets.symmetric(vertical:12),child:Semantics(liveRegion:true,child:Text(note))),
      Text('Cart: ${cart.count} items'),
      Text('Cart total: ${ngn(cart.total(products))}'),
      FilledButton(onPressed:busy||token.isEmpty||cart.isEmpty?null:()=>action(() async {
        checkoutKey ??= 'mobile_${DateTime.now().microsecondsSinceEpoch}';
        try {await request('/api/cart-checkout',{'items':cart.entries.map((e)=>{'productId':e.key,'quantity':e.value}).toList(),'idempotencyKey':checkoutKey});}
        on ApiFailure catch(e) {if(e.status==400||e.status==409)checkoutKey=null;rethrow;}
        if(mounted)setState(() {cart.clear();checkoutKey=null;note='Simulated reservation only. No payment taken.';});
        await refreshOrders(); await load();
      }),child:const Text('Simulate checkout / retry')),
      if(checkoutKey!=null) const Text('Cart locked for retry after a failure. Review orders before changing checkout.'),
      if(checkoutKey==null && cart.isNotEmpty) TextButton(onPressed:busy?null:()=>setState(cart.clear),child:const Text('Clear cart')),
      if(token.isNotEmpty) TextButton(onPressed:busy?null:()=>action(refreshOrders),child:const Text('Refresh orders')),
      ...orders.map((o)=>Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
        ListTile(onTap:busy?null:()=>orderDetails(o['id'].toString()),title:Text('${o['name']} × ${o['quantity']}'),subtitle:Text('${o['lifecycle']} · ${o['id']}\nServer total: ${ngn(num.parse(o['total_kobo'].toString()))}')),
        Wrap(children:[
          if(o['lifecycle']=='reserved') TextButton(onPressed:busy?null:()=>action(() async {await request('/api/demo-orders/${o['id']}/cancel',{});await refreshOrders();await load();}),child:const Text('Cancel')),
          TextButton(onPressed:busy||disputes.any((d)=>d['order_id']==o['id'])?null:()=>openDispute(o['id'].toString()),child:const Text('Open dispute')),
        ]),
      ])),
      ...disputes.map((d)=>ListTile(title:Text('Dispute: ${d['status']}'),subtitle:Text('${d['reason']} · ${d['evidence']} · ${d['response'] ?? 'Awaiting merchant response'} · ${d['resolution'] ?? 'Awaiting review'}'))),
      const SizedBox(height:22),const Text('Featured products',style:TextStyle(fontSize:23,fontWeight:FontWeight.bold,color:navy)),
      TextField(controller:search,maxLength:100,decoration:const InputDecoration(labelText:'Search products')),
      TextField(controller:category,maxLength:100,decoration:const InputDecoration(labelText:'Category')),
      TextButton(onPressed:busy?null:()=>action(loadProducts),child:const Text('Filter products')),
      if(loading) const Center(child:Padding(padding:EdgeInsets.all(30),child:CircularProgressIndicator())),
      if(!loading && products.isEmpty) const Card(child:Padding(padding:EdgeInsets.all(26),child:Text('No products found. Adjust filters or refresh the local API.'))),
      ...products.map((p)=>Card(margin:const EdgeInsets.symmetric(vertical:9),color:Colors.white,child:Padding(padding:const EdgeInsets.all(17),child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
         Text((p['category']??'Sample').toString().toUpperCase(),style:const TextStyle(color:brightBlue,fontSize:10,fontWeight:FontWeight.bold)),
         const SizedBox(height:8),Text(p['name']?.toString()??'Sample product',style:const TextStyle(fontSize:18,fontWeight:FontWeight.bold,color:navy)),
         const SizedBox(height:8),Text(p['description']?.toString()??'',style:const TextStyle(fontSize:11,color:Color(0xff687b92))),
         const SizedBox(height:15),Row(children:[Expanded(child:Text('Single: ${ngn(num.tryParse('${p['price_kobo']}')??0)}',style:const TextStyle(fontWeight:FontWeight.w600))),Expanded(child:Text('Team: ${ngn(num.tryParse('${p['group_price_kobo']}')??0)}',style:const TextStyle(fontWeight:FontWeight.w700,color:green)))]),
         const SizedBox(height:12),SizedBox(width:double.infinity,child:FilledButton(onPressed:busy||checkoutKey!=null||(cart[p['id']]??0)>=10||(cart[p['id']]??0)>=(p['stock_demo'] as num)?null:()=>setState(() {cart.add(p['id'] as String, stock: (p['stock_demo'] as num).toInt());}),child:Text('Add to cart: ${p['name']}'))),
         if ((cart[p['id']] ?? 0) > 0) TextButton(onPressed:busy||checkoutKey!=null?null:()=>setState(() {cart.removeOne(p['id'] as String);}),child:Text('Remove one: ${p['name']}')),
      ])))),
      const SizedBox(height:30)
    ])),
  );
}
