import { BadRequestException, ConflictException } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { totalKobo } from '@imarket/commerce-domain';

// All callers use campaign -> product lock order. Stock is available synthetic stock.
export async function transaction<T>(pool: Pool, work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}
export async function reserve(client: PoolClient, productId: string, quantity: number) {
  const result = await client.query(`UPDATE products SET stock_demo=stock_demo-$2
    WHERE id=$1 AND published AND stock_demo >= $2 RETURNING price_kobo`, [productId, quantity]);
  if (!result.rowCount) throw new ConflictException('Product unavailable or insufficient demo inventory');
  return result.rows[0];
}
export async function finishGroup(client: PoolClient, campaign: any, cancel = false) {
  if (campaign.lifecycle !== 'open') return campaign.lifecycle;
  const count = await client.query('SELECT COUNT(*)::int AS n FROM campaign_members WHERE campaign_id=$1', [campaign.id]);
  const lifecycle = cancel ? 'cancelled' : count.rows[0].n >= campaign.min_members ? 'confirmed' : 'expired';
  if (lifecycle !== 'confirmed') {
    const released = await client.query(`UPDATE campaign_members SET inventory_reserved=false
      WHERE campaign_id=$1 AND inventory_reserved RETURNING id`, [campaign.id]);
    await client.query('UPDATE products SET stock_demo=stock_demo+$2 WHERE id=$1', [campaign.product_id, released.rowCount]);
  }
  await client.query('UPDATE campaigns SET lifecycle=$2 WHERE id=$1', [campaign.id, lifecycle]);
  return lifecycle;
}
export async function createOrder(pool: Pool, account: string, product: string, quantity: number, key: string) {
  return transaction(pool, client => createOrderInTransaction(client,account,product,quantity,key));
}
export async function createOrderInTransaction(client: PoolClient, account: string, product: string, quantity: number, key: string) {
    // Serializes retries before stock mutation, including simultaneous first requests.
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [JSON.stringify([account,key])]);
    const prior = await client.query('SELECT * FROM demo_orders WHERE account_id=$1 AND idempotency_key=$2', [account,key]);
    if (prior.rowCount) {
      const order = prior.rows[0];
      if (order.product_id !== product || order.quantity !== quantity) throw new ConflictException('Idempotency key reused with different request');
      return order;
    }
    const stock = await reserve(client, product, quantity);
    let total: number;
    try { total = totalKobo(Number(stock.price_kobo),quantity); }
    catch { throw new BadRequestException('Amount out of range'); }
    const result = await client.query(`INSERT INTO demo_orders(product_id,quantity,total_kobo,account_id,idempotency_key,lifecycle)
      VALUES($1,$2,$3,$4,$5,'reserved') RETURNING *`, [product,quantity,total,account,key]);
    return result.rows[0];
}
