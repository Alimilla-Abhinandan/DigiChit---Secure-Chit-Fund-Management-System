import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import User, { IUser, UserRole, AccountStatus, KYCStatus, OrganizerStatus } from '../../../modules/user/models/User.js';

let counter = 0;

export interface TestUserOptions {
    name?: string;
    email?: string;
    password?: string;
    role?: UserRole;
    accountStatus?: AccountStatus;
    emailVerified?: boolean;
    kycStatus?: KYCStatus;
    organizerStatus?: OrganizerStatus;
    age?: number;
    tokenVersion?: number;
    deletedAt?: Date | null;
}

export async function createTestUser(options: TestUserOptions = {}): Promise<{ user: IUser; plainPassword: string }> {
    counter++;
    const timestamp = Date.now();
    const plainPassword = options.password || 'Test@Password123';
    const hashedPassword = await bcrypt.hash(plainPassword, 10);
    const email = options.email || `api_test_user_${timestamp}_${counter}@example.com`;

    const user = new User({
        name: options.name || `Test User ${counter}`,
        email: email.toLowerCase(),
        password: hashedPassword,
        role: options.role || UserRole.USER,
        accountStatus: options.accountStatus || AccountStatus.ACTIVE,
        emailVerified: options.emailVerified !== undefined ? options.emailVerified : true,
        kycStatus: options.kycStatus || KYCStatus.NOT_SUBMITTED,
        organizerStatus: options.organizerStatus || OrganizerStatus.NOT_APPLIED,
        age: options.age !== undefined ? options.age : 28,
        tokenVersion: options.tokenVersion || 0,
        deletedAt: options.deletedAt !== undefined ? options.deletedAt : null
    });

    await user.save();
    return { user, plainPassword };
}

export async function createTestOrganizer(options: TestUserOptions = {}): Promise<{ user: IUser; plainPassword: string }> {
    return createTestUser({
        name: options.name || 'Test Organizer',
        role: UserRole.ORGANIZER,
        kycStatus: KYCStatus.APPROVED,
        organizerStatus: OrganizerStatus.APPROVED,
        accountStatus: AccountStatus.ACTIVE,
        emailVerified: true,
        ...options
    });
}

export async function createTestAdmin(options: TestUserOptions = {}): Promise<{ user: IUser; plainPassword: string }> {
    return createTestUser({
        name: options.name || 'Test Admin',
        role: UserRole.ADMIN,
        kycStatus: KYCStatus.APPROVED,
        organizerStatus: OrganizerStatus.APPROVED,
        accountStatus: AccountStatus.ACTIVE,
        emailVerified: true,
        ...options
    });
}
