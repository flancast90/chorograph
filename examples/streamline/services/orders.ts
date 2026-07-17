/**
 * Owns the order lifecycle from cart to fulfilment.
 * @service orders in:Orders tech:Node.js
 * @consumes payment.captured marks the order paid
 */
import { randomUUID } from "node:crypto";
import { PaymentsService } from "./payments.ts";

export interface OrderItem {
  productId: string;
  quantity: number;
  unitPriceCents: number;
}

interface Order {
  id: string;
  items: OrderItem[];
  totalCents: number;
  status: "placed" | "paid" | "shipped" | "expired";
  updatedAt: Date;
}

const orderStore = new Map<string, Order>();

/**
 * The single source of truth for order arithmetic.
 * @fn
 */
export function calculateTotal(items: readonly OrderItem[]): number {
  return items.reduce((sum, i) => sum + i.quantity * i.unitPriceCents, 0);
}

/**
 * @endpoint POST /orders
 * @writes orders-db.orders
 * @writes orders-db.order_items
 * @emits order.placed
 * @calls payments.post-charge charge synchronously, in-process for now
 */
export async function placeOrder(items: OrderItem[]): Promise<Order> {
  if (items.length === 0) throw new Error("an order needs at least one item");
  const order: Order = {
    id: randomUUID(),
    items,
    totalCents: calculateTotal(items),
    status: "placed",
    updatedAt: new Date(),
  };
  orderStore.set(order.id, order);
  await new PaymentsService().charge(order.id, order.totalCents);
  return order;
}

/**
 * @endpoint GET /orders/:id
 * @reads orders-db.orders
 * @reads orders-db.order_items
 */
export async function getOrder(id: string): Promise<Order | null> {
  return orderStore.get(id) ?? null;
}

/**
 * @endpoint POST /orders/:id/ship
 * @writes orders-db.orders
 * @emits order.shipped
 */
export async function shipOrder(id: string): Promise<Order> {
  const order = orderStore.get(id);
  if (!order || order.status !== "paid") throw new Error("only paid orders ship");
  order.status = "shipped";
  order.updatedAt = new Date();
  return order;
}

/**
 * Hourly. Expires orders untouched for 48h.
 * @job abandoned-cart-sweeper
 * @reads orders-db.orders
 * @writes orders-db.orders
 */
export async function sweepAbandonedCarts(): Promise<number> {
  const cutoff = Date.now() - 48 * 3_600_000;
  let expired = 0;
  for (const order of orderStore.values()) {
    if (order.status === "placed" && order.updatedAt.getTime() < cutoff) {
      order.status = "expired";
      expired++;
    }
  }
  return expired;
}
