import { redirect } from "next/navigation";
import AuthActions from "../../components/AuthActions";
import AdminWorkspace from "../../components/AdminWorkspace";
import { currentUser, isAdmin, isSuperAdmin, listAccounts, listAssignableAdmins, listOperationLogs } from "../../lib/admin";
import { listSystems, listTickets } from "../../lib/tickets";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (user.forcePasswordChange) redirect("/change-password");
  const allowed = isAdmin(user);
  const [systems, tickets, assignees] = allowed ? await Promise.all([listSystems(), listTickets(user), listAssignableAdmins()]) : [[], [], []];
  const superAdmin = isSuperAdmin(user);
  const [accounts, logs] = superAdmin ? await Promise.all([listAccounts(), listOperationLogs()]) : [[], []];
  return (
    <main className="admin-shell">
      <header className="topbar"><a href="/" className="brand"><img className="brand-logo" src="/favicon.svg" alt="" /><span>工单中心</span></a><div className="admin-header-actions"><a href="/change-password">修改密码</a><a href="/">返回首页</a><AuthActions /></div></header>
      <section className="admin-layout">
        <aside className="admin-intro"><p className="eyebrow">ADMIN CONSOLE</p><h1>管理后台</h1><p>按模块进入对应工作区，创建、处理和管理信息。</p><div className="admin-account"><span>当前账号</span><strong>{user.username}</strong><small>{superAdmin ? "超级管理员" : "管理员"}</small></div></aside>
        <div className="form-panel">
          {allowed ? <AdminWorkspace systems={systems} tickets={tickets} assignees={assignees} accounts={accounts} logs={logs} superAdmin={superAdmin} currentUserId={user.id} /> : <div className="permission-note"><h2>暂无管理员权限</h2><a href="/">返回工单首页</a></div>}
        </div>
      </section>
    </main>
  );
}
