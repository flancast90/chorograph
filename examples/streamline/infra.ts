/**
 * Datastores and transport infrastructure, annotated where a real codebase would configure them.
 * The `tables:` shorthand declares a database and its tables in one line; anything with its own
 * story (like the session cache) gets its own comment.
 */

interface Pool {
  query(sql: string, params?: unknown[]): Promise<unknown[]>;
}

const pool = (url: string): Pool => ({ query: async () => [void url] });

/** @database identity-db in:Identity tech:"PostgreSQL 16" tables:users,sessions */
export const identityDb = pool("postgres://identity");

/**
 * Hot session lookups so token validation never hits Postgres.
 * @cache session-cache in:Identity tech:Redis
 */
export const sessionCache = new Map<string, string>();

/** @database catalog-db in:Catalog tech:"PostgreSQL 16" tables:products,price_history */
export const catalogDb = pool("postgres://catalog");

/**
 * Full-text product search. Rebuilt from catalog-db, safe to lose.
 * @database search-cluster in:Catalog tech:OpenSearch
 */
export const searchCluster = pool("opensearch://search");

/** @bucket product-images in:Catalog tech:S3 */
export const productImages = { bucket: "streamline-product-images" };

/** @database orders-db in:Orders tech:"PostgreSQL 16" tables:orders,order_items,payment_ledger */
export const ordersDb = pool("postgres://orders");

/** @queue email-queue in:Notifications tech:SQS */
export const emailQueue: string[] = [];
