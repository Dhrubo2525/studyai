import "server-only";
import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { row, run } from "@/lib/db";

const COOKIE = "learnsphere_session";
const SESSION_DAYS = 30;
export type User = { id: string; email: string };
export const hashPassword = (password: string) => {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
};
export function verifyPassword(password: string, stored: string) {
  const [salt, original] = stored.split(":");
  if (!salt || !original) return false;
  const candidate = scryptSync(password, salt, 64);
  const expected = Buffer.from(original, "hex");
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}
const digest = (s: string) => createHash("sha256").update(s).digest("hex");
export async function createSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + SESSION_DAYS * 86400000).toISOString();
  run("INSERT INTO sessions (id,user_id,token_hash,expires_at) VALUES (?,?,?,?)", randomBytes(16).toString("hex"), userId, digest(token), expires);
  (await cookies()).set(COOKIE, token, { httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production", path: "/", expires: new Date(expires) });
}
export async function currentUser(): Promise<User | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const session = row<{ id: string; user_id: string; expires_at: string; email: string }>(
    "SELECT s.id,s.user_id,s.expires_at,u.email FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=?", digest(token));
  if (!session) return null;
  if (new Date(session.expires_at).getTime() <= Date.now()) { run("DELETE FROM sessions WHERE id=?", session.id); return null; }
  return { id: session.user_id, email: session.email };
}
export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) run("DELETE FROM sessions WHERE token_hash=?", digest(token));
  jar.delete(COOKIE);
}
