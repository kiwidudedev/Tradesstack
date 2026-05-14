"use client";

import { Plus } from "lucide-react";
import { Dialog, DialogClose, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ibmPlexSans } from "@/lib/fonts";
import { FormLabel } from "@/components/app/FormLabel";

function FieldLabel({
  htmlFor,
  children,
  required = false,
}: {
  htmlFor: string;
  children: React.ReactNode;
  required?: boolean;
}) {
  return (
    <FormLabel htmlFor={htmlFor}>
      {children}
      {required ? <span className="ml-1 text-[var(--orange-primary)]">*</span> : null}
    </FormLabel>
  );
}

const inputClass = `${ibmPlexSans.className} h-[2.75rem] w-full rounded-[0.6rem] border border-[var(--border)] bg-[var(--surface)] px-3.5 text-[14px] font-medium text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none transition focus:border-[var(--primary)]`;

export function AddClientDialog({
  createClientAction,
}: {
  createClientAction: (formData: FormData) => void | Promise<void>;
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className={`${ibmPlexSans.className} inline-flex items-center gap-2 rounded-[0.5rem] border border-[var(--primary)] bg-[var(--primary)] px-[0.95rem] py-[0.55rem] text-[14px] font-semibold text-white shadow-none transition-opacity hover:opacity-90`}
        >
          <Plus className="h-4 w-4" strokeWidth={2.3} />
          Add Client
        </button>
      </DialogTrigger>

      <DialogContent className="max-h-[92vh] w-full max-w-[720px] overflow-y-auto rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-0 shadow-[var(--shadow-overlay)]">
        <form action={createClientAction}>
          <DialogHeader className="px-7 pb-6 pt-7">
            <DialogTitle className={`${ibmPlexSans.className} m-0 text-[33px] font-semibold leading-none tracking-[-0.02em] text-[var(--text-primary)]`}>
              Add Client
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3.5 px-7 pb-4">
            {/* Client Name */}
            <div>
              <FieldLabel htmlFor="companyName" required>Client Name</FieldLabel>
              <Input
                id="companyName"
                name="companyName"
                required
                placeholder="Auckland Developments Ltd"
                className={inputClass}
              />
            </div>

            {/* Primary Contact */}
            <div>
              <FieldLabel htmlFor="contactName" required>Primary Contact</FieldLabel>
              <Input
                id="contactName"
                name="contactName"
                required
                placeholder="John Andrews"
                className={inputClass}
              />
            </div>

            {/* Email + Phone */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <FieldLabel htmlFor="email">Email</FieldLabel>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="Email@example.com"
                  className={inputClass}
                />
              </div>
              <div>
                <FieldLabel htmlFor="phone">Phone</FieldLabel>
                <Input
                  id="phone"
                  name="phone"
                  placeholder="+64 9 123 4567"
                  className={inputClass}
                />
              </div>
            </div>

            {/* Location */}
            <div>
              <FieldLabel htmlFor="location">Location</FieldLabel>
              <Input
                id="location"
                name="location"
                placeholder="Auckland CBD"
                className={inputClass}
              />
            </div>

            {/* Full Address */}
            <div>
              <FieldLabel htmlFor="fullAddress">Full Address</FieldLabel>
              <textarea
                id="fullAddress"
                name="fullAddress"
                rows={1}
                placeholder="Level 12, 123 Queen Street, Auckland 1010"
                className={`${ibmPlexSans.className} w-full resize-none rounded-[0.6rem] border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2.5 text-[14px] font-medium text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none transition focus:border-[var(--primary)]`}
              />
            </div>

            {/* Status */}
            <div>
              <FieldLabel htmlFor="status">Status</FieldLabel>
              <select
                id="status"
                name="status"
                className={`${ibmPlexSans.className} h-[2.75rem] w-full appearance-none rounded-[0.6rem] border border-[var(--border)] bg-[var(--surface)] px-3.5 text-[14px] font-medium text-[var(--text-primary)] outline-none transition focus:border-[var(--primary)]`}
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 px-7 pb-7 pt-5">
            <DialogClose asChild>
              <button
                type="button"
                className={`${ibmPlexSans.className} inline-flex h-10 items-center justify-center rounded-[0.5rem] border border-[var(--border)] bg-[var(--surface)] px-5 text-[14px] font-semibold text-[var(--text-secondary)] transition hover:bg-[var(--surface-muted)]`}
              >
                Cancel
              </button>
            </DialogClose>
            <button
              type="submit"
              className={`${ibmPlexSans.className} inline-flex h-10 items-center justify-center rounded-[0.5rem] bg-[var(--primary)] px-5 text-[14px] font-semibold text-white transition hover:bg-[var(--primary-hover)]`}
            >
              Add Client
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
