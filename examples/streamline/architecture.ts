/**
 * Fictional e-commerce platform: storefront traffic in, orders and emails out.
 * @system Streamline
 */

/**
 * Who the user is: accounts, sessions, sign-in.
 * @domain Identity
 */

/**
 * What we sell: products, pricing, search.
 * @domain Catalog
 */

/**
 * The money path: checkout, payment, fulfilment.
 * @domain Orders
 */

/**
 * Everything we send to the customer.
 * @domain Notifications
 */

/**
 * Payment processing.
 * @external Stripe in:Orders
 */

/**
 * Transactional email.
 * @external SendGrid in:Notifications
 */

/**
 * SMS for shipping updates.
 * @external Twilio in:Notifications
 */

// This file only anchors the map: the system, its domains, and the third parties.
// Everything else is annotated next to the code it describes — see infra.ts, events.ts,
// and services/*. Render the whole map with:
//
//   pnpm chorograph render examples/streamline
export {};
