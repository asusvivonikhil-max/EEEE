import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import crypto from 'crypto';
import { uploadFile } from './storageService';

interface ImageJob {
  id: string;
  filePath: string;
  originalname: string;
  mimetype: string;
}

class ImageProcessingQueue {
  private queue: ImageJob[] = [];
  private processing = false;
  private jobsMap = new Map<string, { resolve: (url: string) => void; reject: (err: any) => void }>();

  constructor() {
    // Ensure temp directory exists
    const tempDir = path.join(process.cwd(), 'uploads', 'temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
  }

  async addJob(file: Express.Multer.File): Promise<string> {
    const jobId = crypto.randomBytes(16).toString('hex');
    const tempPath = path.join(process.cwd(), 'uploads', 'temp', `${jobId}_temp`);
    
    // Save original buffer to temporary file
    await fs.promises.writeFile(tempPath, file.buffer);

    const job: ImageJob = {
      id: jobId,
      filePath: tempPath,
      originalname: file.originalname,
      mimetype: file.mimetype,
    };

    this.queue.push(job);
    
    const promise = new Promise<string>((resolve, reject) => {
      this.jobsMap.set(jobId, { resolve, reject });
    });

    // Trigger process loop
    this.processNext();

    return promise;
  }

  private async processNext() {
    if (this.processing || this.queue.length === 0) return;
    this.processing = true;

    const job = this.queue.shift()!;
    const callbacks = this.jobsMap.get(job.id);

    try {
      console.log(`🖼️ Background processing image job ${job.id}...`);
      
      // Read original from temp file
      const inputBuffer = await fs.promises.readFile(job.filePath);

      // Perform compression/resize via sharp (max width 1200px, 80% JPEG quality)
      const outputBuffer = await sharp(inputBuffer)
        .resize({ width: 1200, withoutEnlargement: true })
        .jpeg({ quality: 80, progressive: true })
        .toBuffer();

      // Clean up temp file
      await fs.promises.unlink(job.filePath).catch(() => {});

      // Re-create a Multer File object containing the compressed JPEG buffer
      const processedFile: Express.Multer.File = {
        fieldname: 'image',
        originalname: job.originalname.replace(/\.[^/.]+$/, "") + '.jpg',
        encoding: '7bit',
        mimetype: 'image/jpeg',
        buffer: outputBuffer,
        size: outputBuffer.length,
        stream: null as any,
        destination: '',
        filename: '',
        path: '',
      };

      // Upload using storageService (S3 or local fallback)
      const finalUrl = await uploadFile(processedFile);
      
      if (callbacks) {
        callbacks.resolve(finalUrl);
      }
    } catch (err: any) {
      console.error(`❌ Background image job ${job.id} failed:`, err);
      // Ensure temp cleanup
      await fs.promises.unlink(job.filePath).catch(() => {});
      if (callbacks) {
        callbacks.reject(err);
      }
    } finally {
      this.jobsMap.delete(job.id);
      this.processing = false;
      
      // Check next job
      this.processNext();
    }
  }
}

export const imageQueue = new ImageProcessingQueue();
