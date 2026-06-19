import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { config } from '../config/env';

let s3Client: S3Client | null = null;
const useS3 = !!(config.aws.accessKeyId && config.aws.secretAccessKey && config.aws.bucket);

if (useS3) {
  s3Client = new S3Client({
    region: config.aws.region,
    credentials: {
      accessKeyId: config.aws.accessKeyId!,
      secretAccessKey: config.aws.secretAccessKey!,
    },
  });
} else {
  // Ensure local uploads directory exists
  const uploadDir = path.join(process.cwd(), 'uploads');
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }
}

export const uploadFile = async (file: Express.Multer.File): Promise<string> => {
  const fileExt = path.extname(file.originalname);
  const fileName = `${crypto.randomBytes(16).toString('hex')}${fileExt}`;

  if (useS3 && s3Client) {
    try {
      await s3Client.send(
        new PutObjectCommand({
          Bucket: config.aws.bucket,
          Key: fileName,
          Body: file.buffer,
          ContentType: file.mimetype,
        })
      );
      return `https://${config.aws.bucket}.s3.${config.aws.region}.amazonaws.com/${fileName}`;
    } catch (error) {
      console.error('❌ S3 Upload failed, falling back to local storage:', error);
    }
  }

  // Local storage fallback
  const uploadPath = path.join(process.cwd(), 'uploads', fileName);
  await fs.promises.writeFile(uploadPath, file.buffer);
  
  return `/uploads/${fileName}`;
};
