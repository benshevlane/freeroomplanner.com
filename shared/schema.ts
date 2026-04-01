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

// Room plans stored on server for sharing
export const roomPlans = pgTable("room_plans", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  data: jsonb("data").notNull(), // full plan JSON
});

export const insertRoomPlanSchema = createInsertSchema(roomPlans).omit({
  id: true,
});

export type InsertRoomPlan = z.infer<typeof insertRoomPlanSchema>;
export type RoomPlan = typeof roomPlans.$inferSelect;
