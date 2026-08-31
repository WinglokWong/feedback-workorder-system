import { headers } from "next/headers";
import { appEnv } from "./tickets";

export type AccountRole = "admin" | "superadmin";
export type AccountUser = {
  id:number; username:string; role:AccountRole; forcePasswordChange:boolean;
  userId:string; email:string; displayName:string;
};
export type AccountRecord = { id:number; username:string; role:AccountRole; forcePasswordChange:boolean; active:boolean; createdAt:number };
export type AssignableAccount = { id:number; username:string };
export type OperationLog = { id:number; userId:number|null; username:string; action:string; targetType:string|null; targetId:string|null; details:string|null; createdAt:number };

const SESSION_COOKIE = "workorder_session";
const SESSION_SECONDS = 7 * 24 * 60 * 60;

function toBase64Url(bytes:Uint8Array) {
  let binary = ""; for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function randomToken(size = 32) { const bytes = new Uint8Array(size); crypto.getRandomValues(bytes); return toBase64Url(bytes); }
async function sha256(value:string) { return toBase64Url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)))); }

export async function hashPassword(password:string, salt = randomToken(16)) {
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name:"PBKDF2", hash:"SHA-256", salt:new TextEncoder().encode(salt), iterations:120000 }, material, 256);
  return { hash:toBase64Url(new Uint8Array(bits)), salt };
}
export async function verifyPassword(password:string, salt:string, expected:string) {
  const { hash } = await hashPassword(password, salt);
  if (hash.length !== expected.length) return false;
  let difference = 0; for (let index = 0; index < hash.length; index += 1) difference |= hash.charCodeAt(index) ^ expected.charCodeAt(index);
  return difference === 0;
}

export async function ensureAuthSchema() {
  const { DB } = appEnv();
  await DB.batch([
    DB.prepare(`CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, password_salt TEXT NOT NULL, role TEXT NOT NULL, force_password_change INTEGER NOT NULL DEFAULT 1, active INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`),
    DB.prepare(`CREATE TABLE IF NOT EXISTS sessions (id INTEGER PRIMARY KEY AUTOINCREMENT, token_hash TEXT NOT NULL UNIQUE, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL)`),
    DB.prepare("CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions (user_id)"),
    DB.prepare("CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions (expires_at)"),
    DB.prepare(`CREATE TABLE IF NOT EXISTS operation_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER REFERENCES users(id) ON DELETE SET NULL, username TEXT NOT NULL, action TEXT NOT NULL, target_type TEXT, target_id TEXT, details TEXT, created_at INTEGER NOT NULL)`),
    DB.prepare("CREATE INDEX IF NOT EXISTS idx_operation_logs_user_id ON operation_logs (user_id)"),
    DB.prepare("CREATE INDEX IF NOT EXISTS idx_operation_logs_created_at ON operation_logs (created_at)"),
  ]);
  const count = await DB.prepare("SELECT COUNT(*) AS count FROM users").first<{ count:number }>();
  if ((count?.count ?? 0) === 0) {
    const environment = appEnv();
    const username = environment.BOOTSTRAP_SUPERADMIN_USERNAME ?? (process.env.NODE_ENV === "development" ? "superadmin" : "");
    const password = environment.BOOTSTRAP_SUPERADMIN_PASSWORD ?? (process.env.NODE_ENV === "development" ? "123123" : "");
    if (username && password) {
      const credentials = await hashPassword(password); const now = Date.now();
      await DB.prepare("INSERT INTO users (username, password_hash, password_salt, role, force_password_change, active, created_at, updated_at) VALUES (?, ?, ?, 'superadmin', 1, 1, ?, ?)")
        .bind(username, credentials.hash, credentials.salt, now, now).run();
    }
  }
}

function parseCookie(cookieHeader:string | null, name:string) {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) { const [key, ...value] = part.trim().split("="); if (key === name) return decodeURIComponent(value.join("=")); }
  return null;
}
export async function requestSessionToken() { return parseCookie((await headers()).get("cookie"), SESSION_COOKIE); }

type UserRow = { id:number; username:string; role:AccountRole; force_password_change:number; active:number; password_hash:string; password_salt:string };
function accountFromRow(row:UserRow):AccountUser {
  return { id:row.id, username:row.username, role:row.role, forcePasswordChange:Boolean(row.force_password_change), userId:String(row.id), email:row.username, displayName:row.username };
}
export async function currentUser():Promise<AccountUser|null> {
  await ensureAuthSchema();
  const token = await requestSessionToken(); if (!token) return null;
  const tokenHash = await sha256(token); const { DB } = appEnv();
  const row = await DB.prepare("SELECT users.id, users.username, users.role, users.force_password_change, users.active, users.password_hash, users.password_salt FROM sessions JOIN users ON users.id = sessions.user_id WHERE sessions.token_hash = ? AND sessions.expires_at > ? AND users.active = 1")
    .bind(tokenHash, Date.now()).first<UserRow>();
  return row ? accountFromRow(row) : null;
}
export function isAdmin(user:AccountUser|null) { return Boolean(user && !user.forcePasswordChange && (user.role === "admin" || user.role === "superadmin")); }
export function isSuperAdmin(user:AccountUser|null) { return Boolean(user && !user.forcePasswordChange && user.role === "superadmin"); }
export function canAccessAssignedResource(user:AccountUser|null, assignedUserId:number|null) {
  if (assignedUserId == null) return true;
  return Boolean(user && !user.forcePasswordChange && (user.role === "superadmin" || user.id === assignedUserId));
}
export function canViewOrUpdateTicket(user:AccountUser|null, assignedUserId:number|null, createdByUserId:number|null) {
  if (!user || user.forcePasswordChange) return false;
  if (user.role === "superadmin") return true;
  if (assignedUserId == null) return true;
  return user.id === assignedUserId || user.id === createdByUserId;
}
export function canEditTicket(user:AccountUser|null, createdByUserId:number|null) {
  return Boolean(user && !user.forcePasswordChange && (user.role === "superadmin" || user.id === createdByUserId));
}

export async function findUser(username:string) {
  await ensureAuthSchema();
  return appEnv().DB.prepare("SELECT id, username, role, force_password_change, active, password_hash, password_salt FROM users WHERE username = ? COLLATE NOCASE")
    .bind(username).first<UserRow>();
}
export async function createSession(userId:number) {
  await ensureAuthSchema(); const token = randomToken(); const now = Date.now();
  await appEnv().DB.batch([
    appEnv().DB.prepare("DELETE FROM sessions WHERE expires_at <= ?").bind(now),
    appEnv().DB.prepare("INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)").bind(await sha256(token), userId, now + SESSION_SECONDS * 1000, now),
  ]);
  return token;
}
export function sessionCookie(token:string) { return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_SECONDS}${process.env.NODE_ENV === "production" ? "; Secure" : ""}`; }
export function clearSessionCookie() { return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${process.env.NODE_ENV === "production" ? "; Secure" : ""}`; }
export async function revokeCurrentSession() { const token = await requestSessionToken(); if (token) await appEnv().DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await sha256(token)).run(); }

export async function setPassword(userId:number, password:string, forcePasswordChange:boolean) {
  const credentials = await hashPassword(password); const { DB } = appEnv();
  await DB.batch([
    DB.prepare("UPDATE users SET password_hash = ?, password_salt = ?, force_password_change = ?, updated_at = ? WHERE id = ?").bind(credentials.hash, credentials.salt, forcePasswordChange ? 1 : 0, Date.now(), userId),
    DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(userId),
  ]);
}

export async function writeLog(user:AccountUser|null, action:string, targetType?:string, targetId?:string|number, details?:string, usernameOverride?:string) {
  await ensureAuthSchema();
  await appEnv().DB.prepare("INSERT INTO operation_logs (user_id, username, action, target_type, target_id, details, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .bind(user?.id ?? null, user?.username ?? usernameOverride ?? "未知", action, targetType ?? null, targetId == null ? null : String(targetId), details ?? null, Date.now()).run();
}
export async function listAccounts():Promise<AccountRecord[]> {
  await ensureAuthSchema();
  const result = await appEnv().DB.prepare("SELECT id, username, role, force_password_change, active, created_at FROM users ORDER BY role DESC, id ASC").all<{ id:number; username:string; role:AccountRole; force_password_change:number; active:number; created_at:number }>();
  return result.results.map((row) => ({ id:row.id, username:row.username, role:row.role, forcePasswordChange:Boolean(row.force_password_change), active:Boolean(row.active), createdAt:row.created_at }));
}
export async function listAssignableAdmins():Promise<AssignableAccount[]> {
  await ensureAuthSchema();
  const result = await appEnv().DB.prepare("SELECT id, username FROM users WHERE role = 'admin' AND active = 1 ORDER BY username COLLATE NOCASE ASC").all<{ id:number; username:string }>();
  return result.results;
}
export async function listOperationLogs():Promise<OperationLog[]> {
  await ensureAuthSchema();
  const result = await appEnv().DB.prepare("SELECT id, user_id, username, action, target_type, target_id, details, created_at FROM operation_logs ORDER BY created_at DESC, id DESC LIMIT 500").all<{ id:number; user_id:number|null; username:string; action:string; target_type:string|null; target_id:string|null; details:string|null; created_at:number }>();
  return result.results.map((row) => ({ id:row.id, userId:row.user_id, username:row.username, action:row.action, targetType:row.target_type, targetId:row.target_id, details:row.details, createdAt:row.created_at }));
}
