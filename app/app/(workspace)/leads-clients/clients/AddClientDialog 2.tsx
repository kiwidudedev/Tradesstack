"use client";

import { Plus } from "lucide-react";
import { Dialog, DialogClose, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ibmPlexSans } from "@/lib/fonts";

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
    <label htmlFor={htmlFor} className={`${ibmPlexSans.className} mb-1 block text-[13px] font-semibold text-[#1d2433]`}>
      {children}
      {required ? <span className="ml-1 text-[#FF4C14]">*</span> : null}
    </label>
  );
}

const inputClass = `${ibmPlexSans.className} h-[2.75rem] w-full rounded-[0.6rem] border border-[#D9E3EE] bg-white px-3.5 text-[14px] font-medium text-[#10283B] placeholder:text-[#9BAABB] outline-none transition focus:border-[#F15A29]`;

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
          className={`${ibmPlexSans.className} inline-flex items-center gap-2 rounded-[0.5rem] border border-[#F15A29] bg-[#F15A29] px-[0.95rem] py-[0.55rem] text-[14px] font-semibold text-white shadow-none transition-opacity hover:opacity-90`}
        >
          <Plus className="h-4 w-4" strokeWidth={2.3} />
          Add Client
        </button>
      </DialogTrigger>

      <DialogContent className="max-h-[92vh] w-full max-w-[560px] overflow-y-auto rounded-[18px] border border-[#E2E8F1] bg-white p-0 shadow-[0_8px_32px_rgba(15,23,42,0.12)]">
        <form action={createClientAction}>
          <DialogHeader className="px-7 pb-6 pt-7">
            <DialogTitle className={`${ibmPlexSans.className} m-0 text-[33px] font-semibold leading-none tracking-[-0.02em] text-[#1d1d1d]`}>
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
                className={`${ibmPlexSans.className} w-full resize-none rounded-[0.6rem] border border-[#D9E3EE] bg-white px-3.5 py-2.5 text-[14px] font-medium text-[#10283B] placeholder:text-[#9BAABB] outline-none transition focus:border-[#F15A29]`}
              />
            </div>

            {/* Status */}
            <div>
              <FieldLabel htmlFor="status">Status</FieldLabel>
              <select
                id="status"
                name="status"
                className={`${ibmPlexSans.className} h-[2.75rem] w-full appearance-none rounded-[0.6rem] border border-[#D9E3EE] bg-white px-3.5 text-[14px] font-medium text-[#10283B] outline-none transition focus:border-[#F15A29]`}
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
                className={`${ibmPlexSans.className} inline-flex h-10 items-center justify-center rounded-[0.5rem] border border-[#D9E3EE] bg-white px-5 text-[14px] font-semibold text-[#475569] transition hover:bg-[#F8FAFC]`}
              >
                Cancel
              </button>
            </DialogClose>
            <button
              type="submit"
              className={`${ibmPlexSans.className} inline-flex h-10 items-center justify-center rounded-[0.5rem] bg-[#F15A29] px-5 text-[14px] font-semibold text-white transition hover:bg-[#db4d1f]`}
            >
              Add Client
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
