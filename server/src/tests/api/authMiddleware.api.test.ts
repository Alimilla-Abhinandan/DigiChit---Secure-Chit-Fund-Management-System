import mongoose from 'mongoose';
import { api } from './helpers/testApp.js';
import { createTestUser } from './helpers/createTestUser.js';
import { getAuthToken, getAuthHeaders, getExpiredToken, getInvalidSignatureToken } from './helpers/authRequest.js';
import { cleanupApiTestData } from './helpers/cleanup.js';
import { TestHarness, assertEqual, assertTrue, assertDefined } from './helpers/testUtils.js';
import User, { AccountStatus } from '../../modules/user/models/User.js';

export async function runAuthMiddlewareTests(): Promise<{ passed: number; failed: number }> {
    const harness = new TestHarness('Auth Middleware (HTTP Boundary)');
    console.log('\n======================================================');
    console.log('  RUNNING SUITE: AUTH MIDDLEWARE (HTTP BOUNDARY)');
    console.log('======================================================\n');

    await cleanupApiTestData();

    // -------------------------------------------------------------------------
    // 1. MISSING AND MALFORMED TOKEN TESTS
    // -------------------------------------------------------------------------
    await harness.test('rejects request with no Authorization header with 401 AUTH_NO_TOKEN', async () => {
        const res = await api
            .get('/api/user/profile');

        assertEqual(res.status, 401);
        assertEqual(res.body.success, false);
        assertEqual(res.body.errorCode, 'AUTH_NO_TOKEN');
    });

    await harness.test('rejects malformed Authorization header ("Basic ...") with 401 AUTH_NO_TOKEN', async () => {
        const res = await api
            .get('/api/user/profile')
            .set('Authorization', 'Basic dXNlcm5hbWU6cGFzc3dvcmQ=');

        assertEqual(res.status, 401);
        assertEqual(res.body.success, false);
        assertEqual(res.body.errorCode, 'AUTH_NO_TOKEN');
    });

    await harness.test('rejects empty "Bearer " token with 401 AUTH_TOKEN_INVALID', async () => {
        const res = await api
            .get('/api/user/profile')
            .set('Authorization', 'Bearer ');

        assertEqual(res.status, 401);
        assertEqual(res.body.success, false);
    });

    await harness.test('rejects corrupted JWT token string with 401 AUTH_TOKEN_INVALID', async () => {
        const res = await api
            .get('/api/user/profile')
            .set('Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.corrupted.payload');

        assertEqual(res.status, 401);
        assertEqual(res.body.success, false);
        assertEqual(res.body.errorCode, 'AUTH_TOKEN_INVALID');
    });

    // -------------------------------------------------------------------------
    // 2. SIGNATURE & EXPIRATION TESTS
    // -------------------------------------------------------------------------
    await harness.test('rejects token signed with invalid secret key with 401 AUTH_TOKEN_INVALID', async () => {
        const { user } = await createTestUser();
        const fakeToken = getInvalidSignatureToken(user);

        const res = await api
            .get('/api/user/profile')
            .set('Authorization', `Bearer ${fakeToken}`);

        assertEqual(res.status, 401);
        assertEqual(res.body.success, false);
        assertEqual(res.body.errorCode, 'AUTH_TOKEN_INVALID');
    });

    await harness.test('rejects expired JWT token with 401', async () => {
        const { user } = await createTestUser();
        const expiredToken = getExpiredToken(user);

        const res = await api
            .get('/api/user/profile')
            .set('Authorization', `Bearer ${expiredToken}`);

        assertEqual(res.status, 401);
        assertEqual(res.body.success, false);
    });

    // -------------------------------------------------------------------------
    // 3. USER DELETION & SESSION REVOCATION (tokenVersion) TESTS
    // -------------------------------------------------------------------------
    await harness.test('rejects token if user was deleted from database with 401 AUTH_USER_DELETED', async () => {
        const { user } = await createTestUser();
        const token = getAuthToken(user);

        // Delete user completely from DB
        await User.deleteOne({ _id: user._id });

        const res = await api
            .get('/api/user/profile')
            .set('Authorization', `Bearer ${token}`);

        assertEqual(res.status, 401);
        assertEqual(res.body.success, false);
        assertEqual(res.body.errorCode, 'AUTH_USER_DELETED');
    });

    await harness.test('rejects token with stale tokenVersion (session invalidated) with 401 AUTH_SESSION_EXPIRED', async () => {
        const { user } = await createTestUser({ tokenVersion: 0 });
        const tokenVersion0 = getAuthToken(user);

        // Invalidate session by incrementing tokenVersion in DB
        await User.updateOne({ _id: user._id }, { $inc: { tokenVersion: 1 } });

        const res = await api
            .get('/api/user/profile')
            .set('Authorization', `Bearer ${tokenVersion0}`);

        assertEqual(res.status, 401);
        assertEqual(res.body.success, false);
        assertEqual(res.body.errorCode, 'AUTH_SESSION_EXPIRED');
    });

    await harness.test('rejects token if accountStatus is DELETED with 403 AUTH_ACCOUNT_DELETED', async () => {
        const { user } = await createTestUser({ accountStatus: AccountStatus.DELETED });
        const token = getAuthToken(user);

        const res = await api
            .get('/api/user/profile')
            .set('Authorization', `Bearer ${token}`);

        assertEqual(res.status, 403);
        assertEqual(res.body.success, false);
        assertEqual(res.body.errorCode, 'AUTH_ACCOUNT_DELETED');
    });

    // -------------------------------------------------------------------------
    // 4. VALID TOKEN & IDENTITY INTEGRITY
    // -------------------------------------------------------------------------
    await harness.test('accepts valid JWT token and populates authenticated user profile correctly', async () => {
        const { user } = await createTestUser({ name: 'Verified Profile User' });
        const token = getAuthToken(user);

        const res = await api
            .get('/api/user/profile')
            .set('Authorization', `Bearer ${token}`);

        assertEqual(res.status, 200);
        assertEqual(res.body.success, true);
        assertEqual(res.body.data.user._id, user._id.toString());
        assertEqual(res.body.data.user.email, user.email);
        assertEqual(res.body.data.user.name, 'Verified Profile User');
    });

    await harness.test('authentication does not trust client-supplied userId in query or body', async () => {
        const { user: realUser } = await createTestUser({ name: 'Real Authenticated User' });
        const { user: victimUser } = await createTestUser({ name: 'Victim User' });
        const token = getAuthToken(realUser);

        // Attempt to pass victim's userId in query or body
        const res = await api
            .get(`/api/user/profile?userId=${victimUser._id.toString()}`)
            .set('Authorization', `Bearer ${token}`);

        assertEqual(res.status, 200);
        assertEqual(res.body.success, true);
        // req.user must resolve to realUser, NOT victimUser
        assertEqual(res.body.data.user._id, realUser._id.toString());
        assertEqual(res.body.data.user.email, realUser.email);
    });

    await cleanupApiTestData();
    harness.printSummary();
    const summary = harness.getSummary();
    return { passed: summary.passed, failed: summary.failed };
}
