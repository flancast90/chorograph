/**
 * Search indexer — a consumer service: rebuilds the search index whenever a product changes.
 */
import { catalogDomain } from "../architecture.ts";
import { productUpdated } from "../events.ts";
import { productsTable, searchCluster } from "../infra.ts";
import type { Product } from "./catalog.ts";

interface SearchDoc {
  id: string;
  text: string;
  boost: number;
}

export const searchIndexer = catalogDomain.service("search-indexer", {
  description: "Rebuilds the search index whenever a product changes.",
  tech: "Node.js worker",
  consumes: [productUpdated],
  reads: [productsTable],
  writes: [searchCluster],
});

export const buildDocument = searchIndexer.fn(
  "buildDocument",
  { description: "Product row → search document. Boost is a naive freshness signal." },
  (product: Product, updatedAt: Date): SearchDoc => ({
    id: product.id,
    text: `${product.name} ${(product.priceCents / 100).toFixed(2)}`,
    boost: Math.max(0, 30 - Math.floor((Date.now() - updatedAt.getTime()) / 86_400_000)),
  }),
);
