import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface OperationalPanelProps extends React.HTMLAttributes<HTMLDivElement> {
  title?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  toolbar?: React.ReactNode;
  contentClassName?: string;
}

export function OperationalPanel({
  title,
  description,
  actions,
  toolbar,
  contentClassName,
  className,
  children,
  ...props
}: OperationalPanelProps) {
  const hasHeader = title || description || actions || toolbar;

  return (
    <Card
      className={cn("overflow-hidden", className)}
      {...props}
    >
      {hasHeader ? (
        <CardHeader className="gap-4 border-b border-[var(--border)] p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              {title ? <CardTitle>{title}</CardTitle> : null}
              {description ? <p className="mt-1.5 text-sm text-[var(--text-secondary)]">{description}</p> : null}
            </div>
            {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
          </div>
          {toolbar ? <div>{toolbar}</div> : null}
        </CardHeader>
      ) : null}
      <CardContent className={cn("p-6", hasHeader ? null : "pt-6", contentClassName)}>{children}</CardContent>
    </Card>
  );
}
