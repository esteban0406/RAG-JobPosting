"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { fetchApi } from "@/lib/api";
import { useAuthStore } from "@/lib/auth-store";

export function DeleteAccountDialog() {
  const router = useRouter();
  const clear = useAuthStore((s) => s.clear);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleDelete() {
    setLoading(true);
    try {
      await fetchApi("/users/me", { method: "DELETE" });
      await fetch("/api/auth/logout", { method: "POST" });
      clear();
      toast.success("Account deleted");
      router.push("/");
      router.refresh();
    } catch {
      toast.error("Failed to delete account");
    } finally {
      setLoading(false);
      setOpen(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button className="flex items-center gap-2 px-[18px] py-2.5 border border-danger bg-[#EF444415] text-danger text-sm font-semibold rounded-[var(--radius-sm)] hover:bg-[#EF444425] transition-colors">
          <Trash2 size={16} />
          Delete account
        </button>
      </DialogTrigger>
      <DialogContent className="bg-bg-surface border border-border text-text-primary max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-text-primary text-lg">
            Delete account
          </DialogTitle>
          <DialogDescription className="text-text-secondary">
            This will permanently delete your account and all saved jobs. This
            action cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex gap-3 mt-2">
          <button
            onClick={() => setOpen(false)}
            className="flex-1 h-10 border border-border text-text-secondary rounded-[var(--radius-md)] text-sm hover:bg-bg-surface-2 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleDelete}
            disabled={loading}
            className="flex-1 h-10 bg-danger text-white rounded-[var(--radius-md)] text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-60"
          >
            {loading ? "Deleting…" : "Yes, delete"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
