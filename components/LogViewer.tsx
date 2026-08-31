"use client";

import { useEffect, useMemo, useState } from "react";
import type { AccountRecord, OperationLog } from "../lib/admin";
import Pagination from "./Pagination";

const dayKey = new Intl.DateTimeFormat("en-CA", { year:"numeric", month:"2-digit", day:"2-digit", timeZone:"Asia/Shanghai" });
const displayDate = new Intl.DateTimeFormat("zh-CN", { dateStyle:"medium", timeStyle:"medium", hour12:false, timeZone:"Asia/Shanghai" });

export default function LogViewer({ logs, accounts }:{ logs:OperationLog[]; accounts:AccountRecord[] }) {
  const [account, setAccount] = useState("");
  const [date, setDate] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const filtered = useMemo(() => logs.filter((log) => (!account || String(log.userId ?? "unknown") === account) && (!date || dayKey.format(log.createdAt) === date)), [logs, account, date]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pagedLogs = filtered.slice((page - 1) * pageSize, page * pageSize);
  useEffect(() => { setPage(1); }, [account, date, pageSize]);
  useEffect(() => { if (page > pageCount) setPage(pageCount); }, [page, pageCount]);

  return (
    <section className="super-section">
      <div className="admin-section-title"><div><span>05</span><h2>操作日志</h2></div><small>当前 {filtered.length} / 共 {logs.length} 条</small></div>
      <div className="log-filters"><label><span>账户</span><select value={account} onChange={(event) => setAccount(event.target.value)}><option value="">全部账户</option>{accounts.map((item) => <option value={item.id} key={item.id}>{item.username}</option>)}<option value="unknown">未知/登录失败</option></select></label><label><span>日期</span><input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label><button type="button" disabled={!account && !date} onClick={() => { setAccount(""); setDate(""); }}>清除筛选</button></div>
      <div className="log-list">{pagedLogs.length ? pagedLogs.map((log) => <article key={log.id}><time>{displayDate.format(log.createdAt)}</time><strong>{log.username}</strong><span>{log.action}</span><p>{log.details ?? `${log.targetType ?? ""}${log.targetId ? ` #${log.targetId}` : ""}`}</p></article>) : <p className="admin-empty">没有符合条件的日志</p>}</div>
      <Pagination total={filtered.length} page={page} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={setPageSize} />
    </section>
  );
}
