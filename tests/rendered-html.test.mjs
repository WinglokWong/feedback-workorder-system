import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const baseUrl = process.env.TEST_BASE_URL ?? "http://localhost:3000";
const testAuthCookie = process.env.TEST_AUTH_COOKIE ?? "";
function cookieFrom(response) { return response.headers.get("set-cookie")?.split(";")[0] ?? ""; }
async function authedFetch(url, init = {}) {
  return fetch(`${baseUrl}${url}`, { ...init, headers:{ ...(init.headers ?? {}), cookie:testAuthCookie } });
}

test("未登录用户跳转登录页且看不到工单内容", async () => {
  const response = await fetch(`${baseUrl}/`, { redirect:"manual" });
  assert.ok([307, 308].includes(response.status), "请先运行 npm run dev");
  assert.equal(response.headers.get("location"), "/login");
  const login = await fetch(`${baseUrl}/login`);
  assert.equal(login.status, 200);
  const html = await login.text();
  assert.match(html, /账号登录/);
  assert.doesNotMatch(html, /最新工单|工单筛选条件/);
});

test("完整管理员流程：反馈人、处理状态、部署状态和删除", { skip:!testAuthCookie }, async () => {
  const marker = `测试系统-${Date.now()}`;
  const systemResponse = await authedFetch(`/api/systems`, {
    method:"POST", headers:{ "content-type":"application/json" }, body:JSON.stringify({ name:marker }),
  });
  assert.equal(systemResponse.status, 201);
  const system = await systemResponse.json();

  const form = new FormData();
  form.set("title", "");
  form.set("systemId", String(system.id));
  form.set("content", "无标题工单自动化测试内容");
  form.set("reporter", "测试反馈人");
  form.set("status", "pending");
  form.set("urgency", "5");
  form.set("scheduledAt", "2026-08-28");
  const created = await authedFetch(`/api/tickets`, { method:"POST", body:form });
  assert.equal(created.status, 201);
  const { id } = await created.json();

  const newerForm = new FormData();
  newerForm.set("title", "最新创建但业务日期更早");
  newerForm.set("systemId", String(system.id));
  newerForm.set("content", "用于验证新建工单置顶");
  newerForm.set("status", "pending");
  newerForm.set("scheduledAt", "2020-01-01");
  const newerResponse = await authedFetch(`/api/tickets`, { method:"POST", body:newerForm });
  assert.equal(newerResponse.status, 201);
  const { id:newerId } = await newerResponse.json();

  for (const file of [new File(["hello"], "测试附件.txt", { type:"text/plain" }), new File(["image"], "测试图片.png", { type:"image/png" })]) {
    const uploadForm = new FormData();
    uploadForm.set("file", file);
    const uploaded = await authedFetch(`/api/tickets/${id}/attachments`, { method:"POST", body:uploadForm });
    assert.equal(uploaded.status, 201);
  }

  let list = await fetch(`${baseUrl}/api/tickets`).then((response) => response.json());
  assert.equal(list.tickets[0].id, newerId);
  let ticket = list.tickets.find((item) => item.id === id);
  assert.ok(ticket);
  assert.equal(ticket.title, "");
  assert.match(ticket.ticketNumber, /^\d{6}$/);
  assert.match(list.tickets.find((item) => item.id === newerId).ticketNumber, /^\d{6}$/);
  assert.notEqual(ticket.ticketNumber, list.tickets.find((item) => item.id === newerId).ticketNumber);
  assert.equal(ticket.systemName, marker);
  assert.equal(ticket.reporter, "测试反馈人");
  assert.equal(ticket.status, "pending");
  assert.equal(ticket.deploymentStatus, "undeployed");
  assert.equal(ticket.urgency, 5);
  assert.equal(ticket.attachments.length, 2);
  assert.equal(list.tickets.find((item) => item.id === newerId).urgency, 1);

  const edited = await authedFetch(`/api/tickets/${id}`, {
    method:"PATCH", headers:{ "content-type":"application/json" }, body:JSON.stringify({
      action:"edit", title:"已修正标题", systemId:system.id, content:"已修正工单内容", reporter:"修正后的反馈人",
      status:"processing", deploymentStatus:"deployed", urgency:3, scheduledAt:"2026-08-29", assignedUserId:"",
    }),
  });
  assert.equal(edited.status, 200);
  list = await authedFetch(`/api/tickets`).then((response) => response.json());
  ticket = list.tickets.find((item) => item.id === id);
  assert.equal(ticket.title, "已修正标题");
  assert.equal(ticket.content, "已修正工单内容");
  assert.equal(ticket.reporter, "修正后的反馈人");
  assert.equal(ticket.status, "processing");
  assert.equal(ticket.deploymentStatus, "deployed");
  assert.equal(ticket.urgency, 3);

  const deletedSystem = await authedFetch(`/api/systems/${system.id}`, { method:"DELETE" });
  assert.equal(deletedSystem.status, 200);
  list = await fetch(`${baseUrl}/api/tickets`).then((response) => response.json());
  ticket = list.tickets.find((item) => item.id === id);
  assert.equal(ticket.systemId, null);
  assert.equal(ticket.systemName, null);
  const systemList = await fetch(`${baseUrl}/api/systems`).then((response) => response.json());
  assert.equal(systemList.systems.some((item) => item.id === system.id), false);

  const processing = await authedFetch(`/api/tickets/${id}`, {
    method:"PATCH", headers:{ "content-type":"application/json" }, body:JSON.stringify({ status:"processing" }),
  });
  assert.equal(processing.status, 200);
  list = await fetch(`${baseUrl}/api/tickets`).then((response) => response.json());
  ticket = list.tickets.find((item) => item.id === id);
  assert.equal(ticket.status, "processing");

  const undeployed = await authedFetch(`/api/tickets/${id}`, {
    method:"PATCH", headers:{ "content-type":"application/json" }, body:JSON.stringify({ deploymentStatus:"undeployed" }),
  });
  assert.equal(undeployed.status, 200);
  list = await fetch(`${baseUrl}/api/tickets`).then((response) => response.json());
  ticket = list.tickets.find((item) => item.id === id);
  assert.equal(ticket.deploymentStatus, "undeployed");

  const completed = await authedFetch(`/api/tickets/${id}`, {
    method:"PATCH", headers:{ "content-type":"application/json" }, body:JSON.stringify({ status:"completed" }),
  });
  assert.equal(completed.status, 200);
  list = await fetch(`${baseUrl}/api/tickets`).then((response) => response.json());
  ticket = list.tickets.find((item) => item.id === id);
  assert.equal(ticket.status, "completed");

  const attachmentId = ticket.attachments[0].id;
  const deleted = await authedFetch(`/api/tickets/${id}`, { method:"DELETE" });
  assert.equal(deleted.status, 200);
  assert.equal((await authedFetch(`/api/tickets/${newerId}`, { method:"DELETE" })).status, 200);
  list = await fetch(`${baseUrl}/api/tickets`).then((response) => response.json());
  assert.equal(list.tickets.some((item) => item.id === id), false);
  assert.equal((await fetch(`${baseUrl}/api/attachments/${attachmentId}`)).status, 404);
});

test("管理表单会准确显示累计附件并支持单独移除", async () => {
  const source = await readFile(new URL("../components/AdminForm.tsx", import.meta.url), "utf8");
  assert.match(source, /正在上传附件/);
  assert.match(source, /\/attachments/);
  assert.match(source, /finally/);
  assert.match(source, /setSelectedFiles\(next\)/);
  assert.match(source, /removeFile\(index\)/);
  assert.match(source, /name="urgency" defaultValue="1"/);
  assert.match(source, /name="deploymentStatus" defaultValue="undeployed"/);
  assert.match(source, /updateDeploymentStatus/);
  assert.match(source, /部署状态已更新为/);
  assert.match(source, /file-input-hidden/);
  assert.match(source, /已添加 \$\{selectedFiles\.length\} 个文件/);
  assert.match(source, /暂未添加文件/);
  assert.match(source, /deleteSystem/);
  assert.match(source, /window\.confirm/);
  assert.match(source, /manageSystem/);
  assert.match(source, /setManageReporter/);
  assert.match(source, /filteredTickets/);
  assert.match(source, /已有工单筛选条件/);
  assert.match(source, /manageTicketNumber/);
  assert.match(source, /ticket\.ticketNumber\.includes\(manageTicketNumber\)/);
  assert.match(source, /输入6位编号/);
  assert.doesNotMatch(source, /manage-meta.*deployment-badge/);
});

test("工单创建人和超级管理员可以修改工单内容及附件", async () => {
  const [form, route, workspace, page, permissions, upload, attachment, css] = await Promise.all([
    readFile(new URL("../components/AdminForm.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/tickets/[id]/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../components/AdminWorkspace.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/admin.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/tickets/[id]/attachments/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/attachments/[id]/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(form, /superAdmin \|\| ticket\.createdByUserId === currentUserId/);
  assert.match(form, /修改工单内容/);
  assert.match(form, /保存修改/);
  assert.match(form, /添加图片或附件/);
  assert.match(form, /deleteAttachment/);
  assert.match(form, /editFiles/);
  assert.match(form, /action:"edit"/);
  assert.match(route, /payload\.action === "edit"/);
  assert.match(route, /canEditTicket\(auth\.user, ticket\.created_by_user_id\)/);
  assert.match(route, /只有工单创建人或超级管理员可以修改工单内容/);
  assert.match(route, /UPDATE tickets SET title = \?, content = \?, reporter = \?/);
  assert.match(route, /修改工单内容/);
  assert.match(workspace, /currentUserId=\{currentUserId\}/);
  assert.match(workspace, /superAdmin=\{superAdmin\}/);
  assert.match(page, /currentUserId=\{user\.id\}/);
  assert.match(permissions, /user\.role === "superadmin" \|\| user\.id === createdByUserId/);
  assert.match(upload, /canEditTicket\(user, ticket\.created_by_user_id\)/);
  assert.match(attachment, /export async function DELETE/);
  assert.match(attachment, /FILES\.delete\(row\.storage_key\)/);
  assert.match(attachment, /删除附件/);
  assert.match(css, /\.ticket-edit-actions \.primary-button \{ border:0; background:linear-gradient/);
});

test("缩略图在当前页面打开原图预览", async () => {
  const source = await readFile(new URL("../components/AttachmentGallery.tsx", import.meta.url), "utf8");
  assert.match(source, /image-lightbox/);
  assert.match(source, /role="dialog"/);
  assert.doesNotMatch(source, /target="_blank"/);
  assert.match(source, /适应屏幕/);
  assert.match(source, /原始尺寸/);
  assert.match(source, /下载原图/);
  assert.match(source, /is-actual/);
  assert.match(source, /查看上一张图片/);
  assert.match(source, /查看下一张图片/);
  assert.match(source, /ArrowLeft/);
  assert.match(source, /ArrowRight/);
  assert.match(source, /previewIndex \+ 1/);
  assert.match(source, /images\[\(previewIndex \+ offset \+ images\.length\) % images\.length\]/);
});

test("图片附件保存原始字节且不执行压缩或转码", async () => {
  const [upload, download, css] = await Promise.all([
    readFile(new URL("../app/api/tickets/[id]/attachments/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/attachments/[id]/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(upload, /FILES\.put\(key, file\.stream\(\)/);
  assert.doesNotMatch(upload, /sharp|resize|quality|compress/i);
  assert.match(download, /new Response\(object\.body/);
  assert.match(download, /private, no-store/);
  assert.match(css, /object-fit:contain/);
  assert.match(css, /figure\.is-actual img \{ max-width:none; max-height:none/);
});

test("首页支持系统、反馈人、日期、处理状态、部署状态和紧急程度组合筛选", async () => {
  const source = await readFile(new URL("../components/TicketBoard.tsx", import.meta.url), "utf8");
  assert.match(source, /setSystem/);
  assert.match(source, /setTicketNumber/);
  assert.match(source, /ticket\.ticketNumber\.includes\(ticketNumber\)/);
  assert.match(source, /ticket-number-badge/);
  assert.match(source, /setReporter/);
  assert.match(source, /setDate/);
  assert.match(source, /setStatus/);
  assert.match(source, /全部状态/);
  assert.match(source, /setDeploymentStatus/);
  assert.match(source, /全部部署状态/);
  assert.match(source, /ticket\.deploymentStatus !== deploymentStatus/);
  assert.match(source, /setUrgency/);
  assert.match(source, /全部星级/);
  assert.match(source, /clearFilters/);
  assert.match(source, /未填写/);
});

test("超级管理员可管理账号，管理员仅能使用业务功能", { skip:!testAuthCookie }, async () => {
  const username = `testadmin${Date.now()}`;
  const created = await authedFetch("/api/accounts", { method:"POST", headers:{ "content-type":"application/json" }, body:JSON.stringify({ username, password:"Start123!" }) });
  assert.equal(created.status, 201);
  const { id } = await created.json();
  assert.equal((await authedFetch(`/api/accounts/${id}/status`, { method:"PATCH", headers:{ "content-type":"application/json" }, body:JSON.stringify({ active:false }) })).status, 200);
  assert.equal((await fetch(`${baseUrl}/api/auth/login`, { method:"POST", headers:{ "content-type":"application/json" }, body:JSON.stringify({ username, password:"Start123!" }) })).status, 401);
  assert.equal((await authedFetch(`/api/accounts/${id}/status`, { method:"PATCH", headers:{ "content-type":"application/json" }, body:JSON.stringify({ active:true }) })).status, 200);
  assert.equal((await authedFetch(`/api/accounts/${id}/reset`, { method:"POST" })).status, 200);

  const adminLogin = await fetch(`${baseUrl}/api/auth/login`, { method:"POST", headers:{ "content-type":"application/json" }, body:JSON.stringify({ username, password:"123123" }) });
  assert.equal(adminLogin.status, 200);
  let adminCookie = cookieFrom(adminLogin);
  const changed = await fetch(`${baseUrl}/api/auth/password`, { method:"POST", headers:{ "content-type":"application/json", cookie:adminCookie }, body:JSON.stringify({ currentPassword:"123123", newPassword:"AdminSecure456!" }) });
  assert.equal(changed.status, 200); adminCookie = cookieFrom(changed);

  const adminSystem = await fetch(`${baseUrl}/api/systems`, { method:"POST", headers:{ "content-type":"application/json", cookie:adminCookie }, body:JSON.stringify({ name:`管理员业务测试-${Date.now()}` }) });
  assert.equal(adminSystem.status, 201);
  const system = await adminSystem.json();
  const restrictedForm = new FormData();
  restrictedForm.set("title", "仅指定管理员可见"); restrictedForm.set("systemId", String(system.id)); restrictedForm.set("content", "权限测试"); restrictedForm.set("status", "pending"); restrictedForm.set("scheduledAt", "2026-08-29"); restrictedForm.set("assignedUserId", String(id));
  const restrictedResponse = await fetch(`${baseUrl}/api/tickets`, { method:"POST", headers:{ cookie:adminCookie }, body:restrictedForm });
  assert.equal(restrictedResponse.status, 201); const restricted = await restrictedResponse.json();
  assert.equal((await fetch(`${baseUrl}/api/tickets`)).status, 401);
  const adminTickets = await fetch(`${baseUrl}/api/tickets`, { headers:{ cookie:adminCookie } }).then((response) => response.json());
  assert.equal(adminTickets.tickets.some((ticket) => ticket.id === restricted.id), true);
  const superTickets = await authedFetch("/api/tickets").then((response) => response.json());
  assert.equal(superTickets.tickets.some((ticket) => ticket.id === restricted.id), true);
  const restrictedUpload = new FormData(); restrictedUpload.set("file", new File(["private"], "private.txt", { type:"text/plain" }));
  const uploaded = await fetch(`${baseUrl}/api/tickets/${restricted.id}/attachments`, { method:"POST", headers:{ cookie:adminCookie }, body:restrictedUpload });
  assert.equal(uploaded.status, 201); const attachment = await uploaded.json();
  assert.equal((await fetch(`${baseUrl}/api/attachments/${attachment.id}`)).status, 404);
  assert.equal((await fetch(`${baseUrl}/api/attachments/${attachment.id}`, { headers:{ cookie:adminCookie } })).status, 200);
  assert.equal((await fetch(`${baseUrl}/api/tickets/${restricted.id}`, { method:"DELETE", headers:{ cookie:adminCookie } })).status, 200);
  assert.equal((await fetch(`${baseUrl}/api/systems/${system.id}`, { method:"DELETE", headers:{ cookie:adminCookie } })).status, 200);
  assert.equal((await fetch(`${baseUrl}/api/accounts`, { headers:{ cookie:adminCookie } })).status, 403);
  assert.equal((await authedFetch(`/api/accounts/${id}/reset`, { method:"POST" })).status, 200);

  const adminPage = await authedFetch("/admin");
  const html = await adminPage.text();
  assert.match(html, /账号管理/);
  assert.match(html, /操作日志/);
});

test("操作日志仅超级管理员可见并支持账户与日期筛选", async () => {
  const source = await readFile(new URL("../components/LogViewer.tsx", import.meta.url), "utf8");
  assert.match(source, /全部账户/);
  assert.match(source, /type="date"/);
  assert.match(source, /清除筛选/);
  const workspace = await readFile(new URL("../components/AdminWorkspace.tsx", import.meta.url), "utf8");
  assert.match(workspace, /superAdmin && active === "logs"/);
  assert.match(workspace, /superAdmin \? \[/);
});

test("后台默认只展示创建工单并按角色提供四个模块", async () => {
  const [workspace, form] = await Promise.all([
    readFile(new URL("../components/AdminWorkspace.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/AdminForm.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(workspace, /useState<ModuleKey>\("create"\)/);
  assert.match(workspace, /label:"创建工单"/);
  assert.match(workspace, /label:"变更状态"/);
  assert.match(workspace, /label:"账号管理"/);
  assert.match(workspace, /label:"操作日志"/);
  assert.match(form, /mode === "create"/);
  assert.match(form, /mode === "manage"/);
});

test("支持 iOS 与 Android 添加到主屏幕且不缓存业务数据", async () => {
  const [manifestText, worker, layout, register] = await Promise.all([
    readFile(new URL("../public/manifest.webmanifest", import.meta.url), "utf8"),
    readFile(new URL("../public/sw.js", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/PwaRegister.tsx", import.meta.url), "utf8"),
  ]);
  const manifest = JSON.parse(manifestText);
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.start_url, "/");
  assert.ok(manifest.icons.some((icon) => icon.sizes === "192x192"));
  assert.ok(manifest.icons.some((icon) => icon.sizes === "512x512" && icon.purpose === "maskable"));
  assert.match(layout, /appleWebApp/);
  assert.match(layout, /apple-touch-icon\.png/);
  assert.match(register, /serviceWorker\.register\("\/sw\.js"/);
  assert.match(worker, /\/_next\/static\//);
  assert.doesNotMatch(worker, /\/api\//);
  assert.doesNotMatch(worker, /\/login/);
});

test("账号创建成功后使用稳定表单引用重置", async () => {
  const source = await readFile(new URL("../components/AccountManager.tsx", import.meta.url), "utf8");
  assert.match(source, /const formElement = event\.currentTarget/);
  assert.match(source, /formElement\.reset\(\)/);
  assert.doesNotMatch(source, /else \{ event\.currentTarget\.reset/);
  assert.match(source, /toggleActive/);
  assert.match(source, /\/status/);
  assert.match(source, /确定禁用管理员/);
  assert.match(source, /已禁用/);
});

test("首页、后台和账号日志页面包含完整手机端适配", async () => {
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(css, /@media \(max-width:760px\)/);
  assert.match(css, /@media \(max-width:380px\)/);
  assert.match(css, /\.admin-header-actions \{ width:100%/);
  assert.match(css, /\.account-list article \{ align-items:stretch; flex-direction:column/);
  assert.match(css, /\.log-list article \{ padding:11px/);
  assert.match(css, /font-size:16px/);
  assert.match(css, /min-height:44px/);
  assert.match(css, /\.manage-item \{ display:grid; grid-template-columns:minmax\(0,1fr\); gap:13px/);
  assert.match(css, /\.manage-meta \{ display:flex; align-items:center; flex-wrap:wrap/);
  assert.match(css, /\.manage-meta time,\.manage-meta em \{ white-space:nowrap/);
  assert.match(css, /\.manage-actions \{ display:flex; align-items:center; justify-content:flex-end; flex-wrap:wrap/);
  assert.match(css, /grid-template-columns:1fr 1fr/);
  assert.match(css, /\.filter-panel input\[type="date"\] \{ display:block; min-width:0; min-inline-size:0; max-width:100%; max-inline-size:100%/);
  assert.match(css, /::-webkit-date-and-time-value/);
});

test("全站使用统一冷色视觉系统与清晰卡片层级", async () => {
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(css, /--surface:#ffffff/);
  assert.match(css, /Unified visual system/);
  assert.match(css, /backdrop-filter:blur\(14px\)/);
  assert.match(css, /\.hero \{ margin-top:16px/);
  assert.match(css, /\.admin-intro \{ padding:28px/);
  assert.match(css, /linear-gradient\(155deg,#172b49,#223d63\)/);
  assert.match(css, /focus-visible/);
});

test("工单左侧状态条与标签同色且已完成使用绿色", async () => {
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(css, /--status-pending:#645c99/);
  assert.match(css, /--status-processing:#2b6388/);
  assert.match(css, /--status-completed:#2f7d62/);
  assert.match(css, /\.ticket-card-pending \{ border-left-color:var\(--status-pending\)/);
  assert.match(css, /\.ticket-card-processing \{ border-left-color:var\(--status-processing\)/);
  assert.match(css, /\.ticket-card-completed \{ border-left-color:var\(--status-completed\)/);
  assert.match(css, /\.ticket-card\.ticket-card-pending \{ border-left-color:var\(--status-pending\); background:#fbf9ff/);
  assert.match(css, /\.ticket-card\.ticket-card-processing \{ border-left-color:var\(--status-processing\); background:#f6fbfe/);
  assert.match(css, /\.ticket-card\.ticket-card-completed \{ border-left-color:var\(--status-completed\); background:#f7fcf9/);
  assert.match(css, /\.status-completed \{ background:var\(--status-completed-bg\); color:var\(--status-completed\)/);
  assert.match(css, /\.ticket-card\.is-complete \{ opacity:1/);
});

test("指定修改人权限同时覆盖工单列表和附件", async () => {
  const [form, board, tickets, attachment] = await Promise.all([
    readFile(new URL("../components/AdminForm.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/TicketBoard.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/tickets.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/attachments/[id]/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(form, /name="assignedUserId"/);
  assert.match(board, /创建人：/);
  assert.match(board, /修改人：/);
  assert.match(tickets, /assigned_user_id IS NULL OR tickets\.assigned_user_id = \? OR tickets\.created_by_user_id = \?/);
  assert.match(tickets, /creators\.username AS creator_name/);
  assert.match(tickets, /assignees\.username AS assignee_name/);
  assert.match(attachment, /canViewOrUpdateTicket/);
  assert.match(attachment, /private, no-store/);
});

test("创建人拥有自己工单的查看和状态变更权限", async () => {
  const [permissions, statusRoute] = await Promise.all([
    readFile(new URL("../lib/admin.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/tickets/[id]/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(permissions, /user\.id === assignedUserId \|\| user\.id === createdByUserId/);
  assert.match(statusRoute, /canViewOrUpdateTicket\(auth\.user, ticket\.assigned_user_id, ticket\.created_by_user_id\)/);
  assert.match(statusRoute, /canAccessAssignedResource\(auth\.user, ticket\.assigned_user_id\)/);
});

test("首页工单使用昵称并通过摘要展开查看完整详情", async () => {
  const source = await readFile(new URL("../components/TicketBoard.tsx", import.meta.url), "utf8");
  assert.match(source, /createdByName/);
  assert.match(source, /assignedUserName/);
  assert.match(source, /slice\(0, 180\)/);
  assert.match(source, /expandedTickets/);
  assert.match(source, /查看详情/);
  assert.match(source, /收起详情/);
  assert.match(source, /aria-expanded/);
});

test("首页工单、后台工单和操作日志统一支持分页", async () => {
  const [pagination, board, admin, logs] = await Promise.all([
    readFile(new URL("../components/Pagination.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/TicketBoard.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/AdminForm.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/LogViewer.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(pagination, /5 条/);
  assert.match(pagination, /10 条/);
  assert.match(pagination, /20 条/);
  assert.match(pagination, /上一页/);
  assert.match(pagination, /下一页/);
  assert.match(pagination, /第 \{safePage\} \/ \{pageCount\} 页/);
  assert.match(board, /pagedTickets/);
  assert.match(admin, /pagedManageTickets/);
  assert.match(logs, /pagedLogs/);
});

test("工单接口拒绝匿名访问并保持创建时间倒序", async () => {
  assert.equal((await fetch(`${baseUrl}/api/tickets`)).status, 401);
  const source = await readFile(new URL("../lib/tickets.ts", import.meta.url), "utf8");
  assert.match(source, /ORDER BY tickets\.created_at DESC, tickets\.id DESC/);
  assert.match(source, /WHERE 1 = 0/);
  assert.match(source, /deployment_status TEXT NOT NULL DEFAULT 'undeployed'/);
  assert.match(source, /deploymentStatus:row\.deployment_status/);
  assert.match(source, /ticketNumber:row\.ticket_number/);
  assert.match(source, /CREATE UNIQUE INDEX IF NOT EXISTS idx_tickets_ticket_number/);
  assert.match(source, /assignTicketNumber/);
});

test("每个工单自动生成唯一六位数字编号并为历史数据补号", async () => {
  const [tickets, createRoute, schema, migration] = await Promise.all([
    readFile(new URL("../lib/tickets.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/tickets/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0008_dizzy_lord_hawal.sql", import.meta.url), "utf8"),
  ]);
  assert.match(tickets, /100000 \+ id/);
  assert.match(tickets, /String\(100000 \+ \(bytes\[0\] % 900000\)\)/);
  assert.match(tickets, /ticket_number IS NULL OR length\(ticket_number\) <> 6/);
  assert.match(tickets, /UPDATE tickets SET ticket_number = \? WHERE id = \?/);
  assert.match(createRoute, /ticketNumber = await assignTicketNumber\(DB, ticketId\)/);
  assert.match(createRoute, /Response\.json\(\{ id:ticketId, ticketNumber \}/);
  assert.match(schema, /ticketNumber: text\("ticket_number"\)\.unique\(\)/);
  assert.match(migration, /printf\('%06d', 100000 \+ `id`\)/);
  assert.match(migration, /CREATE UNIQUE INDEX/);
});

test("导航使用标准链接并统一 favicon logo", async () => {
  const [home, admin, login] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/LoginForm.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(home, /<a href="\/admin"/);
  assert.match(home, /src="\/favicon\.svg"/);
  assert.match(admin, /src="\/favicon\.svg"/);
  assert.match(login, /window\.location\.assign/);
  assert.doesNotMatch(home, /from "next\/link"/);
});
