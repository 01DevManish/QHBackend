import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class CartService {
  constructor(private readonly db: DatabaseService) {}

  private async getOrCreateCart(userId: string): Promise<string> {
    const existing = await this.db.query<{ id: string }>(
      'select id from customer_carts where user_id = $1 limit 1', [userId],
    );
    if (existing.rows[0]) return existing.rows[0].id;
    const created = await this.db.query<{ id: string }>(
      'insert into customer_carts (user_id) values ($1) returning id', [userId],
    );
    return created.rows[0].id;
  }

  async getCartItems(userId: string) {
    const cartId = await this.getOrCreateCart(userId);
    const items = await this.db.query(
      `select id, product_slug, product_title, product_image, 
              unit_price::text, mrp::text, quantity 
       from customer_cart_items where cart_id = $1 order by created_at`, [cartId],
    );
    return { items: items.rows };
  }

  async addItem(userId: string, body: any) {
    const { slug, title, image, price, mrp, quantity = 1 } = body;
    if (!slug || !title || !price) return { error: 'slug, title, and price are required' };
    const cartId = await this.getOrCreateCart(userId);
    await this.db.query(
      `insert into customer_cart_items (cart_id, product_slug, product_title, product_image, unit_price, mrp, quantity)
       values ($1, $2, $3, $4, $5, $6, $7)
       on conflict (cart_id, product_slug) do update
       set quantity = customer_cart_items.quantity + $7, unit_price = $5, product_title = $3, product_image = $4, updated_at = now()`,
      [cartId, slug, title, image, price, mrp, quantity],
    );
    await this.db.query('update customer_carts set updated_at = now() where id = $1', [cartId]);
    return { ok: true };
  }

  async updateQuantity(userId: string, slug: string, quantity: number) {
    const cartId = await this.getOrCreateCart(userId);
    if (quantity <= 0) {
      await this.db.query('delete from customer_cart_items where cart_id = $1 and product_slug = $2', [cartId, slug]);
    } else {
      await this.db.query(
        'update customer_cart_items set quantity = $3, updated_at = now() where cart_id = $1 and product_slug = $2',
        [cartId, slug, Math.min(quantity, 20)],
      );
    }
    return { ok: true };
  }

  async removeItem(userId: string, slug?: string) {
    const cartId = await this.getOrCreateCart(userId);
    if (slug) {
      await this.db.query('delete from customer_cart_items where cart_id = $1 and product_slug = $2', [cartId, slug]);
    } else {
      await this.db.query('delete from customer_cart_items where cart_id = $1', [cartId]);
    }
    return { ok: true };
  }
}
