"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { AccountRecord } from "../lib/admin";

export default function AccountManager({ accounts }:{ accounts:AccountRecord[] }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionId, setActionId] = useState<number|null>(null);

  async function create(event:FormEvent<HTMLFormElement>) {
    event.preventDefault(); const formElement = event.currentTarget; setBusy(true); setMessage(""); const form = new FormData(formElement);
    try {
      const response = await fetch("/api/accounts", { method:"POST", headers:{ "content-type":"application/json" }, body:JSON.stringify({ username:form.get("username"), password:form.get("password") }) });
      const result = await response.json() as { error?:string };
      if (!response.ok) setMessage(result.error ?? "创建失败。");
      else { formElement.reset(); setMessage("管理员账号已创建，首次登录需修改密码。"); router.refresh(); }
    } catch { setMessage("创建请求未完成，请检查网络后重试。"); }
    finally { setBusy(false); }
  }

  async function reset(account:AccountRecord) {
    if (!window.confirm(`确定将管理员“${account.username}”的密码重置为 123123 吗？该账号当前会话将全部退出。`)) return;
    setActionId(account.id); setMessage("");
    try { const response = await fetch(`/api/accounts/${account.id}/reset`, { method:"POST" }); const result = await response.json() as { error?:string }; if (!response.ok) setMessage(result.error ?? "重置失败。"); else { setMessage(`“${account.username}”的密码已重置为 123123。`); router.refresh(); } }
    catch { setMessage("重置失败，请重试。"); } finally { setActionId(null); }
  }

  async function toggleActive(account:AccountRecord) {
    const nextActive = !account.active;
    if (!nextActive && !window.confirm(`确定禁用管理员“${account.username}”吗？该账号会立即退出，且无法继续登录。`)) return;
    setActionId(account.id); setMessage("");
    try {
      const response = await fetch(`/api/accounts/${account.id}/status`, { method:"PATCH", headers:{ "content-type":"application/json" }, body:JSON.stringify({ active:nextActive }) });
      const result = await response.json() as { error?:string };
      if (!response.ok) setMessage(result.error ?? "状态修改失败。");
      else { setMessage(`管理员“${account.username}”已${nextActive ? "恢复" : "禁用"}。`); router.refresh(); }
    } catch { setMessage("状态修改失败，请重试。"); }
    finally { setActionId(null); }
  }

  return (
    <section className="super-section">
      <div className="admin-section-title"><div><span>04</span><h2>账号管理</h2></div><small>仅超级管理员可见</small></div>
      <form className="account-create" onSubmit={create}><label><span>管理员用户名</span><input name="username" minLength={3} maxLength={32} required /></label><label><span>初始密码</span><input name="password" type="password" minLength={6} maxLength={128} defaultValue="123123" required /></label><button type="submit" disabled={busy}>{busy ? "创建中…" : "创建管理员"}</button></form>
      {message && <p className="inline-message">{message}</p>}
      <div className="account-list">{accounts.map((account) => <article className={account.active ? "" : "account-disabled"} key={account.id}><div><strong>{account.username}</strong><span>{account.role === "superadmin" ? "超级管理员" : "管理员"} · {account.active ? "正常" : "已禁用"}{account.forcePasswordChange ? " · 待修改密码" : ""}</span></div>{account.role === "admin" && <div className="account-actions"><button type="button" disabled={!account.active || actionId === account.id} onClick={() => reset(account)}>重置为 123123</button><button className={account.active ? "disable-account" : "restore-account"} type="button" disabled={actionId === account.id} onClick={() => toggleActive(account)}>{account.active ? "禁用" : "恢复"}</button></div>}</article>)}</div>
    </section>
  );
}
