import mongoose from 'mongoose';
import { api } from './helpers/testApp.js';
import { createTestUser, createTestAdmin } from './helpers/createTestUser.js';
import { getAuthHeaders, getAuthToken } from './helpers/authRequest.js';
import { cleanupApiTestData } from './helpers/cleanup.js';
import { TestHarness, assertEqual, assertTrue, assertDefined } from './helpers/testUtils.js';
import Token from '../../modules/auth/models/Token.js';
import User, { AccountStatus } from '../../modules/user/models/User.js';

export async function runAuthApiTests(): Promise<{ passed: number; failed: number }> {
    const harness = new TestHarness('Authentication API (HTTP Boundary)');
    console.log('\n======================================================');
    console.log('  RUNNING SUITE: AUTHENTICATION API (HTTP BOUNDARY)');
    console.log('======================================================\n');

    await cleanupApiTestData();

    // -------------------------------------------------------------------------
    // 1. REGISTRATION TESTS
    // -------------------------------------------------------------------------
    await harness.test('POST /api/auth/register: successful registration returns 201 and sanitized user', async () => {
        const timestamp = Date.now();
        const payload = {
            name: 'John Registration Test',
            email: `api_test_reg_${timestamp}@example.com`,
            password: 'SecurePassword123!',
            age: 26
        };

        const res = await api
            .post('/api/auth/register')
            .send(payload);

        assertEqual(res.status, 201, 'Status must be 201 Created');
        assertEqual(res.body.success, true);
        assertDefined(res.body.data?.user?.id);
        assertEqual(res.body.data.user.email, payload.email.toLowerCase());
        assertEqual(res.body.data.user.emailVerified, false);
        assertEqual(res.body.data.user.accountStatus, 'REGISTERED');
        assertEqual(res.body.data.user.role, 'USER');
        // Ensure sensitive fields (password) are not returned
        assertEqual(res.body.data.user.password, undefined);
    });

    await harness.test('POST /api/auth/register: rejects duplicate email with 400 AUTH_EMAIL_EXISTS', async () => {
        const { user } = await createTestUser();
        const payload = {
            name: 'Duplicate Email User',
            email: user.email,
            password: 'SecurePassword123!',
            age: 30
        };

        const res = await api
            .post('/api/auth/register')
            .send(payload);

        assertEqual(res.status, 400, 'Status must be 400 Bad Request');
        assertEqual(res.body.success, false);
        assertEqual(res.body.errorCode, 'AUTH_EMAIL_EXISTS');
    });

    await harness.test('POST /api/auth/register: rejects invalid email format with 400 VALIDATION_ERROR', async () => {
        const payload = {
            name: 'Invalid Email User',
            email: 'not-an-email-format',
            password: 'SecurePassword123!',
            age: 25
        };

        const res = await api
            .post('/api/auth/register')
            .send(payload);

        assertEqual(res.status, 400);
        assertEqual(res.body.success, false);
        assertEqual(res.body.errorCode, 'VALIDATION_ERROR');
    });

    await harness.test('POST /api/auth/register: rejects password shorter than 8 chars with 400 VALIDATION_ERROR', async () => {
        const payload = {
            name: 'Short Password User',
            email: `api_test_shortpass_${Date.now()}@example.com`,
            password: 'short',
            age: 25
        };

        const res = await api
            .post('/api/auth/register')
            .send(payload);

        assertEqual(res.status, 400);
        assertEqual(res.body.success, false);
        assertEqual(res.body.errorCode, 'VALIDATION_ERROR');
    });

    await harness.test('POST /api/auth/register: rejects age under 21 with 400 VALIDATION_ERROR', async () => {
        const payload = {
            name: 'Underage User',
            email: `api_test_underage_${Date.now()}@example.com`,
            password: 'SecurePassword123!',
            age: 19
        };

        const res = await api
            .post('/api/auth/register')
            .send(payload);

        assertEqual(res.status, 400);
        assertEqual(res.body.success, false);
        assertEqual(res.body.errorCode, 'VALIDATION_ERROR');
    });

    await harness.test('POST /api/auth/register: rejects missing required fields with 400 VALIDATION_ERROR', async () => {
        const res = await api
            .post('/api/auth/register')
            .send({});

        assertEqual(res.status, 400);
        assertEqual(res.body.success, false);
        assertEqual(res.body.errorCode, 'VALIDATION_ERROR');
    });

    // -------------------------------------------------------------------------
    // 2. EMAIL VERIFICATION TESTS
    // -------------------------------------------------------------------------
    await harness.test('GET /api/auth/verify-email: valid token activates account and issues JWT', async () => {
        const { user } = await createTestUser({ emailVerified: false, accountStatus: AccountStatus.REGISTERED });
        const tokenString = 'test_valid_verify_token_' + Date.now();
        await Token.create({
            userId: user._id,
            token: tokenString,
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
        });

        const res = await api
            .get(`/api/auth/verify-email?token=${tokenString}`);

        assertEqual(res.status, 200);
        assertEqual(res.body.success, true);
        assertDefined(res.body.token);
        assertEqual(res.body.data.user.emailVerified, true);
        assertEqual(res.body.data.user.accountStatus, 'ACTIVE');

        // Confirm DB state updated
        const updatedUser = await User.findById(user._id);
        assertEqual(updatedUser?.emailVerified, true);
        assertEqual(updatedUser?.accountStatus, AccountStatus.ACTIVE);

        // Confirm token is deleted after use
        const deletedToken = await Token.findOne({ token: tokenString });
        assertEqual(deletedToken, null);
    });

    await harness.test('GET /api/auth/verify-email: invalid token returns 400 AUTH_TOKEN_INVALID', async () => {
        const res = await api
            .get('/api/auth/verify-email?token=completely_fake_invalid_token');

        assertEqual(res.status, 400);
        assertEqual(res.body.success, false);
        assertEqual(res.body.errorCode, 'AUTH_TOKEN_INVALID');
    });

    await harness.test('GET /api/auth/verify-email: expired token returns 400 AUTH_TOKEN_EXPIRED', async () => {
        const { user } = await createTestUser({ emailVerified: false });
        const tokenString = 'test_expired_verify_token_' + Date.now();
        await Token.create({
            userId: user._id,
            token: tokenString,
            expiresAt: new Date(Date.now() - 10000) // Expired in past
        });

        const res = await api
            .get(`/api/auth/verify-email?token=${tokenString}`);

        assertEqual(res.status, 400);
        assertEqual(res.body.success, false);
        assertEqual(res.body.errorCode, 'AUTH_TOKEN_EXPIRED');
    });

    await harness.test('POST /api/auth/resend-verification: resends token for unverified user', async () => {
        const { user } = await createTestUser({ emailVerified: false });

        const res = await api
            .post('/api/auth/resend-verification')
            .send({ email: user.email });

        assertEqual(res.status, 200);
        assertEqual(res.body.success, true);

        // Check token generated in DB
        const tokenDoc = await Token.findOne({ userId: user._id });
        assertDefined(tokenDoc);
    });

    await harness.test('POST /api/auth/resend-verification: rejects already verified user with 400', async () => {
        const { user } = await createTestUser({ emailVerified: true });

        const res = await api
            .post('/api/auth/resend-verification')
            .send({ email: user.email });

        assertEqual(res.status, 400);
        assertEqual(res.body.success, false);
        assertEqual(res.body.errorCode, 'AUTH_EMAIL_ALREADY_VERIFIED');
    });

    // -------------------------------------------------------------------------
    // 3. LOGIN TESTS
    // -------------------------------------------------------------------------
    await harness.test('POST /api/auth/login: valid credentials returns 200 and JWT token', async () => {
        const { user, plainPassword } = await createTestUser({ emailVerified: true, accountStatus: AccountStatus.ACTIVE });

        const res = await api
            .post('/api/auth/login')
            .send({
                email: user.email,
                password: plainPassword
            });

        assertEqual(res.status, 200);
        assertEqual(res.body.success, true);
        assertDefined(res.body.token);
        assertEqual(res.body.data.user.id, user._id.toString());
        assertEqual(res.body.data.user.email, user.email);
    });

    await harness.test('POST /api/auth/login: incorrect password returns 401 AUTH_INCORRECT_PASSWORD', async () => {
        const { user } = await createTestUser({ emailVerified: true, accountStatus: AccountStatus.ACTIVE });

        const res = await api
            .post('/api/auth/login')
            .send({
                email: user.email,
                password: 'WrongPassword999!'
            });

        assertEqual(res.status, 401);
        assertEqual(res.body.success, false);
        assertEqual(res.body.errorCode, 'AUTH_INCORRECT_PASSWORD');
    });

    await harness.test('POST /api/auth/login: nonexistent email returns 404 AUTH_EMAIL_NOT_FOUND', async () => {
        const res = await api
            .post('/api/auth/login')
            .send({
                email: 'never_existed_user_9999@example.com',
                password: 'SomePassword123!'
            });

        assertEqual(res.status, 404);
        assertEqual(res.body.success, false);
        assertEqual(res.body.errorCode, 'AUTH_EMAIL_NOT_FOUND');
    });

    await harness.test('POST /api/auth/login: unverified user is rejected with 403 AUTH_EMAIL_UNVERIFIED', async () => {
        const { user, plainPassword } = await createTestUser({ emailVerified: false });

        const res = await api
            .post('/api/auth/login')
            .send({
                email: user.email,
                password: plainPassword
            });

        assertEqual(res.status, 403);
        assertEqual(res.body.success, false);
        assertEqual(res.body.errorCode, 'AUTH_EMAIL_UNVERIFIED');
    });

    await harness.test('POST /api/auth/login: suspended account is rejected with 403 AUTH_ACCOUNT_BLOCKED', async () => {
        const { user, plainPassword } = await createTestUser({
            emailVerified: true,
            accountStatus: AccountStatus.SUSPENDED
        });

        const res = await api
            .post('/api/auth/login')
            .send({
                email: user.email,
                password: plainPassword
            });

        assertEqual(res.status, 403);
        assertEqual(res.body.success, false);
        assertEqual(res.body.errorCode, 'AUTH_ACCOUNT_BLOCKED');
    });

    await harness.test('POST /api/auth/login: frozen account is rejected with 403 AUTH_ACCOUNT_BLOCKED', async () => {
        const { user, plainPassword } = await createTestUser({
            emailVerified: true,
            accountStatus: AccountStatus.FROZEN
        });

        const res = await api
            .post('/api/auth/login')
            .send({
                email: user.email,
                password: plainPassword
            });

        assertEqual(res.status, 403);
        assertEqual(res.body.success, false);
        assertEqual(res.body.errorCode, 'AUTH_ACCOUNT_BLOCKED');
    });

    await harness.test('POST /api/auth/login: soft-deleted user is rejected with 404 AUTH_EMAIL_NOT_FOUND', async () => {
        const { user, plainPassword } = await createTestUser({
            emailVerified: true,
            accountStatus: AccountStatus.DELETED,
            deletedAt: new Date()
        });

        const res = await api
            .post('/api/auth/login')
            .send({
                email: user.email,
                password: plainPassword
            });

        assertEqual(res.status, 404);
        assertEqual(res.body.success, false);
        assertEqual(res.body.errorCode, 'AUTH_EMAIL_NOT_FOUND');
    });

    await harness.test('POST /api/auth/login: admin bypasses email verification check', async () => {
        const { user, plainPassword } = await createTestAdmin({ emailVerified: false });

        const res = await api
            .post('/api/auth/login')
            .send({
                email: user.email,
                password: plainPassword
            });

        assertEqual(res.status, 200);
        assertEqual(res.body.success, true);
        assertEqual(res.body.data.user.role, 'ADMIN');
    });

    // -------------------------------------------------------------------------
    // 4. PASSWORD RESET TESTS
    // -------------------------------------------------------------------------
    await harness.test('POST /api/auth/forgot-password: generates reset token for active user', async () => {
        const { user } = await createTestUser({ emailVerified: true, accountStatus: AccountStatus.ACTIVE });

        const res = await api
            .post('/api/auth/forgot-password')
            .send({ email: user.email });

        assertEqual(res.status, 200);
        assertEqual(res.body.success, true);

        const resetTokenDoc = await Token.findOne({ userId: user._id });
        assertDefined(resetTokenDoc);
    });

    await harness.test('POST /api/auth/forgot-password: fails with 404 for nonexistent email', async () => {
        const res = await api
            .post('/api/auth/forgot-password')
            .send({ email: 'nonexistent_forgot_email@example.com' });

        assertEqual(res.status, 404);
        assertEqual(res.body.success, false);
        assertEqual(res.body.errorCode, 'AUTH_USER_NOT_FOUND');
    });

    await harness.test('POST /api/auth/reset-password: valid token resets password, invalidates old sessions', async () => {
        const { user, plainPassword: oldPassword } = await createTestUser({ emailVerified: true, accountStatus: AccountStatus.ACTIVE, tokenVersion: 0 });
        const resetTokenString = 'reset_token_' + Date.now();
        await Token.create({
            userId: user._id,
            token: resetTokenString,
            expiresAt: new Date(Date.now() + 60 * 60 * 1000)
        });

        // Generate JWT with initial tokenVersion 0
        const oldJwt = getAuthToken(user);

        const newPassword = 'BrandNewSecurePassword123!';
        const res = await api
            .post('/api/auth/reset-password')
            .send({
                token: resetTokenString,
                newPassword
            });

        assertEqual(res.status, 200);
        assertEqual(res.body.success, true);

        // 1. Old password should fail login
        const oldLoginRes = await api
            .post('/api/auth/login')
            .send({ email: user.email, password: oldPassword });
        assertEqual(oldLoginRes.status, 401);

        // 2. New password should succeed login
        const newLoginRes = await api
            .post('/api/auth/login')
            .send({ email: user.email, password: newPassword });
        assertEqual(newLoginRes.status, 200);

        // 3. User tokenVersion must be incremented in DB
        const updatedUser = await User.findById(user._id);
        assertEqual(updatedUser?.tokenVersion, 1);

        // 4. Old JWT with tokenVersion 0 should fail against protected route (Session invalidation)
        const profileRes = await api
            .get('/api/user/profile')
            .set('Authorization', `Bearer ${oldJwt}`);
        assertEqual(profileRes.status, 401);
        assertEqual(profileRes.body.errorCode, 'AUTH_SESSION_EXPIRED');
    });

    await harness.test('POST /api/auth/reset-password: rejects invalid token with 400 AUTH_TOKEN_INVALID', async () => {
        const res = await api
            .post('/api/auth/reset-password')
            .send({
                token: 'invalid_reset_token_string',
                newPassword: 'NewPassword123!'
            });

        assertEqual(res.status, 400);
        assertEqual(res.body.success, false);
        assertEqual(res.body.errorCode, 'AUTH_TOKEN_INVALID');
    });

    await cleanupApiTestData();
    harness.printSummary();
    const summary = harness.getSummary();
    return { passed: summary.passed, failed: summary.failed };
}
