/**
 * Default plan catalogue used to seed the database. These are product concepts — not final
 * prices or guaranteed entitlements. Platform admins edit plans in /platform/plans and the
 * database is the source of truth at runtime.
 */
export const FEATURES = {
  "feature.prayer_requests": "Confidential prayer requests",
  "feature.recurring_meetings": "Recurring meetings",
  "feature.in_app_audio": "In-app audio meetings",
  "feature.in_app_video": "In-app video meetings",
  "feature.groups": "Community groups",
  "feature.programmes": "Bible study & programmes",
  "feature.fundraising": "Fundraising & donations",
  "feature.paid_gifts": "Paid virtual gifts",
  "feature.reports": "Reports & exports",
  "feature.email_notifications": "Email notifications",
  "feature.custom_branding": "Custom branding",
} as const;

export const LIMITS = {
  "limit.members": "Active members",
  "limit.admins": "Administrators (owner, admin, finance, coordinator roles)",
  "limit.groups": "Groups",
  "limit.active_meetings": "Active meeting series",
  "limit.room_participants": "Participants per in-app room",
} as const;

export type FeatureKey = keyof typeof FEATURES;
export type LimitKey = keyof typeof LIMITS;
export type EntitlementKey = FeatureKey | LimitKey;

type PlanSeed = {
  code: string;
  name: string;
  description: string;
  monthlyPrice: number | null;
  yearlyPrice: number | null;
  trialDays: number;
  features: FeatureKey[];
  limits: Record<LimitKey, number | null>;
  public: boolean;
};

export const DEFAULT_PLANS: PlanSeed[] = [
  {
    code: "FREE",
    name: "Free",
    description: "Basic community management for small groups getting started.",
    monthlyPrice: 0,
    yearlyPrice: 0,
    trialDays: 0,
    features: ["feature.groups"],
    limits: { "limit.members": 50, "limit.admins": 2, "limit.groups": 1, "limit.active_meetings": 3, "limit.room_participants": 0 },
    public: true,
  },
  {
    code: "COMMUNITY",
    name: "Community",
    description: "Prayer requests, recurring meetings and notifications for growing communities.",
    monthlyPrice: 1500,
    yearlyPrice: 15000,
    trialDays: 14,
    features: ["feature.groups", "feature.prayer_requests", "feature.recurring_meetings", "feature.in_app_audio", "feature.email_notifications", "feature.reports"],
    limits: { "limit.members": 250, "limit.admins": 5, "limit.groups": 5, "limit.active_meetings": 20, "limit.room_participants": 50 },
    public: true,
  },
  {
    code: "GROWTH",
    name: "Growth",
    description: "More members, multiple groups, video meetings and programmes.",
    monthlyPrice: 4000,
    yearlyPrice: 40000,
    trialDays: 14,
    features: [
      "feature.groups",
      "feature.prayer_requests",
      "feature.recurring_meetings",
      "feature.in_app_audio",
      "feature.in_app_video",
      "feature.programmes",
      "feature.email_notifications",
      "feature.reports",
    ],
    limits: { "limit.members": 1000, "limit.admins": 15, "limit.groups": 25, "limit.active_meetings": 100, "limit.room_participants": 100 },
    public: true,
  },
  {
    code: "MINISTRY",
    name: "Ministry",
    description: "Larger communities with fundraising, enhanced reporting and more administrators.",
    monthlyPrice: 9900,
    yearlyPrice: 99000,
    trialDays: 14,
    features: [
      "feature.groups",
      "feature.prayer_requests",
      "feature.recurring_meetings",
      "feature.in_app_audio",
      "feature.in_app_video",
      "feature.programmes",
      "feature.fundraising",
      "feature.paid_gifts",
      "feature.email_notifications",
      "feature.reports",
      "feature.custom_branding",
    ],
    limits: { "limit.members": 5000, "limit.admins": 40, "limit.groups": 100, "limit.active_meetings": null, "limit.room_participants": 300 },
    public: true,
  },
  {
    code: "ENTERPRISE",
    name: "Enterprise",
    description: "Custom requirements, multiple branches, integrations and support arrangements.",
    monthlyPrice: null,
    yearlyPrice: null,
    trialDays: 0,
    features: Object.keys(FEATURES) as FeatureKey[],
    limits: { "limit.members": null, "limit.admins": null, "limit.groups": null, "limit.active_meetings": null, "limit.room_participants": 500 },
    public: true,
  },
];
