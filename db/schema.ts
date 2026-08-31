import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const tickets = sqliteTable("tickets", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  content: text("content").notNull(),
  scheduledAt: integer("scheduled_at", { mode: "timestamp_ms" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  authorEmail: text("author_email").notNull(),
  reporter: text("reporter"),
  systemId: integer("system_id").references(() => systems.id, { onDelete: "set null" }),
  status: text("status", { enum: ["pending", "processing", "completed"] }).notNull().default("pending"),
  urgency: integer("urgency").notNull().default(1),
  createdByUserId: integer("created_by_user_id").references(() => users.id, { onDelete:"set null" }),
  assignedUserId: integer("assigned_user_id").references(() => users.id, { onDelete:"set null" }),
  // Retained for compatibility with the first local schema migration.
  completed: integer("completed", { mode: "boolean" }).notNull().default(false),
  completedAt: integer("completed_at", { mode: "timestamp_ms" }),
}, (table) => [
  index("idx_tickets_scheduled_at").on(table.scheduledAt),
  index("idx_tickets_created_at").on(table.createdAt),
  index("idx_tickets_assigned_user_id").on(table.assignedUserId),
]);

export const systems = sqliteTable("systems", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

export const attachments = sqliteTable("attachments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ticketId: integer("ticket_id").notNull().references(() => tickets.id, { onDelete: "cascade" }),
  storageKey: text("storage_key").notNull().unique(),
  fileName: text("file_name").notNull(),
  contentType: text("content_type").notNull(),
  size: integer("size").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [index("idx_attachments_ticket_id").on(table.ticketId)]);

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  passwordSalt: text("password_salt").notNull(),
  role: text("role", { enum:["admin", "superadmin"] }).notNull(),
  forcePasswordChange: integer("force_password_change", { mode:"boolean" }).notNull().default(true),
  active: integer("active", { mode:"boolean" }).notNull().default(true),
  createdAt: integer("created_at", { mode:"timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode:"timestamp_ms" }).notNull(),
});

export const sessions = sqliteTable("sessions", {
  id: integer("id").primaryKey({ autoIncrement:true }),
  tokenHash: text("token_hash").notNull().unique(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete:"cascade" }),
  expiresAt: integer("expires_at", { mode:"timestamp_ms" }).notNull(),
  createdAt: integer("created_at", { mode:"timestamp_ms" }).notNull(),
}, (table) => [index("idx_sessions_user_id").on(table.userId), index("idx_sessions_expires_at").on(table.expiresAt)]);

export const operationLogs = sqliteTable("operation_logs", {
  id: integer("id").primaryKey({ autoIncrement:true }),
  userId: integer("user_id").references(() => users.id, { onDelete:"set null" }),
  username: text("username").notNull(),
  action: text("action").notNull(),
  targetType: text("target_type"),
  targetId: text("target_id"),
  details: text("details"),
  createdAt: integer("created_at", { mode:"timestamp_ms" }).notNull(),
}, (table) => [index("idx_operation_logs_user_id").on(table.userId), index("idx_operation_logs_created_at").on(table.createdAt)]);
