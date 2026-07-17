/**
 * Datastores and transport infrastructure, declared where a real codebase would configure them.
 * The handles exported here are what services point their `reads`/`writes` edges at.
 */
import { catalogDomain, identityDomain, notificationsDomain, ordersDomain } from "./architecture.ts";

// ── Identity ──────────────────────────────────────────────────────────────
export const identityDb = identityDomain.database("identity-db", { tech: "PostgreSQL 16" });
export const usersTable = identityDb.table("users");
export const sessionsTable = identityDb.table("sessions");

export const sessionCache = identityDomain.cache("session-cache", {
  description: "Hot session lookups so token validation never hits Postgres.",
  tech: "Redis",
});

// ── Catalog ───────────────────────────────────────────────────────────────
export const catalogDb = catalogDomain.database("catalog-db", { tech: "PostgreSQL 16" });
export const productsTable = catalogDb.table("products");
export const priceHistoryTable = catalogDb.table("price_history");

export const searchCluster = catalogDomain.database("search-cluster", {
  description: "Full-text product search. Rebuilt from catalog-db, safe to lose.",
  tech: "OpenSearch",
});

export const productImages = catalogDomain.bucket("product-images", { tech: "S3" });

// ── Orders ────────────────────────────────────────────────────────────────
export const ordersDb = ordersDomain.database("orders-db", { tech: "PostgreSQL 16" });
export const ordersTable = ordersDb.table("orders");
export const orderItemsTable = ordersDb.table("order_items");
export const paymentLedgerTable = ordersDb.table("payment_ledger");

// ── Notifications ──────────────────────────────────────────────────────────
export const emailQueue = notificationsDomain.queue("email-queue", { tech: "SQS" });
