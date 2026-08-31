import { currentUser, isAdmin, writeLog } from "../../../lib/admin";
import { appEnv, ensureSchema, listSystems } from "../../../lib/tickets";

export const dynamic = "force-dynamic";

export async function GET() {
  try { return Response.json({ systems:await listSystems() }); }
  catch { return Response.json({ error:"暂时无法读取系统列表。" }, { status:500 }); }
}

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return Response.json({ error:"请先登录管理员账号。" }, { status:401 });
  if (!isAdmin(user)) return Response.json({ error:"当前账号没有管理员权限。" }, { status:403 });
  try {
    const payload = await request.json() as { name?:string };
    const name = payload.name?.trim() ?? "";
    if (!name || name.length > 60) return Response.json({ error:"系统名称为必填项，最多 60 个字符。" }, { status:400 });
    const { DB } = appEnv();
    await ensureSchema(DB);
    const existing = await DB.prepare("SELECT id FROM systems WHERE name = ? COLLATE NOCASE").bind(name).first<{ id:number }>();
    if (existing) return Response.json({ error:"该系统名称已经存在。" }, { status:409 });
    const result = await DB.prepare("INSERT INTO systems (name, created_at) VALUES (?, ?)").bind(name, Date.now()).run();
    const id = Number(result.meta.last_row_id);
    await writeLog(user, "创建系统", "系统", id, `名称：${name}`);
    return Response.json({ id, name }, { status:201 });
  } catch { return Response.json({ error:"系统创建失败，请稍后重试。" }, { status:500 }); }
}
