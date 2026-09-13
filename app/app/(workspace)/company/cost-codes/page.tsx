import { redirect } from "next/navigation";

/** Legacy numeric mappings remain in storage for historical snapshots only. */
export default function LegacyCostCodesPage() {
  redirect("/app/settings/integrations");
}
