import { Router } from 'express';
import { protect } from '@modules/auth/index.js';
import * as transactionController from '../controller/TransactionController.js';
import * as razorpayWebhookController from '../controller/RazorpayWebhookController.js';
import * as transactionValidator from '../validators/transaction.validator.js';

const router = Router();

// =========================================================================
// PUBLIC WEBHOOK ROUTE (Unprotected by JWT - Authenticated via Webhook Signature)
// =========================================================================
router.post('/webhook/razorpay', razorpayWebhookController.handleRazorpayWebhook);

// =========================================================================
// PROTECTED USER API ROUTES (Requires Valid JWT Session)
// =========================================================================
router.use(protect);

router.post('/initiate', transactionValidator.validateInitiatePayment, transactionController.initiatePayment);
router.post('/verify', transactionValidator.validateVerifyPayment, transactionController.verifyPayment);
router.post('/refund', transactionValidator.validateRefundPayment, transactionController.refundPayment);

router.get('/member/:memberId', transactionController.getMemberTransactions);
router.get('/group/:groupId', transactionController.getGroupTransactions);
router.get('/installment/:installmentId', transactionController.getInstallmentTransactions);
router.get('/:id', transactionController.getTransactionById);
router.get('/', transactionController.getAllTransactions);

export default router;
