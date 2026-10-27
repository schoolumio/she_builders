import "server-only";
import { z } from "zod";
import { db } from "../db";
import { ConflictError, UnauthenticatedError, ValidationError } from "../errors";
import { parseInput } from "../validate";
import { rateLimit } from "../rate-limit";
import { emailSchema, nameSchema, passwordSchema, timezoneSchema } from "@/lib/validation";
import { getDummyHash, hashPassword, verifyPassword } from "./password";
import { consumeAuthToken, issueAuthToken } from "./tokens";
import { invalidateAllUserSessions } from "./session";
import { renderEmail, sendEmail } from "../email";
import { env } from "../env";
import { audit } from "../audit";
import { brand } from "@/config/brand";

export const registerSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  password: passwordSchema,
  timezone: timezoneSchema.optional().default("UTC"),
  acceptTerms: z.literal("on", { error: "You must accept the terms and privacy policy." }),
});

export async function registerUser(input: unknown, meta: { ipHash: string }) {
  const data = parseInput(registerSchema, input);
  await rateLimit(`register:ip:${meta.ipHash}`, 10, 3600);
  const existing = await db.user.findUnique({ where: { email: data.email } });
  if (existing) throw new ConflictError("An account with this email already exists. Try signing in or resetting your password.");
  const user = await db.user.create({
    data: { email: data.email, name: data.name, passwordHash: await hashPassword(data.password), timezone: data.timezone },
  });
  await sendVerificationEmail(user.id);
  await audit({ actorId: user.id, action: "user.registered", targetType: "User", targetId: user.id });
  return user;
}

export async function sendVerificationEmail(userId: string) {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  if (user.emailVerifiedAt) return;
  const token = await issueAuthToken(user.id, "EMAIL_VERIFICATION");
  const { text, html } = renderEmail({
    heading: `Confirm your email for ${brand.productName}`,
    paragraphs: [`Hello ${user.name},`, "Please confirm your email address so we can send you meeting reminders and account notices. This link expires in 48 hours."],
    action: { label: "Confirm email", url: `${env.appUrl}/verify-email?token=${token}` },
  });
  await sendEmail({ to: user.email, subject: "Confirm your email", text, html, category: "ACCOUNT" });
}

export async function verifyEmail(token: string) {
  const userId = await consumeAuthToken(token, "EMAIL_VERIFICATION");
  if (!userId) return false;
  await db.user.update({ where: { id: userId }, data: { emailVerifiedAt: new Date() } });
  return true;
}

export const loginSchema = z.object({ email: emailSchema, password: z.string().min(1, { error: "Enter your password." }).max(200) });

const INVALID_LOGIN = "That email and password combination is not correct.";

export async function authenticate(input: unknown, meta: { ipHash: string }) {
  const data = parseInput(loginSchema, input);
  await rateLimit(`login:ip:${meta.ipHash}`, 30, 900);
  await rateLimit(`login:email:${data.email}`, 10, 900);
  const user = await db.user.findUnique({ where: { email: data.email } });
  if (!user || !user.passwordHash) {
    await verifyPassword(data.password, await getDummyHash()); // equalise timing
    throw new UnauthenticatedError(INVALID_LOGIN);
  }
  const ok = await verifyPassword(data.password, user.passwordHash);
  if (!ok) throw new UnauthenticatedError(INVALID_LOGIN);
  if (user.status !== "ACTIVE") throw new UnauthenticatedError("This account is not active. Contact support for help.");
  return user;
}

export async function requestPasswordReset(input: unknown, meta: { ipHash: string }) {
  const { email } = parseInput(z.object({ email: emailSchema }), input);
  await rateLimit(`reset:ip:${meta.ipHash}`, 10, 3600);
  await rateLimit(`reset:email:${email}`, 3, 3600);
  const user = await db.user.findUnique({ where: { email } });
  // Always respond identically to avoid account enumeration.
  if (!user || user.status !== "ACTIVE") return;
  const token = await issueAuthToken(user.id, "PASSWORD_RESET");
  const { text, html } = renderEmail({
    heading: "Reset your password",
    paragraphs: [
      `Hello ${user.name},`,
      "We received a request to reset your password. This link expires in 1 hour and can be used once.",
      "If you did not request this, you can ignore this email — your password will not change.",
    ],
    action: { label: "Choose a new password", url: `${env.appUrl}/reset-password?token=${token}` },
  });
  await sendEmail({ to: user.email, subject: "Reset your password", text, html, category: "ACCOUNT" });
}

export async function resetPassword(input: unknown) {
  const data = parseInput(z.object({ token: z.string().min(10).max(200), password: passwordSchema }), input);
  const userId = await consumeAuthToken(data.token, "PASSWORD_RESET");
  if (!userId) throw new ValidationError("This reset link is invalid or has expired. Please request a new one.");
  await db.user.update({
    where: { id: userId },
    // Possession of the emailed link proves control of the address.
    data: { passwordHash: await hashPassword(data.password), emailVerifiedAt: new Date() },
  });
  await invalidateAllUserSessions(userId);
  await audit({ actorId: userId, action: "user.password_reset", targetType: "User", targetId: userId });
  return userId;
}

export async function changePassword(userId: string, input: unknown, currentSessionToken?: string) {
  const data = parseInput(z.object({ currentPassword: z.string().min(1).max(200), newPassword: passwordSchema }), input);
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  if (!user.passwordHash || !(await verifyPassword(data.currentPassword, user.passwordHash))) {
    throw new ValidationError("Your current password is not correct.", { currentPassword: "Incorrect password." });
  }
  await db.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword(data.newPassword) } });
  await invalidateAllUserSessions(userId, currentSessionToken);
  await audit({ actorId: userId, action: "user.password_changed", targetType: "User", targetId: userId });
}
