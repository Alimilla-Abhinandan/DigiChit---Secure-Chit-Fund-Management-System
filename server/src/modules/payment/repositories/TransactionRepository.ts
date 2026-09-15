import mongoose from 'mongoose';
import Transaction, { ITransaction, TransactionStatus } from '../models/Transaction.js';
import Installment, { IInstallment } from '@modules/installment/models/Installment.js';
import ChitCycle, { IChitCycle } from '@modules/chit-cycle/models/ChitCycle.js';
import ChitGroup, { IChitGroup } from '@modules/chit-group/models/ChitGroup.js';
import User, { IUser } from '@modules/user/models/User.js';

export interface PaginationOptions {
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
}

export interface PaginatedResult<T> {
    data: T[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
}

export class TransactionRepository {
    public async findInstallmentById(installmentId: string): Promise<IInstallment | null> {
        if (!mongoose.Types.ObjectId.isValid(installmentId)) return null;
        return await Installment.findById(installmentId);
    }

    public async findCycleById(cycleId: any): Promise<IChitCycle | null> {
        return await ChitCycle.findById(cycleId);
    }

    public async findGroupById(groupId: any): Promise<IChitGroup | null> {
        return await ChitGroup.findById(groupId);
    }

    public async findUserById(userId: string): Promise<IUser | null> {
        if (!mongoose.Types.ObjectId.isValid(userId)) return null;
        return await User.findById(userId);
    }

    public async findLatestTransactionNumber(prefix: string): Promise<string | null> {
        const latestTxn = await Transaction.findOne({
            transactionNumber: new RegExp(`^${prefix}`)
        })
            .sort({ createdAt: -1 })
            .select('transactionNumber')
            .lean();
        return latestTxn?.transactionNumber || null;
    }

    public async findLatestReceiptNumber(prefix: string): Promise<string | null> {
        const latestTxn = await Transaction.findOne({
            receiptNumber: new RegExp(`^${prefix}`)
        })
            .sort({ createdAt: -1 })
            .select('receiptNumber')
            .lean();
        return latestTxn?.receiptNumber || null;
    }

    public async create(data: Partial<ITransaction>): Promise<ITransaction> {
        return await Transaction.create(data);
    }

    public async findById(id: string): Promise<ITransaction | null> {
        if (!mongoose.Types.ObjectId.isValid(id)) return null;
        return await Transaction.findOne({ _id: id, deletedAt: null })
            .populate('memberId', 'name email')
            .populate('groupId', 'name monthlyContribution')
            .populate('cycleId', 'cycleNumber status')
            .populate('installmentId', 'installmentNumber dueDate amount paymentStatus');
    }

    public async findByTransactionNumber(txnNumber: string): Promise<ITransaction | null> {
        return await Transaction.findOne({ transactionNumber: txnNumber, deletedAt: null });
    }

    public async findByGatewayOrderId(orderId: string): Promise<ITransaction | null> {
        return await Transaction.findOne({ gatewayOrderId: orderId, deletedAt: null });
    }

    public async findByGatewayPaymentId(paymentId: string): Promise<ITransaction | null> {
        return await Transaction.findOne({ gatewayPaymentId: paymentId, deletedAt: null });
    }

    public async updateStatusIfCurrent(
        id: string,
        currentStatus: TransactionStatus,
        newStatus: TransactionStatus,
        updates: Partial<ITransaction> = {}
    ): Promise<ITransaction | null> {
        return await Transaction.findOneAndUpdate(
            { _id: id, status: currentStatus, deletedAt: null },
            {
                $set: {
                    status: newStatus,
                    ...updates,
                    updatedAt: new Date()
                }
            },
            { new: true }
        );
    }

    public async findByInstallmentAndStatus(
        installmentId: string,
        statuses: TransactionStatus[]
    ): Promise<ITransaction[]> {
        return await Transaction.find({
            installmentId: new mongoose.Types.ObjectId(installmentId),
            status: { $in: statuses },
            deletedAt: null
        });
    }

    public async findPaginated(
        filter: Record<string, any>,
        options: PaginationOptions = {}
    ): Promise<PaginatedResult<ITransaction>> {
        const page = Math.max(1, options.page || 1);
        const limit = Math.max(1, Math.min(100, options.limit || 20));
        const skip = (page - 1) * limit;

        const sortField = options.sortBy || 'createdAt';
        const sortOrder = options.sortOrder === 'asc' ? 1 : -1;
        const sortOptions: Record<string, 1 | -1> = { [sortField]: sortOrder };

        const queryFilter: Record<string, any> = {
            ...filter,
            deletedAt: null
        };

        const [data, total] = await Promise.all([
            Transaction.find(queryFilter)
                .populate('memberId', 'name email')
                .populate('groupId', 'name')
                .populate('cycleId', 'cycleNumber')
                .populate('installmentId', 'installmentNumber dueDate amount')
                .sort(sortOptions)
                .skip(skip)
                .limit(limit)
                .exec(),
            Transaction.countDocuments(queryFilter)
        ]);

        return {
            data,
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit) || 1
        };
    }

    public async updateStatus(
        id: string,
        status: TransactionStatus,
        updates: Partial<ITransaction> = {}
    ): Promise<ITransaction | null> {
        return await Transaction.findOneAndUpdate(
            { _id: id, deletedAt: null },
            {
                $set: {
                    status,
                    ...updates,
                    updatedAt: new Date()
                }
            },
            { new: true }
        );
    }

    public async softDelete(id: string, userId: string): Promise<ITransaction | null> {
        return await Transaction.findOneAndUpdate(
            { _id: id, deletedAt: null },
            {
                $set: {
                    deletedAt: new Date(),
                    updatedBy: new mongoose.Types.ObjectId(userId)
                }
            },
            { new: true }
        );
    }
}
