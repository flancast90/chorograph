/**
 * Identity service — function-style declarations. Each endpoint wrapper returns the handler
 * unchanged, so this module exports plain async functions that the router (or tests) call
 * directly; the architecture is a side effect of the same lines that define the code.
 */
import { randomUUID, scryptSync } from "node:crypto";
import { identityDomain } from "../architecture.ts";
import { userSignedUp } from "../events.ts";
import { sessionCache, sessionsTable, usersTable } from "../infra.ts";

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

export const identity = identityDomain.service("identity", {
  description: "Owns accounts and sessions. Issues and validates access tokens.",
  tech: "Node.js + Fastify",
});

export const hashPassword = identity.fn(
  "hashPassword",
  { description: "scrypt with a per-user salt; the only place passwords are touched." },
  (password: string, salt: string): string => scryptSync(password, salt, 32).toString("hex"),
);

export const signup = identity.endpoint(
  "POST /signup",
  { writes: [usersTable], emits: [userSignedUp] },
  async (email: string, password: string): Promise<{ userId: string }> => {
    if (!email.includes("@")) throw new Error("invalid email");
    if ([...users.values()].some((u) => u.email === email)) throw new Error("email already registered");
    const user: User = { id: randomUUID(), email, passwordHash: hashPassword(password, email) };
    users.set(user.id, user);
    return { userId: user.id };
  },
);

export const issueToken = identity.endpoint(
  "POST /token",
  { reads: [usersTable], writes: [sessionsTable, sessionCache] },
  async (email: string, password: string): Promise<{ token: string }> => {
    const user = [...users.values()].find((u) => u.email === email);
    if (!user || user.passwordHash !== hashPassword(password, email)) throw new Error("bad credentials");
    const session: Session = { token: randomUUID(), userId: user.id, expiresAt: Date.now() + 86_400_000 };
    sessions.set(session.token, session);
    return { token: session.token };
  },
);

export const verifyToken = identity.endpoint(
  "GET /token/verify",
  { reads: [sessionCache] },
  async (token: string): Promise<{ userId: string } | null> => {
    const session = sessions.get(token);
    if (!session || session.expiresAt < Date.now()) return null;
    return { userId: session.userId };
  },
);
