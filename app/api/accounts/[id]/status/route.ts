import { appEnv } from "../../../../../lib/tickets";
import { currentUser, isSuperAdmin, writeLog } from "../../../../../lib/admin";

export async function PATCH(request:Request, context:{ params:Promise<{ id:string }> }) {
  const user = await currentUser();
  if (!isSuperAdmin(user)) return Response.json({ error:"仅超级管理员可修改账号状态。" }, { status:403 });
  const rawId = (await context.params).id; const id = /^\d+$/.test(rawId) ? Number(rawId) : 0;
  const payload = await request.json() as { active?:boolean };
  if (typeof payload.active !== "boolean") return Response.json({ error:"账号状态无效。" }, { status:400 });
  const { DB } = appEnv();
  const target = id ? await DB.prepare("SELECT id, username, role, active FROM users WHERE id = ?").bind(id).first<{ id:number; username:string; role:string; active:number }>() : null;
  if (!target || target.role !== "admin") return Response.json({ error:"只能禁用或恢复管理员账号。" }, { status:400 });
  await DB.batch([
    DB.prepare("UPDATE users SET active = ?, updated_at = ? WHERE id = ?").bind(payload.active ? 1 : 0, Date.now(), id),
    DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(id),
  ]);
  await writeLog(user, payload.active ? "恢复管理员账号" : "禁用管理员账号", "账户", id, `用户名：${target.username}`);
  return Response.json({ id, active:payload.active });
}
