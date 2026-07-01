import { sql } from "drizzle-orm";
import { pgTable, text, varchar, jsonb, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Admin users for backend authentication
export const adminUsers = pgTable("admin_users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  resetToken: text("reset_token"),
  resetTokenExpiresAt: timestamp("reset_token_expires_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Room plans stored on server for sharing.
// `id` is a short human-friendly code (e.g. K7M2XQ4A) used in /p/:code links.
// `edit_key_hash` lets the original creator update the plan in place;
// everyone else who opens the link saves a copy under a new code.
export const roomPlans = pgTable("room_plans", {
  id: varchar("id").primaryKey(),
  name: text("name").notNull().default("My floor plan"),
  data: jsonb("data").notNull(), // full plan JSON (editor exportAllRooms format)
  roomType: text("room_type"), // kitchen | bathroom | office | general (from intent)
  country: text("country"), // ISO country at save time (from Vercel geo header)
  editKeyHash: text("edit_key_hash"),
  openCount: integer("open_count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const insertRoomPlanSchema = createInsertSchema(roomPlans).omit({
  id: true,
});

export type InsertRoomPlan = z.infer<typeof insertRoomPlanSchema>;
export type RoomPlan = typeof roomPlans.$inferSelect;
