import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { randomBytes } from 'crypto';

@Injectable()
export class OrdersService {
  constructor(private readonly db: DatabaseService) {}

  private generateOrderNumber() {
    const d = new Date();
    const prefix = `QH${d.getFullYear().toString().slice(2)}${String(d.getMonth() + 1).padStart(2, '0')}`;
    return `${prefix}-${randomBytes(3).toString('hex').toUpperCase()}`;
  }

  async getUserOrders(userId: string) {
    const orders = await this.db.query<any>(
      `select id, order_number, status, payment_status, subtotal::text, shipping_total::text, grand_total::text,
              shipping_name, shipping_phone, shipping_address, shipping_city, shipping_state, shipping_pincode,
              placed_at, created_at
       from customer_orders where user_id = $1 order by created_at desc limit 50`, [userId],
    );
    const result = [];
    for (const order of orders.rows) {
      const items = await this.db.query(
        `select product_slug, product_title, product_image, unit_price::text, quantity, line_total::text
         from customer_order_items where order_id = $1`, [order.id],
      );
      result.push({ ...order, items: items.rows });
    }
    return { orders: result };
  }

  async placeOrder(userId: string, body: any) {
    const { name, phone, address, city, state, pincode, notes } = body;
    if (!name || !phone || !address || !city || !state || !pincode) {
      return { error: 'Complete shipping address is required.' };
    }
    const cartResult = await this.db.query<{ id: string }>(
      'select id from customer_carts where user_id = $1 limit 1', [userId],
    );
    if (!cartResult.rows[0]) return { error: 'Cart is empty.' };
    const cartItems = await this.db.query<any>(
      `select product_slug, product_title, product_image, unit_price::text, quantity
       from customer_cart_items where cart_id = $1`, [cartResult.rows[0].id],
    );
    if (cartItems.rows.length === 0) return { error: 'Cart is empty.' };
    const subtotal = cartItems.rows.reduce((sum: number, item: any) => sum + (parseFloat(item.unit_price) * item.quantity), 0);
    const shippingTotal = subtotal >= 499 ? 0 : 49;
    const grandTotal = subtotal + shippingTotal;
    const orderNumber = this.generateOrderNumber();
    const orderResult = await this.db.query<{ id: string }>(
      `insert into customer_orders (order_number, user_id, subtotal, shipping_total, grand_total, 
       shipping_name, shipping_phone, shipping_address, shipping_city, shipping_state, shipping_pincode, notes)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) returning id`,
      [orderNumber, userId, subtotal, shippingTotal, grandTotal, name, phone, address, city, state, pincode, notes || null],
    );
    const orderId = orderResult.rows[0].id;
    for (const item of cartItems.rows) {
      const lineTotal = parseFloat(item.unit_price) * item.quantity;
      await this.db.query(
        `insert into customer_order_items (order_id, product_slug, product_title, product_image, unit_price, quantity, line_total)
         values ($1, $2, $3, $4, $5, $6, $7)`,
        [orderId, item.product_slug, item.product_title, item.product_image, item.unit_price, item.quantity, lineTotal],
      );
    }
    await this.db.query('delete from customer_cart_items where cart_id = $1', [cartResult.rows[0].id]);
    return { ok: true, order: { id: orderId, orderNumber, grandTotal, status: 'pending' } };
  }
}
