/**
 * Turns domain events into emails and texts. Retries via the queue.
 * @service notifications in:Notifications tech:Node.js
 * @consumes user.signed-up welcome email
 * @consumes order.placed
 * @consumes order.shipped
 * @consumes payment.captured
 * @writes email-queue
 */
import type { OrderPlacedPayload, UserSignedUpPayload } from "../events.ts";

interface QueuedMessage {
  to: string;
  channel: "email" | "sms";
  body: string;
}

const queued: QueuedMessage[] = [];

/**
 * Event payload → message body. The only place copy lives.
 * @fn
 */
export function renderTemplate(
  event: "welcome" | "order-placed",
  payload: UserSignedUpPayload | OrderPlacedPayload,
): string {
  switch (event) {
    case "welcome":
      return `Welcome to Streamline, ${(payload as UserSignedUpPayload).email}!`;
    case "order-placed":
      return `Order ${(payload as OrderPlacedPayload).orderId} received — $${((payload as OrderPlacedPayload).totalCents / 100).toFixed(2)}.`;
  }
}

/**
 * Drains the queue and hands messages to the providers.
 * @job email-sender
 * @reads email-queue
 * @calls SendGrid
 * @calls Twilio
 */
export async function sendPending(): Promise<number> {
  const batch = queued.splice(0, 50);
  // Real code would call the provider SDKs here; the edges above are the architectural facts.
  return batch.length;
}
