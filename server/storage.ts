import { type Submission, type InsertSubmission, type Batch, type InsertBatch, submissions, batches } from "@shared/schema";
import { randomUUID } from "crypto";
import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import { eq } from 'drizzle-orm';

export interface IStorage {
  // Submission methods
  createSubmission(submission: InsertSubmission): Promise<Submission>;
  getSubmission(id: string): Promise<Submission | undefined>;
  updateSubmissionStatus(id: string, status: string): Promise<void>;
  updateSubmissionProgress(id: string, processedRecords: number): Promise<void>;

  // Batch methods
  createBatch(batch: InsertBatch): Promise<Batch>;
  updateBatchStatus(id: string, status: string, errorMessage?: string): Promise<void>;
}

export class MemStorage implements IStorage {
  private submissions: Map<string, Submission>;
  private batches: Map<string, Batch>;

  constructor() {
    this.submissions = new Map();
    this.batches = new Map();
  }

  async createSubmission(insertSubmission: InsertSubmission): Promise<Submission> {
    const id = randomUUID();
    const now = new Date();
    const submission: Submission = {
      id,
      formUrl: insertSubmission.formUrl,
      formTitle: insertSubmission.formTitle ?? null,
      fileName: insertSubmission.fileName,
      totalRecords: insertSubmission.totalRecords,
      batchSize: insertSubmission.batchSize,
      data: insertSubmission.data as Record<string, any>[],
      processedRecords: 0,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    };
    this.submissions.set(id, submission);
    return submission;
  }

  async getSubmission(id: string): Promise<Submission | undefined> {
    return this.submissions.get(id);
  }

  async updateSubmissionStatus(id: string, status: string): Promise<void> {
    const submission = this.submissions.get(id);
    if (submission) {
      submission.status = status;
      submission.updatedAt = new Date();
      this.submissions.set(id, submission);
    }
  }

  async updateSubmissionProgress(id: string, processedRecords: number): Promise<void> {
    const submission = this.submissions.get(id);
    if (submission) {
      submission.processedRecords = processedRecords;
      submission.updatedAt = new Date();
      this.submissions.set(id, submission);
    }
  }

  async createBatch(insertBatch: InsertBatch): Promise<Batch> {
    const id = randomUUID();
    const now = new Date();
    const batch: Batch = {
      ...insertBatch,
      id,
      status: 'pending',
      errorMessage: null,
      startedAt: now,
      completedAt: null,
    };
    this.batches.set(id, batch);
    return batch;
  }

  async updateBatchStatus(id: string, status: string, errorMessage?: string): Promise<void> {
    const batch = this.batches.get(id);
    if (batch) {
      batch.status = status;
      batch.errorMessage = errorMessage || null;
      if (status === 'completed' || status === 'failed') {
        batch.completedAt = new Date();
      }
      this.batches.set(id, batch);
    }
  }
}

export class DbStorage implements IStorage {
  private db;

  constructor() {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL is not set");
    }
    const sql = neon(process.env.DATABASE_URL);
    this.db = drizzle(sql);
  }

  async createSubmission(insertSubmission: InsertSubmission): Promise<Submission> {
    const [submission] = await this.db
      .insert(submissions)
      .values({
        ...insertSubmission,
        data: insertSubmission.data as any,
      })
      .returning();
    return submission;
  }

  async getSubmission(id: string): Promise<Submission | undefined> {
    const [submission] = await this.db
      .select()
      .from(submissions)
      .where(eq(submissions.id, id));
    return submission;
  }

  async updateSubmissionStatus(id: string, status: string): Promise<void> {
    await this.db
      .update(submissions)
      .set({ status, updatedAt: new Date() })
      .where(eq(submissions.id, id));
  }

  async updateSubmissionProgress(id: string, processedRecords: number): Promise<void> {
    await this.db
      .update(submissions)
      .set({ processedRecords, updatedAt: new Date() })
      .where(eq(submissions.id, id));
  }

  async createBatch(insertBatch: InsertBatch): Promise<Batch> {
    const [batch] = await this.db
      .insert(batches)
      .values(insertBatch)
      .returning();
    return batch;
  }

  async updateBatchStatus(id: string, status: string, errorMessage?: string): Promise<void> {
    const updateData: any = { status };
    if (errorMessage !== undefined) {
      updateData.errorMessage = errorMessage;
    }
    if (status === 'completed' || status === 'failed') {
      updateData.completedAt = new Date();
    }
    
    await this.db
      .update(batches)
      .set(updateData)
      .where(eq(batches.id, id));
  }
}

// Use database storage for production
export const storage = new DbStorage();
