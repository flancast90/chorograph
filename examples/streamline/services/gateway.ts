/**
 * Public entry point. Terminates TLS, authenticates requests, and routes to the owning service.
 * @service api-gateway tech:"Envoy + Node.js"
 * @calls identity.post-signup HTTP
 * @calls identity.post-token HTTP
 * @calls identity.get-token-verify HTTP
 * @calls catalog.get-products HTTP
 * @calls catalog.get-products-id HTTP
 * @calls orders.post-orders HTTP
 * @calls orders.get-orders-id HTTP
 * @calls orders.post-orders-id-ship HTTP
 */
import { verifyToken } from "./identity.ts";

/**
 * Session check on every request; cache-first.
 * @fn
 * @reads session-cache
 */
export async function authenticate(token: string | undefined): Promise<{ userId: string } | null> {
  if (!token) return null;
  return verifyToken(token);
}
