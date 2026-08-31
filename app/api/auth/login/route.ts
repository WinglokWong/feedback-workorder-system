import { createSession, findUser, sessionCookie, verifyPassword, writeLog } from "../../../../lib/admin";
import { appEnv } from "../../../../lib/tickets";

export async function POST(request:Request) {
  try {
    const payload = await request.json() as { username?:string; password?:string };
    const username = payload.username?.trim() ?? ""; const password = payload.password ?? "";
    const row = username ? await findUser(username) : null;
    if (!row || !row.active || !(await verifyPassword(password, row.password_salt, row.password_hash))) {
      await writeLog(null, "登录失败", "账户", undefined, "用户名或密码错误", username || "空用户名");
      return Response.json({ error:"用户名或密码错误。" }, { status:401 });
    }
    if (row.role === "superadmin" && password === "123123" && !row.force_password_change) {
      await appEnv().DB.prepare("UPDATE users SET force_password_change = 1, updated_at = ? WHERE id = ?").bind(Date.now(), row.id).run();
      row.force_password_change = 1;
    }
    const token = await createSession(row.id);
    const user = { id:row.id, username:row.username, role:row.role, forcePasswordChange:Boolean(row.force_password_change), userId:String(row.id), email:row.username, displayName:row.username };
    await writeLog(user, "登录成功", "账户", row.id);
    return Response.json({ role:row.role, forcePasswordChange:Boolean(row.force_password_change) }, { headers:{ "set-cookie":sessionCookie(token) } });
  } catch { return Response.json({ error:"登录失败，请稍后重试。" }, { status:500 }); }
}
