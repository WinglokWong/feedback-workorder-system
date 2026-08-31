"use client";
import { useState, type FormEvent } from "react";

export default function PasswordForm({ forced }:{ forced:boolean }) {
  const [message, setMessage] = useState(""); const [busy, setBusy] = useState(false);
  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget); const next = String(form.get("newPassword") ?? "");
    if (next !== form.get("confirmPassword")) { setMessage("两次输入的新密码不一致。"); return; }
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/auth/password", { method:"POST", headers:{ "content-type":"application/json" }, body:JSON.stringify({ currentPassword:form.get("currentPassword"), newPassword:next }) });
      const result = await response.json() as { error?:string };
      if (!response.ok) setMessage(result.error ?? "修改失败。");
      else { setMessage("密码修改成功，正在返回首页……"); window.location.assign("/"); }
    } catch { setMessage("修改失败，请检查网络后重试。"); }
    finally { setBusy(false); }
  }
  return <form className="login-form" onSubmit={submit}>{forced && <div className="forced-note">当前为初始或重置密码，请先修改后继续使用。</div>}<label><span>当前密码</span><input name="currentPassword" type="password" autoComplete="current-password" required /></label><label><span>新密码</span><input name="newPassword" type="password" minLength={6} maxLength={128} autoComplete="new-password" required /></label><label><span>确认新密码</span><input name="confirmPassword" type="password" minLength={6} maxLength={128} autoComplete="new-password" required /></label>{message && <p role="status">{message}</p>}<button type="submit" disabled={busy}>{busy ? "正在修改…" : "修改密码"}</button></form>;
}
