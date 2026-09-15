import { Request, Response, NextFunction } from 'express';
import { RazorpayWebhookService } from '../services/RazorpayWebhookService.js';

const webhookService = new RazorpayWebhookService();

export const handleRazorpayWebhook = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        // Retrieve raw body preserved by Express verify middleware or fallback to req.body
        const rawBody: string | Buffer = (req as any).rawBody || req.body;

        // Retrieve signature and event ID from headers
        const rawSignature = req.headers['x-razorpay-signature'] || req.header('x-razorpay-signature') || '';
        const signature = (Array.isArray(rawSignature) ? rawSignature[0] : rawSignature) || '';

        const rawEventId = req.headers['x-razorpay-event-id'] || req.header('x-razorpay-event-id') || '';
        const eventId = (Array.isArray(rawEventId) ? rawEventId[0] : rawEventId) || '';

        const result = await webhookService.processWebhook(rawBody, signature, eventId);

        res.status(200).json({
            success: true,
            message: result.message,
            data: {
                eventId: result.eventId,
                duplicate: result.duplicate || false,
                transactionId: result.transactionId
            }
        });
    } catch (error) {
        next(error);
    }
};
