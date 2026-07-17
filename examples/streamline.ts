/**
 * Streamline — a fictional e-commerce platform used as chorograph's demo and test map.
 *
 * It deliberately exercises every node kind (domains, services, endpoints, jobs, databases,
 * tables, a cache, a bucket, a queue, events, externals) and every edge verb. Render it with:
 *
 *   pnpm chorograph render examples/streamline.ts
 */
import { defineSystem } from "../src/index.ts";

export default defineSystem(
  "Streamline",
  { description: "Fictional e-commerce platform: storefront traffic in, orders and emails out." },
  (s) => {
    // ── Edge of the system ──────────────────────────────────────────────
    const gateway = s.service("api-gateway", {
      description: "Public entry point. Terminates TLS, authenticates requests, and routes to the owning service.",
      tech: "Envoy + Node.js",
    });

    // ── Identity ────────────────────────────────────────────────────────
    const identity = s.domain("Identity", {
      description: "Who the user is: accounts, sessions, sign-in.",
    });
    const identitySvc = identity.service("identity", {
      description: "Owns accounts and sessions. Issues and validates access tokens.",
      tech: "Go",
    });
    const signup = identitySvc.endpoint("POST /signup");
    const token = identitySvc.endpoint("POST /token");
    const identityDb = identity.database("identity-db", { tech: "PostgreSQL 16" });
    const users = identityDb.table("users");
    const sessions = identityDb.table("sessions");
    const sessionCache = identity.cache("session-cache", {
      description: "Hot session lookups so token validation never hits Postgres.",
      tech: "Redis",
    });
    const userSignedUp = identity.event("user.signed-up");

    s.calls(gateway, signup, "HTTP");
    s.calls(gateway, token, "HTTP");
    s.writes(identitySvc, users);
    s.writes(identitySvc, sessions);
    s.reads(identitySvc, sessionCache);
    s.writes(identitySvc, sessionCache);
    s.emits(identitySvc, userSignedUp);

    // ── Catalog ─────────────────────────────────────────────────────────
    const catalog = s.domain("Catalog", {
      description: "What we sell: products, pricing, search.",
    });
    const catalogSvc = catalog.service("catalog", {
      description: "Owns products and prices. Serves browse and search traffic.",
      tech: "Node.js",
    });
    const listProducts = catalogSvc.endpoint("GET /products");
    const getProduct = catalogSvc.endpoint("GET /products/:id");
    const indexer = catalog.service("search-indexer", {
      description: "Rebuilds the search index whenever a product changes.",
      tech: "Rust",
    });
    const catalogDb = catalog.database("catalog-db", { tech: "PostgreSQL 16" });
    const products = catalogDb.table("products");
    const prices = catalogDb.table("price_history");
    const searchDb = catalog.database("search-cluster", {
      description: "Full-text product search. Rebuilt from catalog-db, safe to lose.",
      tech: "OpenSearch",
    });
    const productImages = catalog.bucket("product-images", { tech: "S3" });
    const productUpdated = catalog.event("product.updated");

    s.calls(gateway, listProducts, "HTTP");
    s.calls(gateway, getProduct, "HTTP");
    s.reads(catalogSvc, products);
    s.reads(catalogSvc, prices);
    s.writes(catalogSvc, products);
    s.reads(catalogSvc, searchDb, "search queries");
    s.uses(catalogSvc, productImages, "signed URLs");
    s.emits(catalogSvc, productUpdated);
    s.consumes(indexer, productUpdated);
    s.reads(indexer, products);
    s.writes(indexer, searchDb);

    // ── Orders ──────────────────────────────────────────────────────────
    const orders = s.domain("Orders", {
      description: "The money path: checkout, payment, fulfilment.",
    });
    const ordersSvc = orders.service("orders", {
      description: "Owns the order lifecycle from cart to fulfilment.",
      tech: "Node.js",
    });
    const placeOrder = ordersSvc.endpoint("POST /orders");
    const getOrder = ordersSvc.endpoint("GET /orders/:id");
    const cartSweeper = ordersSvc.job("abandoned-cart-sweeper", {
      description: "Hourly. Expires carts untouched for 48h.",
    });
    const paymentsSvc = orders.service("payments", {
      description: "Wraps the payment provider; the only service allowed to talk to Stripe.",
      tech: "Go",
    });
    const reconcile = paymentsSvc.job("reconcile-payments", {
      description: "Nightly. Compares our ledger against Stripe and records drift.",
    });
    const ordersDb = orders.database("orders-db", { tech: "PostgreSQL 16" });
    const ordersTable = ordersDb.table("orders");
    const orderItems = ordersDb.table("order_items");
    const ledger = ordersDb.table("payment_ledger");
    const orderPlaced = orders.event("order.placed");
    const orderShipped = orders.event("order.shipped");
    const paymentCaptured = orders.event("payment.captured");

    s.calls(gateway, placeOrder, "HTTP");
    s.calls(gateway, getOrder, "HTTP");
    s.calls(ordersSvc, paymentsSvc, "gRPC");
    s.calls(ordersSvc, token, "verify session");
    s.writes(ordersSvc, ordersTable);
    s.writes(ordersSvc, orderItems);
    s.reads(ordersSvc, ordersTable);
    s.emits(ordersSvc, orderPlaced);
    s.emits(ordersSvc, orderShipped);
    s.consumes(ordersSvc, paymentCaptured, "marks order paid");
    s.reads(cartSweeper, ordersTable);
    s.writes(paymentsSvc, ledger);
    s.emits(paymentsSvc, paymentCaptured);
    s.reads(reconcile, ledger);

    // ── Notifications ────────────────────────────────────────────────────
    const comms = s.domain("Notifications", {
      description: "Everything we send to the customer.",
    });
    const notifySvc = comms.service("notifications", {
      description: "Turns domain events into emails and texts. Retries via the queue.",
      tech: "Node.js",
    });
    const emailSender = notifySvc.job("email-sender", {
      description: "Drains the queue and hands messages to the providers.",
    });
    const emailQueue = comms.queue("email-queue", { tech: "SQS" });

    s.consumes(notifySvc, orderPlaced);
    s.consumes(notifySvc, orderShipped);
    s.consumes(notifySvc, paymentCaptured);
    s.consumes(notifySvc, userSignedUp, "welcome email");
    s.writes(notifySvc, emailQueue);
    s.reads(emailSender, emailQueue);

    // ── Third parties ────────────────────────────────────────────────────
    const stripe = s.external("Stripe", { description: "Payment processing." });
    const sendgrid = s.external("SendGrid", { description: "Transactional email." });
    const twilio = s.external("Twilio", { description: "SMS for shipping updates." });

    s.calls(paymentsSvc, stripe, "charge + refund");
    s.calls(reconcile, stripe, "list charges");
    s.calls(emailSender, sendgrid);
    s.calls(emailSender, twilio);
  },
);
