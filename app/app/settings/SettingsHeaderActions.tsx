"use client";

import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { interMedium } from "@/lib/fonts";

interface SettingsHeaderActionsProps {
  isSaving?: boolean;
}

export function SettingsHeaderActions(_props: SettingsHeaderActionsProps) {
  const pathname = usePathname();

  if (pathname !== "/app/settings/organization") {
    return null;
  }

  return (
    <Button
      type="submit"
      form="organization-settings-form"
      className={`${interMedium.className} h-10 rounded-[10px] bg-[#0B2739] px-4 text-sm font-medium text-white hover:bg-[#0a2232]`}
    >
      Save organization
    </Button>
  );
}
