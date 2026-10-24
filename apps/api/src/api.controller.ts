import { BadRequestException, ConflictException, Controller, Get, HttpException, Inject, Param, Post, Body, Req, Query } from '@nestjs/common';
import { Principal, objectInput } from './auth.service';
import { DbService } from './db.service';
import { groupState, validateCampaign, validateDemoAlias } from '@imarket/commerce-domain';
import { randomUUID } from 'node:crypto';
import { transaction, reserve, finishGroup, createOrder, createOrderInTransaction } from './inventory';

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
function uuid(value: unknown): string {
  if (typeof value !== 'string' || !UUID.test(value)) throw new BadRequestException('Invalid product or campaign ID');
  return value.toLowerCase();
}
function safeInt(v: unknown): number {
  if (typeof v !== 'number' || !Number.isSafeInteger(v)) throw new BadRequestException('Expected integer');
  return v;
}
function presentMoney(v: unknown): number {
  const n = Number(v);
  if (!Number.isSafeInteger(n) || n < 0) throw new BadRequestException('Amount out of range');
  return n;
}
@Controller()
export class ApiController {
  constructor(@Inject(DbService) private readonly db: DbService) {}
  @Get('health') health() {return { status:'ok', mode:'demo', realPayments:false, liveMarketplace:false };}
  @Get('api/products') async products(@Query() filters: Record<string,unknown> = {}) {
    objectInput(filters,['q','category','minPriceKobo','maxPriceKobo']);
    for(const field of ['q','category']) if(filters[field] !== undefined && (typeof filters[field] !== 'string' || (filters[field] as string).length > 100)) throw new BadRequestException('Invalid catalog filter');
    const price=(field:string)=>{
      const value=filters[field];
      if(value===undefined || value==='') return null;
      if(typeof value!=='string' || !/^\d{1,10}$/.test(value) || Number(value)>1000000000) throw new BadRequestException('Invalid price filter');
      return Number(value);
    };
    const minimum=price('minPriceKobo'), maximum=price('maxPriceKobo');
    if(minimum!==null && maximum!==null && minimum>maximum) throw new BadRequestException('Invalid price range');
    // Literal substring search: wildcard characters never broaden the filter.
    const values=[typeof filters.q==='string'?filters.q.trim():'',typeof filters.category==='string'?filters.category.trim():'',minimum,maximum];
    const r=await this.db.pool.query(`SELECT id,slug,name,category,description,price_kobo,group_price_kobo,stock_demo FROM products WHERE published AND (merchant_id IS NULL OR (moderation='approved' AND EXISTS (SELECT 1 FROM merchants m WHERE m.id=products.merchant_id AND m.status='approved'))) AND stock_demo > 0 AND ($1='' OR strpos(lower(name || ' ' || description),lower($1))>0) AND ($2='' OR lower(category)=lower($2)) AND ($3::bigint IS NULL OR price_kobo >= $3) AND ($4::bigint IS NULL OR price_kobo <= $4) ORDER BY name,id`,values);
    return r.rows.map(x=>({...x,price_kobo:presentMoney(x.price_kobo),group_price_kobo:presentMoney(x.group_price_kobo)}));
  }
  @Get('api/groups') async groups() {
    const r=await this.db.pool.query(`SELECT c.id,c.lifecycle,c.product_id,c.min_members,c.max_members,c.expires_at,p.name AS product_name,p.group_price_kobo,COUNT(m.id)::int AS members
       FROM campaigns c JOIN products p ON p.id=c.product_id LEFT JOIN campaign_members m ON m.campaign_id=c.id
       WHERE p.published AND (p.merchant_id IS NULL OR (p.moderation='approved' AND EXISTS (SELECT 1 FROM merchants owner WHERE owner.id=p.merchant_id AND owner.status='approved'))) GROUP BY c.id,p.name,p.group_price_kobo ORDER BY c.created_at DESC LIMIT 40`);
    return r.rows.map(x=>({...x,group_price_kobo:presentMoney(x.group_price_kobo),state:x.lifecycle !== 'open' ? x.lifecycle : groupState({members:x.members,minMembers:x.min_members,maxMembers:x.max_members,expiresAt:x.expires_at.toISOString()})}));
  }
  @Post('api/groups') async create(@Body() input: Record<string,unknown>, @Req() request: {principal: Principal}) {
    try {
      objectInput(input,['productId','minMembers','maxMembers','durationHours']);
      const productId=uuid(input.productId);
      const minMembers=safeInt(input.minMembers);
      const maxMembers=safeInt(input.maxMembers);
      const durationHours=safeInt(input.durationHours);
      validateCampaign({minMembers,maxMembers,durationHours});
      const p=await this.db.pool.query('SELECT id FROM products WHERE id=$1 AND merchant_id=$2 AND published AND moderation=\'approved\' AND EXISTS(SELECT 1 FROM merchants m WHERE m.id=products.merchant_id AND m.status=\'approved\')',[productId,request.principal.merchant_id]);
      if(!p.rowCount) throw new BadRequestException('Unknown demo product');
      const r=await this.db.pool.query(`INSERT INTO campaigns (product_id,min_members,max_members,expires_at,merchant_id)
          VALUES($1,$2,$3, now() + ($4 * interval '1 hour'),$5) RETURNING id,product_id,min_members,max_members,expires_at`,
          [productId,minMembers,maxMembers,durationHours,request.principal.merchant_id]);
      return {...r.rows[0],state:'open',members:0,mode:'SIMULATED_ONLY'};
    } catch(e) {if(e instanceof HttpException) throw e; throw new BadRequestException('Invalid campaign request');}
  }
  @Post('api/groups/:id/join') async join(@Param('id') id: string, @Body() input: Record<string,unknown>, @Req() request: {principal: Principal}) {
    objectInput(input,['demoAlias']);
    uuid(id);
    let alias:string;
    try {alias=validateDemoAlias(input?.demoAlias);}catch(e){throw new BadRequestException(e instanceof Error ? e.message : 'Invalid demo alias');}
    const result=await transaction(this.db.pool,async client=>{
      const found=await client.query('SELECT * FROM campaigns WHERE id=$1 FOR UPDATE',[id]);
      if (!found.rowCount) throw new BadRequestException('Campaign not found');
      const c=found.rows[0];
      c.elapsed=(await client.query('SELECT clock_timestamp() >= $1 AS elapsed',[c.expires_at])).rows[0].elapsed;
      if (c.lifecycle === 'open' && c.elapsed) await finishGroup(client,c);
      if (c.lifecycle !== 'open' || c.elapsed) return null;
      const count=await client.query('SELECT COUNT(*)::int AS n FROM campaign_members WHERE campaign_id=$1',[id]);
      if (count.rows[0].n >= c.max_members) throw new ConflictException('Campaign full');
      await reserve(client,c.product_id,1);
      await client.query('INSERT INTO campaign_members(id,campaign_id,demo_alias,account_id,inventory_reserved) VALUES($1,$2,$3,$4,true)',[randomUUID(),id,alias,request.principal.id]);
      const members=count.rows[0].n+1;
      return {id,members,state:groupState({members,minMembers:c.min_members,maxMembers:c.max_members,expiresAt:c.expires_at.toISOString()}),mode:'SIMULATED_ONLY'};
    }).catch(e=>{
      if(e?.code === '23505') throw new ConflictException('Account or demo alias already joined');
      throw e;
    });
    if (!result) throw new ConflictException('Campaign closed');
    return result;
  }
  @Post('api/groups/:id/checkout') async groupCheckout(@Param('id') id: string, @Body() input: Record<string,unknown>, @Req() request: {principal: Principal}) {
    id=uuid(id); objectInput(input,[]);
    return transaction(this.db.pool,async client=>{
      const found=await client.query('SELECT * FROM campaigns WHERE id=$1 FOR UPDATE',[id]);
      if(!found.rowCount) throw new BadRequestException('Campaign not found');
      const c=found.rows[0], account=request.principal.id, key='group_'+id;
      const membership=await client.query('SELECT * FROM campaign_members WHERE campaign_id=$1 AND account_id=$2',[id,account]);
      if(!membership.rowCount) throw new ConflictException('Group membership required');
      const prior=await client.query('SELECT * FROM demo_orders WHERE account_id=$1 AND idempotency_key=$2',[account,key]);
      if(prior.rowCount) return {...prior.rows[0],mode:'SIMULATED_ONLY',paymentCaptured:false};
      if(c.lifecycle==='open' && (await client.query('SELECT clock_timestamp() >= $1 AS elapsed',[c.expires_at])).rows[0].elapsed) {
        await finishGroup(client,c);
        c.lifecycle=(await client.query('SELECT lifecycle FROM campaigns WHERE id=$1',[id])).rows[0].lifecycle;
      }
      if(c.lifecycle!=='confirmed' || !membership.rows[0].inventory_reserved) return {mode:'SIMULATED_ONLY',paymentCaptured:false,state:c.lifecycle,orderCreated:false};
      // Transfer the existing reservation. Never reserve this member's item twice.
      await client.query('SELECT m.id FROM merchants m JOIN products p ON p.merchant_id=m.id WHERE p.id=$1 FOR SHARE OF m',[c.product_id]);
      const product=await client.query(`SELECT group_price_kobo FROM products WHERE id=$1 AND published AND
        (merchant_id IS NULL OR (moderation='approved' AND EXISTS(SELECT 1 FROM merchants m WHERE m.id=products.merchant_id AND m.status='approved'))) FOR UPDATE`,[c.product_id]);
      if(!product.rowCount) throw new ConflictException('Product unavailable');
      const total=presentMoney(product.rows[0].group_price_kobo);
      const order=(await client.query(`INSERT INTO demo_orders(product_id,quantity,total_kobo,account_id,idempotency_key,lifecycle)
        VALUES($1,1,$2,$3,$4,'reserved') RETURNING *`,[c.product_id,total,account,key])).rows[0];
      await client.query('UPDATE campaign_members SET inventory_reserved=false WHERE campaign_id=$1 AND account_id=$2',[id,account]);
      await client.query("INSERT INTO marketplace_audit(actor_id,action,subject_id) VALUES($1,'order.group',$2)",[account,order.id]);
      return {...order,mode:'SIMULATED_ONLY',paymentCaptured:false};
    });
  }
  @Post('api/groups/:id/cancel') async cancelGroup(@Param('id') id: string, @Body() input: Record<string,unknown>, @Req() request: {principal: Principal}) {
    return this.transitionGroup(id,input,request,true);
  }
  @Post('api/groups/:id/expire') async expireGroup(@Param('id') id: string, @Body() input: Record<string,unknown>, @Req() request: {principal: Principal}) {
    return this.transitionGroup(id,input,request,false);
  }
  private async transitionGroup(id: string, input: Record<string,unknown>, request: {principal: Principal}, cancel: boolean) {
    uuid(id); objectInput(input,[]);
    const transition=await transaction(this.db.pool,async client=>{
      const result=await client.query(`SELECT * FROM campaigns
        WHERE id=$1 AND merchant_id=$2 FOR UPDATE`,[id,request.principal.merchant_id]);
      if (!result.rowCount) throw new BadRequestException('Campaign not found');
      const c=result.rows[0];
      c.elapsed=(await client.query('SELECT clock_timestamp() >= $1 AS elapsed',[c.expires_at])).rows[0].elapsed;
      if (!cancel && !c.elapsed) throw new ConflictException('Campaign has not expired');
      // Expiry wins over cancellation once its deadline has passed.
      const state=await finishGroup(client,c,cancel && !c.elapsed);
      return {id,state,mode:'SIMULATED_ONLY'};
    });
    if(cancel && transition.state !== 'cancelled') throw new ConflictException('Campaign already closed');
    return transition;
  }
  @Post('api/demo-orders/:id/cancel') async cancelOrder(@Param('id') id: string, @Body() input: Record<string,unknown>, @Req() request: {principal: Principal}) {
    uuid(id); objectInput(input,[]);
    return transaction(this.db.pool,async client=>{
      const result=await client.query('SELECT * FROM demo_orders WHERE id=$1 AND account_id=$2 FOR UPDATE',[id,request.principal.id]);
      if(!result.rowCount) throw new BadRequestException('Order not found');
      const order=result.rows[0];
      if(!['reserved','cancelled'].includes(order.lifecycle)) throw new ConflictException('Order cannot be cancelled');
      if(order.lifecycle === 'reserved') {
        await client.query('UPDATE products SET stock_demo=stock_demo+$2 WHERE id=$1',[order.product_id,order.quantity]);
        await client.query("UPDATE demo_orders SET lifecycle='cancelled' WHERE id=$1",[id]);
        await client.query("INSERT INTO marketplace_audit(actor_id,action,subject_id) VALUES($1,'order.cancel',$2)",[request.principal.id,id]);
      }
      return {id,lifecycle:'cancelled',paymentCaptured:false,fulfilmentCreated:false,mode:'SIMULATED_ONLY'};
    });
  }
  @Get('api/merchant/products') async merchantProducts(@Req() request: {principal: Principal}) {
    return (await this.db.pool.query('SELECT * FROM products WHERE merchant_id=$1 ORDER BY created_at DESC',[request.principal.merchant_id])).rows;
  }
  @Post('api/merchant/products') async createProduct(@Body() input: Record<string,unknown>, @Req() request: {principal: Principal}) {
    objectInput(input,['name','category','description','priceKobo','stock']);
    for(const field of ['name','category','description']) if(typeof input[field] !== 'string' || !(input[field] as string).trim() || (input[field] as string).length > 500) throw new BadRequestException('Invalid product text');
    const price=safeInt(input.priceKobo),stock=safeInt(input.stock);
    if(price<1 || price>1000000000 || stock<0 || stock>1000000) throw new BadRequestException('Invalid price or stock');
    return transaction(this.db.pool,async client=>{
    const product=(await client.query(`INSERT INTO products(slug,name,category,description,price_kobo,group_price_kobo,stock_demo,merchant_id,published)
      VALUES($1,$2,$3,$4,$5,$5,$6,$7,false) RETURNING *`,[randomUUID(),input.name,input.category,input.description,price,stock,request.principal.merchant_id])).rows[0];
    await client.query("INSERT INTO marketplace_audit(actor_id,action,subject_id) VALUES($1,'product.create',$2)",[request.principal.id,product.id]);
    return product;});
  }
  @Post('api/merchant/products/:id/publish') async publishProduct(@Param('id') id: string,@Body() input: Record<string,unknown>,@Req() request: {principal: Principal}) {
    uuid(id); objectInput(input,['published']);
    if(typeof input.published !== 'boolean') throw new BadRequestException('Expected published boolean');
    // Only administrator review can publish; merchants can withdraw a listing.
    if(input.published) throw new BadRequestException('Administrator review required');
    return transaction(this.db.pool,async client=>{
      const r=await client.query('UPDATE products SET published=false WHERE id=$1 AND merchant_id=$2 RETURNING *',[id,request.principal.merchant_id]);
      if(!r.rowCount) throw new BadRequestException('Product not found');
      await client.query("INSERT INTO marketplace_audit(actor_id,action,subject_id) VALUES($1,'product.withdraw',$2)",[request.principal.id,id]);
      return r.rows[0];
    });
  }
  @Get('api/orders') async orders(@Req() request: {principal: Principal}) {
    const merchant=request.principal.role==='merchant';
    return (await this.db.pool.query(`SELECT o.id,o.product_id,o.quantity,o.total_kobo,o.lifecycle,o.created_at,p.name FROM demo_orders o JOIN products p ON p.id=o.product_id
      WHERE ${merchant?'p.merchant_id':'o.account_id'}=$1 ORDER BY o.created_at DESC LIMIT 100`,[merchant?request.principal.merchant_id:request.principal.id])).rows;
  }
  @Post('api/merchant/orders/:id/fulfill') async fulfill(@Param('id') id:string,@Body() input:Record<string,unknown>,@Req() request:{principal:Principal}) {
    uuid(id);objectInput(input,['lifecycle']);
    const previous:Record<string,string>={processing:'reserved',shipped:'processing',delivered:'shipped'};
    if(typeof input.lifecycle!=='string' || !previous[input.lifecycle]) throw new BadRequestException('Invalid lifecycle');
    return transaction(this.db.pool,async client=>{
      const r=await client.query('SELECT o.* FROM demo_orders o JOIN products p ON p.id=o.product_id WHERE o.id=$1 AND p.merchant_id=$2 FOR UPDATE OF o',[id,request.principal.merchant_id]);
      if(!r.rowCount) throw new BadRequestException('Order not found');
      if(r.rows[0].lifecycle===input.lifecycle) return {id,lifecycle:input.lifecycle,mode:'SIMULATED_ONLY'};
      if(r.rows[0].lifecycle!==previous[input.lifecycle as string]) throw new ConflictException('Invalid order transition');
      await client.query('UPDATE demo_orders SET lifecycle=$2 WHERE id=$1',[id,input.lifecycle]);
      await client.query('INSERT INTO marketplace_audit(actor_id,action,subject_id) VALUES($1,$2,$3)',[request.principal.id,`order.${input.lifecycle}`,id]);
      return {id,lifecycle:input.lifecycle,mode:'SIMULATED_ONLY'};
    });
  }
  @Post('api/cart-checkout') async cartCheckout(@Body() input:Record<string,unknown>,@Req() request:{principal:Principal}) {
    objectInput(input,['items','idempotencyKey']);
    if(typeof input.idempotencyKey!=='string' || !/^[a-zA-Z0-9_-]{8,80}$/.test(input.idempotencyKey)) throw new BadRequestException('Invalid idempotency key');
    if(!Array.isArray(input.items)||input.items.length<1||input.items.length>20) throw new BadRequestException('Invalid cart');
    const items=input.items.map(item=>{objectInput(item,['productId','quantity']);const productId=uuid(item.productId),quantity=safeInt(item.quantity);if(quantity<1||quantity>10) throw new BadRequestException('Invalid quantity');return {productId,quantity};}).sort((a,b)=>a.productId.localeCompare(b.productId));
    if(new Set(items.map(x=>x.productId)).size!==items.length) throw new BadRequestException('Duplicate cart item');
    return transaction(this.db.pool,async client=>{
      const key=input.idempotencyKey as string, account=request.principal.id;
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[JSON.stringify(['cart',account,key])]);
      const prior=await client.query('SELECT * FROM checkout_batches WHERE account_id=$1 AND key=$2',[account,key]);
      if(prior.rowCount){
        const payload=prior.rows[0].payload.map((x:{productId:string;quantity:number})=>({productId:x.productId,quantity:x.quantity}));
        if(JSON.stringify(payload)!==JSON.stringify(items)) throw new ConflictException('Idempotency key conflict');
        return {orderIds:prior.rows[0].order_ids,mode:'SIMULATED_ONLY',paymentCaptured:false};
      }
      const ids=[];
      for(let i=0;i<items.length;i++) ids.push((await createOrderInTransaction(client,account,items[i].productId,items[i].quantity,'cart_'+randomUUID())).id);
      await client.query('INSERT INTO checkout_batches VALUES($1,$2,$3,$4)',[account,key,JSON.stringify(items),ids]);
      return {orderIds:ids,mode:'SIMULATED_ONLY',paymentCaptured:false};
    });
  }
  @Post('api/demo-checkout') async checkout(@Body() input: Record<string,unknown>, @Req() request: {principal: Principal}) {
    objectInput(input,['productId','quantity','idempotencyKey']);
    const productId=uuid(input.productId);
    const quantity=safeInt(input.quantity);
    if(quantity < 1 || quantity > 10) throw new BadRequestException('Invalid quantity');
    const key=input.idempotencyKey;
    if(typeof key !== 'string' || key.startsWith('group_') || !/^[a-zA-Z0-9_-]{8,80}$/.test(key)) throw new BadRequestException('Invalid idempotency key');
    const order=await createOrder(this.db.pool,request.principal.id,productId,quantity,key);
    return {id:order.id,status:'SIMULATED_ONLY',lifecycle:order.lifecycle,total_kobo:presentMoney(order.total_kobo),currency:'NGN',paymentCaptured:false,fulfilmentCreated:false};
  }
}
