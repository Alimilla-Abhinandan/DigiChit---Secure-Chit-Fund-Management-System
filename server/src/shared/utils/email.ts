import { logger } from '@shared/logger/logger.js';
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import { 
    getVerificationTemplate,
    getOTPTemplate,
    getPasswordResetTemplate, 
    getWelcomeTemplate,
    getKYCApprovedTemplate,
    getKYCRejectedTemplate,
    getOrganizerApprovedTemplate,
    getOrganizerRejectedTemplate,
    getContactReplyTemplate,
    getChitGroupCreatedTemplate
} from './emailTemplates.js';

dotenv.config();

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
});

const dispatchEmail = async (mailOptions: any, logSuccessMsg: string, logErrorMsg: string) => {
    if (process.env.NODE_ENV === 'test') {
        logger.info(`[TEST_EMAIL] Simulated email to ${mailOptions.to} - Subject: "${mailOptions.subject}"`);
        return;
    }
    try {
        await transporter.sendMail(mailOptions);
        logger.info(logSuccessMsg);
    } catch (error) {
        logger.error(logErrorMsg, error);
    }
};


export const sendVerificationEmail = async (email: string, token: string, otp?: string) => {
    const verificationLink = `${process.env.FRONTEND_URL}/verify-email?token=${token}`;

    const mailOptions = {
        from: `DigiChit <${process.env.EMAIL_FROM}>`,
        to: email,
        subject: 'Verify your DigiChit Account',
        html: getVerificationTemplate(verificationLink, otp),
    };

    await dispatchEmail(mailOptions, `Verification email sent to ${email}`, 'Error sending email:');
};

export const sendOTPEmail = async (email: string, otp: string, name?: string) => {
    const mailOptions = {
        from: `DigiChit Security <${process.env.EMAIL_FROM}>`,
        to: email,
        subject: 'Your DigiChit One-Time Passcode (OTP)',
        html: getOTPTemplate(otp, name),
    };

    await dispatchEmail(mailOptions, `OTP email sent to ${email}`, 'Error sending OTP email:');
};

export const sendWelcomeEmail = async (email: string, name: string) => {
    const mailOptions = {
        from: `DigiChit Team <${process.env.EMAIL_FROM}>`,
        to: email,
        subject: 'Welcome to DigiChit - Account Active!',
        html: getWelcomeTemplate(name),
    };

    await dispatchEmail(mailOptions, `Welcome email sent to ${email}`, 'Error sending welcome email:');
};

export const sendPasswordResetEmail = async (email: string, token: string, otp?: string) => {
    const resetLink = `${process.env.FRONTEND_URL}/reset-password?token=${token}`;

    const mailOptions = {
        from: `DigiChit Security <${process.env.EMAIL_FROM}>`,
        to: email,
        subject: 'Reset your DigiChit Password',
        html: getPasswordResetTemplate(resetLink, otp),
    };

    await dispatchEmail(mailOptions, `Password reset email sent to ${email}`, 'Error sending password reset email:');
};

export const sendKYCApprovedEmail = async (email: string, name: string) => {
    const mailOptions = {
        from: `DigiChit Compliance <${process.env.EMAIL_FROM}>`,
        to: email,
        subject: 'KYC Verification Approved - DigiChit',
        html: getKYCApprovedTemplate(name),
    };

    await dispatchEmail(mailOptions, `KYC Approved email sent to ${email}`, 'Error sending KYC Approved email:');
};

export const sendKYCRejectedEmail = async (email: string, name: string, reason: string) => {
    const mailOptions = {
        from: `DigiChit Compliance <${process.env.EMAIL_FROM}>`,
        to: email,
        subject: 'KYC Verification Action Required - DigiChit',
        html: getKYCRejectedTemplate(name, reason),
    };

    await dispatchEmail(mailOptions, `KYC Rejected email sent to ${email}`, 'Error sending KYC Rejected email:');
};

export const sendOrganizerApprovedEmail = async (email: string, name: string) => {
    const mailOptions = {
        from: `DigiChit Admin <${process.env.EMAIL_FROM}>`,
        to: email,
        subject: 'Organizer Privileges Approved - DigiChit',
        html: getOrganizerApprovedTemplate(name),
    };

    await dispatchEmail(mailOptions, `Organizer Approved email sent to ${email}`, 'Error sending Organizer Approved email:');
};

export const sendOrganizerRejectedEmail = async (email: string, name: string, reason: string) => {
    const mailOptions = {
        from: `DigiChit Admin <${process.env.EMAIL_FROM}>`,
        to: email,
        subject: 'Organizer Application Status - DigiChit',
        html: getOrganizerRejectedTemplate(name, reason),
    };

    await dispatchEmail(mailOptions, `Organizer Rejected email sent to ${email}`, 'Error sending Organizer Rejected email:');
};

export const sendContactReplyEmail = async (email: string, name: string, originalMessage: string, adminResponse: string) => {
    const mailOptions = {
        from: `DigiChit Support <${process.env.EMAIL_FROM}>`,
        to: email,
        subject: 'Response to your DigiChit Support Inquiry',
        html: getContactReplyTemplate(name, originalMessage, adminResponse),
    };

    await dispatchEmail(mailOptions, `Contact Reply email sent to ${email}`, 'Error sending Contact Reply email:');
};

export const sendChitGroupCreatedEmail = async (email: string, name: string, groupName: string, contribution: number, members: number, startDate: string) => {
    const mailOptions = {
        from: `DigiChit Circles <${process.env.EMAIL_FROM}>`,
        to: email,
        subject: `Financial Circle Established: ${groupName}`,
        html: getChitGroupCreatedTemplate(name, groupName, contribution, members, startDate),
    };

    await dispatchEmail(mailOptions, `Chit Group Created email sent to ${email}`, 'Error sending Chit Group Created email:');
};
