import { env } from "cloudflare:workers";

export type TicketAttachment = {
  id: number;
  fileName: string;
  contentType: string;
  size: number;
};

export type TicketRecord = {
  id: number;
  ticketNumber: string;
  title: string;
  content: string;
  scheduledAt: number;
  createdAt: number;
  authorEmail: string;
  reporter: string | null;
  systemId: number | null;
  systemName: string | null;
  status: TicketStatus;
  deploymentStatus: DeploymentStatus;
  urgency: number;
  createdByUserId: number | null;
  assignedUserId: number | null;
  createdByName: string | null;
  assignedUserName: string | null;
  completedAt: number | null;
  attachments: TicketAttachment[];
};

export type TicketStatus = "pending" | "processing" | "completed";
export type DeploymentStatus = "undeployed" | "deployed";

export type SystemRecord = { id:number; name:string; createdAt:number };

type AppEnv = { DB: D1Database; FILES: R2Bucket; BOOTSTRAP_SUPERADMIN_USERNAME?:string; BOOTSTRAP_SUPERADMIN_PASSWORD?:string };
export function appEnv() { return env as unknown as AppEnv; }

function sixDigitCandidate(id:number) {
  const value = 100000 + id;
  return value <= 999999 ? String(value) : null;
}

export async function assignTicketNumber(db:D1Database, ticketId:number) {
  const candidates:string[] = [];
  const preferred = sixDigitCandidate(ticketId);
  if (preferred) candidates.push(preferred);
  for (let attempt = 0; attempt < 24; attempt += 1) {
    const bytes = new Uint32Array(1); crypto.getRandomValues(bytes);
    candidates.push(String(100000 + (bytes[0] % 900000)));
  }
  for (const candidate of candidates) {
    const existing = await db.prepare("SELECT id FROM tickets WHERE ticket_number = ? AND id <> ?").bind(candidate, ticketId).first<{ id:number }>();
    if (existing) continue;
    await db.prepare("UPDATE tickets SET ticket_number = ? WHERE id = ?").bind(candidate, ticketId).run();
    return candidate;
  }
  throw new Error("无法生成唯一工单编号");
}

export async function ensureSchema(db: D1Database) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS systems (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    created_at INTEGER NOT NULL
  )`).run();
  const tableInfo = await db.prepare("PRAGMA table_info(tickets)").all<{ name:string }>();
  const columns = new Set(tableInfo.results.map((column) => column.name));
  if (columns.size > 0 && !columns.has("system_id")) await db.prepare("ALTER TABLE tickets ADD COLUMN system_id INTEGER REFERENCES systems(id) ON DELETE SET NULL").run();
  if (columns.size > 0 && !columns.has("completed")) await db.prepare("ALTER TABLE tickets ADD COLUMN completed INTEGER NOT NULL DEFAULT 0").run();
  if (columns.size > 0 && !columns.has("completed_at")) await db.prepare("ALTER TABLE tickets ADD COLUMN completed_at INTEGER").run();
  if (columns.size > 0 && !columns.has("reporter")) await db.prepare("ALTER TABLE tickets ADD COLUMN reporter TEXT").run();
  if (columns.size > 0 && !columns.has("status")) {
    await db.prepare("ALTER TABLE tickets ADD COLUMN status TEXT NOT NULL DEFAULT 'pending'").run();
    await db.prepare("UPDATE tickets SET status = CASE WHEN completed = 1 THEN 'completed' ELSE 'processing' END").run();
  }
  if (columns.size > 0 && !columns.has("urgency")) await db.prepare("ALTER TABLE tickets ADD COLUMN urgency INTEGER NOT NULL DEFAULT 1").run();
  if (columns.size > 0 && !columns.has("created_by_user_id")) await db.prepare("ALTER TABLE tickets ADD COLUMN created_by_user_id INTEGER").run();
  if (columns.size > 0 && !columns.has("assigned_user_id")) await db.prepare("ALTER TABLE tickets ADD COLUMN assigned_user_id INTEGER").run();
  if (columns.size > 0 && !columns.has("deployment_status")) await db.prepare("ALTER TABLE tickets ADD COLUMN deployment_status TEXT NOT NULL DEFAULT 'undeployed'").run();
  if (columns.size > 0 && !columns.has("ticket_number")) await db.prepare("ALTER TABLE tickets ADD COLUMN ticket_number TEXT").run();
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_number TEXT,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      scheduled_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      author_email TEXT NOT NULL
      ,system_id INTEGER REFERENCES systems(id) ON DELETE SET NULL
      ,completed INTEGER NOT NULL DEFAULT 0
      ,completed_at INTEGER
      ,reporter TEXT
      ,status TEXT NOT NULL DEFAULT 'pending'
      ,urgency INTEGER NOT NULL DEFAULT 1
      ,created_by_user_id INTEGER
      ,assigned_user_id INTEGER
      ,deployment_status TEXT NOT NULL DEFAULT 'undeployed'
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_tickets_scheduled_at ON tickets (scheduled_at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_tickets_created_at ON tickets (created_at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_tickets_assigned_user_id ON tickets (assigned_user_id)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS attachments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
      storage_key TEXT NOT NULL UNIQUE,
      file_name TEXT NOT NULL,
      content_type TEXT NOT NULL,
      size INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_attachments_ticket_id ON attachments (ticket_id)"),
  ]);
  const missingNumbers = await db.prepare("SELECT id FROM tickets WHERE ticket_number IS NULL OR length(ticket_number) <> 6 OR ticket_number GLOB '*[^0-9]*'").all<{ id:number }>();
  for (const ticket of missingNumbers.results) await assignTicketNumber(db, ticket.id);
  await db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_tickets_ticket_number ON tickets (ticket_number)").run();
}

type TicketRow = { id:number; ticket_number:string; title:string; content:string; scheduled_at:number; created_at:number; author_email:string; reporter:string|null; system_id:number|null; system_name:string|null; status:TicketStatus; deployment_status:DeploymentStatus; urgency:number; created_by_user_id:number|null; assigned_user_id:number|null; creator_name:string|null; assignee_name:string|null; completed_at:number|null };
type AttachmentRow = { id:number; ticket_id:number; file_name:string; content_type:string; size:number };

type TicketViewer = { id:number; role:"admin"|"superadmin"; forcePasswordChange?:boolean } | null;

export async function listTickets(viewer:TicketViewer = null): Promise<TicketRecord[]> {
  const { DB } = appEnv();
  await ensureSchema(DB);
  const effectiveViewer = viewer?.forcePasswordChange ? null : viewer;
  const selectSql = "SELECT tickets.id, tickets.ticket_number, tickets.title, tickets.content, tickets.scheduled_at, tickets.created_at, tickets.author_email, tickets.reporter, tickets.system_id, systems.name AS system_name, tickets.status, tickets.deployment_status, tickets.urgency, tickets.created_by_user_id, tickets.assigned_user_id, creators.username AS creator_name, assignees.username AS assignee_name, tickets.completed_at FROM tickets LEFT JOIN systems ON systems.id = tickets.system_id LEFT JOIN users AS creators ON creators.id = tickets.created_by_user_id LEFT JOIN users AS assignees ON assignees.id = tickets.assigned_user_id";
  const orderSql = " ORDER BY tickets.created_at DESC, tickets.id DESC LIMIT 100";
  const statement = effectiveViewer?.role === "superadmin"
    ? DB.prepare(selectSql + orderSql)
    : effectiveViewer
      ? DB.prepare(selectSql + " WHERE tickets.assigned_user_id IS NULL OR tickets.assigned_user_id = ? OR tickets.created_by_user_id = ?" + orderSql).bind(effectiveViewer.id, effectiveViewer.id)
      : DB.prepare(selectSql + " WHERE 1 = 0" + orderSql);
  const { results: ticketRows } = await statement.all<TicketRow>();
  if (!ticketRows.length) return [];
  const { results: fileRows } = await DB.prepare(
    "SELECT id, ticket_id, file_name, content_type, size FROM attachments ORDER BY id ASC"
  ).all<AttachmentRow>();
  const byTicket = new Map<number, TicketAttachment[]>();
  for (const file of fileRows) {
    const files = byTicket.get(file.ticket_id) ?? [];
    files.push({ id:file.id, fileName:file.file_name, contentType:file.content_type, size:file.size });
    byTicket.set(file.ticket_id, files);
  }
  return ticketRows.map((row) => ({
    id:row.id, ticketNumber:row.ticket_number, title:row.title, content:row.content, scheduledAt:row.scheduled_at,
    createdAt:row.created_at, authorEmail:row.author_email, reporter:row.reporter, systemId:row.system_id,
    systemName:row.system_name, status:row.status, deploymentStatus:row.deployment_status, urgency:row.urgency, createdByUserId:row.created_by_user_id,
    assignedUserId:row.assigned_user_id, createdByName:row.creator_name ?? row.author_email ?? null,
    assignedUserName:row.assignee_name, completedAt:row.completed_at,
    attachments:byTicket.get(row.id) ?? [],
  }));
}

export async function listSystems(): Promise<SystemRecord[]> {
  const { DB } = appEnv();
  await ensureSchema(DB);
  const { results } = await DB.prepare("SELECT id, name, created_at FROM systems ORDER BY name COLLATE NOCASE ASC").all<{ id:number; name:string; created_at:number }>();
  return results.map((row) => ({ id:row.id, name:row.name, createdAt:row.created_at }));
}

export function isAllowedFile(file: File) {
  const blocked = /\.(exe|dll|bat|cmd|com|scr|msi|sh|ps1)$/i;
  return file.size > 0 && file.size <= 10 * 1024 * 1024 && !blocked.test(file.name);
}

export function safeFileName(name: string) {
  return name.replace(/[\\/\u0000-\u001f\u007f]/g, "_").slice(0, 180) || "attachment";
}
