/**
 * Owns accounts and sessions. Issues and validates access tokens.
 * @service identity in:Identity tech:"Node.js + Fastify"
 */
import { randomUUID, scryptSync } from "node:crypto";

interface User {
  id: string;
  email: string;
  passwordHash: string;
}

interface Session {
  token: string;
  userId: string;
  expiresAt: number;
}

// In-memory stand-ins for the real stores, so the example runs anywhere.
const users = new Map<string, User>();
const sessions = new Map<string, Session>();

/**
 * scrypt with a per-user salt; the only place passwords are touched.
 * @fn
 */
export function hashPassword(password: string, salt: string): string {
  return scryptSync(password, salt, 32).toString("hex");
}

/**
 * @endpoint POST /signup
 * @writes identity-db.users
 * @emits user.signed-up so notifications can send the welcome email
 */
export async function signup(email: string, password: string): Promise<{ userId: string }> {
  if (!email.includes("@")) throw new Error("invalid email");
  if ([...users.values()].some((u) => u.email === email)) throw new Error("email already registered");
  const user: User = { id: randomUUID(), email, passwordHash: hashPassword(password, email) };
  users.set(user.id, user);
  return { userId: user.id };
}

/**
 * @endpoint POST /token
 * @reads identity-db.users
 * @writes identity-db.sessions
 * @writes session-cache so verification is cache-first
 */
export async function issueToken(email: string, password: string): Promise<{ token: string }> {
  const user = [...users.values()].find((u) => u.email === email);
  if (!user || user.passwordHash !== hashPassword(password, email)) throw new Error("bad credentials");
  const session: Session = { token: randomUUID(), userId: user.id, expiresAt: Date.now() + 86_400_000 };
  sessions.set(session.token, session);
  return { token: session.token };
}

/**
 * @endpoint GET /token/verify
 * @reads session-cache
 */
export async function verifyToken(token: string): Promise<{ userId: string } | null> {
  const session = sessions.get(token);
  if (!session || session.expiresAt < Date.now()) return null;
  return { userId: session.userId };
}
