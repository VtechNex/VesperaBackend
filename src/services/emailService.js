import nodemailer from "nodemailer";
import dotenv from "dotenv";

dotenv.config();

const {
  EMAIL_HOST,
  EMAIL_PORT,
  EMAIL_SECURE,
  EMAIL_USER,
  EMAIL_PASS,
  EMAIL_FROM
} = process.env;

let transporter;

if (EMAIL_HOST && EMAIL_PORT && EMAIL_USER && EMAIL_PASS) {
  transporter = nodemailer.createTransport({
    host: EMAIL_HOST,
    port: Number(EMAIL_PORT),
    secure: EMAIL_SECURE === "true" || EMAIL_SECURE === "1", // true for 465, false for other ports
    auth: {
      user: EMAIL_USER,
      pass: EMAIL_PASS
    }
  });
} else {
  console.warn(
    "[emailService] SMTP not configured - follow-up emails will be skipped. Set EMAIL_HOST, EMAIL_PORT, EMAIL_USER, EMAIL_PASS in your .env."
  );
}

export async function sendEmail({ to, cc, subject, text, html }) {
  if (!transporter) {
    console.warn("[emailService] transporter not initialized; skipping sendEmail.");
    return null;
  }

  const from = EMAIL_FROM || EMAIL_USER;

  const mailOptions = {
    from,
    to,
    cc,
    subject,
    text,
    html
  };

  const info = await transporter.sendMail(mailOptions);
  return info;
}
