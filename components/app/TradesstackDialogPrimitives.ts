import { ibmPlexSans } from "@/lib/fonts";

export const dialogContentClassName =
  "max-h-[92vh] w-full max-w-[560px] overflow-y-auto rounded-[18px] border border-[var(--border)] bg-[var(--surface)] p-0 shadow-[0_8px_32px_rgba(15,23,42,0.12)]";

export const dialogTitleClassName =
  `${ibmPlexSans.className} m-0 text-[33px] font-semibold leading-none tracking-[-0.02em] text-[var(--text-primary)]`;

export const inputClassName =
  `${ibmPlexSans.className} h-[2.75rem] w-full rounded-[0.6rem] border border-[var(--border)] bg-[var(--surface)] px-3.5 text-[14px] font-medium text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none transition focus:border-[var(--primary)]`;

export const selectClassName =
  `${ibmPlexSans.className} h-[2.75rem] w-full appearance-none rounded-[0.6rem] border border-[var(--border)] bg-[var(--surface)] px-3.5 text-[14px] font-medium text-[var(--text-primary)] outline-none transition focus:border-[var(--primary)]`;

export const labelClassName =
  `${ibmPlexSans.className} mb-1 block text-[13px] font-semibold text-[var(--text-primary)]`;

export const footerContainerClassName = "flex items-center justify-end gap-3 px-7 pb-7 pt-5";

export const primaryButtonClassName =
  `${ibmPlexSans.className} inline-flex h-10 items-center justify-center rounded-[0.5rem] bg-[var(--primary)] px-5 text-[14px] font-semibold text-white transition hover:bg-[var(--primary-hover)] disabled:opacity-60`;

export const secondaryButtonClassName =
  `${ibmPlexSans.className} inline-flex h-10 items-center justify-center rounded-[0.5rem] border border-[var(--border)] bg-[var(--surface)] px-5 text-[14px] font-semibold text-[var(--text-secondary)] transition hover:bg-[var(--surface-muted)]`;
