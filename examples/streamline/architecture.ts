/**
 * System-wide architecture anchors: the map's name, the domains, and the third parties.
 *
 * Everything else is declared next to the code it describes — see `infra.ts`, `events.ts`, and
 * `services/*`. Render the whole map with:
 *
 *   pnpm chorograph render examples/streamline
 */
import { domain, external, system } from "../../src/index.ts";

system("Streamline", {
  description: "Fictional e-commerce platform: storefront traffic in, orders and emails out.",
});

export const identityDomain = domain("Identity", {
  description: "Who the user is: accounts, sessions, sign-in.",
});

export const catalogDomain = domain("Catalog", {
  description: "What we sell: products, pricing, search.",
});

export const ordersDomain = domain("Orders", {
  description: "The money path: checkout, payment, fulfilment.",
});

export const notificationsDomain = domain("Notifications", {
  description: "Everything we send to the customer.",
});

export const stripe = external("Stripe", { description: "Payment processing." });
export const sendgrid = external("SendGrid", { description: "Transactional email." });
export const twilio = external("Twilio", { description: "SMS for shipping updates." });
