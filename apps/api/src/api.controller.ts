import { BadRequestException, ConflictException, Controller, Get, HttpException, Inject, Param, Post, Body, Req } from '@nestjs/common';
import { Principal, objectInput } from './auth.service';
import { DbService } from './db.service';
import { groupState, validateCampaign, validateDemoAlias, totalKobo } from '@imarket/commerce-domain';
import { randomUUID } from 'node:crypto';

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
function uuid(value: unknown): string {
  if (typeof value !== 'string' || !UUID.test(value)) throw new BadRequestException('Invalid product or campaign ID');
  return value;
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
  @Get('api/products') async products() {
    const r=await this.db.pool.query('SELECT id,slug,name,category,description,price_kobo,group_price_kobo,stock_demo FROM products ORDER BY name');
    return r.rows.map(x=>({...x,price_kobo:presentMoney(x.price_kobo),group_price_kobo:presentMoney(x.group_price_kobo)}));
  }
  @Get('api/groups') async groups() {
    const r=await this.db.pool.query(`SELECT c.id,c.product_id,c.min_members,c.max_members,c.expires_at,p.name AS product_name,p.group_price_kobo,COUNT(m.id)::int AS members
       FROM campaigns c JOIN products p ON p.id=c.product_id LEFT JOIN campaign_members m ON m.campaign_id=c.id
       GROUP BY c.id,p.name,p.group_price_kobo ORDER BY c.created_at DESC LIMIT 40`);
    return r.rows.map(x=>({...x,group_price_kobo:presentMoney(x.group_price_kobo),state:groupState({members:x.members,minMembers:x.min_members,maxMembers:x.max_members,expiresAt:x.expires_at.toISOString()})}));
  }
  @Post('api/groups') async create(@Body() input: Record<string,unknown>, @Req() request: {principal: Principal}) {
    try {
      objectInput(input,['productId','minMembers','maxMembers','durationHours']);
      const productId=uuid(input.productId);
      const minMembers=safeInt(input.minMembers);
      const maxMembers=safeInt(input.maxMembers);
      const durationHours=safeInt(input.durationHours);
      validateCampaign({minMembers,maxMembers,durationHours});
      const p=await this.db.pool.query('SELECT id FROM products WHERE id=$1 AND merchant_id=$2',[productId,request.principal.merchant_id]);
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
    const client=await this.db.pool.connect();
    try {
      await client.query('BEGIN');
      const found=await client.query('SELECT id,min_members,max_members,expires_at FROM campaigns WHERE id=$1 FOR UPDATE',[id]);
      if (!found.rowCount) throw new BadRequestException('Campaign not found');
      const c=found.rows[0];
      const count=await client.query('SELECT COUNT(*)::int AS n FROM campaign_members WHERE campaign_id=$1',[id]);
      const before=groupState({members:count.rows[0].n,minMembers:c.min_members,maxMembers:c.max_members,expiresAt:c.expires_at.toISOString()});
      if (new Date(c.expires_at).getTime() <= Date.now()) throw new ConflictException('Campaign expired');
      if (before === 'full') throw new ConflictException('Campaign full');
      await client.query('INSERT INTO campaign_members(id,campaign_id,demo_alias,account_id) VALUES($1,$2,$3,$4)',[randomUUID(),id,alias,request.principal.id]);
      const members=count.rows[0].n+1;
      await client.query('COMMIT');
      return {id, members, state:groupState({members,minMembers:c.min_members,maxMembers:c.max_members,expiresAt:c.expires_at.toISOString()}),mode:'SIMULATED_ONLY'};
    } catch(e:unknown) {
      await client.query('ROLLBACK');
      if ((e as {code?:string})?.code === '23505') throw new ConflictException('Demo alias already joined');
      throw e;
    } finally {client.release();}
  }
  @Post('api/demo-checkout') async checkout(@Body() input: Record<string,unknown>, @Req() request: {principal: Principal}) {
    objectInput(input,['productId','quantity']);
    const productId=uuid(input.productId);
    const quantity=safeInt(input.quantity);
    const r=await this.db.pool.query('SELECT price_kobo FROM products WHERE id=$1',[productId]);
    if(!r.rowCount) throw new BadRequestException('Product not found');
    let total: number;
    try {total=totalKobo(presentMoney(r.rows[0].price_kobo),quantity);} catch(e) {throw new BadRequestException(e instanceof Error ? e.message : 'Invalid quantity');}
    const result=await this.db.pool.query('INSERT INTO demo_orders(product_id,quantity,total_kobo,account_id) VALUES($1,$2,$3,$4) RETURNING id',[productId,quantity,total,request.principal.id]);
    return {id:result.rows[0].id, status:'SIMULATED_ONLY',total_kobo:total,currency:'NGN',paymentCaptured:false,fulfilmentCreated:false};
  }
}
