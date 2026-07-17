/**
 * Notifications service — turns domain events into emails and texts, buffered through a queue.
 */
import { notificationsDomain, sendgrid, twilio } from "../architecture.ts";
import {
  orderPlaced,
  orderShipped,
  paymentCaptured,
  userSignedUp,
  type OrderPlacedPayload,
  type UserSignedUpPayload,
} from "../events.ts";
import { emailQueue } from "../infra.ts";

interface QueuedMessage {
  to: string;
  channel: "email" | "sms";
  body: string;
}

const queued: QueuedMessage[] = [];

export const notifications = notificationsDomain.service("notifications", {
  description: "Turns domain events into emails and texts. Retries via the queue.",
  tech: "Node.js",
  consumes: [orderPlaced, orderShipped, paymentCaptured, [userSignedUp, "welcome email"]],
  writes: [emailQueue],
});

export const renderTemplate = notifications.fn(
  "renderTemplate",
  { description: "Event payload → message body. The only place copy lives." },
  (event: "welcome" | "order-placed", payload: UserSignedUpPayload | OrderPlacedPayload): string => {
    switch (event) {
      case "welcome":
        return `Welcome to Streamline, ${(payload as UserSignedUpPayload).email}!`;
      case "order-placed":
        return `Order ${(payload as OrderPlacedPayload).orderId} received — $${((payload as OrderPlacedPayload).totalCents / 100).toFixed(2)}.`;
    }
  },
);

export const sendPending = notifications.job(
  "email-sender",
  {
    description: "Drains the queue and hands messages to the providers.",
    reads: [emailQueue],
    calls: [sendgrid, twilio],
  },
  async (): Promise<number> => {
    const batch = queued.splice(0, 50);
    // Real code would call the provider SDKs here; the edge above is the architectural fact.
    return batch.length;
  },
);
