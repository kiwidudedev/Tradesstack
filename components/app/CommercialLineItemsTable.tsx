"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatMoneyDocument } from "@/lib/format/currency";
import { cn } from "@/lib/utils";

const commercialNumberFormatter = new Intl.NumberFormat("en-NZ", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function sanitizeCommercialNumericInput(value: string) {
  return value.replace(/[^\d.-]/g, "");
}

function parseCommercialNumericInput(value: string | number) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const parsed = Number(sanitizeCommercialNumericInput(trimmed));
  return Number.isFinite(parsed) ? parsed : null;
}

export function formatCommercialPriceNumber(value: number) {
  return commercialNumberFormatter.format(value);
}

export function formatCommercialDocumentMoney(value: number) {
  const formatted = formatMoneyDocument(value, { decimals: 2 });
  return formatted.startsWith("$") ? `NZ${formatted}` : formatted;
}

export function formatCommercialDocumentMoneyValue(value: number) {
  return formatCommercialDocumentMoney(value).replace(/^NZ\$/, "");
}

type CommercialLineItemsTableProps = {
  columns: Array<{
    key: string;
    label: ReactNode;
    align?: "left" | "right" | "center";
    className?: string;
  }>;
  gridTemplateColumns: string;
  minWidthClassName?: string;
  emptyState?: ReactNode | null;
  children?: ReactNode;
  className?: string;
};

export function CommercialLineItemsTable({
  columns,
  gridTemplateColumns,
  minWidthClassName = "min-w-[1004px]",
  emptyState = null,
  children,
  className,
}: CommercialLineItemsTableProps) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-[18px] border border-[var(--border)] bg-[var(--surface)]",
        className
      )}
    >
      <div className="overflow-x-auto">
        <div className={minWidthClassName}>
          <div
            className="grid items-center gap-0 border-b border-[var(--border)] bg-[var(--surface-muted)] px-0 py-0 text-left text-[13px] tracking-[-0.01em] text-[var(--text-secondary)]"
            style={{ gridTemplateColumns }}
          >
            {columns.map((column, index) => (
              <span
                key={column.key}
                className={cn(
                  "px-3 py-2.5 font-semibold",
                  index === 0 ? "" : "border-l border-[var(--border)]",
                  column.align === "right" ? "text-right" : "",
                  column.align === "center" ? "text-center" : "",
                  column.className
                )}
              >
                {column.label}
              </span>
            ))}
          </div>
          {children ? (
            <div className="divide-y divide-[var(--border-subtle)] bg-[var(--surface)]">
              {children}
            </div>
          ) : (
            emptyState
          )}
        </div>
      </div>
    </div>
  );
}

type CommercialLineItemsRowProps = {
  gridTemplateColumns: string;
  children: ReactNode;
  className?: string;
};

export function CommercialLineItemsRow({
  gridTemplateColumns,
  children,
  className,
}: CommercialLineItemsRowProps) {
  return (
    <div
      className={cn("group grid items-stretch gap-0 px-0 py-0", className)}
      style={{ gridTemplateColumns }}
    >
      {children}
    </div>
  );
}

type CommercialLineItemsCellProps = {
  children: ReactNode;
  className?: string;
  withBorder?: boolean;
};

export function CommercialLineItemsCell({
  children,
  className,
  withBorder = false,
}: CommercialLineItemsCellProps) {
  return (
    <div
      className={cn(
        "flex items-center px-3 py-1.5",
        withBorder ? "border-l border-[var(--border-subtle)]" : "",
        className
      )}
    >
      {children}
    </div>
  );
}

type CommercialLineTextInputProps = {
  value: string | number;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
  inputMode?: React.InputHTMLAttributes<HTMLInputElement>["inputMode"];
  type?: React.InputHTMLAttributes<HTMLInputElement>["type"];
  placeholder?: string;
  title?: string;
  ariaLabel?: string;
};

export function CommercialLineTextInput({
  value,
  onChange,
  disabled = false,
  className,
  inputMode,
  type,
  placeholder,
  title,
  ariaLabel,
}: CommercialLineTextInputProps) {
  return (
    <Input
      aria-label={ariaLabel}
      type={type}
      inputMode={inputMode}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      disabled={disabled}
      placeholder={placeholder}
      title={title}
      className={cn(
        "h-9 w-full !border-0 !bg-transparent px-0 text-left !shadow-none focus:!border-0 focus:!bg-transparent focus:!shadow-none focus-visible:!border-0 focus-visible:!bg-transparent focus-visible:!shadow-none disabled:!bg-transparent disabled:text-[var(--text-secondary)]",
        className
      )}
    />
  );
}

type CommercialLineDescriptionFieldProps = {
  primaryValue: string;
  secondaryValue?: string | null;
  onPrimaryChange?: (value: string) => void;
  onSecondaryChange?: (value: string) => void;
  primaryPlaceholder?: string;
  secondaryPlaceholder?: string;
  primaryAriaLabel?: string;
  secondaryAriaLabel?: string;
  disabled?: boolean;
  readOnly?: boolean;
  className?: string;
  primaryInputClassName?: string;
  secondaryInputClassName?: string;
  readOnlyClassName?: string;
  primaryTextClassName?: string;
  secondaryTextClassName?: string;
};

export function CommercialLineDescriptionField({
  primaryValue,
  secondaryValue,
  onPrimaryChange,
  onSecondaryChange,
  primaryPlaceholder,
  secondaryPlaceholder,
  primaryAriaLabel,
  secondaryAriaLabel,
  disabled = false,
  readOnly = false,
  className,
  primaryInputClassName,
  secondaryInputClassName,
  readOnlyClassName,
  primaryTextClassName,
  secondaryTextClassName,
}: CommercialLineDescriptionFieldProps) {
  const shouldRenderSecondaryField = (
    secondaryValue !== undefined
    || secondaryPlaceholder !== undefined
    || onSecondaryChange !== undefined
    || secondaryAriaLabel !== undefined
    || secondaryInputClassName !== undefined
    || secondaryTextClassName !== undefined
  );

  if (readOnly) {
    return (
      <div className={cn("flex min-w-0 flex-col gap-0.5 py-1", readOnlyClassName, className)}>
        <span className={cn("truncate text-sm text-[var(--text-primary)]", primaryTextClassName)}>
          {primaryValue.trim() || "—"}
        </span>
        {secondaryValue?.trim() ? (
          <span className={cn("truncate text-xs text-[var(--text-secondary)]", secondaryTextClassName)}>
            {secondaryValue.trim()}
          </span>
        ) : null}
      </div>
    );
  }

  return (
    <div className={cn("w-full", className)}>
      <CommercialLineTextInput
        value={primaryValue}
        onChange={onPrimaryChange ?? (() => undefined)}
        disabled={disabled}
        placeholder={primaryPlaceholder}
        ariaLabel={primaryAriaLabel}
        className={primaryInputClassName}
      />
      {shouldRenderSecondaryField ? (
        <CommercialLineSecondaryInput
          value={secondaryValue ?? ""}
          onChange={onSecondaryChange ?? (() => undefined)}
          disabled={disabled}
          placeholder={secondaryPlaceholder}
          ariaLabel={secondaryAriaLabel}
          className={secondaryInputClassName}
        />
      ) : null}
    </div>
  );
}

type CommercialLineSecondaryInputProps = {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  ariaLabel?: string;
  className?: string;
};

export function CommercialLineSecondaryInput({
  value,
  onChange,
  disabled = false,
  placeholder,
  ariaLabel,
  className,
}: CommercialLineSecondaryInputProps) {
  return (
    <Input
      aria-label={ariaLabel}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      disabled={disabled}
      placeholder={placeholder}
      className={cn(
        "mt-0.5 h-7 w-full !border-0 !bg-transparent px-0 text-left text-xs text-[var(--text-secondary)] !shadow-none focus:!border-0 focus:!bg-transparent focus:!shadow-none focus-visible:!border-0 focus-visible:!bg-transparent focus-visible:!shadow-none disabled:!bg-transparent disabled:text-[var(--text-secondary)]",
        className
      )}
    />
  );
}

type CommercialLinePrefixedNumberInputProps = {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  ariaLabel?: string;
  prefix: string;
  align?: "left" | "right";
  formatter?: (value: number) => string;
  joinPrefixWithValue?: boolean;
  className?: string;
  title?: string;
};

export function CommercialLinePrefixedNumberInput({
  value,
  onChange,
  disabled = false,
  placeholder,
  ariaLabel,
  prefix,
  align = "left",
  formatter = formatCommercialPriceNumber,
  joinPrefixWithValue = false,
  className,
  title,
}: CommercialLinePrefixedNumberInputProps) {
  const [isFocused, setIsFocused] = useState(false);
  const [displayValue, setDisplayValue] = useState(() => {
    const parsed = parseCommercialNumericInput(value);
    return parsed === null ? value : formatter(parsed);
  });

  useEffect(() => {
    if (isFocused) {
      return;
    }

    const parsed = parseCommercialNumericInput(value);
    queueMicrotask(() => {
      setDisplayValue(parsed === null ? value : formatter(parsed));
    });
  }, [formatter, isFocused, value]);

  return (
    <div className={cn("relative w-full", className)}>
      {!joinPrefixWithValue || isFocused ? (
        <span
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute top-1/2 -translate-y-1/2 text-sm text-[var(--text-secondary)]",
            align === "right" ? "left-3" : "left-0"
          )}
        >
          {prefix}
        </span>
      ) : null}
      <Input
        aria-label={ariaLabel}
        inputMode="decimal"
        value={joinPrefixWithValue && !isFocused && displayValue ? `${prefix}${displayValue}` : displayValue}
        onFocus={() => {
          setIsFocused(true);
          setDisplayValue(value);
        }}
        onChange={(event) => {
          const rawValue = sanitizeCommercialNumericInput(event.target.value);
          setDisplayValue(event.target.value);
          onChange(rawValue);
        }}
        onBlur={(event) => {
          const rawValue = sanitizeCommercialNumericInput(event.target.value);
          const parsed = parseCommercialNumericInput(rawValue);
          setIsFocused(false);
          setDisplayValue(parsed === null ? rawValue : formatter(parsed));
          onChange(rawValue);
        }}
        disabled={disabled}
        placeholder={placeholder}
        title={title}
        className={cn(
          "h-9 w-full !border-0 !bg-transparent !shadow-none focus:!border-0 focus:!bg-transparent focus:!shadow-none focus-visible:!border-0 focus-visible:!bg-transparent focus-visible:!shadow-none disabled:!bg-transparent disabled:text-[var(--text-secondary)]",
          align === "right"
            ? joinPrefixWithValue && !isFocused
              ? "px-0 text-right"
              : "pl-11 pr-0 text-right"
            : "pl-5 pr-0 text-left",
          className
        )}
      />
    </div>
  );
}

type CommercialLineMoneyDisplayProps = {
  value: number;
  className?: string;
};

export function CommercialLineMoneyDisplay({
  value,
  className,
}: CommercialLineMoneyDisplayProps) {
  return (
    <span className={cn("whitespace-nowrap text-right text-sm font-medium text-[var(--text-primary)]", className)}>
      {formatCommercialDocumentMoney(value)}
    </span>
  );
}

type CommercialLineItemActionButtonProps = {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  alwaysVisible?: boolean;
  className?: string;
};

export function CommercialLineItemActionButton({
  icon,
  label,
  onClick,
  disabled = false,
  alwaysVisible = false,
  className,
}: CommercialLineItemActionButtonProps) {
  return (
    <Button
      type="button"
      variant="ghost"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "h-8 w-8 rounded-none border-0 bg-transparent p-0 text-[var(--text-muted)]/80 shadow-none hover:bg-transparent hover:text-[var(--error)] focus-visible:outline-none focus-visible:ring-0 disabled:opacity-40",
        alwaysVisible ? "opacity-100" : "opacity-0 group-hover:opacity-100",
        className
      )}
      aria-label={label}
    >
      {icon}
    </Button>
  );
}

type CommercialLineItemsAddButtonProps = {
  label?: string;
  onClick: () => void;
  className?: string;
};

export function CommercialLineItemsAddButton({
  label = "Add Item",
  onClick,
  className,
}: CommercialLineItemsAddButtonProps) {
  return (
    <Button
      type="button"
      variant="ghost"
      onClick={onClick}
      className={cn(
        "h-8 rounded-none border-0 bg-transparent px-0 text-[var(--text-secondary)] shadow-none hover:bg-transparent hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-0",
        className
      )}
    >
      <Plus className="mr-1 h-3.5 w-3.5" />
      {label}
    </Button>
  );
}

type CommercialSummaryCardProps = {
  title: ReactNode;
  children: ReactNode;
  className?: string;
};

export function CommercialSummaryCard({
  title,
  children,
  className,
}: CommercialSummaryCardProps) {
  return (
    <div
      className={cn(
        "rounded-[14px] border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-4 py-4",
        className
      )}
    >
      <h2 className="mb-4 text-[15px] font-semibold text-[var(--text-primary)]">{title}</h2>
      {children}
    </div>
  );
}

type CommercialSummaryRowProps = {
  label: ReactNode;
  value: ReactNode;
  className?: string;
  valueClassName?: string;
  labelClassName?: string;
};

export function CommercialSummaryRow({
  label,
  value,
  className,
  valueClassName,
  labelClassName,
}: CommercialSummaryRowProps) {
  return (
    <div className={cn("flex items-center justify-between gap-2", className)}>
      <span className={cn("text-[var(--text-secondary)]", labelClassName)}>{label}</span>
      <span className={cn("font-medium text-[var(--text-primary)]", valueClassName)}>{value}</span>
    </div>
  );
}
