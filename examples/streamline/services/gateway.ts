/**
 * API gateway — the public entry point. Its edges point at the endpoints it routes to, so the
 * map shows exactly which surfaces are reachable from outside.
 */
import { service } from "../../../src/index.ts";
import { sessionCache } from "../infra.ts";
import { getProduct, listProducts } from "./catalog.ts";
import { issueToken, signup, verifyToken } from "./identity.ts";
import { getOrder, placeOrder, shipOrder } from "./orders.ts";

export const gateway = service("api-gateway", {
  description: "Public entry point. Terminates TLS, authenticates requests, and routes to the owning service.",
  tech: "Envoy + Node.js",
  calls: [
    [signup, "HTTP"],
    [issueToken, "HTTP"],
    [verifyToken, "HTTP"],
    [listProducts, "HTTP"],
    [getProduct, "HTTP"],
    [placeOrder, "HTTP"],
    [getOrder, "HTTP"],
    [shipOrder, "HTTP"],
  ],
});

export const authenticate = gateway.fn(
  "authenticate",
  { description: "Session check on every request; cache-first.", reads: [sessionCache] },
  async (token: string | undefined): Promise<{ userId: string } | null> => {
    if (!token) return null;
    return verifyToken(token);
  },
);
