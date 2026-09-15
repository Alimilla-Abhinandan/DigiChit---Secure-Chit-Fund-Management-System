import mongoose, { Schema, Document } from 'mongoose';

export enum RazorpayWebhookEventStatus {
    RECEIVED = 'RECEIVED',
    PROCESSING = 'PROCESSING',
    PROCESSED = 'PROCESSED',
    FAILED = 'FAILED'
}

export interface IRazorpayWebhookEvent extends Document {
    _id: mongoose.Types.ObjectId;
    eventId: string;
    event: string;
    status: RazorpayWebhookEventStatus;
    transactionId?: mongoose.Types.ObjectId | null;
    paymentId?: string | null;
    orderId?: string | null;
    receivedAt: Date;
    processedAt?: Date | null;
    failureReason?: string | null;
    metadata?: Record<string, any>;
    createdAt: Date;
    updatedAt: Date;
}

const RazorpayWebhookEventSchema: Schema = new Schema<IRazorpayWebhookEvent>(
    {
        eventId: {
            type: String,
            required: [true, 'Webhook Event ID is required'],
            unique: true,
            trim: true
        },
        event: {
            type: String,
            required: [true, 'Webhook event type is required'],
            trim: true
        },
        status: {
            type: String,
            enum: Object.values(RazorpayWebhookEventStatus),
            default: RazorpayWebhookEventStatus.PROCESSING,
            required: true,
            index: true
        },
        transactionId: {
            type: Schema.Types.ObjectId,
            ref: 'Transaction',
            default: null,
            index: true
        },
        paymentId: {
            type: String,
            default: null,
            trim: true,
            index: true
        },
        orderId: {
            type: String,
            default: null,
            trim: true,
            index: true
        },
        receivedAt: {
            type: Date,
            default: Date.now,
            required: true
        },
        processedAt: {
            type: Date,
            default: null
        },
        failureReason: {
            type: String,
            default: null
        },
        metadata: {
            type: Schema.Types.Mixed,
            default: {}
        }
    },
    {
        timestamps: true
    }
);

// Indexes
RazorpayWebhookEventSchema.index({ eventId: 1 }, { unique: true });
RazorpayWebhookEventSchema.index({ createdAt: -1 });

export default mongoose.model<IRazorpayWebhookEvent>('RazorpayWebhookEvent', RazorpayWebhookEventSchema);
