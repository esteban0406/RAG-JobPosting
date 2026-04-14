"use client";

import { AiDrawer } from "@/components/ai/AiDrawer";

interface SavedJobsAiDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contextJobIds: string[];
}

export function SavedJobsAiDrawer({
  open,
  onOpenChange,
  contextJobIds,
}: SavedJobsAiDrawerProps) {
  return (
    <AiDrawer
      open={open}
      onClose={() => onOpenChange(false)}
      contextJobIds={contextJobIds}
    />
  );
}
