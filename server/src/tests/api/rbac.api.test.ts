import mongoose from 'mongoose';
import { api } from './helpers/testApp.js';
import { createTestUser, createTestOrganizer, createTestAdmin } from './helpers/createTestUser.js';
import { getAuthHeaders } from './helpers/authRequest.js';
import { cleanupApiTestData } from './helpers/cleanup.js';
import { TestHarness, assertEqual, assertTrue, assertDefined } from './helpers/testUtils.js';
import { UserRole } from '../../modules/user/models/User.js';

export async function runRbacApiTests(): Promise<{ passed: number; failed: number }> {
    const harness = new TestHarness('Role-Based Access Control (RBAC HTTP Boundary)');
    console.log('\n======================================================');
    console.log('  RUNNING SUITE: RBAC (HTTP BOUNDARY)');
    console.log('======================================================\n');

    await cleanupApiTestData();

    // Provision Actors
    const { user: memberUser } = await createTestUser();
    const { user: organizerUser } = await createTestOrganizer();
    const { user: adminUser } = await createTestAdmin();

    const memberHeaders = getAuthHeaders(memberUser);
    const organizerHeaders = getAuthHeaders(organizerUser);
    const adminHeaders = getAuthHeaders(adminUser);

    // -------------------------------------------------------------------------
    // 1. MEMBER (role: USER) ACCESS RESTRICTIONS
    // -------------------------------------------------------------------------
    await harness.test('MEMBER can access permitted member endpoints (profile, discover groups)', async () => {
        const profileRes = await api
            .get('/api/user/profile')
            .set(memberHeaders);
        assertEqual(profileRes.status, 200);

        const groupsRes = await api
            .get('/api/chit-groups')
            .set(memberHeaders);
        assertEqual(groupsRes.status, 200);
    });

    await harness.test('MEMBER cannot access Admin freeze-account endpoint (403 AUTH_FORBIDDEN)', async () => {
        const res = await api
            .post('/api/admin/freeze-account')
            .set(memberHeaders)
            .send({ userId: memberUser._id.toString(), reason: 'Test' });

        assertEqual(res.status, 403);
        assertEqual(res.body.errorCode, 'AUTH_FORBIDDEN');
    });

    await harness.test('MEMBER cannot access Admin KYC pending list (403 AUTH_FORBIDDEN)', async () => {
        const res = await api
            .get('/api/kyc/pending')
            .set(memberHeaders);

        assertEqual(res.status, 403);
        assertEqual(res.body.errorCode, 'AUTH_FORBIDDEN');
    });

    await harness.test('MEMBER cannot access Admin Organizer applications (403 AUTH_FORBIDDEN)', async () => {
        const res = await api
            .get('/api/organizer/applications')
            .set(memberHeaders);

        assertEqual(res.status, 403);
        assertEqual(res.body.errorCode, 'AUTH_FORBIDDEN');
    });

    await harness.test('MEMBER cannot access Admin Support Queries inbox (403 AUTH_FORBIDDEN)', async () => {
        const res = await api
            .get('/api/contact/queries')
            .set(memberHeaders);

        assertEqual(res.status, 403);
        assertEqual(res.body.errorCode, 'AUTH_FORBIDDEN');
    });

    await harness.test('MEMBER cannot create a ChitGroup (403 AUTH_FORBIDDEN)', async () => {
        const res = await api
            .post('/api/chit-groups')
            .set(memberHeaders)
            .send({
                name: 'api_test_unauthorized_group',
                totalMembers: 5,
                monthlyContribution: 5000,
                startDate: new Date(Date.now() + 86400000 * 5)
            });

        assertEqual(res.status, 403);
        assertEqual(res.body.errorCode, 'AUTH_FORBIDDEN');
    });

    await harness.test('MEMBER cannot access Organizer my-groups dashboard (403 AUTH_FORBIDDEN)', async () => {
        const res = await api
            .get('/api/chit-groups/my-groups')
            .set(memberHeaders);

        assertEqual(res.status, 403);
        assertEqual(res.body.errorCode, 'AUTH_FORBIDDEN');
    });

    await harness.test('MEMBER cannot generate cycle installments (403 AUTH_FORBIDDEN)', async () => {
        const fakeCycleId = new mongoose.Types.ObjectId().toString();
        const res = await api
            .post(`/api/installments/generate/${fakeCycleId}`)
            .set(memberHeaders)
            .send({ dueDate: new Date(Date.now() + 86400000 * 10) });

        assertEqual(res.status, 403);
        assertEqual(res.body.errorCode, 'AUTH_FORBIDDEN');
    });

    await harness.test('MEMBER cannot create a chit cycle (403 AUTH_FORBIDDEN)', async () => {
        const res = await api
            .post('/api/chit-cycles')
            .set(memberHeaders)
            .send({
                groupId: new mongoose.Types.ObjectId().toString(),
                cycleNumber: 1,
                startDate: new Date(Date.now() + 86400000)
            });

        assertEqual(res.status, 403);
        assertEqual(res.body.errorCode, 'AUTH_FORBIDDEN');
    });

    // -------------------------------------------------------------------------
    // 2. ORGANIZER ACCESS PERMISSIONS & RESTRICTIONS
    // -------------------------------------------------------------------------
    await harness.test('ORGANIZER can create a new ChitGroup (201 Created)', async () => {
        const timestamp = Date.now();
        const res = await api
            .post('/api/chit-groups')
            .set(organizerHeaders)
            .send({
                name: `api_test_group_${timestamp}`,
                totalMembers: 5,
                monthlyContribution: 5000,
                startDate: new Date(Date.now() + 86400000 * 10)
            });

        assertEqual(res.status, 201);
        assertEqual(res.body.success, true);
        assertDefined(res.body.data.chitGroup._id);
        assertEqual(res.body.data.chitGroup.organizerId.toString(), organizerUser._id.toString());
    });

    await harness.test('ORGANIZER can access Organizer dashboard (GET /api/chit-groups/my-groups)', async () => {
        const res = await api
            .get('/api/chit-groups/my-groups')
            .set(organizerHeaders);

        assertEqual(res.status, 200);
        assertEqual(res.body.success, true);
        assertTrue(Array.isArray(res.body.data.groups));
    });

    await harness.test('ORGANIZER cannot access Admin freeze-account endpoint (403 AUTH_FORBIDDEN)', async () => {
        const res = await api
            .post('/api/admin/freeze-account')
            .set(organizerHeaders)
            .send({ userId: memberUser._id.toString(), reason: 'Test' });

        assertEqual(res.status, 403);
        assertEqual(res.body.errorCode, 'AUTH_FORBIDDEN');
    });

    await harness.test('ORGANIZER cannot access Admin KYC pending list (403 AUTH_FORBIDDEN)', async () => {
        const res = await api
            .get('/api/kyc/pending')
            .set(organizerHeaders);

        assertEqual(res.status, 403);
        assertEqual(res.body.errorCode, 'AUTH_FORBIDDEN');
    });

    await harness.test('ORGANIZER cannot access Admin Organizer applications (403 AUTH_FORBIDDEN)', async () => {
        const res = await api
            .get('/api/organizer/applications')
            .set(organizerHeaders);

        assertEqual(res.status, 403);
        assertEqual(res.body.errorCode, 'AUTH_FORBIDDEN');
    });

    // -------------------------------------------------------------------------
    // 3. ADMIN ACCESS PERMISSIONS
    // -------------------------------------------------------------------------
    await harness.test('ADMIN can access Admin KYC pending endpoint (200 OK)', async () => {
        const res = await api
            .get('/api/kyc/pending')
            .set(adminHeaders);

        assertEqual(res.status, 200);
        assertEqual(res.body.success, true);
        assertTrue(Array.isArray(res.body.data.pendings));
    });

    await harness.test('ADMIN can access Admin Organizer applications (200 OK)', async () => {
        const res = await api
            .get('/api/organizer/applications')
            .set(adminHeaders);

        assertEqual(res.status, 200);
        assertEqual(res.body.success, true);
        assertTrue(Array.isArray(res.body.data.applications));
    });

    await harness.test('ADMIN can access Admin Support Queries list (200 OK)', async () => {
        const res = await api
            .get('/api/contact/queries')
            .set(adminHeaders);

        assertEqual(res.status, 200);
        assertEqual(res.body.success, true);
        assertTrue(Array.isArray(res.body.data.queries));
    });

    await cleanupApiTestData();
    harness.printSummary();
    const summary = harness.getSummary();
    return { passed: summary.passed, failed: summary.failed };
}
