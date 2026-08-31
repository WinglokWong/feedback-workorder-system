import { canEditTicket, currentUser, isAdmin, writeLog } from "../../../../../lib/admin";
import { appEnv, ensureSchema, isAllowedFile, safeFileName } from "../../../../../lib/tickets";

function parseId(value:string) { return /^\d+$/.test(value) ? Number(value) : null; }

export async function POST(request:Request, context:{ params:Promise<{ id:string }> }) {
  const user = await currentUser();
  if (!user) return Response.json({ error:"请先登录管理员账号。" }, { status:401 });
  if (!isAdmin(user)) return Response.json({ error:"当前账号没有管理员权限。" }, { status:403 });
  const ticketId = parseId((await context.params).id);
  if (!ticketId) return Response.json({ error:"工单不存在。" }, { status:404 });

  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File) || !isAllowedFile(file)) {
      return Response.json({ error:"附件不能为空、不能超过 10MB，且不支持可执行脚本文件。" }, { status:400 });
    }
    const { DB, FILES } = appEnv();
    await ensureSchema(DB);
    const ticket = await DB.prepare("SELECT id, assigned_user_id, created_by_user_id, created_at FROM tickets WHERE id = ?").bind(ticketId).first<{ id:number; assigned_user_id:number|null; created_by_user_id:number|null; created_at:number }>();
    if (!ticket || !canEditTicket(user, ticket.created_by_user_id)) return Response.json({ error:"只有工单创建人或超级管理员可以添加附件。" }, { status:403 });
    const count = await DB.prepare("SELECT COUNT(*) AS count FROM attachments WHERE ticket_id = ?").bind(ticketId).first<{ count:number }>();
    if ((count?.count ?? 0) >= 8) return Response.json({ error:"每个工单最多上传 8 个附件。" }, { status:400 });

    const key = `tickets/${ticketId}/${crypto.randomUUID()}`;
    const fileName = safeFileName(file.name);
    const contentType = file.type || "application/octet-stream";
    await FILES.put(key, file.stream(), { httpMetadata:{ contentType }, customMetadata:{ fileName } });
    try {
      const result = await DB.prepare("INSERT INTO attachments (ticket_id, storage_key, file_name, content_type, size, created_at) VALUES (?, ?, ?, ?, ?, ?)")
        .bind(ticketId, key, fileName, contentType, file.size, Date.now()).run();
      const id = Number(result.meta.last_row_id);
      await writeLog(user, "上传附件", "工单", ticketId, `文件：${fileName}`);
      return Response.json({ id, fileName }, { status:201 });
    } catch (error) {
      await FILES.delete(key);
      throw error;
    }
  } catch {
    return Response.json({ error:"附件上传失败，请重试。" }, { status:500 });
  }
}
