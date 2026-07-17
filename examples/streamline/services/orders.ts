/**
 * Orders service — the order lifecycle from cart to fulfilment. Function-style, and shows a
 * cross-style edge: the checkout endpoint calls the class-based PaymentsService via `archRef`.
 */
import { randomUUID } from "node:crypto";
import { archRef } from "../../../src/index.ts";
import { ordersDomain } from "../architecture.ts";
import { orderPlaced, orderShipped, paymentCaptured } from "../events.ts";
import { orderItemsTable, ordersTable } from "../infra.ts";
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

export const orders = ordersDomain.service("orders", {
  description: "Owns the order lifecycle from cart to fulfilment.",
  tech: "Node.js",
  consumes: [[paymentCaptured, "marks order paid"]],
});

export const calculateTotal = orders.fn(
  "calculateTotal",
  { description: "The single source of truth for order arithmetic." },
  (items: readonly OrderItem[]): number => items.reduce((sum, i) => sum + i.quantity * i.unitPriceCents, 0),
);

export const placeOrder = orders.endpoint(
  "POST /orders",
  {
    writes: [ordersTable, orderItemsTable],
    emits: [orderPlaced],
    calls: [[archRef(PaymentsService), "charge, in-process for now"]],
  },
  async (items: OrderItem[]): Promise<Order> => {
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
  },
);

export const getOrder = orders.endpoint(
  "GET /orders/:id",
  { reads: [ordersTable, orderItemsTable] },
  async (id: string): Promise<Order | null> => orderStore.get(id) ?? null,
);

export const shipOrder = orders.endpoint(
  "POST /orders/:id/ship",
  { writes: [ordersTable], emits: [orderShipped] },
  async (id: string): Promise<Order> => {
    const order = orderStore.get(id);
    if (!order || order.status !== "paid") throw new Error("only paid orders ship");
    order.status = "shipped";
    order.updatedAt = new Date();
    return order;
  },
);

export const sweepAbandonedCarts = orders.job(
  "abandoned-cart-sweeper",
  { description: "Hourly. Expires orders untouched for 48h.", reads: [ordersTable], writes: [ordersTable] },
  async (): Promise<number> => {
    const cutoff = Date.now() - 48 * 3_600_000;
    let expired = 0;
    for (const order of orderStore.values()) {
      if (order.status === "placed" && order.updatedAt.getTime() < cutoff) {
        order.status = "expired";
        expired++;
      }
    }
    return expired;
  },
);
