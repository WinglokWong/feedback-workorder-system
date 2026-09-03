"use client";

import { useState } from "react";
import type { AccountRecord, AssignableAccount, OperationLog } from "../lib/admin";
import type { SystemRecord, TicketRecord } from "../lib/tickets";
import AccountManager from "./AccountManager";
import AdminForm from "./AdminForm";
import LogViewer from "./LogViewer";

type ModuleKey = "create" | "manage" | "accounts" | "logs";

export default function AdminWorkspace({ systems, tickets, assignees, accounts, logs, superAdmin, currentUserId }:{ systems:SystemRecord[]; tickets:TicketRecord[]; assignees:AssignableAccount[]; accounts:AccountRecord[]; logs:OperationLog[]; superAdmin:boolean; currentUserId:number }) {
  const [active, setActive] = useState<ModuleKey>("create");
  const modules:Array<{ key:ModuleKey; label:string; description:string; count?:number }> = [
    { key:"create", label:"创建工单", description:"创建系统名称与新工单" },
    { key:"manage", label:"变更状态", description:"查看并处理已有工单", count:tickets.length },
    ...(superAdmin ? [
      { key:"accounts" as const, label:"账号管理", description:"创建、重置或禁用管理员", count:accounts.length },
      { key:"logs" as const, label:"操作日志", description:"查看最近7天的账户操作记录", count:logs.length },
    ] : []),
  ];
  const current = modules.find((item) => item.key === active) ?? modules[0];

  return (
    <div className="admin-workspace">
      <nav className="module-nav" aria-label="后台功能模块">
        {modules.map((item) => <button type="button" className={active === item.key ? "is-active" : ""} aria-current={active === item.key ? "page" : undefined} onClick={() => setActive(item.key)} key={item.key}><span><b>{item.label}</b><small>{item.description}</small></span>{item.count !== undefined && <em>{item.count}</em>}</button>)}
      </nav>
      <section className="module-content" aria-labelledby="active-module-title">
        <header className="module-content-heading"><div><p>当前模块</p><h2 id="active-module-title">{current.label}</h2></div><span>{current.description}</span></header>
        {(active === "create" || active === "manage") && <AdminForm systems={systems} tickets={tickets} assignees={assignees} mode={active} currentUserId={currentUserId} superAdmin={superAdmin} />}
        {superAdmin && active === "accounts" && <AccountManager accounts={accounts} />}
        {superAdmin && active === "logs" && <LogViewer accounts={accounts} logs={logs} />}
      </section>
    </div>
  );
}
