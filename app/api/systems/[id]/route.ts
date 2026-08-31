import { currentUser, isAdmin, writeLog } from "../../../../lib/admin";
import { appEnv, ensureSchema } from "../../../../lib/tickets";

function parseId(value:string) { return /^\d+$/.test(value) ? Number(value) : null; }

export async function DELETE(_request:Request, context:{ params:Promise<{ id:string }> }) {
  const user = await currentUser();
  if (!user) return Response.json({ error:"请先登录管理员账号。" }, { status:401 });
  if (!isAdmin(user)) return Response.json({ error:"当前账号没有管理员权限。" }, { status:403 });
  const id = parseId((await context.params).id);
  if (!id) return Response.json({ error:"系统不存在。" }, { status:404 });

  try {
    const { DB } = appEnv();
    await ensureSchema(DB);
    const existing = await DB.prepare("SELECT id, name FROM systems WHERE id = ?").bind(id).first<{ id:number; name:string }>();
    if (!existing) return Response.json({ error:"系统不存在。" }, { status:404 });
    await DB.batch([
      DB.prepare("UPDATE tickets SET system_id = NULL WHERE system_id = ?").bind(id),
      DB.prepare("DELETE FROM systems WHERE id = ?").bind(id),
    ]);
    await writeLog(user, "删除系统", "系统", id, `名称：${existing.name}；关联工单改为未分类`);
    return Response.json({ id, deleted:true });
  } catch {
    return Response.json({ error:"系统删除失败，请稍后重试。" }, { status:500 });
  }
}
