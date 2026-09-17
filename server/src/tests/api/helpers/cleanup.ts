import User from '../../../modules/user/models/User.js';
import ChitGroup from '../../../modules/chit-group/models/ChitGroup.js';
import Membership from '../../../modules/membership/models/Membership.js';
import ChitCycle from '../../../modules/chit-cycle/models/ChitCycle.js';
import Installment from '../../../modules/installment/models/Installment.js';
import Transaction from '../../../modules/payment/models/Transaction.js';
import PaymentIdempotency from '../../../modules/payment/models/PaymentIdempotency.js';
import RazorpayWebhookEvent from '../../../modules/payment/models/RazorpayWebhookEvent.js';
import JournalEntry from '../../../modules/ledger/models/JournalEntry.js';
import Account from '../../../modules/ledger/models/Account.js';
import Token from '../../../modules/auth/models/Token.js';

export async function cleanupApiTestData(): Promise<void> {
    try {
        const testUserFilter = { email: { $regex: /^api_test_/i } };
        const testUsers = await User.find(testUserFilter);
        const userIds = testUsers.map(u => u._id);

        if (userIds.length > 0) {
            await Token.deleteMany({ userId: { $in: userIds } });
            await Membership.deleteMany({ userId: { $in: userIds } });
            await Installment.deleteMany({ userId: { $in: userIds } });
            await Transaction.deleteMany({ userId: { $in: userIds } });
            await PaymentIdempotency.deleteMany({ userId: { $in: userIds } });
            await Account.deleteMany({ memberId: { $in: userIds.map(id => id.toString()) } });
            await JournalEntry.deleteMany({ memberId: { $in: userIds.map(id => id.toString()) } });
            await User.deleteMany({ _id: { $in: userIds } });
        }

        // Clean up test groups & associated artifacts
        const testGroupFilter = { name: { $regex: /^api_test_/i } };
        const testGroups = await ChitGroup.find(testGroupFilter);
        const groupIds = testGroups.map(g => g._id);

        if (groupIds.length > 0) {
            await ChitCycle.deleteMany({ groupId: { $in: groupIds } });
            await Membership.deleteMany({ chitGroupId: { $in: groupIds } });
            await Installment.deleteMany({ groupId: { $in: groupIds } });
            await Transaction.deleteMany({ groupId: { $in: groupIds } });
            await Account.deleteMany({ groupId: { $in: groupIds.map(id => id.toString()) } });
            await JournalEntry.deleteMany({ groupId: { $in: groupIds.map(id => id.toString()) } });
            await ChitGroup.deleteMany({ _id: { $in: groupIds } });
        }

        // Clean up test webhook events
        await RazorpayWebhookEvent.deleteMany({ eventId: { $regex: /^evt_api_test_/i } });
    } catch (err) {
        console.warn('[cleanupApiTestData] Warning during cleanup:', err);
    }
}
