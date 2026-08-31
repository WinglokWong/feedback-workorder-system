"use client";
import { useState, type FormEvent } from "react";

export default function LoginForm() {
  const [message, setMessage] = useState(""); const [busy, setBusy] = useState(false);
  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage(""); const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/auth/login", { method:"POST", headers:{ "content-type":"application/json" }, body:JSON.stringify({ username:form.get("username"), password:form.get("password") }) });
      const result = await response.json() as { error?:string; forcePasswordChange?:boolean };
      if (!response.ok) setMessage(result.error ?? "登录失败。");
      else { window.location.assign(result.forcePasswordChange ? "/change-password" : "/"); }
    } catch { setMessage("登录失败，请检查网络后重试。"); }
    finally { setBusy(false); }
  }
  return <form className="login-form" onSubmit={submit}><label><span>用户名</span><input name="username" autoComplete="username" required /></label><label><span>密码</span><input name="password" type="password" autoComplete="current-password" required /></label>{message && <p role="alert">{message}</p>}<button type="submit" disabled={busy}>{busy ? "正在登录…" : "登录"}</button></form>;
}
