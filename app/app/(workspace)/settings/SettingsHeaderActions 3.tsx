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
      className={`${interMedium.className} inline-flex items-center gap-2 rounded-full border border-[#0B2739] bg-[#0B2739] px-[0.7rem] py-[0.55rem] text-[15px] font-medium text-white shadow-none transition-opacity hover:bg-[#0B2739] hover:opacity-90`}
    >
      Save organization
    </Button>
  );
}
