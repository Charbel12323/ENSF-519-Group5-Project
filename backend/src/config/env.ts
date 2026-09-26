import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  port: parseInt(process.env.PORT ?? "4000", 10),
  databaseUrl: required("DATABASE_URL"),
  jwtSecret: required("JWT_SECRET"),
  corsOrigin: process.env.CORS_ORIGIN ?? "http://localhost:3000",
  appUrl: process.env.APP_URL ?? "http://localhost:3000",
  apiUrl: process.env.API_URL ?? "http://localhost:4000",
  smtpHost: process.env.SMTP_HOST ?? "localhost",
  smtpPort: Number(process.env.SMTP_PORT ?? 1025),
  smtpSecure: process.env.SMTP_SECURE === "true",
  smtpUser: process.env.SMTP_USER,
  smtpPass: process.env.SMTP_PASS,
  mailFrom: process.env.MAIL_FROM ?? "Boardly <noreply@boardly.local>",
  googleClientId: process.env.GOOGLE_CLIENT_ID ?? "",
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
};
