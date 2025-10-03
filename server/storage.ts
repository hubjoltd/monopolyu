import { type Submission, type InsertSubmission, type Batch, type InsertBatch } from "@shared/schema";
import { randomUUID } from "crypto";

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

export const storage = new MemStorage();
