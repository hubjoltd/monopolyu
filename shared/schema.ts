import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, json, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const submissions = pgTable("submissions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  formUrl: text("form_url").notNull(),
  formTitle: text("form_title"),
  fileName: text("file_name").notNull(),
  totalRecords: integer("total_records").notNull(),
  batchSize: integer("batch_size").notNull(),
  processedRecords: integer("processed_records").default(0),
  status: text("status").notNull().default("pending"), // pending, processing, completed, failed
  data: json("data").$type<Record<string, any>[]>().notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const batches = pgTable("batches", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  submissionId: varchar("submission_id").notNull().references(() => submissions.id),
  batchNumber: integer("batch_number").notNull(),
  recordsCount: integer("records_count").notNull(),
  status: text("status").notNull().default("pending"), // pending, processing, completed, failed
  errorMessage: text("error_message"),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
});

export const insertSubmissionSchema = createInsertSchema(submissions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  processedRecords: true,
});

export const insertBatchSchema = createInsertSchema(batches).omit({
  id: true,
  startedAt: true,
  completedAt: true,
});

export type InsertSubmission = z.infer<typeof insertSubmissionSchema>;
export type Submission = typeof submissions.$inferSelect;
export type InsertBatch = z.infer<typeof insertBatchSchema>;
export type Batch = typeof batches.$inferSelect;

export const formValidationSchema = z.object({
  url: z.string().url("Please enter a valid Google Form URL"),
});

export const batchControlSchema = z.object({
  batchSize: z.number().min(1).max(500),
  soundEnabled: z.boolean(),
});
