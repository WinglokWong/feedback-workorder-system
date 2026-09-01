import { redirect } from "next/navigation";
import HomeWorkspace from "../components/HomeWorkspace";
import { listTickets } from "../lib/tickets";
import { currentUser } from "../lib/admin";

export const dynamic = "force-dynamic";

export default async function Home() {
  let tickets = [] as Awaited<ReturnType<typeof listTickets>>;
  let unavailable = false;
  const user = await currentUser();
  if (!user) redirect("/login");
  try { tickets = await listTickets(user); } catch { unavailable = true; }

  return (
    <main className="site-shell">
      <header className="topbar">
        <a href="/" className="brand" aria-label="工单中心首页"><img className="brand-logo" src="/favicon.svg" alt="" /><span>工单中心</span></a>
        <a href="/admin" className="admin-link">{user.username} · 后台</a>
      </header>
      <section className="hero"><div><p className="eyebrow">SERVICE BULLETIN</p><h1>工单公告</h1></div><p>查看最新服务安排、维护通知与相关附件。</p></section>
      <HomeWorkspace tickets={tickets} unavailable={unavailable} />
      <footer>工单中心 · 信息清晰传达，服务及时抵达</footer>
    </main>
  );
}
