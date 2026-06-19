import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IWebhookEventDoc extends Document {
  stripeEventId: string;
  type: string;
  status: 'processing' | 'processed' | 'failed';
  payload: any;
  error?: string;
  processedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const webhookEventSchema = new Schema<IWebhookEventDoc>(
  {
    stripeEventId: { type: String, required: true, unique: true, index: true },
    type: { type: String, required: true },
    status: { type: String, enum: ['processing', 'processed', 'failed'], default: 'processing' },
    payload: { type: Schema.Types.Mixed },
    error: String,
    processedAt: Date,
  },
  { timestamps: true }
);

// Auto-delete after 90 days to prevent unbounded size
webhookEventSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

export const WebhookEvent: Model<IWebhookEventDoc> = mongoose.models.WebhookEvent || mongoose.model<IWebhookEventDoc>('WebhookEvent', webhookEventSchema);
