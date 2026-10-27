import { describe, expect, it } from "vitest";
import { permissionsFor, ROLE_PERMISSIONS } from "@/server/tenancy/permissions";

describe("role permissions", () => {
  it("does not give finance administrators access to prayer requests", () => {
    const p = permissionsFor(["FINANCE_ADMIN", "MEMBER"]);
    expect(p.has("prayer.view_confidential")).toBe(false);
    expect(p.has("prayer.moderate")).toBe(false);
    expect(p.has("finance.manage")).toBe(true);
  });

  it("does not give prayer coordinators access to finance", () => {
    const p = permissionsFor(["PRAYER_COORDINATOR"]);
    expect(p.has("finance.view")).toBe(false);
    expect(p.has("finance.manage")).toBe(false);
    expect(p.has("prayer.view_confidential")).toBe(true);
  });

  it("does not let owners or admins read private prayer requests by default", () => {
    expect(permissionsFor(["OWNER"]).has("prayer.view_confidential")).toBe(false);
    expect(permissionsFor(["ADMIN"]).has("prayer.view_confidential")).toBe(false);
  });

  it("keeps admins out of finance and billing management", () => {
    const p = permissionsFor(["ADMIN"]);
    expect(p.has("finance.view")).toBe(false);
    expect(p.has("billing.manage")).toBe(false);
    expect(p.has("roles.assign")).toBe(false);
    expect(p.has("roles.assign_limited")).toBe(true);
  });

  it("grants members no administrative permissions", () => {
    expect(ROLE_PERMISSIONS.MEMBER).toEqual([]);
  });

  it("combines roles additively", () => {
    const p = permissionsFor(["HOST", "FINANCE_ADMIN"]);
    expect(p.has("meetings.create")).toBe(true);
    expect(p.has("finance.view")).toBe(true);
  });
});
