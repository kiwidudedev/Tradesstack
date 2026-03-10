"use client";

import * as React from "react";

import { AuthPanel } from "@/components/auth/AuthPanel";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

interface AuthDialogProps {
  trigger: React.ReactNode;
}

export function AuthDialog({ trigger }: AuthDialogProps) {
  return (
    <Dialog>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="border-white/30 bg-transparent p-0 shadow-none">
        <DialogTitle className="sr-only">TradesStack Sign In</DialogTitle>
        <DialogDescription className="sr-only">
          Sign in to TradesStack to access projects, scopes, and risk workflows.
        </DialogDescription>
        <AuthPanel compact />
      </DialogContent>
    </Dialog>
  );
}
