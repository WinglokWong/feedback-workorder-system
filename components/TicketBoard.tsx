"use client";

import { useEffect, useMemo, useState } from "react";
import type { TicketRecord } from "../lib/tickets";
import AttachmentGallery from "./AttachmentGallery";
import Pagination from "./Pagination";

const dateFormatter = new Intl.DateTimeFormat("zh-CN", { year:"numeric", month:"long", day:"numeric", timeZone:"Asia/Shanghai" });
const dateKeyFormatter = new Intl.DateTimeFormat("en-CA", { year:"numeric", month:"2-digit", day:"2-digit", timeZone:"Asia/Shanghai" });
const statusLabels = { pending:"待处理", processing:"处理中", completed:"已完成" } as const;
const deploymentStatusLabels = { undeployed:"未部署", deployed:"已部署" } as const;
const EMPTY_REPORTER = "__empty__";
function urgencyStars(value:number) { return `${"★".repeat(value)}${"☆".repeat(5 - value)}`; }

export default function TicketBoard({ tickets, unavailable }:{ tickets:TicketRecord[]; unavailable:boolean }) {
  const [system, setSystem] = useState("");
  const [reporter, setReporter] = useState("");
  const [date, setDate] = useState("");
  const [status, setStatus] = useState("");
  const [deploymentStatus, setDeploymentStatus] = useState("");
  const [urgency, setUrgency] = useState("");
  const [expandedTickets, setExpandedTickets] = useState<Set<number>>(() => new Set());
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const systems = useMemo(() => Array.from(new Map(tickets.map((ticket) => [String(ticket.systemId ?? "unclassified"), ticket.systemName ?? "未分类"]))).map(([id, name]) => ({ id, name })), [tickets]);
  const reporters = useMemo(() => Array.from(new Set(tickets.map((ticket) => ticket.reporter).filter((value): value is string => Boolean(value)))).sort((a, b) => a.localeCompare(b, "zh-CN")), [tickets]);
  const filtered = useMemo(() => tickets.filter((ticket) => {
    if (system && String(ticket.systemId ?? "unclassified") !== system) return false;
    if (reporter === EMPTY_REPORTER && ticket.reporter) return false;
    if (reporter && reporter !== EMPTY_REPORTER && ticket.reporter !== reporter) return false;
    if (date && dateKeyFormatter.format(ticket.scheduledAt) !== date) return false;
    if (status && ticket.status !== status) return false;
    if (deploymentStatus && ticket.deploymentStatus !== deploymentStatus) return false;
    if (urgency && ticket.urgency !== Number(urgency)) return false;
    return true;
  }), [tickets, system, reporter, date, status, deploymentStatus, urgency]);

  const counts = {
    pending:filtered.filter((ticket) => ticket.status === "pending").length,
    processing:filtered.filter((ticket) => ticket.status === "processing").length,
    completed:filtered.filter((ticket) => ticket.status === "completed").length,
  };
  const hasFilters = Boolean(system || reporter || date || status || deploymentStatus || urgency);
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pagedTickets = filtered.slice((page - 1) * pageSize, page * pageSize);

  useEffect(() => { setPage(1); }, [system, reporter, date, status, deploymentStatus, urgency, pageSize]);
  useEffect(() => { if (page > pageCount) setPage(pageCount); }, [page, pageCount]);

  function clearFilters() { setSystem(""); setReporter(""); setDate(""); setStatus(""); setDeploymentStatus(""); setUrgency(""); }
  function toggleTicket(id:number) { setExpandedTickets((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; }); }

  return (
    <section className="ticket-section" aria-labelledby="ticket-list-title">
      <div className="section-heading">
        <div><h2 id="ticket-list-title">最新工单</h2><p>新建工单优先显示</p></div>
        <div className="status-summary" aria-label={`当前显示 ${filtered.length} 条工单`}>
          <span className="summary-pending">待处理 <b>{counts.pending}</b></span>
          <span className="summary-processing">处理中 <b>{counts.processing}</b></span>
          <span className="summary-completed">已完成 <b>{counts.completed}</b></span>
        </div>
      </div>

      <div className="filter-panel" aria-label="工单筛选条件">
        <label><span>系统</span><select value={system} onChange={(event) => setSystem(event.target.value)}><option value="">全部系统</option>{systems.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
        <label><span>反馈人</span><select value={reporter} onChange={(event) => setReporter(event.target.value)}><option value="">全部反馈人</option><option value={EMPTY_REPORTER}>未填写</option>{reporters.map((name) => <option value={name} key={name}>{name}</option>)}</select></label>
        <label><span>日期</span><input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
        <label><span>工单状态</span><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">全部状态</option><option value="pending">待处理</option><option value="processing">处理中</option><option value="completed">已完成</option></select></label>
        <label><span>部署状态</span><select value={deploymentStatus} onChange={(event) => setDeploymentStatus(event.target.value)}><option value="">全部部署状态</option><option value="undeployed">未部署</option><option value="deployed">已部署</option></select></label>
        <label><span>紧急程度</span><select value={urgency} onChange={(event) => setUrgency(event.target.value)}><option value="">全部星级</option><option value="1">★☆☆☆☆ 1 星</option><option value="2">★★☆☆☆ 2 星</option><option value="3">★★★☆☆ 3 星</option><option value="4">★★★★☆ 4 星</option><option value="5">★★★★★ 5 星</option></select></label>
        <button type="button" onClick={clearFilters} disabled={!hasFilters}>清除筛选</button>
        <p>当前显示 <b>{filtered.length}</b> / {tickets.length} 条</p>
      </div>

      {unavailable ? <div className="empty-state"><strong>暂时无法载入工单</strong><p>请稍后刷新页面重试。</p></div> : tickets.length === 0 ? <div className="empty-state"><strong>暂无工单</strong><p>管理员发布的内容会显示在这里。</p></div> : filtered.length === 0 ? <div className="empty-state filtered-empty"><strong>没有符合条件的工单</strong><p>请调整或清除筛选条件。</p></div> : (
        <>
        <div className="ticket-list">
          {pagedTickets.map((ticket) => {
            const expanded = expandedTickets.has(ticket.id);
            const summary = ticket.content.length > 180 ? `${ticket.content.slice(0, 180)}…` : ticket.content;
            return <article className={`ticket-card ticket-card-${ticket.status}${ticket.status === "completed" ? " is-complete" : ""}`} key={ticket.id}>
              <div className="ticket-body">
                <div className="ticket-meta"><span className="system-badge">{ticket.systemName ?? "未分类"}</span><span className={`status-${ticket.status}`}>{statusLabels[ticket.status]}</span><span className={`deployment-badge deployment-${ticket.deploymentStatus}`}>{deploymentStatusLabels[ticket.deploymentStatus]}</span><span className={`urgency-stars urgency-${ticket.urgency}`} aria-label={`紧急程度 ${ticket.urgency} 星`}>{urgencyStars(ticket.urgency)}</span><time dateTime={new Date(ticket.scheduledAt).toISOString()}>{dateFormatter.format(ticket.scheduledAt)}</time></div>
                {ticket.title && <h3>{ticket.title}</h3>}
                {ticket.reporter && <p className="ticket-reporter">反馈人：{ticket.reporter}</p>}
                <p className="ticket-ownership"><span>创建人：{ticket.createdByName ?? "未知"}</span><span>修改人：{ticket.assignedUserName ?? "全部"}</span></p>
                <p className={`ticket-content ${expanded ? "ticket-content-full" : "ticket-content-summary"}`}>{expanded ? ticket.content : summary}</p>
                {expanded && ticket.attachments.length > 0 && <AttachmentGallery attachments={ticket.attachments} />}
                <button className="detail-toggle" type="button" aria-expanded={expanded} onClick={() => toggleTicket(ticket.id)}>{expanded ? "收起详情" : "查看详情"}</button>
                <div className="ticket-footer"><span>附件 {ticket.attachments.length} 个</span><span>发布于 {dateFormatter.format(ticket.createdAt)}</span></div>
              </div>
            </article>;
          })}
        </div>
        <Pagination total={filtered.length} page={page} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={setPageSize} />
        </>
      )}
    </section>
  );
}
