import * as React from "react";
import { cn } from "@/lib/utils";

const OperationalTable = React.forwardRef<HTMLTableElement, React.TableHTMLAttributes<HTMLTableElement>>(
  ({ className, ...props }, ref) => (
    <div className="relative w-full overflow-auto">
      <table ref={ref} className={cn("w-full caption-bottom text-sm", className)} {...props} />
    </div>
  )
);
OperationalTable.displayName = "OperationalTable";

const OperationalTableHeader = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => (
    <thead ref={ref} className={cn("border-b border-[var(--border)]", className)} {...props} />
  )
);
OperationalTableHeader.displayName = "OperationalTableHeader";

const OperationalTableBody = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => (
    <tbody ref={ref} className={cn("[&_tr:last-child]:border-0", className)} {...props} />
  )
);
OperationalTableBody.displayName = "OperationalTableBody";

const OperationalTableFooter = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => (
    <tfoot ref={ref} className={cn("border-t border-[var(--border)] bg-[var(--surface-muted)] font-medium", className)} {...props} />
  )
);
OperationalTableFooter.displayName = "OperationalTableFooter";

const OperationalTableRow = React.forwardRef<HTMLTableRowElement, React.HTMLAttributes<HTMLTableRowElement>>(
  ({ className, ...props }, ref) => (
    <tr ref={ref} className={cn("h-14 border-b border-[var(--border)] transition-colors hover:bg-[var(--surface-muted)]", className)} {...props} />
  )
);
OperationalTableRow.displayName = "OperationalTableRow";

const OperationalTableHead = React.forwardRef<HTMLTableCellElement, React.ThHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => (
    <th
      ref={ref}
      className={cn("h-14 px-4 text-left align-middle font-semibold text-[var(--text-primary)] [&:has([role=checkbox])]:pr-0", className)}
      {...props}
    />
  )
);
OperationalTableHead.displayName = "OperationalTableHead";

const OperationalTableCell = React.forwardRef<HTMLTableCellElement, React.TdHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => (
    <td ref={ref} className={cn("px-4 py-4 align-middle text-[var(--text-primary)] [&:has([role=checkbox])]:pr-0", className)} {...props} />
  )
);
OperationalTableCell.displayName = "OperationalTableCell";

const OperationalTableCaption = React.forwardRef<HTMLTableCaptionElement, React.HTMLAttributes<HTMLTableCaptionElement>>(
  ({ className, ...props }, ref) => (
    <caption ref={ref} className={cn("mt-4 text-sm text-[var(--text-secondary)]", className)} {...props} />
  )
);
OperationalTableCaption.displayName = "OperationalTableCaption";

export {
  OperationalTable,
  OperationalTableBody,
  OperationalTableCaption,
  OperationalTableCell,
  OperationalTableFooter,
  OperationalTableHead,
  OperationalTableHeader,
  OperationalTableRow,
};
