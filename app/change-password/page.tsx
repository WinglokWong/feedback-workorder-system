import { redirect } from "next/navigation";
import PasswordForm from "../../components/PasswordForm";
import { currentUser } from "../../lib/admin";
export const dynamic = "force-dynamic";
export default async function ChangePasswordPage() { const user = await currentUser(); if (!user) redirect("/login"); return <main className="auth-page"><section><a className="brand auth-brand" href="/"><img className="brand-logo" src="/favicon.svg" alt="" /><span>工单中心</span></a><p className="eyebrow">PASSWORD SECURITY</p><h1>修改密码</h1><p>当前账号：{user.username}</p><PasswordForm forced={user.forcePasswordChange} /></section></main>; }
