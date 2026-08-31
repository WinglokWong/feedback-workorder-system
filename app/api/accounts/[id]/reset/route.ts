import { appEnv } from "../../../../../lib/tickets";
import { currentUser, isSuperAdmin, setPassword, writeLog } from "../../../../../lib/admin";

export async function POST(_request:Request, context:{ params:Promise<{ id:string }> }) {
  const user = await currentUser();
  if (!isSuperAdmin(user)) return Response.json({ error:"仅超级管理员可重置密码。" }, { status:403 });
  const rawId = (await context.params).id; const id = /^\d+$/.test(rawId) ? Number(rawId) : 0;
  const target = id ? await appEnv().DB.prepare("SELECT id, username, role FROM users WHERE id = ?").bind(id).first<{ id:number; username:string; role:string }>() : null;
  if (!target || target.role !== "admin") return Response.json({ error:"只能重置管理员账号密码。" }, { status:400 });
  await setPassword(id, "123123", true);
  await writeLog(user, "重置管理员密码", "账户", id, `用户名：${target.username}；重置为初始密码`);
  return Response.json({ ok:true, temporaryPassword:"123123" });
}
