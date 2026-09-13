"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

function DisconnectSubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" variant="destructive" disabled={pending} aria-disabled={pending} aria-busy={pending}>
      {pending ? "Disconnecting..." : "Disconnect Xero"}
    </Button>
  );
}

export function DisconnectXeroDialog({
  action,
  disabled,
}: {
  action: (formData: FormData) => Promise<void>;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !disabled && setOpen(nextOpen)}>
      <DialogTrigger asChild>
        <Button type="button" variant="destructive" disabled={disabled}>
          Disconnect Xero
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl p-6 sm:p-6" hideClose={disabled}>
        <DialogHeader className="pr-8">
          <DialogTitle>Disconnect Xero?</DialogTitle>
          <DialogDescription className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
            This disconnects the current Xero authorization for this TradesStack organization. Future Xero imports
            and accounting actions will stop until Xero is connected again, and the stored token credentials will be removed.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm text-[var(--text-secondary)]">
          <p>Imported accounts, tax rates, and contacts will remain for historical and reference purposes.</p>
          <p>Existing TradesStack accounting mappings and historical accounting records will remain.</p>
          <p>Queued Xero jobs that can no longer run will be ended during disconnect.</p>
        </div>

        <form action={action}>
          <input type="hidden" name="disconnect_confirmation" value="disconnect_xero" />
          <DialogFooter className="mt-6 flex flex-row items-center justify-end gap-2 border-t border-[var(--app-border)] pt-4">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)} disabled={disabled}>
              Cancel
            </Button>
            <DisconnectSubmitButton />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
