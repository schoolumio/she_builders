"use client";

import { useState } from "react";
import type { ReportTarget } from "@prisma/client";
import { ActionForm, SubmitButton, TextAreaField } from "./ui/form";
import { reportAction } from "@/app/o/[slug]/actions";

/** Lets a member report content or behaviour to the community's moderators. */
export function ReportButton({ slug, targetType, targetId }: { slug: string; targetType: ReportTarget; targetId: string }) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-xs text-muted underline hover:text-danger">
        Report
      </button>
    );
  }
  return (
    <div className="w-full max-w-sm rounded-lg border border-line bg-surface p-3">
      <ActionForm action={reportAction.bind(null, slug)} resetOnSuccess>
        <input type="hidden" name="targetType" value={targetType} />
        <input type="hidden" name="targetId" value={targetId} />
        <TextAreaField label="What's wrong?" name="reason" rows={3} required hint="Moderators of this community will see your report." />
        <div className="flex gap-2">
          <SubmitButton size="sm">Send report</SubmitButton>
          <button type="button" className="text-sm text-muted underline" onClick={() => setOpen(false)}>Cancel</button>
        </div>
      </ActionForm>
    </div>
  );
}
