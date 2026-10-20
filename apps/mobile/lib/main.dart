import 'dart:convert';
import 'package:flutter/material.dart';
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
  const IMarketApp({super.key});
  @override
  Widget build(BuildContext context) => MaterialApp(
    debugShowCheckedModeBanner: false,
    title: 'IMarket Demo',
    theme: ThemeData(useMaterial3: true, colorScheme: ColorScheme.fromSeed(seedColor: brightBlue), scaffoldBackgroundColor: const Color(0xfff8faff)),
    home: const StoreScreen(),
  );
}

class StoreScreen extends StatefulWidget {
  const StoreScreen({super.key});
  @override
  State<StoreScreen> createState() => _StoreScreenState();
}
class _StoreScreenState extends State<StoreScreen> {
  List<Map<String, dynamic>> products = [];
  bool loading = true;
  bool busy = false;
  String token = '';
  String? checkoutKey;
  final alias = TextEditingController();
  final password = TextEditingController();
  final Map<String,int> cart = {};
  List<dynamic> orders = [];
  List<dynamic> disputes = [];
  @override
  void dispose() { alias.dispose(); password.dispose(); super.dispose(); }
  Future<dynamic> request(String path, [Map<String,dynamic>? body]) async {
    final headers = {'content-type':'application/json', if(token.isNotEmpty) 'authorization':'Bearer $token'};
    final uri = Uri.parse('$apiUrl$path');
    final r = await (body == null ? http.get(uri, headers:headers) : http.post(uri,headers:headers,body:jsonEncode(body))).timeout(const Duration(seconds:10));
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
  void initState() { super.initState(); load(); }
  Future<void> load() async {
    try {
      final r = await http.get(Uri.parse('$apiUrl/api/products')).timeout(const Duration(seconds: 5));
      if (r.statusCode != 200) throw Exception('Local API not ready');
      if (!mounted) return;
      setState(() { products = (jsonDecode(r.body) as List).map((p) => Map<String,dynamic>.from(p as Map)).toList(); loading = false; note = 'Sample listings only · no verified sellers'; });
    } catch (_) {
      if (!mounted) return;
      setState(() {loading = false; note = 'Connect the local IMarket API and Postgres to load demo catalog.';});
    }
  }
  String ngn(num valueKobo) => '₦${(valueKobo / 100).toStringAsFixed(0)}';
  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(backgroundColor: Colors.white, title:const Text('iMarket', style:TextStyle(fontSize:24,fontWeight:FontWeight.w900,color:navy)), actions:[IconButton(onPressed:load,icon:const Icon(Icons.refresh))]),
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
      Text('Cart: ${cart.values.fold<int>(0,(a,b)=>a+b)} items'),
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
      ...orders.map((o)=>Column(crossAxisAlignment:CrossAxisAlignment.start,children:[ListTile(onTap:busy?null:()=>orderDetails(o['id'].toString()),title:Text('${o['name']} × ${o['quantity']}'),subtitle:Text('${o['lifecycle']} · ${o['id']}'),trailing:o['lifecycle']=='reserved'?TextButton(onPressed:busy?null:()=>action(() async {await request('/api/demo-orders/${o['id']}/cancel',{});await refreshOrders();await load();}),child:const Text('Cancel')):null),TextButton(onPressed:busy||disputes.any((d)=>d['order_id']==o['id'])?null:()=>openDispute(o['id'].toString()),child:const Text('Open dispute'))])),
      ...disputes.map((d)=>ListTile(title:Text('Dispute: ${d['status']}'),subtitle:Text('${d['reason']} · ${d['evidence']} · ${d['response'] ?? 'Awaiting merchant response'} · ${d['resolution'] ?? 'Awaiting review'}'))),
      const SizedBox(height:22),const Text('Featured products',style:TextStyle(fontSize:23,fontWeight:FontWeight.bold,color:navy)),
      Padding(padding:const EdgeInsets.symmetric(vertical:12),child:Text(note,style:const TextStyle(color:Color(0xff64758c),fontSize:12))),
      if(loading) const Center(child:Padding(padding:EdgeInsets.all(30),child:CircularProgressIndicator())),
      if(!loading && products.isEmpty) const Card(child:Padding(padding:EdgeInsets.all(26),child:Text('Demo catalog unavailable. Start the API and reload.'))),
      ...products.map((p)=>Card(margin:const EdgeInsets.symmetric(vertical:9),color:Colors.white,child:Padding(padding:const EdgeInsets.all(17),child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
         Text((p['category']??'Sample').toString().toUpperCase(),style:const TextStyle(color:brightBlue,fontSize:10,fontWeight:FontWeight.bold)),
         const SizedBox(height:8),Text(p['name']?.toString()??'Sample product',style:const TextStyle(fontSize:18,fontWeight:FontWeight.bold,color:navy)),
         const SizedBox(height:8),Text(p['description']?.toString()??'',style:const TextStyle(fontSize:11,color:Color(0xff687b92))),
         const SizedBox(height:15),Row(children:[Expanded(child:Text('Single: ${ngn(num.tryParse('${p['price_kobo']}')??0)}',style:const TextStyle(fontWeight:FontWeight.w600))),Expanded(child:Text('Team: ${ngn(num.tryParse('${p['group_price_kobo']}')??0)}',style:const TextStyle(fontWeight:FontWeight.w700,color:green)))]),
         const SizedBox(height:12),SizedBox(width:double.infinity,child:FilledButton(onPressed:busy||checkoutKey!=null||(cart[p['id']]??0)>=10?null:()=>setState(() {cart[p['id'] as String]=(cart[p['id']]??0)+1;}),child:const Text('Add to cart'))),
      ])))),
      const SizedBox(height:30)
    ])),
  );
}
