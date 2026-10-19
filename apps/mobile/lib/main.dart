import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;

const apiUrl = String.fromEnvironment('API_URL', defaultValue: 'http://10.0.2.2:4000');
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
  Future<void> createGroup(Map<String,dynamic> p) async {
    try {
      final r = await http.post(Uri.parse('$apiUrl/api/groups'), headers:{'content-type':'application/json'}, body:jsonEncode({'productId':p['id'],'minMembers':2,'maxMembers':5,'durationHours':24})).timeout(const Duration(seconds: 5));
      if (r.statusCode < 200 || r.statusCode >= 300) throw Exception('Demo group could not be created');
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content:Text('Local demo team created. No payment was taken.')));
    } catch (_) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content:Text('Local API not available. No transaction occurred.')));
    }
  }
  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(backgroundColor: Colors.white, title:const Text('iMarket', style:TextStyle(fontSize:24,fontWeight:FontWeight.w900,color:navy)), actions:[IconButton(onPressed:load,icon:const Icon(Icons.refresh))]),
    body: RefreshIndicator(onRefresh:load,child:ListView(padding:const EdgeInsets.all(20),children:[
      Container(padding:const EdgeInsets.all(13),decoration:BoxDecoration(color:const Color(0xfffff4db),borderRadius:BorderRadius.circular(12)),child:const Text('🚧 DEVELOPMENT DEMO · No real orders, seller offers, or financing',style:TextStyle(fontSize:11,fontWeight:FontWeight.w800))),
      const SizedBox(height:20),
      Container(padding:const EdgeInsets.all(25),decoration:BoxDecoration(gradient:const LinearGradient(colors:[navy,Color(0xff24518a)]),borderRadius:BorderRadius.circular(22)),child:const Column(crossAxisAlignment:CrossAxisAlignment.start,children:[Text('SHOP SMARTER, TOGETHER',style:TextStyle(color:Color(0xffa3ebd9),fontSize:10,letterSpacing:1.5,fontWeight:FontWeight.w700)),SizedBox(height:12),Text('Better deals.\nStronger communities.',style:TextStyle(color:Colors.white,fontSize:30,fontWeight:FontWeight.w800)),SizedBox(height:12),Text('Discover a new way to shop and form buying teams.',style:TextStyle(color:Color(0xffd7e4fb),fontSize:13))])),
      const SizedBox(height:22),const Text('Featured products',style:TextStyle(fontSize:23,fontWeight:FontWeight.bold,color:navy)),
      Padding(padding:const EdgeInsets.symmetric(vertical:12),child:Text(note,style:const TextStyle(color:Color(0xff64758c),fontSize:12))),
      if(loading) const Center(child:Padding(padding:EdgeInsets.all(30),child:CircularProgressIndicator())),
      if(!loading && products.isEmpty) const Card(child:Padding(padding:EdgeInsets.all(26),child:Text('Demo catalog unavailable. Start the API and reload.'))),
      ...products.map((p)=>Card(margin:const EdgeInsets.symmetric(vertical:9),color:Colors.white,child:Padding(padding:const EdgeInsets.all(17),child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
         Text((p['category']??'Sample').toString().toUpperCase(),style:const TextStyle(color:brightBlue,fontSize:10,fontWeight:FontWeight.bold)),
         const SizedBox(height:8),Text(p['name']?.toString()??'Sample product',style:const TextStyle(fontSize:18,fontWeight:FontWeight.bold,color:navy)),
         const SizedBox(height:8),Text(p['description']?.toString()??'',style:const TextStyle(fontSize:11,color:Color(0xff687b92))),
         const SizedBox(height:15),Row(children:[Expanded(child:Text('Single: ${ngn(num.tryParse('${p['price_kobo']}')??0)}',style:const TextStyle(fontWeight:FontWeight.w600))),Expanded(child:Text('Team: ${ngn(num.tryParse('${p['group_price_kobo']}')??0)}',style:const TextStyle(fontWeight:FontWeight.w700,color:green)))]),
         const SizedBox(height:12),SizedBox(width:double.infinity,child:FilledButton(onPressed:()=>createGroup(p),child:const Text('Create demo shopping team'))),
      ])))),
      const SizedBox(height:30)
    ])),
  );
}
