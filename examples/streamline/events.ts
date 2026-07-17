/**
 * Domain events — the contracts that flow between services. Each event is declared once, in its
 * owning domain; producers point `@emits` at it and consumers point `@consumes` at it. The
 * payload types double as documentation of each contract.
 */

/** @event user.signed-up in:Identity */
export const USER_SIGNED_UP = "user.signed-up";

/** @event product.updated in:Catalog */
export const PRODUCT_UPDATED = "product.updated";

/** @event order.placed in:Orders */
export const ORDER_PLACED = "order.placed";

/** @event order.shipped in:Orders */
export const ORDER_SHIPPED = "order.shipped";

/** @event payment.captured in:Orders */
export const PAYMENT_CAPTURED = "payment.captured";

export interface UserSignedUpPayload {
  userId: string;
  email: string;
}

export interface OrderPlacedPayload {
  orderId: string;
  totalCents: number;
  itemCount: number;
}

export interface PaymentCapturedPayload {
  orderId: string;
  amountCents: number;
}
