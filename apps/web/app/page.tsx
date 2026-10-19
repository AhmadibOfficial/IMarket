'use client';
import {useEffect,useMemo,useState} from 'react';

type Product = {id:string;slug:string;name:string;category:string;description:string;price_kobo:number;group_price_kobo:number;stock_demo:number};
type Campaign={id:string;product_id:string;product_name?:string;min_members:number;max_members:number;members:number;state:string;expires_at:string};
const API = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:4000';
const fmt=(kobo:number)=>new Intl.NumberFormat('en-NG',{style:'currency',currency:'NGN',maximumFractionDigits:0}).format(kobo/100);
const categoryEmoji=(s:string)=>s==='Electronics'?'🔋':s==='Groceries'?'🌾':'🧵';
export default function Storefront(){
 const [products,setProducts]=useState<Product[]>([]);
 const [groups,setGroups]=useState<Campaign[]>([]);
 const [message,setMessage]=useState('Connect the local API to load the demo catalog.');
 const [alias,setAlias]=useState('tester01');
 const [busy,setBusy]=useState(false);
 const [filter,setFilter]=useState('All');
 const [search,setSearch]=useState('');
 const categories=['All','Electronics','Groceries','Home & Business'];
 async function refresh(){
  try{
   const [pr,gr]=await Promise.all([fetch(`${API}/api/products`,{cache:'no-store'}),fetch(`${API}/api/groups`,{cache:'no-store'})]);
   if(!pr.ok||!gr.ok) throw new Error('API unavailable');
   setProducts(await pr.json()); setGroups(await gr.json());
   setMessage('Connected to local demo API. All prices are sample values.');
  }catch{setMessage('Offline preview: Start the local API and database to access demo products and group deals.');}
 }
 useEffect(()=>{void refresh()},[]);
 const shown=useMemo(()=>products.filter(p=>(filter==='All'||p.category===filter)&&`${p.name} ${p.category}`.toLowerCase().includes(search.toLowerCase())),[products,filter,search]);
 async function act(path:string, body:Record<string,unknown>){
  setBusy(true);
  try{
   const r=await fetch(`${API}${path}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
   const data=await r.json();
   if(!r.ok) throw new Error(typeof data.message==='string'?data.message:'Demo operation rejected');
   setMessage(path.includes('checkout')?`Demo order ${data.id.slice(0,8)} created. No payment taken.`:path.endsWith('/join')?`Joined demo group. State: ${data.state}`:`Demo team created: ${data.id.slice(0,8)}. Join it below.`);
   await refreshGroups();
  }catch(e){setMessage(e instanceof Error?e.message:'Demo API error')}finally{setBusy(false)}
 }
 async function refreshGroups(){try{const r=await fetch(`${API}/api/groups`,{cache:'no-store'});if(r.ok)setGroups(await r.json())}catch{}}
 return <>
  <div className="top-notice">🚧 IMK-001 LOCAL DEMO — No real orders, payments, lending, discounts or verified sellers</div>
  <header className="nav shell"><a href="/" className="brand"><span className="brandmark">i</span><span>Market<small>SHOP SMARTER, TOGETHER</small></span></a>
   <nav><a href="#shop">Explore</a><a href="#teams">Group deals</a><a href="/merchant">Sell on IMarket</a><a href="/admin">Operations</a></nav>
   <a href="#shop" className="button small">Browse products ↗</a>
  </header>
  <main>
   <section className="hero"><div className="shell hero-layout"><div className="hero-copy"><div className="eyebrow">THE FUTURE OF COMMUNITY COMMERCE · NIGERIA FIRST</div><h1>Shop better.<br/><em>Save together.</em></h1><p>Discover useful products, start a shopping team, and explore what transparent group discounts could look like. Designed for local communities and merchants.</p><div className="actions"><a href="#shop" className="button primary">Explore the marketplace →</a><a href="#teams" className="button outline">How group buying works</a></div><div className="hero-stats"><span>01 <small>Find products</small></span><span>02 <small>Form a team</small></span><span>03 <small>Unlock offers*</small></span></div></div>
   <div className="hero-art"><span className="float float-top">✨ Shopping works better together</span><div className="deal-card"><div className="deal-icon">🛍️</div><div className="deal-caption">GROUP SHOPPING · CONCEPT</div><h3>A better deal starts with a team.</h3><p>Choose a product, invite your community, and reach the seller&apos;s group threshold.</p><div className="progress"><div/></div><span className="deal-meta">GROUP MILESTONE EXAMPLE</span></div><span className="float float-bottom">✔ Transparent prices &amp; thresholds</span></div></div></section>
   <section className="advantages shell"><div><strong>✓ Seller-funded discounts</strong><span>No invented savings claims</span></div><div><strong>✓ Clear group progress</strong><span>Threshold and expiry visible</span></div><div><strong>✓ Built for trust</strong><span>Compliance before finance</span></div></section>
   <section className="shell section" id="shop"><div className="section-heading"><div><span className="eyebrow dark">DISCOVER THE MARKETPLACE</span><h2>Products worth sharing</h2><p>Sample items for feature testing — not real offers or current stock.</p></div><span className="pill">● DEMO CATALOG</span></div><div className="toolbar"><div className="filters">{categories.map(c=><button key={c} className={filter===c?'selected':''} onClick={()=>setFilter(c)}>{c}</button>)}</div><input aria-label="Search products" placeholder="Search products…" value={search} onChange={e=>setSearch(e.target.value)}/></div>
   {shown.length?<div className="products">{shown.map(p=><article className="product" key={p.id}><div className="product-image"><span>{categoryEmoji(p.category)}</span><b>DEMO ITEM</b></div><div className="product-info"><span className="cat">{p.category}</span><h3>{p.name}</h3><p>{p.description}</p><div className="price-row"><div><small>Single price</small><strong>{fmt(p.price_kobo)}</strong></div><div className="group-price"><small>Team price*</small><strong>{fmt(p.group_price_kobo)}</strong></div></div><div className="card-actions"><button disabled={busy} onClick={()=>void act('/api/groups',{productId:p.id,minMembers:2,maxMembers:5,durationHours:24})}>Start demo team ↗</button><button disabled={busy} className="secondary" onClick={()=>void act('/api/demo-checkout',{productId:p.id,quantity:1})}>Simulate order</button></div></div></article>)}</div>:<div className="empty">No demo products found. {products.length===0?'Start the API and PostgreSQL service to load product data.':'Try another search.'}</div>}
   </section>
   <section className="team-section" id="teams"><div className="shell"><div className="section-heading"><div><span className="eyebrow dark">SOCIAL COMMERCE DEMO</span><h2>Buying power, together.</h2><p>Start a team above, then join a group with a synthetic demo alias.</p></div></div><div className="joinpanel"><div><label htmlFor="demoalias">Demo alias (no real name/email)</label><input id="demoalias" value={alias} maxLength={32} onChange={e=>setAlias(e.target.value)}/></div><p>Aliases must contain 3–32 letters, numbers, underscores or hyphens. Only synthetic test data.</p></div>
   <div className="group-grid">{groups.length?groups.map(g=><article key={g.id} className="group-card"><span className="pill">{g.state.toUpperCase()}</span><h3>{g.product_name}</h3><p>{g.members} / {g.min_members} minimum shoppers · Max {g.max_members}</p><div className="progress"><div style={{width:`${Math.min(100,g.members/g.min_members*100)}%`}}/></div><small>Expires {new Date(g.expires_at).toLocaleString()}</small><button disabled={busy||g.state==='expired'||g.state==='full'} onClick={()=>void act(`/api/groups/${g.id}/join`,{demoAlias:alias})}>Join demo group →</button></article>):<div className="empty">No demo groups yet. Start a group from a product card to see it here.</div>}</div>
   </div></section>
   <section className="shell next-phase"><span className="eyebrow dark">WHAT COMES NEXT</span><h2>Flexible payments, built responsibly.</h2><p>Structured prepayments and regulated early-delivery installments are future features. They are not enabled, and no financing eligibility or legal approval is implied.</p><a className="button outline dark-outline" href="/merchant">Preview seller workspace →</a></section>
  </main><footer className="footer"><div className="shell"><b>iMarket</b><span>Engineering prototype · IMK-001 · No live purchases or financial services.</span></div></footer>
  <div role="status" aria-live="polite" className="demo-status">{message}</div>
 </>;
}
