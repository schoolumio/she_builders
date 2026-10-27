import type { Meeting, MeetingHost, MeetingInvitee } from "@prisma/client";

export type MeetingAccessFacts = {
  userId: string;
  canManageAll: boolean; // meetings.manage
  groupIds: string[];
};

type MeetingWithPeople = Pick<Meeting, "visibility" | "groupId"> & {
  hosts: Pick<MeetingHost, "userId" | "role">[];
  invitees: Pick<MeetingInvitee, "userId">[];
};

export function isMeetingHost(meeting: MeetingWithPeople, userId: string) {
  return meeting.hosts.some((h) => h.userId === userId);
}

/** Can this active member see (and attempt to join) the meeting? */
export function canViewMeeting(meeting: MeetingWithPeople, f: MeetingAccessFacts): boolean {
  if (f.canManageAll || isMeetingHost(meeting, f.userId)) return true;
  switch (meeting.visibility) {
    case "PUBLIC":
    case "MEMBERS":
      return true;
    case "GROUP":
      return !!meeting.groupId && f.groupIds.includes(meeting.groupId);
    case "INVITED":
      return meeting.invitees.some((i) => i.userId === f.userId);
  }
}

export function canManageMeeting(meeting: MeetingWithPeople, f: MeetingAccessFacts): boolean {
  return f.canManageAll || isMeetingHost(meeting, f.userId);
}
