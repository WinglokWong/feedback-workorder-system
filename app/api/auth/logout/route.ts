import { clearSessionCookie, currentUser, revokeCurrentSession, writeLog } from "../../../../lib/admin";

export async function POST() {
  const user = await currentUser();
  if (user) await writeLog(user, "退出登录", "账户", user.id);
  await revokeCurrentSession();
  return Response.json({ ok:true }, { headers:{ "set-cookie":clearSessionCookie() } });
}
