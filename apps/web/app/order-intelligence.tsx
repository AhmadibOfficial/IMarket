'use client';
import {useState} from 'react';
export type Activity={id:string;action:string;created_at:string};
export function Timeline({events}:{events:Activity[]}) {
 return <section aria-label="Order timeline"><h3>Simulated order timeline</h3>{!events.length&&<p>No recorded activity.</p>}<ol>{events.map(e=><li key={e.id}>{e.action} · <time dateTime={e.created_at}>{e.created_at}</time></li>)}</ol></section>;
}
export default function OrderIntelligence({api}:{api:(path:string,body?:unknown)=>Promise<any>}) {
 const [events,setEvents]=useState<(Activity&{order_id:string;read_at:string|null})[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(false),[loaded,setLoaded]=useState(false);
 async function refresh(){setBusy(true);try{setEvents(await api('/api/notifications'));setLoaded(true);setError('');}catch{setError('Notifications unavailable. Please retry.');}finally{setBusy(false);}}
 async function markRead(id:string){setBusy(true);try{const read=await api(`/api/notifications/${id}/read`,{});setEvents(items=>items.map(e=>e.id===id?{...e,read_at:read.read_at}:e));setError('');}catch{setError('Unable to mark notification read. Please retry.');}finally{setBusy(false);}}
 return <section aria-label="Private notifications" aria-busy={busy}><h2>Private in-app notifications</h2><p>Simulated order and dispute activity for your account.</p><button disabled={busy} onClick={()=>void refresh()}>Refresh notifications</button><p role="status">{busy?'Loading notifications…':error||(!loaded?'Refresh to load your private activity.':!events.length?'No recorded activity.':'')}</p><ul>{events.map(e=><li key={e.id}>{e.action} · Order {e.order_id} · <time dateTime={e.created_at}>{e.created_at}</time>{e.read_at?' · Read':<button disabled={busy} aria-label={`Mark ${e.action} for order ${e.order_id} read`} onClick={()=>void markRead(e.id)}>Mark read</button>}</li>)}</ul></section>;
}
