/**
 * Owns products and prices. Serves browse and search traffic.
 * @service catalog in:Catalog tech:Node.js
 */

export interface Product {
  id: string;
  name: string;
  priceCents: number;
  imageKey: string;
}

const products = new Map<string, Product>();

/**
 * Signs a short-lived URL for a product image.
 * @fn
 * @uses product-images signed URLs
 */
export function imageUrl(product: Product): string {
  return `https://img.streamline.example/${product.imageKey}?sig=${product.id.slice(0, 8)}`;
}

/**
 * @endpoint GET /products
 * @reads catalog-db.products
 * @reads search-cluster when a search query is present
 */
export async function listProducts(query?: string): Promise<Product[]> {
  const all = [...products.values()];
  if (!query) return all;
  const q = query.toLowerCase();
  return all.filter((p) => p.name.toLowerCase().includes(q));
}

/**
 * @endpoint GET /products/:id
 * @reads catalog-db.products
 * @reads catalog-db.price_history for the price chart
 */
export async function getProduct(id: string): Promise<(Product & { imageUrl: string }) | null> {
  const product = products.get(id);
  return product ? { ...product, imageUrl: imageUrl(product) } : null;
}

/**
 * @endpoint PUT /products/:id
 * @writes catalog-db.products
 * @writes catalog-db.price_history
 * @emits product.updated so the search index stays fresh
 */
export async function upsertProduct(product: Product): Promise<Product> {
  products.set(product.id, product);
  return product;
}
