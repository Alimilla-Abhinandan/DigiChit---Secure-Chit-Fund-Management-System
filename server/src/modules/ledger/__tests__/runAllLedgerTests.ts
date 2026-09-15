import mongoose from 'mongoose';
import { config } from '@shared/config/env.js';
import { runJournalPostingTests } from './journalPosting.test.js';
import { runAccountProvisioningTests } from './accountProvisioning.test.js';
import { runInstallmentObligationJournalTests } from '@modules/installment/__tests__/installmentObligationJournal.test.js';
import { runPaymentJournalPostingTests } from './paymentJournalPosting.test.js';
import { runPaymentRefundJournalPostingTests } from './paymentRefundJournalPosting.test.js';
import { runWinnerPotAllocationJournalTests } from './winnerPotAllocationJournal.test.js';
import { runPrizePayoutTests } from './prizePayoutJournal.test.js';
import { runOrganizerCommissionPayoutTests } from './organizerCommissionPayoutJournal.test.js';
import { runDividendAllocationTests } from './dividendAllocationJournal.test.js';
import { runE2EPaymentFlowTests } from '@modules/payment/__tests__/e2ePaymentFlow.test.js';
import { runCollectionManagementTests } from '@modules/collection/__tests__/collectionManagementFlow.test.js';
import { runRazorpayGatewayTests } from '@modules/payment/__tests__/razorpayPaymentGateway.test.js';
import { runCycleIsolationTests } from '@modules/auction/__tests__/cycleIsolation.test.js';
import { runGracefulShutdownTests } from '@shared/shutdown/__tests__/gracefulShutdown.test.js';
import { runPaymentInitiationIdempotencyTests } from '@modules/payment/__tests__/paymentInitiationIdempotency.test.js';
import { runRazorpayWebhookTests } from '@modules/payment/__tests__/razorpayWebhook.test.js';

async function main() {
    console.log('\n======================================================');
    console.log('  STARTING CONSOLIDATED FINANCIAL & COLLECTION SUITE (P0 - P9 + COLLECTION MANAGEMENT)');
    console.log('======================================================\n');

    try {
        await mongoose.connect(config.mongoUri);
        console.log('✅ Connected to MongoDB at:', config.mongoUri);

        // 1. Run P0 Tests
        console.log('\n--- 1. LEDGER P0: DOUBLE-ENTRY CORE FOUNDATION ---');
        await runJournalPostingTests();

        // 2. Run P1 Tests
        console.log('\n--- 2. LEDGER P1: AUTOMATIC ACCOUNT PROVISIONING ---');
        await runAccountProvisioningTests();

        // 3. Run P2 Tests
        console.log('\n--- 3. LEDGER P2: INSTALLMENT OBLIGATION ACCOUNTING ---');
        await runInstallmentObligationJournalTests();

        // 4. Run P3 Tests
        console.log('\n--- 4. LEDGER P3: PAYMENT SUCCESS DOUBLE-ENTRY ACCOUNTING ---');
        await runPaymentJournalPostingTests();

        // 5. Run P4 Tests
        console.log('\n--- 5. LEDGER P4: REFUND DOUBLE-ENTRY ACCOUNTING ---');
        await runPaymentRefundJournalPostingTests();

        // 6. Run P5 Tests
        console.log('\n--- 6. LEDGER P5: WINNER POT ALLOCATION ACCOUNTING ---');
        await runWinnerPotAllocationJournalTests();

        // 7. Run P6 Tests
        console.log('\n--- 7. LEDGER P6: PRIZE PAYOUT ACCOUNTING ---');
        await runPrizePayoutTests();

        // 8. Run P7 Tests
        console.log('\n--- 8. LEDGER P7: ORGANIZER COMMISSION PAYOUT ACCOUNTING ---');
        await runOrganizerCommissionPayoutTests();

        // 9. Run P8 Tests
        console.log('\n--- 9. LEDGER P8: DIVIDEND ALLOCATION & INSTALLMENT OFFSET ---');
        await runDividendAllocationTests();

        // 10. Run P9 Tests
        console.log('\n--- 10. PHASE 9: FULL END-TO-END PAYMENT & FINANCIAL FLOW ---');
        await runE2EPaymentFlowTests();

        // 11. Run Collection Management Tests
        console.log('\n--- 11. COLLECTION MANAGEMENT: ORGANIZER & MEMBER FLOW ---');
        await runCollectionManagementTests();

        // 12. Run Razorpay Test Gateway Tests
        console.log('\n--- 12. RAZORPAY TEST GATEWAY & SIGNATURE VERIFICATION ---');
        await runRazorpayGatewayTests();

        // 13. Run Per-Cycle Isolation Tests
        console.log('\n--- 13. PER-CYCLE AUCTION & BIDDING ISOLATION VERIFICATION ---');
        await runCycleIsolationTests();

        // 14. Run Graceful Shutdown Tests
        console.log('\n--- 14. PRODUCTION HARDENING: GRACEFUL SHUTDOWN VERIFICATION ---');
        await runGracefulShutdownTests();

        // 15. Run Payment Initiation Idempotency Tests (P2)
        console.log('\n--- 15. PRODUCTION HARDENING: PAYMENT INITIATION IDEMPOTENCY (P2) ---');
        await runPaymentInitiationIdempotencyTests();

        // 16. Run Razorpay Webhook Tests (P3)
        console.log('\n--- 16. PRODUCTION HARDENING: RAZORPAY WEBHOOK HARDENING (P3) ---');
        await runRazorpayWebhookTests();

        console.log('\n======================================================');
        console.log('  🎉 ALL FINANCIAL & COLLECTION SUITES (P0-P9 + COLLECTION MGMT) PASSED CLEANLY');
        console.log('======================================================\n');
    } catch (err: any) {
        console.error('\n❌ TEST RUNNER FAILED WITH ERROR:', err);
        process.exit(1);
    } finally {
        await mongoose.disconnect();
        console.log('Disconnected from MongoDB.');
        process.exit(0);
    }
}

main();
