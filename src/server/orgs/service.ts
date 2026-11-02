import "server-only";
import { z } from "zod";
import { db } from "../db";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "../errors";
import { parseInput } from "../validate";
import { audit } from "../audit";
import { rateLimit } from "../rate-limit";
import type { Actor, OrgContext } from "../tenancy/context";
import { requireActiveOrg, requirePermission } from "../tenancy/context";
import {
  checkbox,
  countrySchema,
  currencySchema,
  nameSchema,
  optionalHttpsUrl,
  optionalText,
  slugSchema,
  timezoneSchema,
} from "@/lib/validation";
import { DEFAULT_GIFTS } from "../gifts/defaults";
import { isAccessibleAccent } from "@/lib/color";

const RESERVED_SLUGS = new Set(["app", "admin", "api", "platform", "login", "register", "pricing", "new", "settings", "c", "o", "www", "support", "help"]);

export const orgProfileSchema = z.object({
  name: nameSchema,
  tagline: optionalText(160),
  description: optionalText(4000),
  country: countrySchema,
  timezone: timezoneSchema,
  language: z.string().trim().min(2).max(10).default("en"),
  defaultCurrency: currencySchema,
  contactEmail: z.union([z.literal(""), z.email({ error: "Enter a valid email." })]).optional().transform((v) => v || undefined),
  contactPhone: optionalText(40),
  websiteUrl: optionalHttpsUrl,
  facebookUrl: optionalHttpsUrl,
  instagramUrl: optionalHttpsUrl,
  youtubeUrl: optionalHttpsUrl,
  xUrl: optionalHttpsUrl,
  visibility: z.enum(["PUBLIC", "UNLISTED", "PRIVATE"]),
  joinPolicy: z.enum(["OPEN", "APPROVAL", "INVITE_ONLY"]),
  accentColor: z
    .string()
    .trim()
    .optional()
    .transform((v) => v || undefined)
    .refine((v) => !v || /^#[0-9a-fA-F]{6}$/.test(v), { error: "Use a hex colour like #5b3a8c." })
    // Accent backgrounds carry white text; refuse colours that would make buttons unreadable.
    .refine((v) => !v || !/^#[0-9a-fA-F]{6}$/.test(v) || isAccessibleAccent(v), { error: "This colour is too light for white text. Choose a darker shade (contrast of at least 4.5:1)." }),
});

const createOrgSchema = orgProfileSchema.extend({
  slug: slugSchema.refine((s) => !RESERVED_SLUGS.has(s), { error: "That address is reserved. Choose another." }),
  acceptTerms: z.literal("on", { error: "Please accept the terms of service and privacy policy." }),
});

function socialLinks(d: { facebookUrl?: string; instagramUrl?: string; youtubeUrl?: string; xUrl?: string }) {
  const links = { facebook: d.facebookUrl, instagram: d.instagramUrl, youtube: d.youtubeUrl, x: d.xUrl };
  return Object.fromEntries(Object.entries(links).filter(([, v]) => !!v));
}

export async function createOrganization(actor: Actor, input: unknown) {
  const data = parseInput(createOrgSchema, input);
  await rateLimit(`org:create:${actor.id}`, 5, 86400);
  if (await db.organization.findUnique({ where: { slug: data.slug } })) {
    throw new ConflictError("That community address is already taken.");
  }
  const freePlan = await db.plan.findUnique({ where: { code: "FREE" } });
  if (!freePlan) throw new Error("FREE plan missing — run the database seed.");
  const org = await db.$transaction(async (tx) => {
    const org = await tx.organization.create({
      data: {
        slug: data.slug,
        name: data.name,
        tagline: data.tagline,
        description: data.description,
        country: data.country,
        timezone: data.timezone,
        language: data.language,
        defaultCurrency: data.defaultCurrency,
        contactEmail: data.contactEmail,
        contactPhone: data.contactPhone,
        websiteUrl: data.websiteUrl,
        socialLinks: socialLinks(data),
        visibility: data.visibility,
        joinPolicy: data.joinPolicy,
        accentColor: data.accentColor,
        termsAcceptedAt: new Date(),
        termsAcceptedById: actor.id,
      },
    });
    await tx.membership.create({
      data: { organizationId: org.id, userId: actor.id, roles: ["OWNER", "MEMBER"], status: "ACTIVE", joinedAt: new Date() },
    });
    await tx.subscription.create({
      data: { organizationId: org.id, planId: freePlan.id, status: "ACTIVE", currentPeriodStart: new Date(), billingProvider: "manual" },
    });
    await tx.virtualGift.createMany({ data: DEFAULT_GIFTS.map((g, i) => ({ ...g, organizationId: org.id, position: i })) });
    await audit({ organizationId: org.id, actorId: actor.id, action: "org.created", targetType: "Organization", targetId: org.id }, tx);
    return org;
  });
  return org;
}

export async function updateOrganizationProfile(ctx: OrgContext, input: unknown) {
  requirePermission(ctx, "org.settings");
  requireActiveOrg(ctx);
  const data = parseInput(orgProfileSchema, input);
  const org = await db.organization.update({
    where: { id: ctx.org.id },
    data: {
      name: data.name,
      tagline: data.tagline ?? null,
      description: data.description ?? null,
      country: data.country,
      timezone: data.timezone,
      language: data.language,
      defaultCurrency: data.defaultCurrency,
      contactEmail: data.contactEmail ?? null,
      contactPhone: data.contactPhone ?? null,
      websiteUrl: data.websiteUrl ?? null,
      socialLinks: socialLinks(data),
      visibility: data.visibility,
      joinPolicy: data.joinPolicy,
      accentColor: data.accentColor ?? null,
    },
  });
  await audit({ organizationId: ctx.org.id, actorId: ctx.actor.id, action: "org.profile_updated", targetType: "Organization", targetId: ctx.org.id });
  return org;
}

const communitySettingsSchema = z.object({
  allowAnonymousPrayer: checkbox,
  moderateSharedPrayer: checkbox,
  moderateTestimonies: checkbox,
  requireMfaForAdmins: checkbox,
});

export async function updateCommunitySettings(ctx: OrgContext, input: unknown) {
  requirePermission(ctx, "org.settings");
  requireActiveOrg(ctx);
  const data = parseInput(communitySettingsSchema, input);
  if (data.requireMfaForAdmins !== ctx.org.requireMfaForAdmins) {
    if (!ctx.membership.roles.includes("OWNER")) throw new ForbiddenError("Only an owner can change the two-factor requirement.");
    if (data.requireMfaForAdmins && !ctx.actor.mfaEnabledAt) throw new ValidationError("Turn on two-factor authentication for your own account first.", { requireMfaForAdmins: "Enable two-factor in Account security first." });
  }
  await db.organization.update({ where: { id: ctx.org.id }, data });
  await audit({ organizationId: ctx.org.id, actorId: ctx.actor.id, action: "org.community_settings_updated", metadata: data });
}

export async function setOrganizationImage(ctx: OrgContext, kind: "logo" | "cover", url: string | null) {
  requirePermission(ctx, "org.settings");
  requireActiveOrg(ctx);
  await db.organization.update({ where: { id: ctx.org.id }, data: kind === "logo" ? { logoUrl: url } : { coverUrl: url } });
  await audit({ organizationId: ctx.org.id, actorId: ctx.actor.id, action: `org.${kind}_updated` });
}

/** Public profile lookup. Private organisations are only visible to their members. */
export async function getPublicOrganization(slug: string, viewerId?: string) {
  const org = await db.organization.findUnique({ where: { slug } });
  if (!org || org.status !== "ACTIVE") throw new NotFoundError("Community not found.");
  let viewerMembership = null;
  if (viewerId) {
    viewerMembership = await db.membership.findUnique({ where: { organizationId_userId: { organizationId: org.id, userId: viewerId } } });
  }
  if (org.visibility === "PRIVATE" && viewerMembership?.status !== "ACTIVE") throw new NotFoundError("Community not found.");
  return { org, viewerMembership };
}

export async function listPublicOrganizations(limit = 24) {
  return db.organization.findMany({
    where: { status: "ACTIVE", visibility: "PUBLIC" },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: { slug: true, name: true, tagline: true, logoUrl: true, country: true, verification: true },
  });
}

export async function listMyOrganizations(userId: string) {
  return db.membership.findMany({
    where: { userId, status: { in: ["ACTIVE", "PENDING"] } },
    include: { organization: { select: { id: true, slug: true, name: true, tagline: true, logoUrl: true, status: true, accentColor: true } } },
    orderBy: { createdAt: "asc" },
  });
}
