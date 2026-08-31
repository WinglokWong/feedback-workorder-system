import { createSession, currentUser, findUser, sessionCookie, setPassword, verifyPassword, writeLog } from "../../../../lib/admin";

export async function POST(request:Request) {
  const user = await currentUser();
  if (!user) return Response.json({ error:"请先登录。" }, { status:401 });
  try {
    const payload = await request.json() as { currentPassword?:string; newPassword?:string };
    const currentPassword = payload.currentPassword ?? ""; const newPassword = payload.newPassword ?? "";
    if (newPassword.length < 6 || newPassword.length > 128) return Response.json({ error:"新密码长度需为 6–128 个字符。" }, { status:400 });
    const row = await findUser(user.username);
    if (!row || !(await verifyPassword(currentPassword, row.password_salt, row.password_hash))) return Response.json({ error:"当前密码不正确。" }, { status:400 });
    await setPassword(user.id, newPassword, false);
    const token = await createSession(user.id);
    await writeLog(user, "修改密码", "账户", user.id);
    return Response.json({ ok:true }, { headers:{ "set-cookie":sessionCookie(token) } });
  } catch { return Response.json({ error:"密码修改失败，请重试。" }, { status:500 }); }
}
