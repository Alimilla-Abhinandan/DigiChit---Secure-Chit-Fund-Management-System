import crypto from 'crypto';
import mongoose from 'mongoose';
import { config } from '@shared/config/env.js';
import { RazorpayWebhookService } from '../services/RazorpayWebhookService.js';
import { RazorpayWebhookEventRepository } from '../repositories/RazorpayWebhookEventRepository.js';
import { TransactionService } from '../services/TransactionService.js';
import { TransactionRepository } from '../repositories/TransactionRepository.js';
import Transaction, { PaymentMethod, PaymentGatewayProvider, TransactionStatus, ITransaction } from '../models/Transaction.js';
import RazorpayWebhookEvent, { RazorpayWebhookEventStatus } from '../models/RazorpayWebhookEvent.js';
import Installment, { PaymentStatus } from '@modules/installment/models/Installment.js';
import ChitGroup, { ChitGroupStatus } from '@modules/chit-group/models/ChitGroup.js';
import ChitCycle, { ChitCycleStatus, PaymentCollectionStatus } from '@modules/chit-cycle/models/ChitCycle.js';
import Membership, { MembershipStatus } from '@modules/membership/models/Membership.js';
import User, { UserRole, AccountStatus, KYCStatus } from '@modules/user/models/User.js';
import JournalEntry from '@modules/ledger/models/JournalEntry.js';
import { DoubleEntryJournalType } from '@modules/ledger/enums/account.enum.js';
import { initPaymentEventListeners } from '../listeners/PaymentEventListener.js';
import { initLedgerEventListeners } from '@modules/ledger/listeners/LedgerEventListener.js';
import { AppError } from '@shared/errors/AppError.js';

let passedTests = 0;
let totalTests = 0;

async function assertSuccess(testName: string, testFn: () => Promise<void>) {
    totalTests++;
    try {
        await testFn();
        console.log(`✅ [PASS] ${testName}`);
        passedTests++;
    } catch (err: any) {
        console.error(`❌ [FAIL] ${testName}: ${err.message || err}`);
        throw err;
    }
}

function computeSignature(payload: string | Buffer, secret: string = config.razorpay.webhookSecret || 'whsec_test_digichit_secret_2026'): string {
    return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

async function waitForJournalEntry(
    transactionId: string | mongoose.Types.ObjectId,
    entryType: DoubleEntryJournalType = DoubleEntryJournalType.INSTALLMENT_PAYMENT,
    timeoutMs: number = 6000
): Promise<any[]> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        const journals = await JournalEntry.find({
            transactionId: transactionId.toString(),
            entryType
        });
        if (journals.length > 0) return journals;
        await new Promise((r) => setTimeout(r, 100));
    }
    return await JournalEntry.find({
        transactionId: transactionId.toString(),
        entryType
    });
}

async function createFixture(userName: string = 'WebhookMember') {
    const org: any = await User.create({
        name: `Org ${Date.now()}_${Math.random().toString(36).substring(7)}`,
        email: `org.${Date.now()}.${Math.random().toString(36).substring(7)}@example.com`,
        password: 'password123',
        role: UserRole.ORGANIZER,
        accountStatus: AccountStatus.ACTIVE,
        kycStatus: KYCStatus.APPROVED,
        age: 35
    });

    const user: any = await User.create({
        name: `${userName} ${Date.now()}_${Math.random().toString(36).substring(7)}`,
        email: `user.${Date.now()}.${Math.random().toString(36).substring(7)}@example.com`,
        password: 'password123',
        role: UserRole.USER,
        accountStatus: AccountStatus.ACTIVE,
        kycStatus: KYCStatus.APPROVED,
        age: 28
    });

    const grp: any = await ChitGroup.create({
        name: `Group ${Date.now()}_${Math.random().toString(36).substring(7)}`,
        organizerId: org._id,
        monthlyContribution: 5000,
        totalMembers: 10,
        currentMemberCount: 1,
        durationMonths: 10,
        startDate: new Date(),
        commissionPercent: 5,
        status: ChitGroupStatus.ACTIVE
    });

    const cyc: any = await ChitCycle.create({
        groupId: grp._id,
        cycleNumber: 1,
        status: ChitCycleStatus.ACTIVE,
        scheduledStartDate: new Date(),
        paymentCollection: {
            status: PaymentCollectionStatus.OPEN,
            openedAt: new Date()
        }
    });

    const mem: any = await Membership.create({
        chitGroupId: grp._id,
        userId: user._id,
        status: MembershipStatus.APPROVED,
        joinedAt: new Date()
    });

    const inst: any = await Installment.create({
        groupId: grp._id,
        cycleId: cyc._id,
        userId: user._id,
        membershipId: mem._id,
        installmentNumber: 1,
        amount: 5000,
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        paymentStatus: PaymentStatus.PENDING
    });

    return { org, user, grp, cyc, mem, inst };
}

export async function runRazorpayWebhookTests() {
    console.log('\n======================================================');
    console.log('=== RUNNING RAZORPAY WEBHOOK (P3) HARDENING TESTS ===');
    console.log('======================================================\n');

    initPaymentEventListeners();
    initLedgerEventListeners();

    const webhookService = new RazorpayWebhookService();
    const webhookRepo = new RazorpayWebhookEventRepository();
    const txnService = new TransactionService();
    const txnRepo = new TransactionRepository();

    const webhookSecret = config.razorpay.webhookSecret || 'whsec_test_digichit_secret_2026';

    // =========================================================================
    // SECTION 1: SIGNATURE VERIFICATION TESTS (1 - 5)
    // =========================================================================

    await assertSuccess('1. Valid HMAC-SHA256 signature is accepted', async () => {
        const body = JSON.stringify({ event: 'payment.authorized', id: 'evt_sig_1' });
        const sig = computeSignature(body, webhookSecret);
        const isValid = webhookService.verifySignature(body, sig);
        if (!isValid) throw new Error('Expected valid signature to return true');
    });

    await assertSuccess('2. Missing signature header is rejected with 400', async () => {
        const body = JSON.stringify({ event: 'payment.authorized', id: 'evt_sig_2' });
        try {
            await webhookService.processWebhook(body, '', 'evt_sig_2');
            throw new Error('Expected missing signature to throw AppError');
        } catch (err: any) {
            const code = err.errorCode || err.code;
            if (err.statusCode !== 400 || code !== 'MISSING_WEBHOOK_SIGNATURE') {
                throw new Error(`Expected 400 MISSING_WEBHOOK_SIGNATURE, got ${err.statusCode} ${code}`);
            }
        }
    });

    await assertSuccess('3. Invalid signature is rejected with 400', async () => {
        const body = JSON.stringify({ event: 'payment.authorized', id: 'evt_sig_3' });
        const invalidSig = 'invalid_hex_signature_abcdef1234567890abcdef1234567890abcdef1234567890';
        try {
            await webhookService.processWebhook(body, invalidSig, 'evt_sig_3');
            throw new Error('Expected invalid signature to throw AppError');
        } catch (err: any) {
            const code = err.errorCode || err.code;
            if (err.statusCode !== 400 || code !== 'INVALID_WEBHOOK_SIGNATURE') {
                throw new Error(`Expected 400 INVALID_WEBHOOK_SIGNATURE, got ${err.statusCode} ${code}`);
            }
        }
    });

    await assertSuccess('4. Modified payload with original signature is rejected with 400', async () => {
        const originalBody = JSON.stringify({ event: 'payment.authorized', amount: 500000 });
        const sig = computeSignature(originalBody, webhookSecret);
        const tamperedBody = JSON.stringify({ event: 'payment.authorized', amount: 100 });
        try {
            await webhookService.processWebhook(tamperedBody, sig, 'evt_sig_4');
            throw new Error('Expected tampered body to be rejected');
        } catch (err: any) {
            const code = err.errorCode || err.code;
            if (err.statusCode !== 400 || code !== 'INVALID_WEBHOOK_SIGNATURE') {
                throw new Error(`Expected 400 INVALID_WEBHOOK_SIGNATURE, got ${err.statusCode} ${code}`);
            }
        }
    });

    await assertSuccess('5. Raw Buffer body signature verification works identically to string', async () => {
        const rawBuffer = Buffer.from(JSON.stringify({ event: 'payment.authorized', id: 'evt_sig_5' }), 'utf8');
        const sig = computeSignature(rawBuffer, webhookSecret);
        const isValid = webhookService.verifySignature(rawBuffer, sig);
        if (!isValid) throw new Error('Expected Buffer signature verification to return true');
    });

    // =========================================================================
    // SECTION 2: EVENT IDEMPOTENCY & DEDUPLICATION (6 - 10)
    // =========================================================================

    await assertSuccess('6. First webhook event is recorded and processed successfully', async () => {
        const eventId = `evt_idem_6_${Date.now()}`;
        const body = JSON.stringify({
            event: 'payment.authorized',
            id: eventId,
            account_id: 'acc_test_123'
        });
        const sig = computeSignature(body, webhookSecret);

        const result = await webhookService.processWebhook(body, sig, eventId);
        if (!result.success || result.eventId !== eventId) {
            throw new Error('Expected first webhook processing to succeed');
        }

        const saved = await webhookRepo.findByEventId(eventId);
        if (!saved || saved.status !== RazorpayWebhookEventStatus.PROCESSED) {
            throw new Error('Expected webhook event status to be PROCESSED in DB');
        }
    });

    await assertSuccess('7. Duplicate webhook event returns idempotent success without reprocessing', async () => {
        const eventId = `evt_idem_7_${Date.now()}`;
        const body = JSON.stringify({
            event: 'payment.authorized',
            id: eventId
        });
        const sig = computeSignature(body, webhookSecret);

        // First call
        await webhookService.processWebhook(body, sig, eventId);

        // Replay duplicate call
        const duplicateResult = await webhookService.processWebhook(body, sig, eventId);
        if (!duplicateResult.success || !duplicateResult.duplicate) {
            throw new Error('Expected duplicate call to return success: true with duplicate: true');
        }
    });

    await assertSuccess('8. Concurrent duplicate webhook events (5 workers) only process once', async () => {
        const eventId = `evt_concurrent_8_${Date.now()}`;
        const body = JSON.stringify({
            event: 'payment.authorized',
            id: eventId
        });
        const sig = computeSignature(body, webhookSecret);

        const promises = Array(5).fill(null).map(() => webhookService.processWebhook(body, sig, eventId));
        const results = await Promise.all(promises);

        for (const res of results) {
            if (!res.success) throw new Error('All concurrent requests should return success');
        }

        const eventRecords = await RazorpayWebhookEvent.find({ eventId });
        if (eventRecords.length !== 1) {
            throw new Error(`Expected exactly 1 RazorpayWebhookEvent record in DB, found ${eventRecords.length}`);
        }
    });

    await assertSuccess('9. Unique event ID constraint prevents database duplicate insertions', async () => {
        const eventId = `evt_unique_9_${Date.now()}`;
        await RazorpayWebhookEvent.create({
            eventId,
            event: 'payment.authorized',
            status: RazorpayWebhookEventStatus.PROCESSED,
            receivedAt: new Date()
        });

        let threw = false;
        try {
            await RazorpayWebhookEvent.create({
                eventId,
                event: 'payment.authorized',
                status: RazorpayWebhookEventStatus.PROCESSED,
                receivedAt: new Date()
            });
        } catch (err: any) {
            threw = true;
            if (err.code !== 11000 && !err.message?.includes('duplicate key')) {
                throw new Error(`Expected duplicate key error 11000, got ${err.message}`);
            }
        }
        if (!threw) throw new Error('Expected unique constraint to prevent duplicate insert');
    });

    await assertSuccess('10. Previously processed event does not re-trigger side effects', async () => {
        const f = await createFixture('UserSideEffect');
        const txn = await txnService.initiatePayment(f.user._id.toString(), {
            installmentId: f.inst._id.toString(),
            paymentMethod: PaymentMethod.UPI,
            paymentGateway: PaymentGatewayProvider.RAZORPAY
        }, `idemp_side_effect_${Date.now()}`);

        const eventId = `evt_side_effect_10_${Date.now()}`;
        const paymentId = `pay_side_effect_${Date.now()}`;
        const body = JSON.stringify({
            event: 'payment.captured',
            id: eventId,
            payload: {
                payment: {
                    entity: {
                        id: paymentId,
                        order_id: txn.gatewayOrderId,
                        amount: 500000,
                        currency: 'INR',
                        status: 'captured'
                    }
                }
            }
        });
        const sig = computeSignature(body, webhookSecret);

        // Process once
        await webhookService.processWebhook(body, sig, eventId);

        const journalsFirst = await waitForJournalEntry(txn._id);
        if (journalsFirst.length !== 1) throw new Error(`Expected 1 journal entry, got ${journalsFirst.length}`);

        // Replay webhook twice more
        await webhookService.processWebhook(body, sig, eventId);
        await webhookService.processWebhook(body, sig, eventId);

        const journalsAfterReplay = await JournalEntry.find({
            transactionId: txn._id.toString(),
            entryType: DoubleEntryJournalType.INSTALLMENT_PAYMENT
        });
        if (journalsAfterReplay.length !== 1) {
            throw new Error(`Expected still 1 journal entry after replay, got ${journalsAfterReplay.length}`);
        }
    });

    // =========================================================================
    // SECTION 3: PAYMENT CAPTURED FLOW (11 - 17)
    // =========================================================================

    await assertSuccess('11. Valid payment.captured transitions transaction from PENDING to SUCCESS', async () => {
        const f = await createFixture('UserCap11');
        const txn = await txnService.initiatePayment(f.user._id.toString(), {
            installmentId: f.inst._id.toString(),
            paymentMethod: PaymentMethod.UPI,
            paymentGateway: PaymentGatewayProvider.RAZORPAY
        }, `idemp_cap_11_${Date.now()}`);

        if (txn.status !== TransactionStatus.PENDING) throw new Error('Initial status must be PENDING');

        const eventId = `evt_cap_11_${Date.now()}`;
        const paymentId = `pay_cap_11_${Date.now()}`;
        const body = JSON.stringify({
            event: 'payment.captured',
            id: eventId,
            payload: {
                payment: {
                    entity: {
                        id: paymentId,
                        order_id: txn.gatewayOrderId,
                        amount: 500000,
                        currency: 'INR',
                        status: 'captured',
                        method: 'upi'
                    }
                }
            }
        });
        const sig = computeSignature(body, webhookSecret);

        const res = await webhookService.processWebhook(body, sig, eventId);
        if (!res.success) throw new Error('Webhook processing failed');

        const updatedTxn = await txnRepo.findById(txn._id.toString());
        if (!updatedTxn || updatedTxn.status !== TransactionStatus.SUCCESS) {
            throw new Error(`Expected status SUCCESS, got ${updatedTxn?.status}`);
        }
        if (updatedTxn.gatewayPaymentId !== paymentId) {
            throw new Error(`Expected gatewayPaymentId ${paymentId}, got ${updatedTxn.gatewayPaymentId}`);
        }
    });

    await assertSuccess('12. Captured payment creates exactly one P3 double-entry ledger journal', async () => {
        const f = await createFixture('UserJournal12');
        const txn = await txnService.initiatePayment(f.user._id.toString(), {
            installmentId: f.inst._id.toString(),
            paymentMethod: PaymentMethod.UPI,
            paymentGateway: PaymentGatewayProvider.RAZORPAY
        }, `idemp_cap_12_${Date.now()}`);

        const eventId = `evt_cap_12_${Date.now()}`;
        const body = JSON.stringify({
            event: 'payment.captured',
            id: eventId,
            payload: {
                payment: {
                    entity: {
                        id: `pay_cap_12_${Date.now()}`,
                        order_id: txn.gatewayOrderId,
                        amount: 500000,
                        currency: 'INR',
                        status: 'captured'
                    }
                }
            }
        });
        const sig = computeSignature(body, webhookSecret);

        await webhookService.processWebhook(body, sig, eventId);

        const journals = await waitForJournalEntry(txn._id);
        if (journals.length !== 1) {
            throw new Error(`Expected exactly 1 P3 journal entry, got ${journals.length}`);
        }
        const journal = journals[0];
        if (journal.lines.length !== 2) {
            throw new Error(`Expected 2 lines in journal, got ${journal.lines.length}`);
        }
    });

    await assertSuccess('13. Captured payment updates Installment status to PAID', async () => {
        const f = await createFixture('UserInst13');
        const txn = await txnService.initiatePayment(f.user._id.toString(), {
            installmentId: f.inst._id.toString(),
            paymentMethod: PaymentMethod.UPI,
            paymentGateway: PaymentGatewayProvider.RAZORPAY
        }, `idemp_cap_13_${Date.now()}`);

        const eventId = `evt_cap_13_${Date.now()}`;
        const body = JSON.stringify({
            event: 'payment.captured',
            id: eventId,
            payload: {
                payment: {
                    entity: {
                        id: `pay_cap_13_${Date.now()}`,
                        order_id: txn.gatewayOrderId,
                        amount: 500000,
                        currency: 'INR',
                        status: 'captured'
                    }
                }
            }
        });
        const sig = computeSignature(body, webhookSecret);

        await webhookService.processWebhook(body, sig, eventId);

        // Poll installment status
        let isPaid = false;
        const start = Date.now();
        while (Date.now() - start < 5000) {
            const updatedInst = await Installment.findById(f.inst._id);
            if (updatedInst?.paymentStatus === PaymentStatus.PAID) {
                isPaid = true;
                break;
            }
            await new Promise(r => setTimeout(r, 100));
        }

        if (!isPaid) {
            throw new Error('Expected installment status to be updated to PAID');
        }
    });

    await assertSuccess('14. Captured payment with unknown order_id does NOT create transaction or journal (404)', async () => {
        const unknownOrderId = `order_unknown_${Date.now()}`;
        const eventId = `evt_unknown_14_${Date.now()}`;
        const body = JSON.stringify({
            event: 'payment.captured',
            id: eventId,
            payload: {
                payment: {
                    entity: {
                        id: 'pay_unknown_123',
                        order_id: unknownOrderId,
                        amount: 500000,
                        currency: 'INR',
                        status: 'captured'
                    }
                }
            }
        });
        const sig = computeSignature(body, webhookSecret);

        try {
            await webhookService.processWebhook(body, sig, eventId);
            throw new Error('Expected unknown order to fail with 404');
        } catch (err: any) {
            const code = err.errorCode || err.code;
            if (err.statusCode !== 404 || code !== 'TRANSACTION_NOT_FOUND') {
                throw new Error(`Expected 404 TRANSACTION_NOT_FOUND, got ${err.statusCode} ${code}`);
            }
        }
    });

    await assertSuccess('15. Captured payment with amount mismatch is rejected with 400', async () => {
        const f = await createFixture('UserAmtMis15');
        const txn = await txnService.initiatePayment(f.user._id.toString(), {
            installmentId: f.inst._id.toString(),
            paymentMethod: PaymentMethod.UPI,
            paymentGateway: PaymentGatewayProvider.RAZORPAY
        }, `idemp_cap_15_${Date.now()}`);

        const eventId = `evt_amt_mis_15_${Date.now()}`;
        const body = JSON.stringify({
            event: 'payment.captured',
            id: eventId,
            payload: {
                payment: {
                    entity: {
                        id: `pay_amt_mis_${Date.now()}`,
                        order_id: txn.gatewayOrderId,
                        amount: 100000, // 1000 INR instead of 5000 INR
                        currency: 'INR',
                        status: 'captured'
                    }
                }
            }
        });
        const sig = computeSignature(body, webhookSecret);

        try {
            await webhookService.processWebhook(body, sig, eventId);
            throw new Error('Expected amount mismatch to fail with 400');
        } catch (err: any) {
            const code = err.errorCode || err.code;
            if (err.statusCode !== 400 || code !== 'AMOUNT_MISMATCH') {
                throw new Error(`Expected 400 AMOUNT_MISMATCH, got ${err.statusCode} ${code}`);
            }
        }
    });

    await assertSuccess('16. Captured payment with currency mismatch is rejected with 400', async () => {
        const f = await createFixture('UserCurrMis16');
        const txn = await txnService.initiatePayment(f.user._id.toString(), {
            installmentId: f.inst._id.toString(),
            paymentMethod: PaymentMethod.UPI,
            paymentGateway: PaymentGatewayProvider.RAZORPAY
        }, `idemp_cap_16_${Date.now()}`);

        const eventId = `evt_curr_mis_16_${Date.now()}`;
        const body = JSON.stringify({
            event: 'payment.captured',
            id: eventId,
            payload: {
                payment: {
                    entity: {
                        id: `pay_curr_mis_${Date.now()}`,
                        order_id: txn.gatewayOrderId,
                        amount: 500000,
                        currency: 'USD',
                        status: 'captured'
                    }
                }
            }
        });
        const sig = computeSignature(body, webhookSecret);

        try {
            await webhookService.processWebhook(body, sig, eventId);
            throw new Error('Expected currency mismatch to fail with 400');
        } catch (err: any) {
            const code = err.errorCode || err.code;
            if (err.statusCode !== 400 || code !== 'CURRENCY_MISMATCH') {
                throw new Error(`Expected 400 CURRENCY_MISMATCH, got ${err.statusCode} ${code}`);
            }
        }
    });

    await assertSuccess('17. Captured payment for already-successful transaction remains idempotent', async () => {
        const f = await createFixture('UserSucc17');
        const txn = await txnService.initiatePayment(f.user._id.toString(), {
            installmentId: f.inst._id.toString(),
            paymentMethod: PaymentMethod.UPI,
            paymentGateway: PaymentGatewayProvider.RAZORPAY
        }, `idemp_cap_17_${Date.now()}`);

        // Mark SUCCESS manually
        await txnRepo.updateStatus(txn._id.toString(), TransactionStatus.SUCCESS, {
            gatewayPaymentId: 'pay_already_succ_17',
            completedAt: new Date()
        });

        const eventId = `evt_already_succ_17_${Date.now()}`;
        const body = JSON.stringify({
            event: 'payment.captured',
            id: eventId,
            payload: {
                payment: {
                    entity: {
                        id: 'pay_already_succ_17',
                        order_id: txn.gatewayOrderId,
                        amount: 500000,
                        currency: 'INR',
                        status: 'captured'
                    }
                }
            }
        });
        const sig = computeSignature(body, webhookSecret);

        const res = await webhookService.processWebhook(body, sig, eventId);
        if (!res.success || !res.duplicate) {
            throw new Error('Expected already SUCCESS transaction to return success: true with duplicate: true');
        }
    });

    // =========================================================================
    // SECTION 4: CONCURRENCY & RACING WITH VERIFY PAYMENT (18 - 20)
    // =========================================================================

    await assertSuccess('18. Race: Webhook payment.captured arrives FIRST, then frontend verifyPayment arrives', async () => {
        const f = await createFixture('UserRace18');
        const txn = await txnService.initiatePayment(f.user._id.toString(), {
            installmentId: f.inst._id.toString(),
            paymentMethod: PaymentMethod.UPI,
            paymentGateway: PaymentGatewayProvider.MOCK
        }, `idemp_race_18_${Date.now()}`);

        const paymentId = `pay_mock_race_18_${Date.now()}`;
        const eventId = `evt_race_18_${Date.now()}`;
        const body = JSON.stringify({
            event: 'payment.captured',
            id: eventId,
            payload: {
                payment: {
                    entity: {
                        id: paymentId,
                        order_id: txn.gatewayOrderId,
                        amount: 500000,
                        currency: 'INR',
                        status: 'captured'
                    }
                }
            }
        });
        const sig = computeSignature(body, webhookSecret);

        // 1. Webhook arrives first
        await webhookService.processWebhook(body, sig, eventId);
        await waitForJournalEntry(txn._id);

        // 2. Frontend verifyPayment arrives second
        const verifiedTxn = await txnService.verifyPayment(f.user._id.toString(), {
            transactionId: txn._id.toString(),
            gatewayPaymentId: paymentId
        });

        if (verifiedTxn.status !== TransactionStatus.SUCCESS) {
            throw new Error(`Expected status SUCCESS, got ${verifiedTxn.status}`);
        }

        const journals = await JournalEntry.find({
            transactionId: txn._id.toString(),
            entryType: DoubleEntryJournalType.INSTALLMENT_PAYMENT
        });
        if (journals.length !== 1) {
            throw new Error(`Expected exactly 1 journal entry, got ${journals.length}`);
        }
    });

    await assertSuccess('19. Race: Frontend verifyPayment arrives FIRST, then Webhook payment.captured arrives', async () => {
        const f = await createFixture('UserRace19');
        const txn = await txnService.initiatePayment(f.user._id.toString(), {
            installmentId: f.inst._id.toString(),
            paymentMethod: PaymentMethod.MOCK,
            paymentGateway: PaymentGatewayProvider.MOCK
        }, `idemp_race_19_${Date.now()}`);

        const paymentId = `pay_mock_race_19_${Date.now()}`;

        // 1. Frontend verifyPayment arrives first
        await txnService.verifyPayment(f.user._id.toString(), {
            transactionId: txn._id.toString(),
            gatewayPaymentId: paymentId
        });
        await waitForJournalEntry(txn._id);

        // 2. Webhook arrives second
        const eventId = `evt_race_19_${Date.now()}`;
        const body = JSON.stringify({
            event: 'payment.captured',
            id: eventId,
            payload: {
                payment: {
                    entity: {
                        id: paymentId,
                        order_id: txn.gatewayOrderId,
                        amount: 500000,
                        currency: 'INR',
                        status: 'captured'
                    }
                }
            }
        });
        const sig = computeSignature(body, webhookSecret);

        const webhookRes = await webhookService.processWebhook(body, sig, eventId);
        if (!webhookRes.success) throw new Error('Webhook processing should succeed');

        const journals = await JournalEntry.find({
            transactionId: txn._id.toString(),
            entryType: DoubleEntryJournalType.INSTALLMENT_PAYMENT
        });
        if (journals.length !== 1) {
            throw new Error(`Expected exactly 1 journal entry, got ${journals.length}`);
        }
    });

    await assertSuccess('20. Race: Both Webhook and verifyPayment executed CONCURRENTLY converge to exactly 1 journal', async () => {
        const f = await createFixture('UserRace20');
        const txn = await txnService.initiatePayment(f.user._id.toString(), {
            installmentId: f.inst._id.toString(),
            paymentMethod: PaymentMethod.MOCK,
            paymentGateway: PaymentGatewayProvider.MOCK
        }, `idemp_race_20_${Date.now()}`);

        const paymentId = `pay_mock_race_20_${Date.now()}`;
        const eventId = `evt_race_20_${Date.now()}`;
        const body = JSON.stringify({
            event: 'payment.captured',
            id: eventId,
            payload: {
                payment: {
                    entity: {
                        id: paymentId,
                        order_id: txn.gatewayOrderId,
                        amount: 500000,
                        currency: 'INR',
                        status: 'captured'
                    }
                }
            }
        });
        const sig = computeSignature(body, webhookSecret);

        // Execute concurrently
        const [webhookRes, verifyRes] = await Promise.all([
            webhookService.processWebhook(body, sig, eventId),
            txnService.verifyPayment(f.user._id.toString(), {
                transactionId: txn._id.toString(),
                gatewayPaymentId: paymentId
            })
        ]);

        if (!webhookRes.success || verifyRes.status !== TransactionStatus.SUCCESS) {
            throw new Error('Both concurrent executions should resolve successfully');
        }

        await waitForJournalEntry(txn._id);

        const finalTxn = await txnRepo.findById(txn._id.toString());
        if (finalTxn?.status !== TransactionStatus.SUCCESS) {
            throw new Error(`Expected final transaction status SUCCESS, got ${finalTxn?.status}`);
        }

        const journals = await JournalEntry.find({
            transactionId: txn._id.toString(),
            entryType: DoubleEntryJournalType.INSTALLMENT_PAYMENT
        });
        if (journals.length !== 1) {
            throw new Error(`Expected exactly 1 P3 ledger journal entry after race, got ${journals.length}`);
        }
    });

    // =========================================================================
    // SECTION 5: PAYMENT FAILED FLOW (21 - 24)
    // =========================================================================

    await assertSuccess('21. Valid payment.failed transitions PENDING transaction to FAILED', async () => {
        const f = await createFixture('UserFail21');
        const txn = await txnService.initiatePayment(f.user._id.toString(), {
            installmentId: f.inst._id.toString(),
            paymentMethod: PaymentMethod.UPI,
            paymentGateway: PaymentGatewayProvider.RAZORPAY
        }, `idemp_fail_21_${Date.now()}`);

        const eventId = `evt_fail_21_${Date.now()}`;
        const body = JSON.stringify({
            event: 'payment.failed',
            id: eventId,
            payload: {
                payment: {
                    entity: {
                        id: 'pay_fail_21',
                        order_id: txn.gatewayOrderId,
                        amount: 500000,
                        currency: 'INR',
                        error_code: 'BAD_REQUEST_ERROR',
                        error_description: 'Payment was declined by bank'
                    }
                }
            }
        });
        const sig = computeSignature(body, webhookSecret);

        const res = await webhookService.processWebhook(body, sig, eventId);
        if (!res.success) throw new Error('payment.failed processing failed');

        const updatedTxn = await txnRepo.findById(txn._id.toString());
        if (updatedTxn?.status !== TransactionStatus.FAILED) {
            throw new Error(`Expected status FAILED, got ${updatedTxn?.status}`);
        }
        if (!updatedTxn?.failureReason?.includes('Payment was declined')) {
            throw new Error(`Expected failure reason in transaction, got ${updatedTxn?.failureReason}`);
        }
    });

    await assertSuccess('22. payment.failed does NOT create ledger journal or mark installment paid', async () => {
        const f = await createFixture('UserFail22');
        const txn = await txnService.initiatePayment(f.user._id.toString(), {
            installmentId: f.inst._id.toString(),
            paymentMethod: PaymentMethod.UPI,
            paymentGateway: PaymentGatewayProvider.RAZORPAY
        }, `idemp_fail_22_${Date.now()}`);

        const eventId = `evt_fail_22_${Date.now()}`;
        const body = JSON.stringify({
            event: 'payment.failed',
            id: eventId,
            payload: {
                payment: {
                    entity: {
                        id: 'pay_fail_22',
                        order_id: txn.gatewayOrderId,
                        amount: 500000,
                        currency: 'INR',
                        error_description: 'Insufficient funds'
                    }
                }
            }
        });
        const sig = computeSignature(body, webhookSecret);

        await webhookService.processWebhook(body, sig, eventId);
        await new Promise(r => setTimeout(r, 200));

        const journals = await JournalEntry.find({ transactionId: txn._id.toString() });
        if (journals.length !== 0) {
            throw new Error(`Expected 0 journal entries for failed payment, got ${journals.length}`);
        }

        const inst = await Installment.findById(f.inst._id);
        if (inst?.paymentStatus === PaymentStatus.PAID) {
            throw new Error('Installment must NOT be marked PAID for failed transaction');
        }
    });

    await assertSuccess('23. Late payment.failed event CANNOT incorrectly downgrade an already SUCCESS transaction', async () => {
        const f = await createFixture('UserFailDowngrade23');
        const txn = await txnService.initiatePayment(f.user._id.toString(), {
            installmentId: f.inst._id.toString(),
            paymentMethod: PaymentMethod.MOCK,
            paymentGateway: PaymentGatewayProvider.MOCK
        }, `idemp_downgrade_23_${Date.now()}`);

        // Verify to SUCCESS
        await txnService.verifyPayment(f.user._id.toString(), {
            transactionId: txn._id.toString(),
            gatewayPaymentId: 'pay_mock_23'
        });

        const eventId = `evt_late_fail_23_${Date.now()}`;
        const body = JSON.stringify({
            event: 'payment.failed',
            id: eventId,
            payload: {
                payment: {
                    entity: {
                        id: 'pay_mock_23',
                        order_id: txn.gatewayOrderId,
                        error_description: 'Late timeout failure'
                    }
                }
            }
        });
        const sig = computeSignature(body, webhookSecret);

        const res = await webhookService.processWebhook(body, sig, eventId);
        if (!res.success) throw new Error('Expected safe acknowledgment of late failed event');

        const txnAfter = await txnRepo.findById(txn._id.toString());
        if (txnAfter?.status !== TransactionStatus.SUCCESS) {
            throw new Error(`Transaction must remain SUCCESS, but was downgraded to ${txnAfter?.status}`);
        }
    });

    await assertSuccess('24. payment.failed for unknown order acknowledges safely without creating state', async () => {
        const eventId = `evt_fail_unknown_24_${Date.now()}`;
        const body = JSON.stringify({
            event: 'payment.failed',
            id: eventId,
            payload: {
                payment: {
                    entity: {
                        id: 'pay_unknown_fail',
                        order_id: 'order_unknown_fail_123',
                        error_description: 'Card expired'
                    }
                }
            }
        });
        const sig = computeSignature(body, webhookSecret);

        const res = await webhookService.processWebhook(body, sig, eventId);
        if (!res.success) throw new Error('Expected safe acknowledgment for unknown order on failure');
    });

    // =========================================================================
    // SECTION 6: REFUND PROCESSED FLOW (25 - 28)
    // =========================================================================

    await assertSuccess('25. Valid refund.processed transitions SUCCESS transaction to REFUNDED', async () => {
        const f = await createFixture('UserRefund25');
        const txn = await txnService.initiatePayment(f.user._id.toString(), {
            installmentId: f.inst._id.toString(),
            paymentMethod: PaymentMethod.MOCK,
            paymentGateway: PaymentGatewayProvider.MOCK
        }, `idemp_refund_25_${Date.now()}`);

        const paymentId = `pay_mock_refund_25_${Date.now()}`;
        await txnService.verifyPayment(f.user._id.toString(), {
            transactionId: txn._id.toString(),
            gatewayPaymentId: paymentId
        });
        await waitForJournalEntry(txn._id, DoubleEntryJournalType.INSTALLMENT_PAYMENT);

        const eventId = `evt_refund_25_${Date.now()}`;
        const refundId = `rfnd_25_${Date.now()}`;
        const body = JSON.stringify({
            event: 'refund.processed',
            id: eventId,
            payload: {
                refund: {
                    entity: {
                        id: refundId,
                        payment_id: paymentId,
                        amount: 500000,
                        currency: 'INR',
                        status: 'processed'
                    }
                }
            }
        });
        const sig = computeSignature(body, webhookSecret);

        const res = await webhookService.processWebhook(body, sig, eventId);
        if (!res.success) throw new Error('refund.processed webhook failed');

        const updatedTxn = await txnRepo.findById(txn._id.toString());
        if (updatedTxn?.status !== TransactionStatus.REFUNDED) {
            throw new Error(`Expected status REFUNDED, got ${updatedTxn?.status}`);
        }
    });

    await assertSuccess('26. refund.processed creates exactly one P4 double-entry reversal journal', async () => {
        const f = await createFixture('UserRefundJournal26');
        const txn = await txnService.initiatePayment(f.user._id.toString(), {
            installmentId: f.inst._id.toString(),
            paymentMethod: PaymentMethod.MOCK,
            paymentGateway: PaymentGatewayProvider.MOCK
        }, `idemp_refund_26_${Date.now()}`);

        const paymentId = `pay_mock_refund_26_${Date.now()}`;
        await txnService.verifyPayment(f.user._id.toString(), {
            transactionId: txn._id.toString(),
            gatewayPaymentId: paymentId
        });
        await waitForJournalEntry(txn._id, DoubleEntryJournalType.INSTALLMENT_PAYMENT);

        const eventId = `evt_refund_26_${Date.now()}`;
        const refundId = `rfnd_26_${Date.now()}`;
        const body = JSON.stringify({
            event: 'refund.processed',
            id: eventId,
            payload: {
                refund: {
                    entity: {
                        id: refundId,
                        payment_id: paymentId,
                        amount: 500000,
                        currency: 'INR',
                        status: 'processed'
                    }
                }
            }
        });
        const sig = computeSignature(body, webhookSecret);

        await webhookService.processWebhook(body, sig, eventId);

        const reversalJournals = await waitForJournalEntry(txn._id, DoubleEntryJournalType.PAYMENT_REFUND);
        if (reversalJournals.length !== 1) {
            throw new Error(`Expected exactly 1 P4 reversal journal, got ${reversalJournals.length}`);
        }
    });

    await assertSuccess('27. Duplicate refund.processed webhook creates NO duplicate reversal journal', async () => {
        const f = await createFixture('UserRefundDup27');
        const txn = await txnService.initiatePayment(f.user._id.toString(), {
            installmentId: f.inst._id.toString(),
            paymentMethod: PaymentMethod.MOCK,
            paymentGateway: PaymentGatewayProvider.MOCK
        }, `idemp_refund_27_${Date.now()}`);

        const paymentId = `pay_mock_refund_27_${Date.now()}`;
        await txnService.verifyPayment(f.user._id.toString(), {
            transactionId: txn._id.toString(),
            gatewayPaymentId: paymentId
        });
        await waitForJournalEntry(txn._id, DoubleEntryJournalType.INSTALLMENT_PAYMENT);

        const eventId = `evt_refund_27_${Date.now()}`;
        const refundId = `rfnd_27_${Date.now()}`;
        const body = JSON.stringify({
            event: 'refund.processed',
            id: eventId,
            payload: {
                refund: {
                    entity: {
                        id: refundId,
                        payment_id: paymentId,
                        amount: 500000,
                        currency: 'INR',
                        status: 'processed'
                    }
                }
            }
        });
        const sig = computeSignature(body, webhookSecret);

        // First refund call
        await webhookService.processWebhook(body, sig, eventId);
        await waitForJournalEntry(txn._id, DoubleEntryJournalType.PAYMENT_REFUND);

        // Replay refund call
        await webhookService.processWebhook(body, sig, eventId);

        const reversalJournals = await JournalEntry.find({
            transactionId: txn._id.toString(),
            entryType: DoubleEntryJournalType.PAYMENT_REFUND
        });
        if (reversalJournals.length !== 1) {
            throw new Error(`Expected still 1 P4 reversal journal after duplicate webhook, got ${reversalJournals.length}`);
        }
    });

    await assertSuccess('28. refund.processed for unknown payment_id is rejected with 404', async () => {
        const eventId = `evt_refund_unknown_28_${Date.now()}`;
        const body = JSON.stringify({
            event: 'refund.processed',
            id: eventId,
            payload: {
                refund: {
                    entity: {
                        id: 'rfnd_unknown_28',
                        payment_id: 'pay_unknown_never_existed',
                        amount: 500000,
                        currency: 'INR',
                        status: 'processed'
                    }
                }
            }
        });
        const sig = computeSignature(body, webhookSecret);

        try {
            await webhookService.processWebhook(body, sig, eventId);
            throw new Error('Expected unknown payment_id on refund to fail with 404');
        } catch (err: any) {
            const code = err.errorCode || err.code;
            if (err.statusCode !== 404 || code !== 'TRANSACTION_NOT_FOUND') {
                throw new Error(`Expected 404 TRANSACTION_NOT_FOUND, got ${err.statusCode} ${code}`);
            }
        }
    });

    // =========================================================================
    // SECTION 7: ROBUSTNESS & EDGE CASES (29 - 34)
    // =========================================================================

    await assertSuccess('29. Malformed JSON payload is rejected with 400', async () => {
        const malformedBody = '{"event": "payment.captured", "id": 123, invalid_json';
        const sig = computeSignature(malformedBody, webhookSecret);

        try {
            await webhookService.processWebhook(malformedBody, sig, 'evt_malformed_29');
            throw new Error('Expected malformed JSON to throw 400');
        } catch (err: any) {
            const code = err.errorCode || err.code;
            if (err.statusCode !== 400 || code !== 'INVALID_PAYLOAD') {
                throw new Error(`Expected 400 INVALID_PAYLOAD, got ${err.statusCode} ${code}`);
            }
        }
    });

    await assertSuccess('30. Unsupported event type is safely acknowledged without error or side effects', async () => {
        const eventId = `evt_unsupported_30_${Date.now()}`;
        const body = JSON.stringify({
            event: 'virtual_account.credited',
            id: eventId,
            payload: { virtual_account: { entity: { id: 'va_123' } } }
        });
        const sig = computeSignature(body, webhookSecret);

        const res = await webhookService.processWebhook(body, sig, eventId);
        if (!res.success) throw new Error('Expected unsupported event to succeed with safe ack');
    });

    await assertSuccess('31. Missing event ID header falls back to payload id safely', async () => {
        const payloadEventId = `evt_in_payload_31_${Date.now()}`;
        const body = JSON.stringify({
            event: 'payment.authorized',
            id: payloadEventId
        });
        const sig = computeSignature(body, webhookSecret);

        const res = await webhookService.processWebhook(body, sig, undefined);
        if (!res.success || res.eventId !== payloadEventId) {
            throw new Error(`Expected eventId ${payloadEventId}, got ${res.eventId}`);
        }
    });

    await assertSuccess('32. Missing required payment/order fields in payment.captured is rejected with 400', async () => {
        const eventId = `evt_missing_fields_32_${Date.now()}`;
        const body = JSON.stringify({
            event: 'payment.captured',
            id: eventId,
            payload: {
                payment: {
                    entity: {
                        id: 'pay_32_no_order'
                    }
                }
            }
        });
        const sig = computeSignature(body, webhookSecret);

        try {
            await webhookService.processWebhook(body, sig, eventId);
            throw new Error('Expected missing order_id to fail with 400');
        } catch (err: any) {
            const code = err.errorCode || err.code;
            if (err.statusCode !== 400 || code !== 'MISSING_ORDER_ID') {
                throw new Error(`Expected 400 MISSING_ORDER_ID, got ${err.statusCode} ${code}`);
            }
        }
    });

    await assertSuccess('33. Out-of-order events: order.paid followed by payment.captured converges cleanly', async () => {
        const f = await createFixture('UserOutOfOrder33');
        const txn = await txnService.initiatePayment(f.user._id.toString(), {
            installmentId: f.inst._id.toString(),
            paymentMethod: PaymentMethod.UPI,
            paymentGateway: PaymentGatewayProvider.RAZORPAY
        }, `idemp_ooo_33_${Date.now()}`);

        const paymentId = `pay_ooo_33_${Date.now()}`;

        // 1. order.paid arrives first
        const eventIdOrderPaid = `evt_order_paid_33_${Date.now()}`;
        const bodyOrderPaid = JSON.stringify({
            event: 'order.paid',
            id: eventIdOrderPaid,
            payload: {
                payment: {
                    entity: {
                        id: paymentId,
                        order_id: txn.gatewayOrderId,
                        amount: 500000,
                        currency: 'INR',
                        status: 'captured'
                    }
                }
            }
        });
        const sig1 = computeSignature(bodyOrderPaid, webhookSecret);
        await webhookService.processWebhook(bodyOrderPaid, sig1, eventIdOrderPaid);

        // 2. payment.captured arrives next
        const eventIdPaymentCaptured = `evt_pay_cap_33_${Date.now()}`;
        const bodyPaymentCaptured = JSON.stringify({
            event: 'payment.captured',
            id: eventIdPaymentCaptured,
            payload: {
                payment: {
                    entity: {
                        id: paymentId,
                        order_id: txn.gatewayOrderId,
                        amount: 500000,
                        currency: 'INR',
                        status: 'captured'
                    }
                }
            }
        });
        const sig2 = computeSignature(bodyPaymentCaptured, webhookSecret);
        const res2 = await webhookService.processWebhook(bodyPaymentCaptured, sig2, eventIdPaymentCaptured);

        if (!res2.success) throw new Error('payment.captured should succeed');

        const journals = await waitForJournalEntry(txn._id);

        const finalTxn = await txnRepo.findById(txn._id.toString());
        if (finalTxn?.status !== TransactionStatus.SUCCESS) {
            throw new Error(`Expected status SUCCESS, got ${finalTxn?.status}`);
        }

        if (journals.length !== 1) {
            throw new Error(`Expected exactly 1 journal entry, got ${journals.length}`);
        }
    });

    await assertSuccess('34. Webhook processing failure marks record as FAILED and allows retry', async () => {
        const eventId = `evt_retry_34_${Date.now()}`;
        const badBody = JSON.stringify({
            event: 'payment.captured',
            id: eventId,
            payload: {
                payment: {
                    entity: {
                        id: 'pay_retry_34',
                        order_id: 'order_non_existent_34',
                        amount: 500000,
                        currency: 'INR'
                    }
                }
            }
        });
        const sig = computeSignature(badBody, webhookSecret);

        // First attempt fails due to non-existent order
        try {
            await webhookService.processWebhook(badBody, sig, eventId);
        } catch (_) {}

        const failedRecord = await webhookRepo.findByEventId(eventId);
        if (failedRecord?.status !== RazorpayWebhookEventStatus.FAILED) {
            throw new Error(`Expected status FAILED, got ${failedRecord?.status}`);
        }

        // Create transaction now
        const f = await createFixture('UserRetry34');
        const txn = await txnService.initiatePayment(f.user._id.toString(), {
            installmentId: f.inst._id.toString(),
            paymentMethod: PaymentMethod.UPI,
            paymentGateway: PaymentGatewayProvider.RAZORPAY
        }, `idemp_retry_34_${Date.now()}`);

        // Retry same event with valid order_id
        const goodBody = JSON.stringify({
            event: 'payment.captured',
            id: eventId,
            payload: {
                payment: {
                    entity: {
                        id: `pay_retry_success_34_${Date.now()}`,
                        order_id: txn.gatewayOrderId,
                        amount: 500000,
                        currency: 'INR'
                    }
                }
            }
        });
        const goodSig = computeSignature(goodBody, webhookSecret);

        const retryRes = await webhookService.processWebhook(goodBody, goodSig, eventId);
        if (!retryRes.success) throw new Error('Expected retry to succeed');

        const successRecord = await webhookRepo.findByEventId(eventId);
        if (successRecord?.status !== RazorpayWebhookEventStatus.PROCESSED) {
            throw new Error(`Expected status PROCESSED after retry, got ${successRecord?.status}`);
        }
    });

    console.log('\n======================================================');
    console.log(`=== RAZORPAY WEBHOOK TESTS SUMMARY: ${passedTests} / ${totalTests} PASSED ===`);
    console.log('======================================================\n');
}

if (process.argv[1]?.includes('razorpayWebhook.test')) {
    mongoose
        .connect(config.mongoUri)
        .then(async () => {
            console.log('Connected to MongoDB for Razorpay Webhook testing.');
            await runRazorpayWebhookTests();
            await mongoose.disconnect();
            process.exit(0);
        })
        .catch((err) => {
            console.error('Test execution failed:', err);
            process.exit(1);
        });
}
