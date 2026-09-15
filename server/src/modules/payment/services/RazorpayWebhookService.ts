import crypto from 'crypto';
import mongoose from 'mongoose';
import { logger } from '@shared/logger/logger.js';
import { config } from '@shared/config/env.js';
import { AppError } from '@shared/errors/AppError.js';
import { logAction } from '@shared/logger/auditLogger.js';
import { UserRole } from '@modules/user/models/User.js';
import { eventBus } from '../events/eventBus.js';
import { PaymentDomainEventType } from '../events/domainEvents.js';
import { TransactionRepository } from '../repositories/TransactionRepository.js';
import { RazorpayWebhookEventRepository } from '../repositories/RazorpayWebhookEventRepository.js';
import { RazorpayWebhookEventStatus, IRazorpayWebhookEvent } from '../models/RazorpayWebhookEvent.js';
import { ITransaction, TransactionStatus } from '../models/Transaction.js';
import { buildReceiptMetadata } from '../utils/receiptGenerator.js';

export interface WebhookProcessResult {
    success: boolean;
    message: string;
    eventId: string;
    duplicate?: boolean | undefined;
    transactionId?: string | null | undefined;
}

export class RazorpayWebhookService {
    private webhookRepo: RazorpayWebhookEventRepository;
    private txnRepo: TransactionRepository;

    constructor() {
        this.webhookRepo = new RazorpayWebhookEventRepository();
        this.txnRepo = new TransactionRepository();
    }

    /**
     * Verifies the cryptographic HMAC-SHA256 signature against the exact raw HTTP request body.
     */
    public verifySignature(rawBody: string | Buffer, receivedSignature: string): boolean {
        const webhookSecret = config.razorpay.webhookSecret;
        if (!webhookSecret) {
            logger.error('[RazorpayWebhook Error] RAZORPAY_WEBHOOK_SECRET is not configured on server');
            throw new AppError('Razorpay webhook secret is not configured on server', 500, 'WEBHOOK_SECRET_MISSING');
        }

        if (!receivedSignature || typeof receivedSignature !== 'string') {
            return false;
        }

        try {
            const expectedSignature = crypto
                .createHmac('sha256', webhookSecret)
                .update(rawBody)
                .digest('hex');

            const sigBuf = Buffer.from(receivedSignature.trim(), 'utf8');
            const expectedBuf = Buffer.from(expectedSignature, 'utf8');

            if (sigBuf.length !== expectedBuf.length) {
                return false;
            }

            return crypto.timingSafeEqual(sigBuf, expectedBuf);
        } catch (err: any) {
            logger.error('[RazorpayWebhook Error] Signature computation error:', err.message || err);
            return false;
        }
    }

    /**
     * Processes a verified Razorpay webhook event with full idempotency, transaction reconciliation,
     * and event-driven ledger integration.
     */
    public async processWebhook(
        rawBody: string | Buffer,
        signatureHeader: string,
        eventIdHeader?: string
    ): Promise<WebhookProcessResult> {
        // 1. Validate and Verify Webhook Signature
        if (!signatureHeader || signatureHeader.trim().length === 0) {
            logger.warn('[RazorpayWebhook] Missing X-Razorpay-Signature header');
            throw new AppError('Missing X-Razorpay-Signature header', 400, 'MISSING_WEBHOOK_SIGNATURE');
        }

        const isSignatureValid = this.verifySignature(rawBody, signatureHeader);
        if (!isSignatureValid) {
            logger.warn('[RazorpayWebhook] Invalid webhook signature detected');
            throw new AppError('Invalid Razorpay webhook signature', 400, 'INVALID_WEBHOOK_SIGNATURE');
        }

        // 2. Parse Raw Body to JSON
        let payload: any;
        try {
            const bodyString = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8');
            payload = JSON.parse(bodyString);
        } catch (parseError: any) {
            logger.error('[RazorpayWebhook Error] Failed to parse raw body JSON:', parseError.message);
            throw new AppError('Malformed webhook request body', 400, 'INVALID_PAYLOAD');
        }

        if (!payload || typeof payload !== 'object') {
            throw new AppError('Invalid webhook payload structure', 400, 'INVALID_PAYLOAD');
        }

        // 3. Extract Event ID & Event Type
        const eventId = (
            eventIdHeader ||
            payload.id ||
            payload.event_id ||
            `evt_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
        ).trim();

        if (!eventId) {
            throw new AppError('Missing webhook event identifier', 400, 'MISSING_EVENT_ID');
        }

        const eventType: string = payload.event || '';
        if (!eventType) {
            throw new AppError('Missing webhook event type', 400, 'MISSING_EVENT_TYPE');
        }

        // Extract safe logging identifiers
        const paymentEntity = payload.payload?.payment?.entity || payload.payment?.entity || payload.payment;
        const refundEntity = payload.payload?.refund?.entity || payload.refund?.entity || payload.refund;
        const orderId: string | undefined = paymentEntity?.order_id || payload.payload?.order?.entity?.id;
        const paymentId: string | undefined = paymentEntity?.id || refundEntity?.payment_id;

        logger.info(
            `[RazorpayWebhook] Received Event: ${eventType} | Event ID: ${eventId} | Order ID: ${orderId || 'N/A'} | Payment ID: ${paymentId || 'N/A'}`
        );

        // 4. Event Idempotency & Deduplication
        let webhookRecord: IRazorpayWebhookEvent | null = null;
        try {
            webhookRecord = await this.webhookRepo.create({
                eventId,
                event: eventType,
                status: RazorpayWebhookEventStatus.PROCESSING,
                paymentId: paymentId || null,
                orderId: orderId || null,
                receivedAt: new Date(),
                metadata: {
                    event: eventType,
                    accountId: payload.account_id
                }
            });
        } catch (err: any) {
            // Duplicate event (E11000)
            if (err.code === 11000 || err.message?.includes('duplicate key') || err.name === 'MongoServerError') {
                const existing = await this.webhookRepo.findByEventId(eventId);
                if (!existing) {
                    throw new AppError('Webhook event duplicate conflict', 409, 'WEBHOOK_EVENT_CONFLICT');
                }

                if (existing.status === RazorpayWebhookEventStatus.PROCESSED) {
                    logger.info(`[RazorpayWebhook] Event ${eventId} was already processed successfully. Returning idempotent 200.`);
                    return {
                        success: true,
                        duplicate: true,
                        eventId,
                        transactionId: existing.transactionId ? existing.transactionId.toString() : undefined,
                        message: 'Webhook event already processed (idempotent)'
                    };
                }

                if (existing.status === RazorpayWebhookEventStatus.PROCESSING) {
                    logger.info(`[RazorpayWebhook] Event ${eventId} is currently being processed concurrently. Awaiting resolution...`);
                    const startWait = Date.now();
                    const maxWaitMs = 5000;
                    while (Date.now() - startWait < maxWaitMs) {
                        await new Promise((r) => setTimeout(r, 100));
                        const polled = await this.webhookRepo.findByEventId(eventId);
                        if (polled?.status === RazorpayWebhookEventStatus.PROCESSED) {
                            return {
                                success: true,
                                duplicate: true,
                                eventId,
                                transactionId: polled.transactionId ? polled.transactionId.toString() : undefined,
                                message: 'Webhook event processed by concurrent worker'
                            };
                        }
                    }
                    return {
                        success: true,
                        duplicate: true,
                        eventId,
                        message: 'Webhook event currently in processing'
                    };
                }

                if (existing.status === RazorpayWebhookEventStatus.FAILED) {
                    logger.info(`[RazorpayWebhook] Retrying previously failed webhook event ${eventId}`);
                    await this.webhookRepo.updateStatus(existing._id, RazorpayWebhookEventStatus.PROCESSING);
                    webhookRecord = existing;
                }
            } else {
                throw err;
            }
        }

        // 5. Business Processing by Event Type
        try {
            let processResult: WebhookProcessResult;

            switch (eventType) {
                case 'payment.captured':
                case 'order.paid':
                    processResult = await this.handlePaymentCaptured(payload, eventId, webhookRecord?._id);
                    break;

                case 'payment.failed':
                    processResult = await this.handlePaymentFailed(payload, eventId, webhookRecord?._id);
                    break;

                case 'refund.processed':
                    processResult = await this.handleRefundProcessed(payload, eventId, webhookRecord?._id);
                    break;

                default:
                    logger.info(`[RazorpayWebhook] Unhandled event type: ${eventType}. Safely acknowledged.`);
                    if (webhookRecord) {
                        await this.webhookRepo.markProcessed(webhookRecord._id, null, { ignored: true, reason: 'Unsupported event type' });
                    }
                    processResult = {
                        success: true,
                        eventId,
                        message: `Event ${eventType} safely acknowledged without domain action`
                    };
                    break;
            }

            return processResult;
        } catch (processingError: any) {
            logger.error(`[RazorpayWebhook Error] Processing failed for event ${eventId}:`, processingError.message || processingError);
            if (webhookRecord) {
                await this.webhookRepo.markFailed(webhookRecord._id, processingError.message || 'Webhook processing failed');
            }
            throw processingError;
        }
    }

    /**
     * Handles payment.captured event
     */
    private async handlePaymentCaptured(
        payload: any,
        eventId: string,
        webhookRecordId?: mongoose.Types.ObjectId
    ): Promise<WebhookProcessResult> {
        const payment = payload.payload?.payment?.entity || payload.payment?.entity || payload.payment;
        if (!payment) {
            throw new AppError('Missing payment entity in payment.captured webhook', 400, 'INVALID_WEBHOOK_PAYLOAD');
        }

        const gatewayPaymentId: string = payment.id;
        const gatewayOrderId: string = payment.order_id;
        const amountInPaise: number = payment.amount;
        const currency: string = (payment.currency || 'INR').toUpperCase();

        if (!gatewayOrderId) {
            throw new AppError('Missing order_id in payment.captured webhook', 400, 'MISSING_ORDER_ID');
        }

        // 1. Reconcile with DigiChit Transaction
        const transaction = await this.txnRepo.findByGatewayOrderId(gatewayOrderId);
        if (!transaction) {
            logger.warn(`[RazorpayWebhook] Reconciliation failed: No DigiChit transaction found for Razorpay order ID ${gatewayOrderId}`);
            throw new AppError(`Transaction not found for order ${gatewayOrderId}`, 404, 'TRANSACTION_NOT_FOUND');
        }

        const transactionIdStr = transaction._id.toString();

        // 2. Validate Amount & Currency (Integer Paise Check)
        const expectedPaise = Math.round(transaction.amount * 100);
        if (amountInPaise !== expectedPaise) {
            logger.error(
                `[RazorpayWebhook Error] Amount mismatch for transaction ${transactionIdStr}: expected ${expectedPaise} paise, got ${amountInPaise} paise`
            );
            throw new AppError(
                `Amount mismatch: expected ${expectedPaise} paise, received ${amountInPaise} paise`,
                400,
                'AMOUNT_MISMATCH'
            );
        }

        if (currency !== transaction.currency.toUpperCase()) {
            logger.error(
                `[RazorpayWebhook Error] Currency mismatch for transaction ${transactionIdStr}: expected ${transaction.currency}, got ${currency}`
            );
            throw new AppError('Currency mismatch in payment.captured webhook', 400, 'CURRENCY_MISMATCH');
        }

        // 3. Idempotency & State Transition Safety
        if (transaction.status === TransactionStatus.SUCCESS) {
            logger.info(`[RazorpayWebhook] Transaction ${transactionIdStr} is already SUCCESS. Skipping state mutation.`);
            if (webhookRecordId) {
                await this.webhookRepo.markProcessed(webhookRecordId, transaction._id, {
                    note: 'Transaction was already SUCCESS (idempotent)'
                });
            }
            return {
                success: true,
                duplicate: true,
                eventId,
                transactionId: transactionIdStr,
                message: 'Transaction already SUCCESS (idempotent)'
            };
        }

        if (transaction.status === TransactionStatus.CANCELLED || transaction.status === TransactionStatus.EXPIRED) {
            logger.warn(`[RazorpayWebhook] Transaction ${transactionIdStr} is in invalid state ${transaction.status}`);
            throw new AppError(`Cannot capture payment for transaction in ${transaction.status} state`, 400, 'INVALID_TRANSACTION_STATE');
        }

        // 4. Atomic Transition PENDING -> SUCCESS
        const actor = await this.txnRepo.findUserById(transaction.memberId.toString());
        const receipt = await buildReceiptMetadata(transaction, actor?.name, actor?.email);

        const updateData: Partial<ITransaction> = {
            gatewayPaymentId,
            completedAt: new Date(),
            receiptNumber: receipt.receiptNumber,
            metadata: {
                ...(transaction.metadata || {}),
                receipt,
                webhookCaptured: {
                    eventId,
                    capturedAt: new Date(),
                    method: payment.method,
                    bank: payment.bank,
                    wallet: payment.wallet,
                    vpa: payment.vpa
                }
            }
        };
        if (receipt.receiptUrl) {
            updateData.receiptUrl = receipt.receiptUrl;
        }

        // Atomic conditional update to prevent races with verifyPayment
        const updatedTxn = await this.txnRepo.updateStatusIfCurrent(
            transactionIdStr,
            TransactionStatus.PENDING,
            TransactionStatus.SUCCESS,
            updateData
        );

        if (!updatedTxn) {
            // Update was null because status was no longer PENDING (e.g. verifyPayment raced and won)
            const freshTxn = await this.txnRepo.findById(transactionIdStr);
            logger.info(
                `[RazorpayWebhook] Concurrent race: Transaction ${transactionIdStr} was transitioned by another thread to ${freshTxn?.status}`
            );
            if (webhookRecordId) {
                await this.webhookRepo.markProcessed(webhookRecordId, transaction._id, {
                    note: 'Raced with verifyPayment, converged safely'
                });
            }
            return {
                success: true,
                duplicate: true,
                eventId,
                transactionId: transactionIdStr,
                message: 'Transaction transitioned by concurrent process'
            };
        }

        // 5. Audit Log
        await logAction(transaction.memberId.toString(), UserRole.USER, 'PAYMENT_SUCCESS', {
            previousValue: { status: TransactionStatus.PENDING },
            newValue: {
                transactionId: updatedTxn._id,
                transactionNumber: updatedTxn.transactionNumber,
                receiptNumber: receipt.receiptNumber,
                source: 'RAZORPAY_WEBHOOK',
                eventId
            }
        });

        // 6. Publish Domain Event (triggers Installment update to PAID and P3 Ledger Journal Posting)
        eventBus.publish({
            eventType: PaymentDomainEventType.TRANSACTION_SUCCESS,
            timestamp: new Date(),
            data: updatedTxn
        });

        // 7. Mark Webhook Record PROCESSED
        if (webhookRecordId) {
            await this.webhookRepo.markProcessed(webhookRecordId, updatedTxn._id);
        }

        logger.info(
            `[RazorpayWebhook] Successfully captured payment for Transaction ${updatedTxn.transactionNumber} (${transactionIdStr})`
        );

        return {
            success: true,
            eventId,
            transactionId: transactionIdStr,
            message: 'Payment captured and transaction completed successfully'
        };
    }

    /**
     * Handles payment.failed event
     */
    private async handlePaymentFailed(
        payload: any,
        eventId: string,
        webhookRecordId?: mongoose.Types.ObjectId
    ): Promise<WebhookProcessResult> {
        const payment = payload.payload?.payment?.entity || payload.payment?.entity || payload.payment;
        if (!payment) {
            throw new AppError('Missing payment entity in payment.failed webhook', 400, 'INVALID_WEBHOOK_PAYLOAD');
        }

        const gatewayOrderId: string = payment.order_id;
        const gatewayPaymentId: string = payment.id;
        const failureReason =
            payment.error_description || payment.error_reason || payment.error_code || 'Payment failed on Razorpay';

        if (!gatewayOrderId) {
            logger.warn('[RazorpayWebhook] Missing order_id in payment.failed event. Acknowledging safely.');
            if (webhookRecordId) {
                await this.webhookRepo.markProcessed(webhookRecordId, null, { note: 'Missing order_id on payment.failed' });
            }
            return { success: true, eventId, message: 'payment.failed acknowledged without orderId' };
        }

        const transaction = await this.txnRepo.findByGatewayOrderId(gatewayOrderId);
        if (!transaction) {
            logger.warn(`[RazorpayWebhook] No transaction found for failed order ${gatewayOrderId}`);
            if (webhookRecordId) {
                await this.webhookRepo.markProcessed(webhookRecordId, null, { note: 'No transaction found for failed order' });
            }
            return { success: true, eventId, message: 'No transaction found for failed order' };
        }

        const transactionIdStr = transaction._id.toString();

        // Safety Rule: Never downgrade an already successful transaction!
        if (transaction.status === TransactionStatus.SUCCESS) {
            logger.warn(
                `[RazorpayWebhook] Late payment.failed received for already SUCCESS transaction ${transaction.transactionNumber} (${transactionIdStr}). Ignoring downgrade.`
            );
            if (webhookRecordId) {
                await this.webhookRepo.markProcessed(webhookRecordId, transaction._id, {
                    note: 'Ignored payment.failed for already SUCCESS transaction'
                });
            }
            return {
                success: true,
                duplicate: true,
                eventId,
                transactionId: transactionIdStr,
                message: 'Ignored payment.failed for already SUCCESS transaction'
            };
        }

        if (transaction.status === TransactionStatus.PENDING) {
            const updatedTxn = await this.txnRepo.updateStatusIfCurrent(
                transactionIdStr,
                TransactionStatus.PENDING,
                TransactionStatus.FAILED,
                {
                    gatewayPaymentId,
                    failureReason,
                    metadata: {
                        ...(transaction.metadata || {}),
                        webhookFailed: {
                            eventId,
                            failedAt: new Date(),
                            errorCode: payment.error_code,
                            errorDescription: payment.error_description
                        }
                    }
                }
            );

            if (updatedTxn) {
                await logAction(transaction.memberId.toString(), UserRole.USER, 'PAYMENT_FAILED', {
                    previousValue: { status: TransactionStatus.PENDING },
                    newValue: {
                        transactionId: updatedTxn._id,
                        failureReason,
                        source: 'RAZORPAY_WEBHOOK',
                        eventId
                    }
                });

                eventBus.publish({
                    eventType: PaymentDomainEventType.TRANSACTION_FAILED,
                    timestamp: new Date(),
                    data: updatedTxn
                });
            }
        }

        if (webhookRecordId) {
            await this.webhookRepo.markProcessed(webhookRecordId, transaction._id);
        }

        return {
            success: true,
            eventId,
            transactionId: transactionIdStr,
            message: 'Transaction marked FAILED from webhook'
        };
    }

    /**
     * Handles refund.processed event
     */
    private async handleRefundProcessed(
        payload: any,
        eventId: string,
        webhookRecordId?: mongoose.Types.ObjectId
    ): Promise<WebhookProcessResult> {
        const refund = payload.payload?.refund?.entity || payload.refund?.entity || payload.refund;
        if (!refund) {
            throw new AppError('Missing refund entity in refund.processed webhook', 400, 'INVALID_WEBHOOK_PAYLOAD');
        }

        const gatewayPaymentId: string = refund.payment_id;
        const refundId: string = refund.id;
        const refundAmountInPaise: number = refund.amount;
        const refundAmount = refundAmountInPaise / 100;

        if (!gatewayPaymentId) {
            throw new AppError('Missing payment_id in refund.processed webhook', 400, 'MISSING_PAYMENT_ID');
        }

        // Reconcile via gatewayPaymentId
        const transaction = await this.txnRepo.findByGatewayPaymentId(gatewayPaymentId);
        if (!transaction) {
            logger.warn(`[RazorpayWebhook] No transaction found for refunded payment ID ${gatewayPaymentId}`);
            throw new AppError(`Transaction not found for refunded payment ${gatewayPaymentId}`, 404, 'TRANSACTION_NOT_FOUND');
        }

        const transactionIdStr = transaction._id.toString();

        // If already REFUNDED, idempotent skip
        if (transaction.status === TransactionStatus.REFUNDED) {
            logger.info(`[RazorpayWebhook] Transaction ${transactionIdStr} is already REFUNDED. Idempotent skip.`);
            if (webhookRecordId) {
                await this.webhookRepo.markProcessed(webhookRecordId, transaction._id, {
                    note: 'Transaction was already REFUNDED'
                });
            }
            return {
                success: true,
                duplicate: true,
                eventId,
                transactionId: transactionIdStr,
                message: 'Transaction already REFUNDED (idempotent)'
            };
        }

        if (transaction.status !== TransactionStatus.SUCCESS && transaction.status !== TransactionStatus.PARTIALLY_REFUNDED) {
            logger.warn(`[RazorpayWebhook] Transaction ${transactionIdStr} is in state ${transaction.status}, cannot refund`);
            throw new AppError(`Transaction in ${transaction.status} state cannot be refunded`, 400, 'INVALID_REFUND_STATE');
        }

        const isFullRefund = refundAmount >= transaction.amount;
        const newStatus = isFullRefund ? TransactionStatus.REFUNDED : TransactionStatus.PARTIALLY_REFUNDED;

        const updatedTxn = await this.txnRepo.updateStatus(transactionIdStr, newStatus, {
            refundedAt: new Date(),
            metadata: {
                ...(transaction.metadata || {}),
                refund: {
                    refundId,
                    amount: refundAmount,
                    gatewayPaymentId,
                    source: 'RAZORPAY_WEBHOOK'
                },
                refundReason: refund.notes?.reason || 'Razorpay Webhook Refund'
            }
        });

        if (updatedTxn) {
            await logAction(transaction.memberId.toString(), UserRole.ORGANIZER, 'PAYMENT_REFUNDED', {
                previousValue: { status: transaction.status, amount: transaction.amount },
                newValue: {
                    transactionId: updatedTxn._id,
                    refundId,
                    refundAmount,
                    status: newStatus,
                    source: 'RAZORPAY_WEBHOOK',
                    eventId
                }
            });

            // Publish Domain Event (triggers P4 Ledger Reversal Journal Posting)
            eventBus.publish({
                eventType: PaymentDomainEventType.TRANSACTION_REFUNDED,
                timestamp: new Date(),
                data: updatedTxn
            });
        }

        if (webhookRecordId) {
            await this.webhookRepo.markProcessed(webhookRecordId, transaction._id);
        }

        logger.info(
            `[RazorpayWebhook] Refund processed for Transaction ${transaction.transactionNumber} (${transactionIdStr}) | Refund ID: ${refundId}`
        );

        return {
            success: true,
            eventId,
            transactionId: transactionIdStr,
            message: 'Refund processed successfully'
        };
    }
}
