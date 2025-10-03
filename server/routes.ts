import type { Express } from "express";
import { createServer, type Server } from "http";
import multer from "multer";
import { storage } from "./storage";
import { parseSheet } from "./services/sheet-parser";
import { validateForm, submitToForm } from "./services/google-forms";
import { insertSubmissionSchema, insertBatchSchema } from "@shared/schema";
import { z } from "zod";
import { fromZodError } from "zod-validation-error";

const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
});

export async function registerRoutes(app: Express): Promise<Server> {
  // Validate Google Form
  app.post("/api/forms/validate", async (req, res) => {
    try {
      const { url } = req.body;
      if (!url) {
        return res.status(400).json({ message: "Form URL is required" });
      }

      const formData = await validateForm(url);
      res.json(formData);
    } catch (error: any) {
      console.error("Form validation error:", error);
      res.status(400).json({ message: error.message || "Failed to validate form" });
    }
  });

  // Upload and parse sheet
  app.post("/api/sheets/upload", upload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      const result = await parseSheet(req.file);
      res.json(result);
    } catch (error: any) {
      console.error("Sheet upload error:", error);
      res.status(400).json({ message: error.message || "Failed to parse sheet" });
    }
  });

  // Create submission
  app.post("/api/submissions", async (req, res) => {
    try {
      const validationResult = insertSubmissionSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          message: fromZodError(validationResult.error).toString() 
        });
      }

      const submission = await storage.createSubmission(validationResult.data);
      res.json(submission);
    } catch (error: any) {
      console.error("Create submission error:", error);
      res.status(500).json({ message: error.message || "Failed to create submission" });
    }
  });

  // Get submission by ID
  app.get("/api/submissions/:id", async (req, res) => {
    try {
      const submission = await storage.getSubmission(req.params.id);
      if (!submission) {
        return res.status(404).json({ message: "Submission not found" });
      }
      res.json(submission);
    } catch (error: any) {
      console.error("Get submission error:", error);
      res.status(500).json({ message: error.message || "Failed to get submission" });
    }
  });

  // Start processing submission
  app.post("/api/submissions/:id/process", async (req, res) => {
    try {
      const submission = await storage.getSubmission(req.params.id);
      if (!submission) {
        return res.status(404).json({ message: "Submission not found" });
      }

      // Update status to processing
      await storage.updateSubmissionStatus(submission.id, 'processing');

      // Start processing batches asynchronously
      processSubmissionBatches(submission.id).catch(error => {
        console.error("Batch processing error:", error);
        storage.updateSubmissionStatus(submission.id, 'failed');
      });

      res.json({ message: "Processing started" });
    } catch (error: any) {
      console.error("Start processing error:", error);
      res.status(500).json({ message: error.message || "Failed to start processing" });
    }
  });

  // Process submission batches
  async function processSubmissionBatches(submissionId: string) {
    const submission = await storage.getSubmission(submissionId);
    if (!submission) return;

    const data = submission.data;
    const batchSize = submission.batchSize;
    const totalBatches = Math.ceil(data.length / batchSize);

    for (let i = 0; i < totalBatches; i++) {
      const batchNumber = i + 1;
      const startIndex = i * batchSize;
      const endIndex = Math.min(startIndex + batchSize, data.length);
      const batchData = data.slice(startIndex, endIndex);

      let batch;
      try {
        // Create batch record
        batch = await storage.createBatch({
          submissionId,
          batchNumber,
          recordsCount: batchData.length,
          status: 'processing',
        });

        // Submit batch to Google Forms
        await submitToForm(submission.formUrl, batchData);

        // Update batch status
        await storage.updateBatchStatus(batch.id, 'completed');

        // Update submission progress
        const newProcessedRecords = (i + 1) * batchSize;
        await storage.updateSubmissionProgress(submissionId, Math.min(newProcessedRecords, data.length));

        // Add delay between batches to avoid rate limiting
        if (i < totalBatches - 1) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      } catch (error: any) {
        console.error(`Batch ${batchNumber} failed:`, error);
        if (batch) {
          await storage.updateBatchStatus(batch.id, 'failed', error.message);
        }
        // Continue with next batch instead of failing entire submission
      }
    }

    // Mark submission as completed
    await storage.updateSubmissionStatus(submissionId, 'completed');
  }

  const httpServer = createServer(app);
  return httpServer;
}
