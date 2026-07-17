/**
 * Domain events — the contracts that flow between services. Each event is declared once, in its
 * owning domain; producers point `emits` at it and consumers point `consumes` at it.
 */
import { catalogDomain, identityDomain, ordersDomain } from "./architecture.ts";

export const userSignedUp = identityDomain.event("user.signed-up");
export const productUpdated = catalogDomain.event("product.updated");
export const orderPlaced = ordersDomain.event("order.placed");
export const orderShipped = ordersDomain.event("order.shipped");
export const paymentCaptured = ordersDomain.event("payment.captured");

// Payload types double as documentation of each contract.
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
