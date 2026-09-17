import jwt from 'jsonwebtoken';
import { config } from '../../../shared/config/env.js';
import { IUser } from '../../../modules/user/models/User.js';

export function getAuthToken(user: IUser | { _id: any; role: string; tokenVersion?: number }, expiresIn: string = '1d'): string {
    const userId = (user as any)._id ? (user as any)._id.toString() : (user as any).id;
    return jwt.sign(
        {
            id: userId,
            role: user.role,
            tokenVersion: user.tokenVersion ?? 0
        },
        config.jwtSecret,
        { expiresIn } as any
    );
}

export function getAuthHeaders(user: IUser | { _id: any; role: string; tokenVersion?: number }): { Authorization: string } {
    const token = getAuthToken(user);
    return { Authorization: `Bearer ${token}` };
}

export function getExpiredToken(user: IUser | { _id: any; role: string; tokenVersion?: number }): string {
    const userId = (user as any)._id ? (user as any)._id.toString() : (user as any).id;
    return jwt.sign(
        {
            id: userId,
            role: user.role,
            tokenVersion: user.tokenVersion ?? 0
        },
        config.jwtSecret,
        { expiresIn: '-10s' } as any
    );
}

export function getInvalidSignatureToken(user: IUser | { _id: any; role: string; tokenVersion?: number }): string {
    const userId = (user as any)._id ? (user as any)._id.toString() : (user as any).id;
    return jwt.sign(
        {
            id: userId,
            role: user.role,
            tokenVersion: user.tokenVersion ?? 0
        },
        'wrong_secret_signature_key_12345',
        { expiresIn: '1d' } as any
    );
}
