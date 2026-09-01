import { currentUser, isAdmin, writeLog } from "../../../lib/admin";
import { appEnv, assignTicketNumber, ensureSchema, isAllowedFile, listTickets, safeFileName } from "../../../lib/tickets";

export const dynamic = "force-dynamic";

export async function GET() {
  try { const user = await currentUser(); if (!user) return Response.json({ error:"请先登录。" }, { status:401 }); if (!isAdmin(user)) return Response.json({ error:"请先完成密码修改。" }, { status:403 }); return Response.json({ tickets: await listTickets(user) }); }
  catch { return Response.json({ error:"暂时无法读取工单，请稍后重试。" }, { status:500 }); }
}

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return Response.json({ error:"请先登录管理员账号。" }, { status:401 });
  if (!isAdmin(user)) return Response.json({ error:"当前账号没有管理员权限。" }, { status:403 });

  try {
    const form = await request.formData();
    const title = String(form.get("title") ?? "").trim();
    const content = String(form.get("content") ?? "").trim();
    const reporter = String(form.get("reporter") ?? "").trim();
    const status = String(form.get("status") ?? "pending");
    const deploymentStatus = String(form.get("deploymentStatus") ?? "undeployed");
    const urgency = Number(form.get("urgency") ?? 1);
    const scheduledAt = Date.parse(String(form.get("scheduledAt") ?? ""));
    const systemId = Number(form.get("systemId"));
    const assignedRaw = String(form.get("assignedUserId") ?? "").trim();
    const assignedUserId = assignedRaw ? Number(assignedRaw) : null;
    const files = form.getAll("files").filter((item): item is File => item instanceof File && item.size > 0);
    if (title.length > 120) return Response.json({ error:"标题最多 120 个字符。" }, { status:400 });
    if (reporter.length > 80) return Response.json({ error:"反馈人最多 80 个字符。" }, { status:400 });
    if (!["pending", "processing", "completed"].includes(status)) return Response.json({ error:"请选择有效工单状态。" }, { status:400 });
    if (!["undeployed", "deployed"].includes(deploymentStatus)) return Response.json({ error:"请选择有效部署状态。" }, { status:400 });
    if (!Number.isInteger(urgency) || urgency < 1 || urgency > 5) return Response.json({ error:"紧急程度必须为 1 到 5 星。" }, { status:400 });
    if (!content || content.length > 20000) return Response.json({ error:"具体内容为必填项，最多 20000 个字符。" }, { status:400 });
    if (!Number.isFinite(scheduledAt)) return Response.json({ error:"请选择有效时间。" }, { status:400 });
    if (!Number.isInteger(systemId) || systemId <= 0) return Response.json({ error:"请选择所属系统。" }, { status:400 });
    if (assignedUserId !== null && (!Number.isInteger(assignedUserId) || assignedUserId <= 0)) return Response.json({ error:"指定修改人无效。" }, { status:400 });
    if (files.length > 8) return Response.json({ error:"每个工单最多上传 8 个附件。" }, { status:400 });
    if (files.some((file) => !isAllowedFile(file))) return Response.json({ error:"单个附件不能超过 10MB，且不支持可执行脚本文件。" }, { status:400 });

    const { DB, FILES } = appEnv();
    await ensureSchema(DB);
    const system = await DB.prepare("SELECT id FROM systems WHERE id = ?").bind(systemId).first<{ id:number }>();
    if (!system) return Response.json({ error:"所选系统不存在，请刷新后重试。" }, { status:400 });
    if (assignedUserId !== null) {
      const assignee = await DB.prepare("SELECT id FROM users WHERE id = ? AND role = 'admin' AND active = 1").bind(assignedUserId).first<{ id:number }>();
      if (!assignee) return Response.json({ error:"指定修改人不存在或已被禁用。" }, { status:400 });
    }
    const now = Date.now();
    const inserted = await DB.prepare("INSERT INTO tickets (title, content, scheduled_at, created_at, author_email, reporter, system_id, status, deployment_status, urgency, created_by_user_id, assigned_user_id, completed, completed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(title, content, scheduledAt, now, user.email, reporter || null, systemId, status, deploymentStatus, urgency, user.id, assignedUserId, status === "completed" ? 1 : 0, status === "completed" ? now : null).run();
    const ticketId = Number(inserted.meta.last_row_id);
    let ticketNumber:string;
    try { ticketNumber = await assignTicketNumber(DB, ticketId); }
    catch (error) { await DB.prepare("DELETE FROM tickets WHERE id = ?").bind(ticketId).run(); throw error; }
    const uploaded: string[] = [];
    try {
      for (const file of files) {
        const key = `tickets/${ticketId}/${crypto.randomUUID()}`;
        await FILES.put(key, file.stream(), { httpMetadata:{ contentType:file.type || "application/octet-stream" }, customMetadata:{ fileName:safeFileName(file.name) } });
        uploaded.push(key);
        await DB.prepare("INSERT INTO attachments (ticket_id, storage_key, file_name, content_type, size, created_at) VALUES (?, ?, ?, ?, ?, ?)")
          .bind(ticketId, key, safeFileName(file.name), file.type || "application/octet-stream", file.size, now).run();
      }
    } catch (error) {
      await Promise.all(uploaded.map((key) => FILES.delete(key)));
      await DB.prepare("DELETE FROM tickets WHERE id = ?").bind(ticketId).run();
      throw error;
    }
    await writeLog(user, "创建工单", "工单", ticketId, `编号：${ticketNumber}；${title ? `标题：${title}` : "无标题工单"}；部署状态：${deploymentStatus}；修改人：${assignedUserId ?? "全部"}`);
    return Response.json({ id:ticketId, ticketNumber }, { status:201 });
  } catch {
    return Response.json({ error:"工单创建失败，请检查内容后重试。" }, { status:500 });
  }
}
