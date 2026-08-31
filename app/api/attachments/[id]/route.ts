import { appEnv, ensureSchema } from "../../../../lib/tickets";
import { canEditTicket, canViewOrUpdateTicket, currentUser, isAdmin, writeLog } from "../../../../lib/admin";

type FileRow = { ticket_id:number; storage_key:string; file_name:string; content_type:string; size:number; assigned_user_id:number|null; created_by_user_id:number|null };

export async function GET(_request: Request, context: { params: Promise<{ id:string }> }) {
  const { id } = await context.params;
  if (!/^\d+$/.test(id)) return new Response("附件不存在", { status:404 });
  const { DB, FILES } = appEnv();
  await ensureSchema(DB);
  const row = await DB.prepare("SELECT attachments.ticket_id, attachments.storage_key, attachments.file_name, attachments.content_type, attachments.size, tickets.assigned_user_id, tickets.created_by_user_id FROM attachments JOIN tickets ON tickets.id = attachments.ticket_id WHERE attachments.id = ?").bind(Number(id)).first<FileRow>();
  const user = await currentUser();
  if (!user || !row || !canViewOrUpdateTicket(user, row.assigned_user_id, row.created_by_user_id)) return new Response("附件不存在", { status:404 });
  const object = await FILES.get(row.storage_key);
  if (!object) return new Response("附件不存在", { status:404 });
  const inline = row.content_type.startsWith("image/");
  const disposition = `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(row.file_name)}`;
  return new Response(object.body, { headers:{ "content-type":row.content_type, "content-length":String(row.size), "content-disposition":disposition, "cache-control":"private, no-store" } });
}

export async function DELETE(_request:Request, context:{ params:Promise<{ id:string }> }) {
  const { id } = await context.params;
  if (!/^\d+$/.test(id)) return Response.json({ error:"附件不存在。" }, { status:404 });
  const user = await currentUser();
  if (!user) return Response.json({ error:"请先登录管理员账号。" }, { status:401 });
  if (!isAdmin(user)) return Response.json({ error:"当前账号没有管理员权限。" }, { status:403 });
  const { DB, FILES } = appEnv();
  await ensureSchema(DB);
  const row = await DB.prepare("SELECT attachments.ticket_id, attachments.storage_key, attachments.file_name, attachments.content_type, attachments.size, tickets.assigned_user_id, tickets.created_by_user_id FROM attachments JOIN tickets ON tickets.id = attachments.ticket_id WHERE attachments.id = ?").bind(Number(id)).first<FileRow>();
  if (!row) return Response.json({ error:"附件不存在。" }, { status:404 });
  if (!canEditTicket(user, row.created_by_user_id)) return Response.json({ error:"只有工单创建人或超级管理员可以删除附件。" }, { status:403 });
  const result = await DB.prepare("DELETE FROM attachments WHERE id = ?").bind(Number(id)).run();
  if (!result.meta.changes) return Response.json({ error:"附件不存在。" }, { status:404 });
  await FILES.delete(row.storage_key);
  await writeLog(user, "删除附件", "工单", row.ticket_id, `文件：${row.file_name}`);
  return Response.json({ id:Number(id), deleted:true });
}
