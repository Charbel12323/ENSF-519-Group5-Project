import nodemailer from "nodemailer";
import { env } from "../config/env";

const transport = nodemailer.createTransport({
  host: env.smtpHost, port: env.smtpPort, secure: env.smtpSecure,
  auth: env.smtpUser ? { user: env.smtpUser, pass: env.smtpPass } : undefined,
  connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000,
  disableFileAccess: true, disableUrlAccess: true,
});

export async function sendMail(to: string, subject: string, text: string) {
  try {
    const result = await transport.sendMail({ from: env.mailFrom, to, subject, text });
    return result.accepted.length > 0;
  } catch {
    console.error("SMTP delivery failed. Check the mail server configuration.");
    return false;
  }
}
