'use client';
import {useState} from 'react';
type Merchant={id:string;alias:string;status:string};
type Product={id:string;name:string;moderation:string;published:boolean;merchant_id:string};
type Dispute={id:string;name:string;status:string;reason:string;evidence:string;response:string;refund_requested:boolean};
type Audit={id:string;action:string;subject_id:string;created_at:string};
export default function Admin(){
 const [token,setToken]=useState(''),[message,setMessage]=useState('Local synthetic administration. MFA required.'),[busy,setBusy]=useState(false);
 const [merchants,setMerchants]=useState<Merchant[]>([]),[products,setProducts]=useState<Product[]>([]),[disputes,setDisputes]=useState<Dispute[]>([]),[audit,setAudit]=useState<Audit[]>([]);
 async function api(path:string,body?:unknown,session=token){
 const result=await fetch((process.env.NEXT_PUBLIC_API_URL||'http://127.0.0.1:4000')+path,{method:body===undefined?'GET':'POST',cache:'no-store',headers:{'content-type':'application/json',authorization:`Bearer ${session}`},...(body===undefined?{}:{body:JSON.stringify(body)})});
 const data=await result.json();if(!result.ok)throw Error(data.message||'Request rejected');return data;
 }
 async function refresh(session=token){const [reviews,issues,events]=await Promise.all([api('/api/admin/reviews',undefined,session),api('/api/disputes',undefined,session),api('/api/admin/audit',undefined,session)]);setMerchants(reviews.merchants);setProducts(reviews.products);setDisputes(issues);setAudit(events);}
 async function run(work:()=>Promise<void>){setBusy(true);try{await work();}catch(e){setMessage(e instanceof Error?e.message:'Request failed');}finally{setBusy(false);}}
 async function decision(path:string,body:unknown){await api(path,body);await refresh();setMessage('Decision recorded. No money moved.');}
 return <main className="shell" style={{paddingBlock:40}}><nav><a href="/">Shop</a> · <a href="/merchant">Merchant workspace</a></nav><h1>Administrator reviews</h1><p>Local accounts only. Sessions expire after five minutes. Refund requests are review records only.</p><p role="status">{message}</p>
 {!token?<form onSubmit={e=>{e.preventDefault();const form=e.currentTarget,data=new FormData(form);void run(async()=>{const session=await api('/api/auth/login',{alias:data.get('alias'),password:data.get('password'),otp:data.get('otp')});form.reset();await refresh(session.accessToken);setToken(session.accessToken);setMessage('MFA verified.');});}}><label>Synthetic administrator alias<input name="alias" required autoComplete="username"/></label><label>Password<input name="password" type="password" required autoComplete="current-password"/></label><label>Authenticator code<input name="otp" inputMode="numeric" pattern="[0-9]{6}" required autoComplete="one-time-code"/></label><button disabled={busy}>Log in with MFA</button></form>:<><button disabled={busy} onClick={()=>void run(()=>refresh())}>Refresh reviews</button><button disabled={busy} onClick={()=>void run(async()=>{try{await api('/api/auth/logout',{});}finally{setToken('');setMerchants([]);setProducts([]);setDisputes([]);setAudit([]);}})}>Log out</button>
 <section><h2>Merchant applications</h2>{merchants.map(m=><article key={m.id}><h3>{m.alias} · {m.status}</h3>{['approved','rejected','suspended'].filter(s=>s!==m.status).map(status=><button key={status} disabled={busy} onClick={()=>void run(()=>decision(`/api/admin/merchants/${m.id}/review`,{status}))}>Set {status}</button>)}</article>)}</section>
 <section><h2>Product moderation</h2>{products.map(p=><article key={p.id}><h3>{p.name}</h3><p>Merchant {p.merchant_id} · {p.moderation} · {p.published?'published':'unpublished'}</p>{['publish','reject','unpublish'].map(choice=><button key={choice} disabled={busy} onClick={()=>void run(()=>decision(`/api/admin/products/${p.id}/review`,{decision:choice}))}>{choice}</button>)}</article>)}</section>
 <section><h2>Customer disputes</h2>{disputes.map(d=><article key={d.id}><h3>{d.name} · {d.status}</h3><p>{d.reason}</p><p>Evidence: {d.evidence}</p><p>Merchant response: {d.response||'Awaiting response'}</p><p>{d.refund_requested?'Refund review requested (record only).':'No refund requested.'}</p>{['open','responded'].includes(d.status)&&<form onSubmit={e=>{e.preventDefault();const data=new FormData(e.currentTarget);void run(()=>decision(`/api/disputes/${d.id}/resolve`,{status:data.get('status'),resolution:data.get('resolution')}));}}><label>Decision<select name="status"><option value="resolved">Resolved</option><option value="rejected">Rejected</option></select></label><label>Resolution<textarea name="resolution" minLength={3} maxLength={2000} required/></label><button disabled={busy}>Record resolution</button></form>}</article>)}</section>
 <section><h2>Recent audit activity</h2><ul>{audit.map(a=><li key={a.id}>{new Date(a.created_at).toLocaleString()} · {a.action} · {a.subject_id}</li>)}</ul></section>
 </>}
 </main>;
}
