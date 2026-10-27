import type { OrgRole } from "@prisma/client";

/**
 * Permission catalogue. Roles are additive; a membership can hold several roles.
 * Keep in sync with the matrix in docs/SECURITY.md.
 */
export const PERMISSIONS = [
  "org.settings",
  "members.view",
  "members.manage",
  "roles.assign",
  "roles.assign_limited",
  "groups.manage",
  "meetings.manage",
  "meetings.create",
  "content.publish",
  "content.moderate",
  "prayer.moderate",
  "prayer.view_confidential",
  "prayer.assign",
  "programmes.manage",
  "gifts.manage",
  "campaigns.draft",
  "finance.view",
  "finance.manage",
  "billing.manage",
  "billing.view",
  "audit.view",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const ROLE_PERMISSIONS: Record<OrgRole, readonly Permission[]> = {
  OWNER: [
    "org.settings",
    "members.view",
    "members.manage",
    "roles.assign",
    "roles.assign_limited",
    "groups.manage",
    "meetings.manage",
    "meetings.create",
    "content.publish",
    "content.moderate",
    "prayer.moderate",
    "programmes.manage",
    "gifts.manage",
    "campaigns.draft",
    "finance.view",
    "finance.manage",
    "billing.manage",
    "billing.view",
    "audit.view",
  ],
  ADMIN: [
    "org.settings",
    "members.view",
    "members.manage",
    "roles.assign_limited",
    "groups.manage",
    "meetings.manage",
    "meetings.create",
    "content.publish",
    "content.moderate",
    "prayer.moderate",
    "programmes.manage",
    "gifts.manage",
    "campaigns.draft",
    "billing.view",
    "audit.view",
  ],
  MODERATOR: ["members.view", "content.moderate", "prayer.moderate"],
  PRAYER_COORDINATOR: ["members.view", "content.publish", "prayer.moderate", "prayer.view_confidential", "prayer.assign"],
  HOST: ["members.view", "meetings.create"],
  FINANCE_ADMIN: ["campaigns.draft", "finance.view", "finance.manage", "billing.view"],
  MEMBER: [],
};

/** Roles an ADMIN (roles.assign_limited) may grant or revoke. */
export const LIMITED_ASSIGNABLE_ROLES: readonly OrgRole[] = ["MODERATOR", "HOST", "MEMBER"];

export const ROLE_LABELS: Record<OrgRole, string> = {
  OWNER: "Owner",
  ADMIN: "Administrator",
  MODERATOR: "Moderator",
  PRAYER_COORDINATOR: "Prayer coordinator",
  HOST: "Meeting host",
  FINANCE_ADMIN: "Finance administrator",
  MEMBER: "Member",
};

export const ROLE_DESCRIPTIONS: Record<OrgRole, string> = {
  OWNER: "Full control of the organisation, finance and billing. Does not see private prayer requests unless also a prayer coordinator.",
  ADMIN: "Runs day-to-day community operations: members, groups, meetings, content and programmes. No finance access.",
  MODERATOR: "Reviews shared prayer requests, testimonies and reports.",
  PRAYER_COORDINATOR: "Sees and assigns confidential prayer requests and publishes prayer points. No finance access.",
  HOST: "Creates meetings and runs the meetings they host.",
  FINANCE_ADMIN: "Manages payment accounts, campaigns, donations and refunds. No access to prayer requests.",
  MEMBER: "Takes part in community life.",
};

export function permissionsFor(roles: readonly OrgRole[]): Set<Permission> {
  const set = new Set<Permission>();
  for (const role of roles) for (const p of ROLE_PERMISSIONS[role] ?? []) set.add(p);
  return set;
}
