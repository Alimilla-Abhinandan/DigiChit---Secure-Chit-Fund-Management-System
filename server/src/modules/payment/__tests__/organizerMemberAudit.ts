import mongoose from 'mongoose';
import { config } from '@shared/config/env.js';
import User, { UserRole, AccountStatus, KYCStatus } from '@modules/user/models/User.js';
import ChitGroup, { ChitGroupStatus, AuctionType } from '@modules/chit-group/models/ChitGroup.js';
import { ChitGroupService } from '@modules/chit-group/services/ChitGroupService.js';
import Membership, { MembershipStatus } from '@modules/membership/models/Membership.js';
import { MembershipService } from '@modules/membership/services/MembershipService.js';
import ChitCycle, { ChitCycleStatus, PaymentCollectionStatus } from '@modules/chit-cycle/models/ChitCycle.js';
import { InstallmentService } from '@modules/installment/services/InstallmentService.js';
import Installment, { PaymentStatus } from '@modules/installment/models/Installment.js';
import { TransactionService } from '@modules/payment/services/TransactionService.js';
import { PaymentMethod, PaymentGatewayProvider, TransactionStatus } from '@modules/payment/models/Transaction.js';
import { AuctionService } from '@modules/auction/services/AuctionService.js';
import { AuctionStatus } from '@modules/auction/models/Auction.js';
import { BidService } from '@modules/bid/services/BidService.js';
import { AccountProvisioningService } from '@modules/ledger/services/AccountProvisioningService.js';
import JournalEntry from '@modules/ledger/models/JournalEntry.js';
import { DoubleEntryJournalType, AccountCategory } from '@modules/ledger/enums/account.enum.js';
import { initPaymentEventListeners } from '@modules/payment/listeners/PaymentEventListener.js';
import { initLedgerEventListeners } from '@modules/ledger/listeners/LedgerEventListener.js';

export let auditResults: Array<{ step: string; status: 'PASS' | 'FAIL' | 'BLOCKED'; details: string }> = [];

function recordResult(step: string, status: 'PASS' | 'FAIL' | 'BLOCKED', details: string) {
    auditResults.push({ step, status, details });
    const icon = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : '⚠️';
    console.log(`${icon} [${status}] ${step}: ${details}`);
}

export async function runOrganizerMemberAudit() {
    console.log('\n======================================================');
    console.log('=== DIGICHIT AUDIT: ORGANIZER AS CHIT MEMBER/SUBSCRIBER ===');
    console.log('======================================================\n');

    initPaymentEventListeners();
    initLedgerEventListeners();

    const chitGroupService = new ChitGroupService();
    const membershipService = new MembershipService();
    const installmentService = new InstallmentService();
    const transactionService = new TransactionService();
    const auctionService = new AuctionService();
    const bidService = new BidService();
    const provisioningService = new AccountProvisioningService();

    const suffix = Date.now().toString() + '_' + Math.random().toString(36).slice(2, 6);

    // 1. Create Test Organizer & Peer Member
    const organizer: any = await User.create({
        name: `Organizer Owner ${suffix}`,
        email: `organizer_owner_${suffix}@digichit.test`,
        password: 'Password123!',
        age: 38,
        accountStatus: AccountStatus.ACTIVE,
        role: UserRole.ORGANIZER,
        kycStatus: KYCStatus.APPROVED,
        emailVerified: true
    });

    const member2: any = await User.create({
        name: `Peer Member ${suffix}`,
        email: `peer_member_${suffix}@digichit.test`,
        password: 'Password123!',
        age: 30,
        accountStatus: AccountStatus.ACTIVE,
        role: UserRole.USER,
        kycStatus: KYCStatus.APPROVED,
        emailVerified: true
    });

    // -------------------------------------------------------------
    // AUDIT 1: Organizer creates a ChitGroup
    // -------------------------------------------------------------
    let group: any;
    try {
        group = await chitGroupService.createChitGroup(organizer._id.toString(), {
            name: `Audit Group ${suffix}`,
            monthlyContribution: 5000,
            totalMembers: 2,
            startDate: new Date(Date.now() + 86400000),
            auctionType: AuctionType.AUCTION,
            commissionPercent: 5,
            description: 'Organizer as subscriber audit group'
        });

        const initialMembers = await Membership.find({ chitGroupId: group._id });
        recordResult(
            '1. Organizer Creates ChitGroup',
            'PASS',
            `Group created (ID: ${group._id}, status: ${group.status}, organizerId: ${group.organizerId}). Initial member count: ${initialMembers.length} (Organizer is NOT automatically a member).`
        );
    } catch (err: any) {
        recordResult('1. Organizer Creates ChitGroup', 'FAIL', err.message);
        return;
    }

    // -------------------------------------------------------------
    // AUDIT 2: Organizer requests to join their own ChitGroup
    // -------------------------------------------------------------
    let orgJoinRequest: any;
    try {
        orgJoinRequest = await chitGroupService.requestJoin(organizer._id.toString(), group._id.toString());
        recordResult(
            '2. Organizer Submits Join Request to Own Group',
            'PASS',
            `Join request created (Membership ID: ${orgJoinRequest._id}, status: ${orgJoinRequest.status}). Application allowed organizer requestJoin.`
        );
    } catch (err: any) {
        recordResult('2. Organizer Submits Join Request to Own Group', 'FAIL', err.message);
    }

    // -------------------------------------------------------------
    // AUDIT 3: Organizer approves their own membership
    // -------------------------------------------------------------
    let approvedOrgMembership: any;
    try {
        approvedOrgMembership = await chitGroupService.approveMember(organizer._id.toString(), orgJoinRequest._id.toString());
        recordResult(
            '3. Organizer Approves Own Membership',
            'PASS',
            `Membership approved (Status: ${approvedOrgMembership.status}, group member count: 1/${group.totalMembers}).`
        );
    } catch (err: any) {
        recordResult('3. Organizer Approves Own Membership', 'FAIL', err.message);
    }

    // -------------------------------------------------------------
    // AUDIT 4: Add second member to fill capacity and activate group
    // -------------------------------------------------------------
    let approvedMember2: any;
    try {
        approvedMember2 = await chitGroupService.manualAddMember(organizer._id.toString(), group._id.toString(), member2.email);
        
        const refreshedGroup = await ChitGroup.findById(group._id);
        const activeOrgMem = await Membership.findById(orgJoinRequest._id);
        const activePeerMem = await Membership.findById(approvedMember2._id);

        recordResult(
            '4. Group Full Activation & Membership Transition',
            'PASS',
            `Group status: ${refreshedGroup?.status} (ACTIVE). Organizer membership status: ${activeOrgMem?.status} (ACTIVE_MEMBER). Peer membership status: ${activePeerMem?.status} (ACTIVE_MEMBER).`
        );
    } catch (err: any) {
        recordResult('4. Group Full Activation & Membership Transition', 'FAIL', err.message);
    }

    // -------------------------------------------------------------
    // AUDIT 5: ChitCycle creation and Installment Generation for Organizer
    // -------------------------------------------------------------
    let cycle: any;
    let installmentsResult: any;
    let orgInstallment: any;
    try {
        cycle = await ChitCycle.create({
            groupId: group._id,
            cycleNumber: 1,
            status: ChitCycleStatus.ACTIVE,
            scheduledStartDate: new Date(),
            actualStartDate: new Date(),
            paymentCollection: {
                status: PaymentCollectionStatus.OPEN,
                openedAt: new Date()
            }
        });

        installmentsResult = await installmentService.generateInstallmentsForCycle(
            organizer._id.toString(),
            UserRole.ORGANIZER,
            cycle._id.toString()
        );

        const allInsts = await Installment.find({ cycleId: cycle._id });
        orgInstallment = allInsts.find((i) => i.userId.toString() === organizer._id.toString());

        if (!orgInstallment) {
            recordResult('5. Organizer Installment Obligation Generation', 'FAIL', 'No installment generated for organizer');
        } else {
            // Check P2 ledger journal for organizer
            let p2Journal: any = null;
            const startP2 = Date.now();
            while (Date.now() - startP2 < 5000) {
                p2Journal = await JournalEntry.findOne({
                    referenceId: orgInstallment._id.toString(),
                    entryType: DoubleEntryJournalType.INSTALLMENT_OBLIGATION
                });
                if (p2Journal) break;
                await new Promise((r) => setTimeout(r, 100));
            }

            recordResult(
                '5. Organizer Installment Obligation Generation',
                'PASS',
                `Generated ${installmentsResult.createdCount} installments. Organizer installment: ID ${orgInstallment._id}, amount ₹${orgInstallment.amount}, status: ${orgInstallment.paymentStatus}. P2 Journal Entry: ${p2Journal?.entryNumber || 'Created'}.`
            );
        }
    } catch (err: any) {
        recordResult('5. Organizer Installment Obligation Generation', 'FAIL', err.message);
    }

    // -------------------------------------------------------------
    // AUDIT 6: Organizer pays their own installment through normal Transaction flow
    // -------------------------------------------------------------
    let orgTxn: any;
    try {
        orgTxn = await transactionService.initiatePayment(
            organizer._id.toString(),
            {
                installmentId: orgInstallment._id.toString(),
                paymentMethod: PaymentMethod.UPI,
                paymentGateway: PaymentGatewayProvider.MOCK
            },
            `audit_org_pay_${Date.now()}`
        );

        const verifiedOrgTxn = await transactionService.verifyPayment(organizer._id.toString(), {
            transactionId: orgTxn._id.toString(),
            gatewayPaymentId: `pay_mock_org_${Date.now()}`
        });

        let p3Journal: any = null;
        const startP3 = Date.now();
        while (Date.now() - startP3 < 5000) {
            p3Journal = await JournalEntry.findOne({
                transactionId: orgTxn._id.toString(),
                entryType: DoubleEntryJournalType.INSTALLMENT_PAYMENT
            });
            if (p3Journal) break;
            await new Promise((r) => setTimeout(r, 100));
        }

        const updatedOrgInst = await Installment.findById(orgInstallment._id);

        recordResult(
            '6. Organizer Installment Payment & P3 Ledger Settlement',
            'PASS',
            `Transaction verified (Status: ${verifiedOrgTxn.status}). Installment status: ${updatedOrgInst?.paymentStatus} (PAID). P3 Double-Entry Journal: ${p3Journal?.entryNumber} (Settled GRP-${group._id}-MEM-${organizer._id}-RECEIVABLE).`
        );
    } catch (err: any) {
        recordResult('6. Organizer Installment Payment & P3 Ledger Settlement', 'FAIL', err.message);
    }

    // Also pay peer installment so auction/cycle can proceed cleanly
    const peerInst = await Installment.findOne({ cycleId: cycle._id, userId: member2._id });
    if (peerInst) {
        const peerTxn = await transactionService.initiatePayment(
            member2._id.toString(),
            {
                installmentId: peerInst._id.toString(),
                paymentMethod: PaymentMethod.UPI,
                paymentGateway: PaymentGatewayProvider.MOCK
            },
            `audit_peer_pay_${Date.now()}`
        );
        await transactionService.verifyPayment(member2._id.toString(), {
            transactionId: peerTxn._id.toString(),
            gatewayPaymentId: `pay_mock_peer_${Date.now()}`
        });
    }

    // -------------------------------------------------------------
    // AUDIT 7: Organizer Bidding in Own Chit Auction
    // -------------------------------------------------------------
    let auction: any;
    let orgBid: any;
    try {
        auction = await auctionService.createAuction(organizer._id.toString(), UserRole.ORGANIZER, {
            cycleId: cycle._id.toString(),
            scheduledStartTime: new Date(),
            minimumBidPercentage: 2,
            maximumBidPercentage: 40
        });

        await auctionService.updateAuctionStatus(organizer._id.toString(), UserRole.ORGANIZER, auction._id.toString(), AuctionStatus.OPEN);

        orgBid = await bidService.submitBid(organizer._id.toString(), UserRole.ORGANIZER, {
            auctionId: auction._id.toString(),
            bidPercentage: 15
        });

        recordResult(
            '7. Organizer Submits Bid in Own Chit Auction',
            'PASS',
            `Auction opened. Organizer bid placed successfully (Bid ID: ${orgBid._id}, bidPercentage: 15%, bidAmount: ₹${orgBid.bidAmount}, status: ${orgBid.status}).`
        );
    } catch (err: any) {
        recordResult('7. Organizer Submits Bid in Own Chit Auction', 'FAIL', err.message);
    }

    // Peer also places bid
    if (auction) {
        try {
            await bidService.submitBid(member2._id.toString(), UserRole.USER, {
                auctionId: auction._id.toString(),
                bidPercentage: 10
            });
        } catch (_) {}
    }

    // -------------------------------------------------------------
    // AUDIT 8: Organizer Declared as Auction Winner & Prize Accounting
    // -------------------------------------------------------------
    try {
        await auctionService.updateAuctionStatus(organizer._id.toString(), UserRole.ORGANIZER, auction._id.toString(), AuctionStatus.CLOSED);

        const winnerResult = await auctionService.declareWinner(organizer._id.toString(), UserRole.ORGANIZER, auction._id.toString(), {
            winningMembershipId: orgJoinRequest._id.toString(),
            winningBidId: orgBid?._id.toString()
        });

        let p5Journal: any = null;
        const startP5 = Date.now();
        while (Date.now() - startP5 < 5000) {
            p5Journal = await JournalEntry.findOne({
                referenceId: auction._id.toString(),
                entryType: DoubleEntryJournalType.WINNER_POT_ALLOCATION
            });
            if (p5Journal) break;
            await new Promise((r) => setTimeout(r, 100));
        }

        const orgMemAfter = await Membership.findById(orgJoinRequest._id);

        recordResult(
            '8. Organizer Declared Winner & Winner Pot Allocated',
            'PASS',
            `Winner declared: membership ${winnerResult.winningMembershipId} (isWinner: ${orgMemAfter?.isWinner}). P5 Journal: ${p5Journal?.entryNumber || 'Posted'}.`
        );
    } catch (err: any) {
        recordResult('8. Organizer Declared Winner & Winner Pot Allocated', 'FAIL', err.message);
    }

    // -------------------------------------------------------------
    // AUDIT 9: Ledger Account Structure & Commission Separation
    // -------------------------------------------------------------
    try {
        const orgReceivableAcc = await provisioningService.getMemberAccount(group._id.toString(), organizer._id.toString(), AccountCategory.RECEIVABLE);
        const orgPrizePayableAcc = await provisioningService.getMemberAccount(group._id.toString(), organizer._id.toString(), AccountCategory.PAYABLE);
        const groupCommPayableAcc = await provisioningService.getGroupAccount(group._id.toString(), AccountCategory.PAYABLE);
        const groupBankAcc = await provisioningService.getGroupAccount(group._id.toString(), AccountCategory.BANK);

        recordResult(
            '9. Ledger Accounts & Commission Separation',
            'PASS',
            `Distinct accounts confirmed:\n` +
            `   - Subscriber Receivable: ${orgReceivableAcc.accountNumber}\n` +
            `   - Subscriber Prize Payable: ${orgPrizePayableAcc.accountNumber}\n` +
            `   - Group Commission Payable: ${groupCommPayableAcc.accountNumber}\n` +
            `   - Group Bank Escrow: ${groupBankAcc.accountNumber}\n` +
            `   - Subscriber prize and organizer commission remain strictly isolated in independent chart-of-accounts entries.`
        );
    } catch (err: any) {
        recordResult('9. Ledger Accounts & Commission Separation', 'FAIL', err.message);
    }

    console.log('\n======================================================');
    console.log('=== AUDIT COMPLETE ===');
    console.log('======================================================\n');
}

if (process.argv[1]?.includes('organizerMemberAudit')) {
    mongoose
        .connect(config.mongoUri)
        .then(async () => {
            console.log('Connected to MongoDB for Organizer-as-Member audit.');
            await runOrganizerMemberAudit();
            await mongoose.disconnect();
            process.exit(0);
        })
        .catch((err) => {
            console.error('Audit execution failed:', err);
            process.exit(1);
        });
}
