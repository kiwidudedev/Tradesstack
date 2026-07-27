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
    <Button type="submit" variant="destructive" disabled={pending}>
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
        <Button type="button" variant="secondary" disabled={disabled}>
          Disconnect
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl p-6 sm:p-6" hideClose={disabled}>
        <DialogHeader className="pr-8">
          <DialogTitle>Disconnect Xero?</DialogTitle>
          <DialogDescription className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
            This will disconnect the current Xero authorization for this TradesStack organization. Future Xero imports
            will stop and the stored token secrets will be removed.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm text-[var(--text-secondary)]">
          <p>Imported accounts and tax rates will remain for historical and reference purposes.</p>
          <p>Existing TradesStack accounting mappings will remain and are not deleted by this Phase 1 disconnect.</p>
          <p>No Supplier Invoices or Payment Claims are exported to Xero in Phase 1.</p>
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
