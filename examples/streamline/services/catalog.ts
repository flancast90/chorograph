/**
 * Catalog service — owns products and prices, serves browse and search traffic.
 */
import { catalogDomain } from "../architecture.ts";
import { productUpdated } from "../events.ts";
import { priceHistoryTable, productImages, productsTable, searchCluster } from "../infra.ts";

export interface Product {
  id: string;
  name: string;
  priceCents: number;
  imageKey: string;
}

const products = new Map<string, Product>();

export const catalog = catalogDomain.service("catalog", {
  description: "Owns products and prices. Serves browse and search traffic.",
  tech: "Node.js",
});

export const imageUrl = catalog.fn(
  "imageUrl",
  { description: "Signs a short-lived URL for a product image.", uses: [[productImages, "signed URLs"]] },
  (product: Product): string => `https://img.streamline.example/${product.imageKey}?sig=${product.id.slice(0, 8)}`,
);

export const listProducts = catalog.endpoint(
  "GET /products",
  { reads: [productsTable, [searchCluster, "search queries"]] },
  async (query?: string): Promise<Product[]> => {
    const all = [...products.values()];
    if (!query) return all;
    const q = query.toLowerCase();
    return all.filter((p) => p.name.toLowerCase().includes(q));
  },
);

export const getProduct = catalog.endpoint(
  "GET /products/:id",
  { reads: [productsTable, priceHistoryTable] },
  async (id: string): Promise<(Product & { imageUrl: string }) | null> => {
    const product = products.get(id);
    return product ? { ...product, imageUrl: imageUrl(product) } : null;
  },
);

export const upsertProduct = catalog.endpoint(
  "PUT /products/:id",
  { writes: [productsTable, priceHistoryTable], emits: [productUpdated] },
  async (product: Product): Promise<Product> => {
    products.set(product.id, product);
    return product;
  },
);
