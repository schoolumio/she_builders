import { beforeEach, describe, expect, it } from "vitest";
import { db, resetDb } from "../support/db";
import { addMember, createGroup, createOrg, createUser, ctxFor } from "../support/factories";
import { getGroupOverview } from "@/server/groups/overview";
import { joinGroup } from "@/server/groups/service";
import { createPrayerRequest } from "@/server/prayer/service";
import { NotFoundError } from "@/server/errors";

beforeEach(resetDb);

async function setup() {
  const owner = await createUser();
  const org = await createOrg(owner, { overrides: { moderateSharedPrayer: false } });
  const member = await addMember(org);
  const outsider = await addMember(org);
  const group = await createGroup(org, [member]);
  const otherGroup = await createGroup(org, [member]);
  await db.announcement.createMany({
    data: [
      { organizationId: org.id, groupId: group.id, title: "Group news", body: "x", status: "PUBLISHED", publishedAt: new Date(), authorId: owner.id },
      { organizationId: org.id, groupId: otherGroup.id, title: "Other group news", body: "x", status: "PUBLISHED", publishedAt: new Date(), authorId: owner.id },
      { organizationId: org.id, groupId: group.id, title: "Draft", body: "x", status: "DRAFT", authorId: owner.id },
    ],
  });
  await createPrayerRequest(await ctxFor(member, org), { title: "Group prayer", body: "Please pray", visibility: "GROUP", groupId: group.id, acknowledgeVisibility: "on" });
  return { owner, org, member, outsider, group };
}

describe("group overview", () => {
  it("shows a member only the content shared with that group", async () => {
    const s = await setup();
    const o = await getGroupOverview(await ctxFor(s.member, s.org), s.group.id);
    expect(o.canSeeInside).toBe(true);
    expect(o.announcements.map((a) => a.title)).toEqual(["Group news"]);
    expect(o.prayers.map((p) => p.title)).toEqual(["Group prayer"]);
    expect(o.members).toHaveLength(1);
  });

  it("hides group content from non-members until they join", async () => {
    const s = await setup();
    const before = await getGroupOverview(await ctxFor(s.outsider, s.org), s.group.id);
    expect(before.canSeeInside).toBe(false);
    expect(before.announcements).toHaveLength(0);
    expect(before.prayers).toHaveLength(0);
    expect(before.members).toHaveLength(0);
    await joinGroup(await ctxFor(s.outsider, s.org), s.group.id);
    const after = await getGroupOverview(await ctxFor(s.outsider, s.org), s.group.id);
    expect(after.canSeeInside).toBe(true);
    expect(after.prayers).toHaveLength(1);
  });

  it("does not reveal groups from another organisation", async () => {
    const s = await setup();
    const otherOwner = await createUser();
    const otherOrg = await createOrg(otherOwner);
    await expect(getGroupOverview(await ctxFor(otherOwner, otherOrg), s.group.id)).rejects.toBeInstanceOf(NotFoundError);
  });
});
