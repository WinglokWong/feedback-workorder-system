import { appEnv } from "../../../lib/tickets";
import { currentUser, hashPassword, isSuperAdmin, listAccounts, writeLog } from "../../../lib/admin";

export async function GET() {
  const user = await currentUser();
  if (!isSuperAdmin(user)) return Response.json({ error:"仅超级管理员可查看账号。" }, { status:403 });
  return Response.json({ accounts:await listAccounts() });
}

export async function POST(request:Request) {
  const user = await currentUser();
  if (!isSuperAdmin(user)) return Response.json({ error:"仅超级管理员可创建账号。" }, { status:403 });
  try {
    const payload = await request.json() as { username?:string; password?:string };
    const username = payload.username?.trim() ?? ""; const password = payload.password ?? "";
    if (!/^[\p{L}\p{N}_.-]{3,32}$/u.test(username)) return Response.json({ error:"用户名需为 3–32 位文字、数字、点、横线或下划线。" }, { status:400 });
    if (password.length < 6 || password.length > 128) return Response.json({ error:"初始密码长度需为 6–128 个字符。" }, { status:400 });
    const existing = await appEnv().DB.prepare("SELECT id FROM users WHERE username = ? COLLATE NOCASE").bind(username).first();
    if (existing) return Response.json({ error:"用户名已存在。" }, { status:409 });
    const credentials = await hashPassword(password); const now = Date.now();
    const result = await appEnv().DB.prepare("INSERT INTO users (username, password_hash, password_salt, role, force_password_change, active, created_at, updated_at) VALUES (?, ?, ?, 'admin', 1, 1, ?, ?)")
      .bind(username, credentials.hash, credentials.salt, now, now).run();
    const id = Number(result.meta.last_row_id);
    await writeLog(user, "创建管理员账号", "账户", id, `用户名：${username}`);
    return Response.json({ id, username }, { status:201 });
  } catch { return Response.json({ error:"账号创建失败，请重试。" }, { status:500 }); }
}
