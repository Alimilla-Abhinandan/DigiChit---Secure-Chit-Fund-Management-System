import mongoose from 'mongoose';
import { api } from './helpers/testApp.js';
import { createTestUser, createTestOrganizer, createTestAdmin } from './helpers/createTestUser.js';
import { getAuthHeaders } from './helpers/authRequest.js';
import { cleanupApiTestData } from './helpers/cleanup.js';
import { TestHarness, assertEqual, assertTrue, assertDefined } from './helpers/testUtils.js';
import ChitGroup, { ChitGroupStatus, CommissionType, LateFeeType, AuctionStrategy } from '../../modules/chit-group/models/ChitGroup.js';
import Membership, { MembershipStatus } from '../../modules/membership/models/Membership.js';
import ChitCycle, { ChitCycleStatus, PaymentCollectionStatus } from '../../modules/chit-cycle/models/ChitCycle.js';
import Installment, { PaymentStatus } from '../../modules/installment/models/Installment.js';
import Transaction, { TransactionStatus, PaymentMethod, PaymentGatewayProvider } from '../../modules/payment/models/Transaction.js';

export async function runIsolationApiTests(): Promise<{ passed: number; failed: number }> {
    const harness = new TestHarness('Horizontal Privilege Escalation & Data Isolation (HTTP Boundary)');
    console.log('\n======================================================');
    console.log('  RUNNING SUITE: HORIZONTAL DATA ISOLATION (HTTP BOUNDARY)');
    console.log('======================================================\n');

    await cleanupApiTestData();

    // -------------------------------------------------------------------------
    // SETUP TEST FIXTURES: Users, Organizers, Groups, Cycles, Installments
    // -------------------------------------------------------------------------
    const timestamp = Date.now();
    const { user: userA } = await createTestUser({ name: 'User Alice' });
    const { user: userB } = await createTestUser({ name: 'User Bob' });
    const { user: organizerA } = await createTestOrganizer({ name: 'Organizer Alpha' });
    const { user: organizerB } = await createTestOrganizer({ name: 'Organizer Beta' });
    const { user: adminUser } = await createTestAdmin({ name: 'Admin Root' });

    const headersA = getAuthHeaders(userA);
    const headersB = getAuthHeaders(userB);
    const headersOrgA = getAuthHeaders(organizerA);
    const headersOrgB = getAuthHeaders(organizerB);
    const headersAdmin = getAuthHeaders(adminUser);

    // Group A (Owned by Organizer A)
    const groupA = await ChitGroup.create({
        name: `api_test_groupA_${timestamp}`,
        totalMembers: 5,
        monthlyContribution: 5000,
        commissionPercent: 2,
        startDate: new Date(Date.now() + 86400000 * 5),
        durationMonths: 5,
        status: ChitGroupStatus.ACTIVE,
        organizerId: organizerA._id,
        financialConfig: {
            version: 1,
            commission: { value: 2, type: CommissionType.PERCENTAGE },
            lateFee: { value: 0, type: LateFeeType.FIXED },
            gracePeriodDays: 3,
            auctionStrategy: AuctionStrategy.LOWEST_BID,
            allowPartialInstallment: false,
            allowPrepayment: true,
            allowPenaltyWaiver: true,
            currency: 'INR'
        }
    });

    // Group B (Owned by Organizer B)
    const groupB = await ChitGroup.create({
        name: `api_test_groupB_${timestamp}`,
        totalMembers: 5,
        monthlyContribution: 5000,
        commissionPercent: 2,
        startDate: new Date(Date.now() + 86400000 * 5),
        durationMonths: 5,
        status: ChitGroupStatus.FORMING,
        organizerId: organizerB._id,
        financialConfig: {
            version: 1,
            commission: { value: 2, type: CommissionType.PERCENTAGE },
            lateFee: { value: 0, type: LateFeeType.FIXED },
            gracePeriodDays: 3,
            auctionStrategy: AuctionStrategy.LOWEST_BID,
            allowPartialInstallment: false,
            allowPrepayment: true,
            allowPenaltyWaiver: true,
            currency: 'INR'
        }
    });

    // Memberships
    const membershipA = await Membership.create({
        chitGroupId: groupA._id,
        userId: userA._id,
        status: MembershipStatus.APPROVED
    });

    const membershipA2 = await Membership.create({
        chitGroupId: groupA._id,
        userId: userB._id,
        status: MembershipStatus.APPROVED
    });

    const membershipB = await Membership.create({
        chitGroupId: groupB._id,
        userId: userB._id,
        status: MembershipStatus.REQUESTED
    });

    // Cycle for Group A
    const cycleA = await ChitCycle.create({
        groupId: groupA._id,
        cycleNumber: 1,
        scheduledStartDate: new Date(),
        status: ChitCycleStatus.ACTIVE,
        paymentCollection: {
            status: PaymentCollectionStatus.OPEN,
            openedAt: new Date()
        }
    });

    // Installments in Cycle A
    const installmentA = await Installment.create({
        groupId: groupA._id,
        cycleId: cycleA._id,
        membershipId: membershipA._id,
        userId: userA._id,
        installmentNumber: 1,
        amount: 5000,
        paidAmount: 0,
        dueDate: new Date(Date.now() + 86400000 * 5),
        paymentStatus: PaymentStatus.PENDING
    });

    const installmentB = await Installment.create({
        groupId: groupA._id,
        cycleId: cycleA._id,
        membershipId: membershipA2._id,
        userId: userB._id,
        installmentNumber: 1,
        amount: 5000,
        paidAmount: 0,
        dueDate: new Date(Date.now() + 86400000 * 5),
        paymentStatus: PaymentStatus.PENDING
    });

    // Transactions
    const transactionA = await Transaction.create({
        transactionNumber: `TXN_API_A_${timestamp}`,
        memberId: userA._id,
        groupId: groupA._id,
        cycleId: cycleA._id,
        installmentId: installmentA._id,
        amount: 5000,
        paymentMethod: PaymentMethod.NET_BANKING,
        paymentGateway: PaymentGatewayProvider.MOCK,
        status: TransactionStatus.SUCCESS
    });

    const transactionB = await Transaction.create({
        transactionNumber: `TXN_API_B_${timestamp}`,
        memberId: userB._id,
        groupId: groupA._id,
        cycleId: cycleA._id,
        installmentId: installmentB._id,
        amount: 5000,
        paymentMethod: PaymentMethod.NET_BANKING,
        paymentGateway: PaymentGatewayProvider.MOCK,
        status: TransactionStatus.SUCCESS
    });

    // -------------------------------------------------------------------------
    // 1. MEMBER-TO-MEMBER HORIZONTAL ISOLATION TESTS
    // -------------------------------------------------------------------------
    await harness.test('User A cannot access User B transactions (403 UNAUTHORIZED)', async () => {
        const res = await api
            .get(`/api/transactions/member/${userB._id.toString()}`)
            .set(headersA);

        assertEqual(res.status, 403);
        assertEqual(res.body.errorCode, 'UNAUTHORIZED');
    });

    await harness.test('User A can access own transactions (200 OK)', async () => {
        const res = await api
            .get(`/api/transactions/member/${userA._id.toString()}`)
            .set(headersA);

        assertEqual(res.status, 200);
        assertEqual(res.body.success, true);
    });

    await harness.test('User A cannot access User B financial statement (403 UNAUTHORIZED)', async () => {
        const res = await api
            .get(`/api/statements/member/${userB._id.toString()}`)
            .set(headersA);

        assertEqual(res.status, 403);
        assertEqual(res.body.errorCode, 'UNAUTHORIZED');
    });

    await harness.test('User A can access own financial statement (200 OK)', async () => {
        const res = await api
            .get(`/api/statements/member/${userA._id.toString()}`)
            .set(headersA);

        assertEqual(res.status, 200);
        assertEqual(res.body.success, true);
    });

    await harness.test('User A cannot view User B individual installment details (403 UNAUTHORIZED)', async () => {
        const res = await api
            .get(`/api/installments/${installmentB._id.toString()}`)
            .set(headersA);

        assertEqual(res.status, 403);
        assertEqual(res.body.errorCode, 'UNAUTHORIZED');
    });

    await harness.test('User A can view own installment details (200 OK)', async () => {
        const res = await api
            .get(`/api/installments/${installmentA._id.toString()}`)
            .set(headersA);

        assertEqual(res.status, 200);
        assertEqual(res.body.success, true);
        assertEqual(res.body.data.installment._id.toString(), installmentA._id.toString());
    });

    await harness.test('User A cannot initiate payment for User B installment (403 UNAUTHORIZED_INSTALLMENT_PAYMENT)', async () => {
        const res = await api
            .post('/api/transactions/initiate')
            .set(headersA)
            .set('Idempotency-Key', `key_cross_pay_${timestamp}`)
            .send({
                installmentId: installmentB._id.toString(),
                paymentMethod: 'UPI',
                paymentGateway: 'MOCK',
                amount: 5000
            });

        assertEqual(res.status, 403);
        assertEqual(res.body.errorCode, 'UNAUTHORIZED_INSTALLMENT_PAYMENT');
    });

    // -------------------------------------------------------------------------
    // 2. ORGANIZER-TO-ORGANIZER HORIZONTAL ISOLATION TESTS
    // -------------------------------------------------------------------------
    await harness.test('Organizer A cannot update Organizer B chit group (403 Forbidden)', async () => {
        const res = await api
            .put(`/api/chit-groups/${groupB._id.toString()}`)
            .set(headersOrgA)
            .send({
                name: 'Hacked Group Name'
            });

        assertEqual(res.status, 403);
    });

    await harness.test('Organizer A cannot approve a member join request in Organizer B group (403 Forbidden)', async () => {
        const res = await api
            .post(`/api/chit-groups/members/approve/${membershipB._id.toString()}`)
            .set(headersOrgA);

        assertEqual(res.status, 403);
    });

    await harness.test('Organizer A cannot reject a member in Organizer B group (403 Forbidden)', async () => {
        const res = await api
            .post(`/api/chit-groups/members/reject/${membershipB._id.toString()}`)
            .set(headersOrgA);

        assertEqual(res.status, 403);
    });

    await harness.test('Organizer A cannot view Organizer B financial statement (403 UNAUTHORIZED)', async () => {
        const res = await api
            .get(`/api/statements/organizer/${organizerB._id.toString()}`)
            .set(headersOrgA);

        assertEqual(res.status, 403);
        assertEqual(res.body.errorCode, 'UNAUTHORIZED');
    });

    await harness.test('Organizer A can access own organizer statement (200 OK)', async () => {
        const res = await api
            .get(`/api/statements/organizer/${organizerA._id.toString()}`)
            .set(headersOrgA);

        assertEqual(res.status, 200);
        assertEqual(res.body.success, true);
    });

    await harness.test('Organizer A can update own chit group (200 OK)', async () => {
        const res = await api
            .put(`/api/chit-groups/${groupA._id.toString()}`)
            .set(headersOrgA)
            .send({
                description: 'Updated description for Alpha Group'
            });

        assertEqual(res.status, 200);
        assertEqual(res.body.success, true);
    });

    // -------------------------------------------------------------------------
    // 3. ADMIN PRIVILEGE & CROSS-TENANT AUDIT TESTS
    // -------------------------------------------------------------------------
    await harness.test('ADMIN can access any member transactions (200 OK)', async () => {
        const res = await api
            .get(`/api/transactions/member/${userA._id.toString()}`)
            .set(headersAdmin);

        assertEqual(res.status, 200);
        assertEqual(res.body.success, true);
    });

    await harness.test('ADMIN can access any member financial statement (200 OK)', async () => {
        const res = await api
            .get(`/api/statements/member/${userA._id.toString()}`)
            .set(headersAdmin);

        assertEqual(res.status, 200);
        assertEqual(res.body.success, true);
    });

    await harness.test('ADMIN can access any organizer financial statement (200 OK)', async () => {
        const res = await api
            .get(`/api/statements/organizer/${organizerA._id.toString()}`)
            .set(headersAdmin);

        assertEqual(res.status, 200);
        assertEqual(res.body.success, true);
    });

    await cleanupApiTestData();
    harness.printSummary();
    const summary = harness.getSummary();
    return { passed: summary.passed, failed: summary.failed };
}
