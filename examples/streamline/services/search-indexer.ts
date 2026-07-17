/**
 * Rebuilds the search index whenever a product changes.
 * @service search-indexer in:Catalog tech:"Node.js worker"
 * @consumes product.updated
 * @reads catalog-db.products full row on every change
 * @writes search-cluster
 */
import type { Product } from "./catalog.ts";

interface SearchDoc {
  id: string;
  text: string;
  boost: number;
}

/**
 * Product row → search document. Boost is a naive freshness signal.
 * @fn
 */
export function buildDocument(product: Product, updatedAt: Date): SearchDoc {
  return {
    id: product.id,
    text: `${product.name} ${(product.priceCents / 100).toFixed(2)}`,
    boost: Math.max(0, 30 - Math.floor((Date.now() - updatedAt.getTime()) / 86_400_000)),
  };
}
