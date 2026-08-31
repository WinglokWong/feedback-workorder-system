"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { SystemRecord, TicketRecord } from "../lib/tickets";
import type { AssignableAccount } from "../lib/admin";
import Pagination from "./Pagination";

const statusLabels = { pending:"待处理", processing:"处理中", completed:"已完成" } as const;
const EMPTY_REPORTER = "__empty__";
function urgencyStars(value:number) { return `${"★".repeat(value)}${"☆".repeat(5 - value)}`; }

async function requestWithTimeout(url:string, init:RequestInit, timeoutMs = 60000) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try { return await fetch(url, { ...init, signal:controller.signal }); }
  finally { window.clearTimeout(timer); }
}

async function readResult(response:Response) {
  try { return await response.json() as { id?:number; error?:string }; }
  catch {
    if (response.status === 413) return { error:"附件体积过大，请减少单个文件大小后重试。" };
    return { error:`请求失败（${response.status}），请稍后重试。` };
  }
}

function localDate() {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 10);
}

function formDate(value:number) {
  const date = new Date(value);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 10);
}

export default function AdminForm({ systems, tickets, assignees, mode, currentUserId, superAdmin }:{ systems:SystemRecord[]; tickets:TicketRecord[]; assignees:AssignableAccount[]; mode:"create"|"manage"; currentUserId:number; superAdmin:boolean }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploadProgress, setUploadProgress] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [systemName, setSystemName] = useState("");
  const [systemBusy, setSystemBusy] = useState(false);
  const [systemActionId, setSystemActionId] = useState<number | null>(null);
  const [actionId, setActionId] = useState<number | null>(null);
  const [editingTicket, setEditingTicket] = useState<TicketRecord | null>(null);
  const [editFiles, setEditFiles] = useState<File[]>([]);
  const [manageSystem, setManageSystem] = useState("");
  const [manageReporter, setManageReporter] = useState("");
  const [managePage, setManagePage] = useState(1);
  const [managePageSize, setManagePageSize] = useState(10);

  const manageSystems = useMemo(() => Array.from(new Map(tickets.map((ticket) => [String(ticket.systemId ?? "unclassified"), ticket.systemName ?? "未分类"]))).map(([id, name]) => ({ id, name })), [tickets]);
  const manageReporters = useMemo(() => Array.from(new Set(tickets.map((ticket) => ticket.reporter).filter((value): value is string => Boolean(value)))).sort((a, b) => a.localeCompare(b, "zh-CN")), [tickets]);
  const filteredTickets = useMemo(() => tickets.filter((ticket) => {
    if (manageSystem && String(ticket.systemId ?? "unclassified") !== manageSystem) return false;
    if (manageReporter === EMPTY_REPORTER && ticket.reporter) return false;
    if (manageReporter && manageReporter !== EMPTY_REPORTER && ticket.reporter !== manageReporter) return false;
    return true;
  }), [tickets, manageSystem, manageReporter]);
  const hasManageFilters = Boolean(manageSystem || manageReporter);
  const managePageCount = Math.max(1, Math.ceil(filteredTickets.length / managePageSize));
  const pagedManageTickets = filteredTickets.slice((managePage - 1) * managePageSize, managePage * managePageSize);

  useEffect(() => {
    if (manageSystem && !manageSystems.some((system) => system.id === manageSystem)) setManageSystem("");
  }, [manageSystem, manageSystems]);
  useEffect(() => { setManagePage(1); }, [manageSystem, manageReporter, managePageSize]);
  useEffect(() => { if (managePage > managePageCount) setManagePage(managePageCount); }, [managePage, managePageCount]);

  function clearManageFilters() { setManageSystem(""); setManageReporter(""); }

  async function createSystem(event:FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSystemBusy(true); setMessage("");
    const response = await fetch("/api/systems", { method:"POST", headers:{ "content-type":"application/json" }, body:JSON.stringify({ name:systemName }) });
    const result = await response.json() as { error?:string };
    if (!response.ok) { setMessage(result.error ?? "系统创建失败。"); setSystemBusy(false); return; }
    setSystemName(""); setSystemBusy(false); setMessage("系统已创建。"); router.refresh();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage("");
    const form = event.currentTarget;
    const payload = new FormData(form);
    payload.delete("files");
    let ticketId:number | null = null;
    try {
      setUploadProgress("正在创建工单…");
      const response = await requestWithTimeout("/api/tickets", { method:"POST", body:payload });
      const result = await readResult(response);
      if (!response.ok || !result.id) throw new Error(result.error ?? "提交失败，请重试。");
      ticketId = result.id;

      for (let index = 0; index < selectedFiles.length; index += 1) {
        setUploadProgress(`正在上传附件 ${index + 1}/${selectedFiles.length}…`);
        const filePayload = new FormData();
        filePayload.set("file", selectedFiles[index]);
        const upload = await requestWithTimeout(`/api/tickets/${ticketId}/attachments`, { method:"POST", body:filePayload });
        const uploadResult = await readResult(upload);
        if (!upload.ok) throw new Error(`${selectedFiles[index].name}：${uploadResult.error ?? "上传失败"}`);
      }

      form.reset(); setSelectedFiles([]); setMessage("工单已创建。"); router.refresh();
    } catch (error) {
      if (ticketId) {
        try { await requestWithTimeout(`/api/tickets/${ticketId}`, { method:"DELETE" }, 15000); }
        catch { /* The user can remove a rare partial record from the management list. */ }
      }
      const isTimeout = error instanceof DOMException && error.name === "AbortError";
      setMessage(isTimeout ? "上传等待时间过长，已取消创建，请检查网络后重试。" : error instanceof Error ? error.message : "创建失败，请重试。");
    } finally {
      setBusy(false); setUploadProgress("");
    }
  }

  async function deleteSystem(system:SystemRecord) {
    if (!window.confirm(`确定删除系统“${system.name}”吗？属于该系统的工单不会删除，但系统名称会变为“未分类”。`)) return;
    setSystemActionId(system.id); setMessage("");
    try {
      const response = await fetch(`/api/systems/${system.id}`, { method:"DELETE" });
      const result = await response.json() as { error?:string };
      if (!response.ok) setMessage(result.error ?? "系统删除失败。");
      else { setMessage(`系统“${system.name}”已删除，关联工单已改为未分类。`); router.refresh(); }
    } catch { setMessage("系统删除失败，请检查网络后重试。"); }
    finally { setSystemActionId(null); }
  }

  function addFiles(files:FileList | null) {
    if (!files?.length) return;
    const next = [...selectedFiles];
    const existing = new Set(selectedFiles.map((file) => `${file.name}:${file.size}:${file.lastModified}`));
    for (const file of Array.from(files)) {
      const key = `${file.name}:${file.size}:${file.lastModified}`;
      if (!existing.has(key) && next.length < 8) { next.push(file); existing.add(key); }
    }
    if (selectedFiles.length + files.length > 8) setMessage("每个工单最多添加 8 个附件。");
    setSelectedFiles(next);
  }

  function removeFile(index:number) {
    setSelectedFiles((current) => current.filter((_, fileIndex) => fileIndex !== index));
  }

  async function updateStatus(ticket:TicketRecord, status:TicketRecord["status"]) {
    setActionId(ticket.id); setMessage("");
    const response = await fetch(`/api/tickets/${ticket.id}`, { method:"PATCH", headers:{ "content-type":"application/json" }, body:JSON.stringify({ status }) });
    const result = await response.json() as { error?:string };
    if (!response.ok) setMessage(result.error ?? "状态更新失败。");
    else { setMessage(`工单状态已更新为“${statusLabels[status]}”。`); router.refresh(); }
    setActionId(null);
  }

  async function updateTicket(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingTicket) return;
    setActionId(editingTicket.id); setMessage("");
    const form = new FormData(event.currentTarget);
    const payload = {
      action:"edit",
      title:String(form.get("title") ?? ""),
      content:String(form.get("content") ?? ""),
      reporter:String(form.get("reporter") ?? ""),
      scheduledAt:String(form.get("scheduledAt") ?? ""),
      systemId:String(form.get("systemId") ?? ""),
      status:String(form.get("status") ?? "pending"),
      urgency:String(form.get("urgency") ?? "1"),
      assignedUserId:String(form.get("assignedUserId") ?? ""),
    };
    try {
      const response = await fetch(`/api/tickets/${editingTicket.id}`, { method:"PATCH", headers:{ "content-type":"application/json" }, body:JSON.stringify(payload) });
      const result = await response.json() as { error?:string };
      if (!response.ok) { setMessage(result.error ?? "工单修改失败。"); return; }
      for (let index = 0; index < editFiles.length; index += 1) {
        const filePayload = new FormData();
        filePayload.set("file", editFiles[index]);
        const upload = await requestWithTimeout(`/api/tickets/${editingTicket.id}/attachments`, { method:"POST", body:filePayload });
        const uploadResult = await readResult(upload);
        if (!upload.ok) throw new Error(`工单内容已保存，但附件“${editFiles[index].name}”添加失败：${uploadResult.error ?? "请重试"}`);
      }
      setEditingTicket(null); setEditFiles([]); setMessage("工单内容和附件已修改。"); router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "工单修改失败，请检查网络后重试。"); }
    finally { setActionId(null); }
  }

  function toggleEdit(ticket:TicketRecord) {
    if (editingTicket?.id === ticket.id) { setEditingTicket(null); setEditFiles([]); return; }
    setEditingTicket(ticket); setEditFiles([]); setMessage("");
  }

  function addEditFiles(files:FileList | null) {
    if (!files?.length || !editingTicket) return;
    const available = Math.max(0, 8 - editingTicket.attachments.length);
    const next = [...editFiles];
    const existing = new Set(editFiles.map((file) => `${file.name}:${file.size}:${file.lastModified}`));
    for (const file of Array.from(files)) {
      const key = `${file.name}:${file.size}:${file.lastModified}`;
      if (!existing.has(key) && next.length < available) { next.push(file); existing.add(key); }
    }
    if (editFiles.length + files.length > available) setMessage("每个工单最多保留 8 个附件，请先删除不需要的附件。");
    setEditFiles(next);
  }

  async function deleteAttachment(attachmentId:number, fileName:string) {
    if (!editingTicket || !window.confirm(`确定删除附件“${fileName}”吗？删除后无法恢复。`)) return;
    setActionId(editingTicket.id); setMessage("");
    try {
      const response = await fetch(`/api/attachments/${attachmentId}`, { method:"DELETE" });
      const result = await response.json() as { error?:string };
      if (!response.ok) setMessage(result.error ?? "附件删除失败。");
      else {
        setEditingTicket({ ...editingTicket, attachments:editingTicket.attachments.filter((file) => file.id !== attachmentId) });
        setMessage(`附件“${fileName}”已删除。`); router.refresh();
      }
    } catch { setMessage("附件删除失败，请检查网络后重试。"); }
    finally { setActionId(null); }
  }

  async function deleteTicket(ticket:TicketRecord) {
    if (!window.confirm(`确定删除“${ticket.title || ticket.systemName || "未命名工单"}”吗？对应附件也会一并删除。`)) return;
    setActionId(ticket.id); setMessage("");
    const response = await fetch(`/api/tickets/${ticket.id}`, { method:"DELETE" });
    const result = await response.json() as { error?:string };
    if (!response.ok) setMessage(result.error ?? "删除失败。");
    else { setMessage("工单已删除。"); router.refresh(); }
    setActionId(null);
  }

  return (
    <div className="admin-console">
      {mode === "create" && <>
      <section className="admin-section">
        <div className="admin-section-title"><div><span>01</span><h2>系统名称</h2></div><small>先创建，之后可直接选择</small></div>
        <form className="system-form" onSubmit={createSystem}>
          <input aria-label="新系统名称" value={systemName} onChange={(event) => setSystemName(event.target.value)} maxLength={60} required placeholder="输入系统名称" />
          <button type="submit" disabled={systemBusy}>{systemBusy ? "创建中…" : "创建系统"}</button>
        </form>
        {systems.length > 0 && <div className="system-tags">{systems.map((system) => <span className="system-tag" key={system.id}><b>{system.name}</b><button type="button" disabled={systemActionId === system.id} onClick={() => deleteSystem(system)}>删除</button></span>)}</div>}
      </section>

      <section className="admin-section">
        <div className="admin-section-title"><div><span>02</span><h2>创建工单</h2></div><small>标题可不填</small></div>
        <form className="admin-form" onSubmit={submit}>
          <label><span>系统 *</span><select name="systemId" required defaultValue=""><option value="" disabled>{systems.length ? "请选择系统" : "请先创建系统"}</option>{systems.map((system) => <option value={system.id} key={system.id}>{system.name}</option>)}</select></label>
          <label><span>标题 <small>选填</small></span><input name="title" maxLength={120} placeholder="例如：例行维护通知" /></label>
          <label><span>反馈人 <small>选填</small></span><input name="reporter" maxLength={80} placeholder="填写反馈人姓名或称呼" /></label>
          <label><span>日期 *</span><input name="scheduledAt" type="date" defaultValue={localDate()} required /></label>
          <label><span>状态 *</span><select name="status" defaultValue="pending" required><option value="pending">待处理</option><option value="processing">处理中</option><option value="completed">已完成</option></select></label>
          <label><span>紧急程度 <small>默认 1 星</small></span><select name="urgency" defaultValue="1"><option value="1">★☆☆☆☆ 1 星</option><option value="2">★★☆☆☆ 2 星</option><option value="3">★★★☆☆ 3 星</option><option value="4">★★★★☆ 4 星</option><option value="5">★★★★★ 5 星（最紧急）</option></select></label>
          <label><span>指定修改人 <small>选填；不填则所有人可见</small></span><select name="assignedUserId" defaultValue=""><option value="">不指定（所有人可见）</option>{assignees.map((account) => <option value={account.id} key={account.id}>{account.username}（ID {account.id}）</option>)}</select></label>
          <label><span>具体内容 *</span><textarea name="content" maxLength={20000} required rows={8} placeholder="填写完整的安排、影响范围及注意事项……" /></label>
          <div className="file-field"><span>图片及其他附件</span><div className="file-picker-row"><label className="file-picker-button" htmlFor="ticket-files">选择文件</label><input id="ticket-files" className="file-input-hidden" name="files" type="file" multiple onChange={(event) => { addFiles(event.target.files); event.target.value = ""; }} /><em>{selectedFiles.length ? `已添加 ${selectedFiles.length} 个文件` : "暂未添加文件"}</em></div><small>{selectedFiles.length ? "可继续选择追加，已添加文件见下方清单" : "可分多次添加，最多 8 个，单个文件不超过 10MB"}</small>{selectedFiles.length > 0 && <ul className="selected-files">{selectedFiles.map((file, index) => <li key={`${file.name}-${file.size}-${file.lastModified}`}><span>{file.name}</span><button type="button" onClick={(event) => { event.preventDefault(); removeFile(index); }} aria-label={`移除 ${file.name}`}>移除</button></li>)}</ul>}</div>
          <button className="primary-button" disabled={busy || systems.length === 0} type="submit">{busy ? uploadProgress || "正在创建…" : "创建工单"}</button>
        </form>
      </section>
      </>}

      {mode === "manage" && <>
      <section className="admin-section">
        <div className="admin-section-title"><div><span>03</span><h2>已有工单</h2></div><small>当前 {filteredTickets.length} / 共 {tickets.length} 条</small></div>
        {tickets.length > 0 && <div className="manage-filters" aria-label="已有工单筛选条件"><label><span>系统</span><select value={manageSystem} onChange={(event) => setManageSystem(event.target.value)}><option value="">全部系统</option>{manageSystems.map((system) => <option value={system.id} key={system.id}>{system.name}</option>)}</select></label><label><span>反馈人</span><select value={manageReporter} onChange={(event) => setManageReporter(event.target.value)}><option value="">全部反馈人</option><option value={EMPTY_REPORTER}>未填写</option>{manageReporters.map((reporter) => <option value={reporter} key={reporter}>{reporter}</option>)}</select></label><button type="button" disabled={!hasManageFilters} onClick={clearManageFilters}>清除筛选</button></div>}
        {tickets.length === 0 ? <p className="admin-empty">暂无工单</p> : filteredTickets.length === 0 ? <p className="admin-empty">没有符合条件的工单</p> : <>
          <div className="manage-list">{pagedManageTickets.map((ticket) => <article className="manage-item" key={ticket.id}>
            <div><div className="manage-meta"><span>{ticket.systemName ?? "未分类"}</span><time>{new Date(ticket.scheduledAt).toLocaleDateString("zh-CN", { timeZone:"Asia/Shanghai" })}</time><em className="urgency-badge">{urgencyStars(ticket.urgency)}</em>{ticket.reporter && <em>反馈人：{ticket.reporter}</em>}<em>创建人：{ticket.createdByName ?? "未知"}</em><em>修改人：{ticket.assignedUserName ?? "全部"}</em></div><h3>{ticket.title || "无标题工单"}</h3><p>{ticket.content}</p></div>
            <div className="manage-actions"><select aria-label={`设置“${ticket.title || "无标题工单"}”的状态`} className={`status-select status-${ticket.status}`} value={ticket.status} disabled={actionId === ticket.id} onChange={(event) => updateStatus(ticket, event.target.value as TicketRecord["status"])}><option value="pending">待处理</option><option value="processing">处理中</option><option value="completed">已完成</option></select>{(superAdmin || ticket.createdByUserId === currentUserId) && <button className="edit-button" type="button" disabled={actionId === ticket.id} onClick={() => toggleEdit(ticket)}>修改</button>}<button className="danger-button" type="button" disabled={actionId === ticket.id} onClick={() => deleteTicket(ticket)}>删除</button></div>
            {editingTicket?.id === ticket.id && <form className="ticket-edit-form" onSubmit={updateTicket}>
              <div className="ticket-edit-heading"><strong>修改工单内容</strong><small>创建人及超级管理员可以保存修改</small></div>
              <label><span>系统 *</span><select name="systemId" required defaultValue={ticket.systemId ?? ""}><option value="" disabled>请选择系统</option>{systems.map((system) => <option value={system.id} key={system.id}>{system.name}</option>)}</select></label>
              <label><span>标题 <small>选填</small></span><input name="title" maxLength={120} defaultValue={ticket.title} /></label>
              <label><span>反馈人 <small>选填</small></span><input name="reporter" maxLength={80} defaultValue={ticket.reporter ?? ""} /></label>
              <label><span>日期 *</span><input name="scheduledAt" type="date" required defaultValue={formDate(ticket.scheduledAt)} /></label>
              <label><span>状态 *</span><select name="status" required defaultValue={ticket.status}><option value="pending">待处理</option><option value="processing">处理中</option><option value="completed">已完成</option></select></label>
              <label><span>紧急程度 *</span><select name="urgency" required defaultValue={ticket.urgency}><option value="1">★☆☆☆☆ 1 星</option><option value="2">★★☆☆☆ 2 星</option><option value="3">★★★☆☆ 3 星</option><option value="4">★★★★☆ 4 星</option><option value="5">★★★★★ 5 星（最紧急）</option></select></label>
              <label><span>指定修改人 <small>选填</small></span><select name="assignedUserId" defaultValue={ticket.assignedUserId ?? ""}><option value="">不指定（所有人可见）</option>{assignees.map((account) => <option value={account.id} key={account.id}>{account.username}（ID {account.id}）</option>)}</select></label>
              <label className="ticket-edit-content"><span>具体内容 *</span><textarea name="content" maxLength={20000} required rows={7} defaultValue={ticket.content} /></label>
              <div className="ticket-edit-attachments">
                <div className="ticket-edit-attachment-title"><span>图片及其他附件</span><small>当前 {editingTicket.attachments.length} 个，待添加 {editFiles.length} 个，最多 8 个</small></div>
                {editingTicket.attachments.length > 0 && <ul>{editingTicket.attachments.map((file) => <li key={file.id}>{file.contentType.startsWith("image/") ? <img className="edit-attachment-thumb" src={`/api/attachments/${file.id}`} alt="" /> : <span className="edit-file-icon">件</span>}<b>{file.fileName}</b><button type="button" disabled={actionId === ticket.id} onClick={() => deleteAttachment(file.id, file.fileName)}>删除</button></li>)}</ul>}
                <div className="ticket-edit-file-picker"><label className="file-picker-button" htmlFor={`edit-files-${ticket.id}`}>添加图片或附件</label><input id={`edit-files-${ticket.id}`} className="file-input-hidden" type="file" multiple onChange={(event) => { addEditFiles(event.target.files); event.target.value = ""; }} /></div>
                {editFiles.length > 0 && <ul className="pending-edit-files">{editFiles.map((file, index) => <li key={`${file.name}-${file.size}-${file.lastModified}`}><span className="edit-file-icon">新</span><b>{file.name}</b><button type="button" onClick={() => setEditFiles((current) => current.filter((_, fileIndex) => fileIndex !== index))}>移除</button></li>)}</ul>}
              </div>
              <div className="ticket-edit-actions"><button type="button" onClick={() => { setEditingTicket(null); setEditFiles([]); }}>取消</button><button className="primary-button" disabled={actionId === ticket.id} type="submit">{actionId === ticket.id ? "保存中…" : "保存修改"}</button></div>
            </form>}
          </article>)}</div>
          <Pagination total={filteredTickets.length} page={managePage} pageSize={managePageSize} onPageChange={setManagePage} onPageSizeChange={setManagePageSize} />
        </>}
      </section>
      </>}
      {message && <p className="form-message sticky-message" role="status">{message}</p>}
    </div>
  );
}
