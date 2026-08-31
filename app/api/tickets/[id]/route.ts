import { canAccessAssignedResource, canEditTicket, canViewOrUpdateTicket, currentUser, isAdmin, writeLog } from "../../../../lib/admin";
import { appEnv, ensureSchema } from "../../../../lib/tickets";

async function authorize() {
  const user = await currentUser();
  if (!user) return { error:Response.json({ error:"请先登录管理员账号。" }, { status:401 }) };
  if (!isAdmin(user)) return { error:Response.json({ error:"当前账号没有管理员权限。" }, { status:403 }) };
  return { user };
}

function parseId(value:string) { return /^\d+$/.test(value) ? Number(value) : null; }

export async function PATCH(request:Request, context:{ params:Promise<{ id:string }> }) {
  const auth = await authorize(); if ("error" in auth) return auth.error;
  const id = parseId((await context.params).id);
  if (!id) return Response.json({ error:"工单不存在。" }, { status:404 });
  const payload = await request.json() as { action?:string; title?:string; content?:string; reporter?:string; status?:string; urgency?:number|string; scheduledAt?:string; systemId?:number|string; assignedUserId?:number|string|null };
  const { DB } = appEnv(); await ensureSchema(DB);
  const ticket = await DB.prepare("SELECT assigned_user_id, created_by_user_id FROM tickets WHERE id = ?").bind(id).first<{ assigned_user_id:number|null; created_by_user_id:number|null }>();
  if (!ticket) return Response.json({ error:"工单不存在。" }, { status:404 });

  if (payload.action === "edit") {
    if (!canEditTicket(auth.user, ticket.created_by_user_id)) return Response.json({ error:"只有工单创建人或超级管理员可以修改工单内容。" }, { status:403 });
    const title = String(payload.title ?? "").trim();
    const content = String(payload.content ?? "").trim();
    const reporter = String(payload.reporter ?? "").trim();
    const status = String(payload.status ?? "pending");
    const urgency = Number(payload.urgency ?? 1);
    const scheduledAt = Date.parse(String(payload.scheduledAt ?? ""));
    const systemId = Number(payload.systemId);
    const assignedRaw = payload.assignedUserId == null ? "" : String(payload.assignedUserId).trim();
    const assignedUserId = assignedRaw ? Number(assignedRaw) : null;
    if (title.length > 120) return Response.json({ error:"标题最多 120 个字符。" }, { status:400 });
    if (reporter.length > 80) return Response.json({ error:"反馈人最多 80 个字符。" }, { status:400 });
    if (!content || content.length > 20000) return Response.json({ error:"具体内容为必填项，最多 20000 个字符。" }, { status:400 });
    if (!["pending", "processing", "completed"].includes(status)) return Response.json({ error:"请选择有效工单状态。" }, { status:400 });
    if (!Number.isInteger(urgency) || urgency < 1 || urgency > 5) return Response.json({ error:"紧急程度必须为 1 到 5 星。" }, { status:400 });
    if (!Number.isFinite(scheduledAt)) return Response.json({ error:"请选择有效日期。" }, { status:400 });
    if (!Number.isInteger(systemId) || systemId <= 0) return Response.json({ error:"请选择所属系统。" }, { status:400 });
    if (assignedUserId !== null && (!Number.isInteger(assignedUserId) || assignedUserId <= 0)) return Response.json({ error:"指定修改人无效。" }, { status:400 });
    const system = await DB.prepare("SELECT id FROM systems WHERE id = ?").bind(systemId).first<{ id:number }>();
    if (!system) return Response.json({ error:"所选系统不存在，请刷新后重试。" }, { status:400 });
    if (assignedUserId !== null) {
      const assignee = await DB.prepare("SELECT id FROM users WHERE id = ? AND role = 'admin' AND active = 1").bind(assignedUserId).first<{ id:number }>();
      if (!assignee) return Response.json({ error:"指定修改人不存在或已被禁用。" }, { status:400 });
    }
    const completed = status === "completed";
    await DB.prepare("UPDATE tickets SET title = ?, content = ?, reporter = ?, scheduled_at = ?, system_id = ?, status = ?, urgency = ?, assigned_user_id = ?, completed = ?, completed_at = ? WHERE id = ?")
      .bind(title, content, reporter || null, scheduledAt, systemId, status, urgency, assignedUserId, completed ? 1 : 0, completed ? Date.now() : null, id).run();
    await writeLog(auth.user, "修改工单内容", "工单", id, `${title ? `标题：${title}` : "无标题工单"}；状态：${status}`);
    return Response.json({ id, updated:true });
  }

  if (!payload.status || !["pending", "processing", "completed"].includes(payload.status)) return Response.json({ error:"工单状态无效。" }, { status:400 });
  if (!canViewOrUpdateTicket(auth.user, ticket.assigned_user_id, ticket.created_by_user_id)) return Response.json({ error:"工单不存在。" }, { status:404 });
  const completed = payload.status === "completed";
  const result = await DB.prepare("UPDATE tickets SET status = ?, completed = ?, completed_at = ? WHERE id = ?")
    .bind(payload.status, completed ? 1 : 0, completed ? Date.now() : null, id).run();
  if (!result.meta.changes) return Response.json({ error:"工单不存在。" }, { status:404 });
  await writeLog(auth.user, "更新工单状态", "工单", id, `状态：${payload.status}`);
  return Response.json({ id, status:payload.status });
}

export async function DELETE(_request:Request, context:{ params:Promise<{ id:string }> }) {
  const auth = await authorize(); if ("error" in auth) return auth.error;
  const id = parseId((await context.params).id);
  if (!id) return Response.json({ error:"工单不存在。" }, { status:404 });
  const { DB, FILES } = appEnv(); await ensureSchema(DB);
  const ticket = await DB.prepare("SELECT assigned_user_id, created_by_user_id, created_at FROM tickets WHERE id = ?").bind(id).first<{ assigned_user_id:number|null; created_by_user_id:number|null; created_at:number }>();
  const recentCreator = Boolean(ticket && auth.user && ticket.created_by_user_id === auth.user.id && Date.now() - ticket.created_at < 5 * 60 * 1000);
  if (!ticket || (!recentCreator && !canAccessAssignedResource(auth.user, ticket.assigned_user_id))) return Response.json({ error:"工单不存在。" }, { status:404 });
  const { results } = await DB.prepare("SELECT storage_key FROM attachments WHERE ticket_id = ?").bind(id).all<{ storage_key:string }>();
  const result = await DB.prepare("DELETE FROM tickets WHERE id = ?").bind(id).run();
  if (!result.meta.changes) return Response.json({ error:"工单不存在。" }, { status:404 });
  await Promise.all(results.map((file) => FILES.delete(file.storage_key)));
  await writeLog(auth.user, "删除工单", "工单", id, `同步删除附件 ${results.length} 个`);
  return Response.json({ id, deleted:true });
}
