import mongoose from 'mongoose';
import { api } from './helpers/testApp.js';
import { createTestUser, createTestOrganizer } from './helpers/createTestUser.js';
import { getAuthHeaders } from './helpers/authRequest.js';
import { cleanupApiTestData } from './helpers/cleanup.js';
import { TestHarness, assertEqual, assertTrue, assertDefined } from './helpers/testUtils.js';

export async function runValidationApiTests(): Promise<{ passed: number; failed: number }> {
    const harness = new TestHarness('HTTP Validation & Error Response Contracts');
    console.log('\n======================================================');
    console.log('  RUNNING SUITE: HTTP VALIDATION & ERROR CONTRACTS');
    console.log('======================================================\n');

    await cleanupApiTestData();

    const { user: testUser } = await createTestUser();
    const { user: organizerUser } = await createTestOrganizer();

    const userHeaders = getAuthHeaders(testUser);
    const organizerHeaders = getAuthHeaders(organizerUser);

    // -------------------------------------------------------------------------
    // 1. INVALID MONGO OBJECTID & NOT FOUND CONTRACTS
    // -------------------------------------------------------------------------
    await harness.test('Malformed ObjectId in chit group details returns 404 Group not found', async () => {
        const res = await api
            .get('/api/chit-groups/details/malformed_not_an_id');

        assertEqual(res.status, 404);
        assertEqual(res.body.success, false);
        assertEqual(res.body.message, 'Group not found.');
    });

    await harness.test('Malformed ObjectId in installment lookup returns 404 INSTALLMENT_NOT_FOUND', async () => {
        const res = await api
            .get('/api/installments/malformed_installment_id_xyz')
            .set(userHeaders);

        assertEqual(res.status, 404);
        assertEqual(res.body.success, false);
        assertEqual(res.body.errorCode, 'INSTALLMENT_NOT_FOUND');
    });

    // -------------------------------------------------------------------------
    // 2. PAYMENT INITIATION VALIDATION (CUSTOM VALIDATOR CONTRACT)
    // -------------------------------------------------------------------------
    await harness.test('Payment initiation without Idempotency-Key returns 400 MISSING_IDEMPOTENCY_KEY', async () => {
        const res = await api
            .post('/api/transactions/initiate')
            .set(userHeaders)
            .send({});

        assertEqual(res.status, 400);
        assertEqual(res.body.success, false);
        assertEqual(res.body.code, 'MISSING_IDEMPOTENCY_KEY');
    });

    await harness.test('Payment initiation with Idempotency-Key but missing installmentId returns 400', async () => {
        const res = await api
            .post('/api/transactions/initiate')
            .set(userHeaders)
            .set('Idempotency-Key', 'test_key_' + Date.now())
            .send({});

        assertEqual(res.status, 400);
        assertEqual(res.body.success, false);
        assertEqual(res.body.message, 'Valid Installment ID is required');
    });

    await harness.test('Invalid enum on paymentMethod returns 400 with allowed methods', async () => {
        const fakeInstallmentId = new mongoose.Types.ObjectId().toString();
        const res = await api
            .post('/api/transactions/initiate')
            .set(userHeaders)
            .set('Idempotency-Key', 'test_key_' + Date.now())
            .send({
                installmentId: fakeInstallmentId,
                paymentMethod: 'INVALID_CRYPTO_METHOD',
                paymentGateway: 'MOCK'
            });

        assertEqual(res.status, 400);
        assertEqual(res.body.success, false);
        assertTrue(res.body.message.includes('Invalid payment method'));
    });

    await harness.test('Invalid enum on paymentGateway returns 400 with allowed gateways', async () => {
        const fakeInstallmentId = new mongoose.Types.ObjectId().toString();
        const res = await api
            .post('/api/transactions/initiate')
            .set(userHeaders)
            .set('Idempotency-Key', 'test_key_' + Date.now())
            .send({
                installmentId: fakeInstallmentId,
                paymentMethod: 'UPI',
                paymentGateway: 'NON_EXISTENT_GATEWAY'
            });

        assertEqual(res.status, 400);
        assertEqual(res.body.success, false);
        assertTrue(res.body.message.includes('Invalid payment gateway'));
    });

    // -------------------------------------------------------------------------
    // 3. EXPRESS-VALIDATOR SCHEMA CONTRACTS
    // -------------------------------------------------------------------------
    await harness.test('Invalid status in PATCH /api/installments/:id/status returns 400 VALIDATION_ERROR with details', async () => {
        const fakeInstallmentId = new mongoose.Types.ObjectId().toString();
        const res = await api
            .patch(`/api/installments/${fakeInstallmentId}/status`)
            .set(organizerHeaders)
            .send({
                paymentStatus: 'SUPER_INVALID_STATUS'
            });

        assertEqual(res.status, 400);
        assertEqual(res.body.success, false);
        assertEqual(res.body.errorCode, 'VALIDATION_ERROR');
        assertTrue(Array.isArray(res.body.errors));
        assertEqual(res.body.errors[0].field, 'paymentStatus');
    });

    // -------------------------------------------------------------------------
    // 4. BUSINESS LOGIC VALIDATION ERRORS
    // -------------------------------------------------------------------------
    await harness.test('Negative monthlyContribution in ChitGroup creation returns 400 Bad Request', async () => {
        const res = await api
            .post('/api/chit-groups')
            .set(organizerHeaders)
            .send({
                name: 'api_test_invalid_group',
                totalMembers: 5,
                monthlyContribution: -500,
                startDate: new Date(Date.now() + 86400000 * 5)
            });

        assertEqual(res.status, 400);
        assertEqual(res.body.success, false);
        assertEqual(res.body.message, 'Monthly contribution must be greater than 0.');
    });

    await harness.test('Total members out of bounds (< 2 or > 50) returns 400 Bad Request', async () => {
        const res = await api
            .post('/api/chit-groups')
            .set(organizerHeaders)
            .send({
                name: 'api_test_invalid_group_size',
                totalMembers: 1,
                monthlyContribution: 5000,
                startDate: new Date(Date.now() + 86400000 * 5)
            });

        assertEqual(res.status, 400);
        assertEqual(res.body.success, false);
        assertEqual(res.body.message, 'Total members must be between 2 and 50.');
    });

    // -------------------------------------------------------------------------
    // 5. ROUTE NOT FOUND (404) & STACK TRACE SECURITY
    // -------------------------------------------------------------------------
    await harness.test('Unmapped API route returns 404 ROUTE_NOT_FOUND structured error', async () => {
        const res = await api
            .get('/api/unmapped_nonexistent_route_path_123');

        assertEqual(res.status, 404);
        assertEqual(res.body.success, false);
        assertEqual(res.body.errorCode, 'ROUTE_NOT_FOUND');
    });

    await harness.test('API error response does not leak internal stack traces to client', async () => {
        const res = await api
            .get('/api/unmapped_route_for_stack_leak_check');

        assertEqual(res.status, 404);
        assertEqual(res.body.stack, undefined);
    });

    await cleanupApiTestData();
    harness.printSummary();
    const summary = harness.getSummary();
    return { passed: summary.passed, failed: summary.failed };
}
