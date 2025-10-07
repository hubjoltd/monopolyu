import type { Express } from "express";
import { createServer, type Server } from "http";
import multer from "multer";
import { storage } from "./storage";
import { parseSheet } from "./services/sheet-parser";
import { validateForm, submitToForm } from "./services/google-forms";
import { googleAuth } from "./services/auth";
import { writeToSheet, getSheetHeaders } from "./services/sheets-writer";
import { insertSubmissionSchema, insertBatchSchema } from "@shared/schema";
import { z } from "zod";
import { fromZodError } from "zod-validation-error";

const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
});

export async function registerRoutes(app: Express): Promise<Server> {
  // Validate Google Form (deprecated - use response sheet instead)
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

  // Validate Response Sheet (new approach)
  app.post("/api/response-sheet/validate", async (req, res) => {
    try {
      const { url } = req.body;
      if (!url) {
        return res.status(400).json({ message: "Response sheet URL is required" });
      }

      const sheetInfo = await getSheetHeaders(url);
      res.json({
        title: "Response Spreadsheet",
        description: `Spreadsheet with ${sheetInfo.headers.length} columns`,
        url,
        fields: sheetInfo.headers.map((header, index) => ({
          id: String(index),
          title: header,
          type: 'text',
          required: false,
          entryId: String(index),
        })),
      });
    } catch (error: any) {
      console.error("Response sheet validation error:", error);
      res.status(400).json({ message: error.message || "Failed to validate response sheet" });
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

  // Fetch sheet from Google Sheets URL
  app.post("/api/sheets/fetch", async (req, res) => {
    try {
      const { url } = req.body;
      if (!url) {
        return res.status(400).json({ message: "Sheet URL is required" });
      }

      let sheetId: string | null = null;
      let gid = '0';

      try {
        const urlObj = new URL(url);
        
        // Extract sheet ID from pathname
        // Supports: /spreadsheets/d/<id>, /spreadsheets/d/e/<pub-id>/pubhtml
        const pathMatch = urlObj.pathname.match(/\/spreadsheets\/d\/(?:e\/)?([a-zA-Z0-9-_]+)/);
        if (pathMatch) {
          sheetId = pathMatch[1];
        }

        // Also support legacy open?id= format
        if (!sheetId && urlObj.searchParams.has('id')) {
          sheetId = urlObj.searchParams.get('id');
        }

        // Extract gid from query params first (most reliable)
        if (urlObj.searchParams.has('gid')) {
          gid = urlObj.searchParams.get('gid') || '0';
        } 
        // Then check hash for #gid=
        else if (urlObj.hash) {
          const hashGidMatch = urlObj.hash.match(/gid=([0-9]+)/);
          if (hashGidMatch) {
            gid = hashGidMatch[1];
          }
        }
      } catch (e) {
        throw new Error("Invalid URL format");
      }

      if (!sheetId) {
        return res.status(400).json({ message: "Could not extract sheet ID from URL" });
      }

      // Construct clean CSV export URL
      const csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;

      // Fetch the CSV data
      const response = await fetch(csvUrl);
      if (!response.ok) {
        throw new Error("Failed to fetch sheet. Make sure it's shared as 'Anyone with the link can view'");
      }

      const csvData = await response.text();
      const buffer = Buffer.from(csvData, 'utf-8');

      // Create a mock file object to reuse the parseSheet function
      const mockFile = {
        buffer,
        originalname: 'Google_Sheet.csv',
        mimetype: 'text/csv',
      } as Express.Multer.File;

      const result = await parseSheet(mockFile);
      res.json(result);
    } catch (error: any) {
      console.error("Sheet fetch error:", error);
      res.status(400).json({ message: error.message || "Failed to fetch sheet from URL" });
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
    const delayMs = submission.delayBetweenBatches ?? 2000;
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

        // Write batch to response sheet
        await writeToSheet(submission.formUrl, batchData);

        // Update batch status
        await storage.updateBatchStatus(batch.id, 'completed');

        // Update submission progress
        const newProcessedRecords = (i + 1) * batchSize;
        await storage.updateSubmissionProgress(submissionId, Math.min(newProcessedRecords, data.length));

        // Add configurable delay between batches to avoid rate limiting
        if (i < totalBatches - 1) {
          await new Promise(resolve => setTimeout(resolve, delayMs));
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

  // Authentication endpoints
  app.get("/api/auth/status", async (_req, res) => {
    try {
      const status = await googleAuth.getAuthStatus();
      res.json(status);
    } catch (error: any) {
      console.error("Auth status error:", error);
      res.status(500).json({ message: error.message || "Failed to check auth status" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
