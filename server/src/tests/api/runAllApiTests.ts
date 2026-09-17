import mongoose from 'mongoose';
import { config } from '../../shared/config/env.js';
import { runAuthApiTests } from './auth.api.test.js';
import { runAuthMiddlewareTests } from './authMiddleware.api.test.js';
import { runRbacApiTests } from './rbac.api.test.js';
import { runIsolationApiTests } from './isolation.api.test.js';
import { runValidationApiTests } from './validation.api.test.js';
import { cleanupApiTestData } from './helpers/cleanup.js';

async function main() {
    process.env.NODE_ENV = 'test';
    console.log('\n======================================================');
    console.log('  STARTING DIGICHIT HTTP/API INTEGRATION TEST SUITE');
    console.log('  (Real Express App -> Middleware -> Controller -> Real DB)');
    console.log('======================================================\n');

    let totalPassed = 0;
    let totalFailed = 0;
    const startTime = Date.now();

    try {
        await mongoose.connect(config.mongoUri);
        console.log('✅ Connected to MongoDB at:', config.mongoUri);
        await cleanupApiTestData();

        // 1. Auth API Lifecycle
        const authResults = await runAuthApiTests();
        totalPassed += authResults.passed;
        totalFailed += authResults.failed;

        // 2. Auth Middleware & Token Invalidation
        const middlewareResults = await runAuthMiddlewareTests();
        totalPassed += middlewareResults.passed;
        totalFailed += middlewareResults.failed;

        // 3. RBAC (Member / Organizer / Admin)
        const rbacResults = await runRbacApiTests();
        totalPassed += rbacResults.passed;
        totalFailed += rbacResults.failed;

        // 4. Horizontal Privilege Escalation & Data Isolation
        const isolationResults = await runIsolationApiTests();
        totalPassed += isolationResults.passed;
        totalFailed += isolationResults.failed;

        // 5. HTTP Validation & Error Contracts
        const validationResults = await runValidationApiTests();
        totalPassed += validationResults.passed;
        totalFailed += validationResults.failed;

        await cleanupApiTestData();
        await mongoose.disconnect();
        console.log('Disconnected from MongoDB.');

        const durationSec = ((Date.now() - startTime) / 1000).toFixed(2);
        console.log('\n======================================================');
        console.log(`  🎉 DIGICHIT HTTP/API TEST SUITE SUMMARY (${durationSec}s)`);
        console.log(`  TOTAL PASSED: ${totalPassed}`);
        console.log(`  TOTAL FAILED: ${totalFailed}`);
        console.log('======================================================\n');

        if (totalFailed > 0) {
            console.error(`❌ ${totalFailed} test(s) failed in the API test suite!`);
            process.exit(1);
        } else {
            console.log('✅ ALL HTTP/API INTEGRATION TESTS PASSED CLEANLY!\n');
            process.exit(0);
        }
    } catch (err) {
        console.error('Fatal error during HTTP/API test execution:', err);
        try {
            await mongoose.disconnect();
        } catch (_) {}
        process.exit(1);
    }
}

main();
