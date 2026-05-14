import Link from "next/link";
import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { OperationalModuleHeader } from "@/components/app/OperationalModuleHeader";
import { OperationalPanel } from "@/components/app/OperationalPanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getCurrentOrganizationMember } from "@/lib/projects-server";
import { requirePermission } from "@/lib/permissions-server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const CLIENT_TAGS = ["Good Client", "High Value", "Difficult", "Slow Payer"] as const;

export default async function EditClientPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;
  const member = await getCurrentOrganizationMember();
  await requirePermission("leads.clients.write", "/app/leads-clients/clients");

  if (!member) {
    redirect("/app/leads-clients/clients");
  }

  const supabase = await createServerSupabaseClient();
  const clientResult = await supabase
    .from("organization_clients")
    .select("id, name, company_name, email, phone, tags")
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

  async function updateClient(formData: FormData) {
    "use server";

    const currentMember = await getCurrentOrganizationMember();
    if (!currentMember) {
      redirect("/app/leads-clients/clients");
    }

    await requirePermission("leads.clients.write", "/app/leads-clients/clients");

    const contactName = String(formData.get("name") ?? "").trim();
    const companyName = String(formData.get("companyName") ?? "").trim();
    const emailRaw = String(formData.get("email") ?? "").trim();
    const phoneRaw = String(formData.get("phone") ?? "").trim();
    const tags = formData
      .getAll("tags")
      .map((value) => String(value))
      .filter((tag): tag is (typeof CLIENT_TAGS)[number] => CLIENT_TAGS.includes(tag as (typeof CLIENT_TAGS)[number]));

    if (!contactName) {
      redirect(`/app/leads-clients/clients/${clientId}/edit?error=missing-contact-name`);
    }

    if (!companyName) {
      redirect(`/app/leads-clients/clients/${clientId}/edit?error=missing-company-name`);
    }

    const serverSupabase = await createServerSupabaseClient();
    const { error } = await serverSupabase
      .from("organization_clients")
      .update({
        name: contactName,
        company_name: companyName,
        email: emailRaw || null,
        phone: phoneRaw || null,
        tags,
      })
      .eq("organization_id", currentMember.organization_id)
      .eq("id", clientId);

    if (error) {
      redirect(`/app/leads-clients/clients/${clientId}/edit?error=${encodeURIComponent(error.message)}`);
    }

    revalidatePath("/app/leads-clients/clients");
    redirect("/app/leads-clients/clients");
  }

  const FIELD_LABEL_CLASS = "text-xs font-semibold uppercase tracking-[0.1em] text-[var(--text-secondary)]";

  return (
    <main className="space-y-4 bg-[var(--background)] pb-8">
      <Button variant="ghost" size="sm" asChild>
        <Link href="/app/leads-clients/clients">
          <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
          Back to Clients
        </Link>
      </Button>

      <OperationalModuleHeader
        title="Edit Client"
        description="Update contact details and company info."
      />

      <OperationalPanel>
        <form action={updateClient} className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <label htmlFor="name" className={FIELD_LABEL_CLASS}>
                Contact Name
              </label>
              <Input id="name" name="name" required defaultValue={client.name} />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="companyName" className={FIELD_LABEL_CLASS}>
                Company Name
              </label>
              <Input id="companyName" name="companyName" required defaultValue={client.company_name ?? ""} />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="email" className={FIELD_LABEL_CLASS}>
                Email
              </label>
              <Input id="email" name="email" type="email" defaultValue={client.email ?? ""} />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="phone" className={FIELD_LABEL_CLASS}>
                Phone
              </label>
              <Input id="phone" name="phone" defaultValue={client.phone ?? ""} />
            </div>
          </div>
          <div className="space-y-2">
            <p className={FIELD_LABEL_CLASS}>Client Tags</p>
            <div className="flex flex-wrap gap-2">
              {CLIENT_TAGS.map((tag) => (
                <label
                  key={tag}
                  className="inline-flex cursor-pointer items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)]"
                >
                  <input
                    type="checkbox"
                    name="tags"
                    value={tag}
                    defaultChecked={(client.tags ?? []).includes(tag)}
                    className="h-3.5 w-3.5 rounded-[var(--radius-sm)] border-[var(--border)]"
                  />
                  {tag}
                </label>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-1">
            <Button variant="secondary" asChild>
              <Link href="/app/leads-clients/clients">Cancel</Link>
            </Button>
            <Button type="submit">Save Changes</Button>
          </div>
        </form>
      </OperationalPanel>
    </main>
  );
}
