import { redirect } from "next/navigation";
import LoginForm from "../../components/LoginForm";
import { currentUser } from "../../lib/admin";
export const dynamic = "force-dynamic";
export default async function LoginPage() { const user = await currentUser(); if (user) redirect(user.forcePasswordChange ? "/change-password" : "/admin"); return <main className="auth-page"><section><a className="brand auth-brand" href="/login"><img className="brand-logo" src="/favicon.svg" alt="" /><span>工单中心</span></a><p className="eyebrow">ACCOUNT SIGN IN</p><h1>账号登录</h1><p>登录后查看工单或进入管理员后台。</p><LoginForm /></section></main>; }
