import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CardTitle } from "@/components/ui/card";
import { interMedium } from "@/lib/fonts";
import { getCurrentOrganizationMember } from "@/lib/projects-server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import styles from "./client-detail.module.css";

export default async function ClientOverviewPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;
  const member = await getCurrentOrganizationMember();

  if (!member) {
    redirect("/app/leads-clients/clients");
  }

  const supabase = await createServerSupabaseClient();
  const clientResult = await supabase
    .from("organization_clients")
    .select("id, company_name")
    .eq("organization_id", member.organization_id)
    .eq("id", clientId)
    .maybeSingle();

  if (clientResult.error) {
    redirect("/app/leads-clients/clients");
  }

  const client = clientResult.data;
  if (!client) {
    notFound();
  }

  return (
    <main className={`${styles.scope} space-y-6 pb-8`}>
      <section className={styles.heroBlock}>
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className={styles.heroTitle}>{client.company_name || "Unknown Company"}</CardTitle>
          </div>
        </div>

        <div className={styles.heroActions}>
          <Button
            variant="ghost"
            size="sm"
            asChild
            className={`${interMedium.className} ${styles.backButton} h-9 px-4 text-sm font-medium`}
          >
            <Link href="/app/leads-clients/clients">
              <ArrowLeft className="mr-1.5 h-4 w-4" />
              Back to Clients
            </Link>
          </Button>
        </div>
      </section>
    </main>
  );
}
