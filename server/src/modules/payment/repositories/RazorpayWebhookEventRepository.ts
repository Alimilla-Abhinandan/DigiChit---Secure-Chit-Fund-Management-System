import mongoose from 'mongoose';
import RazorpayWebhookEvent, { IRazorpayWebhookEvent, RazorpayWebhookEventStatus } from '../models/RazorpayWebhookEvent.js';

export class RazorpayWebhookEventRepository {
    public async create(data: {
        eventId: string;
        event: string;
        status?: RazorpayWebhookEventStatus;
        transactionId?: mongoose.Types.ObjectId | string | null;
        paymentId?: string | null;
        orderId?: string | null;
        receivedAt?: Date;
        metadata?: Record<string, any>;
    }): Promise<IRazorpayWebhookEvent> {
        return await RazorpayWebhookEvent.create({
            eventId: data.eventId,
            event: data.event,
            status: data.status || RazorpayWebhookEventStatus.PROCESSING,
            transactionId: data.transactionId ? new mongoose.Types.ObjectId(data.transactionId.toString()) : null,
            paymentId: data.paymentId || null,
            orderId: data.orderId || null,
            receivedAt: data.receivedAt || new Date(),
            metadata: data.metadata || {}
        });
    }

    public async findByEventId(eventId: string): Promise<IRazorpayWebhookEvent | null> {
        return await RazorpayWebhookEvent.findOne({ eventId });
    }

    public async markProcessed(
        id: mongoose.Types.ObjectId | string,
        transactionId?: mongoose.Types.ObjectId | string | null,
        metadataUpdates?: Record<string, any>
    ): Promise<IRazorpayWebhookEvent | null> {
        const updateData: any = {
            status: RazorpayWebhookEventStatus.PROCESSED,
            processedAt: new Date()
        };
        if (transactionId) {
            updateData.transactionId = new mongoose.Types.ObjectId(transactionId.toString());
        }
        if (metadataUpdates) {
            updateData.metadata = metadataUpdates;
        }

        return await RazorpayWebhookEvent.findByIdAndUpdate(
            id,
            { $set: updateData },
            { returnDocument: 'after' }
        );
    }

    public async markFailed(
        id: mongoose.Types.ObjectId | string,
        failureReason: string
    ): Promise<IRazorpayWebhookEvent | null> {
        return await RazorpayWebhookEvent.findByIdAndUpdate(
            id,
            {
                $set: {
                    status: RazorpayWebhookEventStatus.FAILED,
                    failureReason,
                    processedAt: new Date()
                }
            },
            { returnDocument: 'after' }
        );
    }

    public async updateStatus(
        id: mongoose.Types.ObjectId | string,
        status: RazorpayWebhookEventStatus
    ): Promise<IRazorpayWebhookEvent | null> {
        return await RazorpayWebhookEvent.findByIdAndUpdate(
            id,
            { $set: { status, updatedAt: new Date() } },
            { returnDocument: 'after' }
        );
    }
}
