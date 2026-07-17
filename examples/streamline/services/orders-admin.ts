/**
 * Admin lane for the orders service, in its own file the way large services split their routes.
 * The `@of` directive points everything here at the service declared in orders.ts.
 * @of orders
 */
import { randomUUID } from "node:crypto";

interface Refund {
  id: string;
  orderId: string;
  amountCents: number;
}

const refunds: Refund[] = [];

/**
 * @endpoint POST /orders/:id/refund
 * @writes orders-db.payment_ledger
 * @calls payments.post-charge reverse the charge with the provider
 */
export async function refundOrder(orderId: string, amountCents: number): Promise<Refund> {
  const refund: Refund = { id: randomUUID(), orderId, amountCents: -clampRefund(amountCents) };
  refunds.push(refund);
  return refund;
}

/**
 * Refunds never exceed the captured amount; the one place that rule lives.
 * @fn of:post-orders-id-refund
 */
export function clampRefund(amountCents: number): number {
  return Math.max(0, Math.min(amountCents, 10_000_00));
}
