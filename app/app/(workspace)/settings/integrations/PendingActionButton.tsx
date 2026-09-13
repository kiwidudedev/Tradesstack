"use client";

import { useFormStatus } from "react-dom";
import { Button, type ButtonProps } from "@/components/ui/button";

type PendingActionButtonProps = ButtonProps & {
  pendingLabel: string;
};

export function PendingActionButton({ children, pendingLabel, disabled, ...props }: PendingActionButtonProps) {
  const { pending } = useFormStatus();

  return (
    <Button {...props} disabled={disabled || pending} aria-disabled={disabled || pending} aria-busy={pending}>
      {pending ? pendingLabel : children}
    </Button>
  );
}
