import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Building2, Mail, Phone, Plus, Tag, X } from "lucide-react";
import { OperationalPanel } from "@/components/app/OperationalPanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ibmPlexSans } from "@/lib/fonts";
import { getCurrentOrganizationMember } from "@/lib/projects-server";
import { requirePermission } from "@/lib/permissions-server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const PROFILE_TAGS = ["High Value", "Difficult", "Slow Payer"] as const;

function FieldLabel({
  htmlFor,
  children,
  required = false,
}: {
  htmlFor: string;
  children: React.ReactNode;
  required?: boolean;
}) {
  return (
    <label htmlFor={htmlFor} className="text-base font-semibold text-[var(--text-primary)]">
      {children}
      {required ? <span className="ml-1 text-[var(--error)]">*</span> : null}
    </label>
  );
}

function IconField({
  id,
  name,
  type = "text",
  placeholder,
  icon,
  required = false,
}: {
  id: string;
  name: string;
  type?: string;
  placeholder: string;
  icon?: React.ReactNode;
  required?: boolean;
}) {
  return (
    <div className="relative">
      {icon ? <span className="pointer-events-none absolute left-5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]">{icon}</span> : null}
      <Input
        id={id}
        name={name}
        type={type}
        required={required}
        placeholder={placeholder}
        className={`h-[4.75rem] rounded-[var(--radius-lg)] border-[1.3px] ${icon ? "pl-14" : "pl-5"} pr-5 text-lg`}
      />
    </div>
  );
}

export default async function NewClientPage() {
  const member = await getCurrentOrganizationMember();
  await requirePermission("leads.clients.write", "/app/leads-clients/clients");

  async function createClient(formData: FormData) {
    "use server";

    const currentMember = await getCurrentOrganizationMember();
    if (!currentMember) {
      redirect("/app/leads-clients/clients");
    }

    await requirePermission("leads.clients.write", "/app/leads-clients/clients");

    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      redirect("/app/leads-clients/clients");
    }

    const companyName = String(formData.get("companyName") ?? "").trim();
    const contactName = String(formData.get("contactName") ?? "").trim();
    const email = String(formData.get("email") ?? "").trim();
    const phone = String(formData.get("phone") ?? "").trim();

    const tags = formData
      .getAll("profileTags")
      .map((value) => String(value))
      .filter((tag): tag is (typeof PROFILE_TAGS)[number] => PROFILE_TAGS.includes(tag as (typeof PROFILE_TAGS)[number]));

    if (!companyName) {
      redirect("/app/leads-clients/clients/new?error=missing-company-name");
    }

    if (!contactName) {
      redirect("/app/leads-clients/clients/new?error=missing-contact-name");
    }

    const { error } = await supabase.from("organization_clients").insert({
      organization_id: currentMember.organization_id,
      created_by: user.id,
      name: contactName,
      company_name: companyName,
      email: email || null,
      phone: phone || null,
      tags,
    });

    if (error) {
      redirect(`/app/leads-clients/clients/new?error=${encodeURIComponent(error.message)}`);
    }

    revalidatePath("/app/leads-clients/clients");
    redirect("/app/leads-clients/clients");
  }

  if (!member) {
    redirect("/app/leads-clients/clients");
  }

  return (
    <main className={`${ibmPlexSans.variable} ${ibmPlexSans.className} bg-[var(--background)] pb-8 pt-6`}>
      <form action={createClient} className="mx-auto max-w-[1120px]">
        <OperationalPanel
          title="Add New Client"
          actions={
            <Button asChild variant="secondary" size="icon" className="h-11 w-11 rounded-full">
              <Link href="/app/leads-clients/clients" aria-label="Close add client">
                <X className="h-6 w-6" strokeWidth={2.2} />
              </Link>
            </Button>
          }
        >
          <div className="grid gap-8">
            <div className="grid gap-3">
              <FieldLabel htmlFor="companyName" required>Client Name</FieldLabel>
              <IconField
                id="companyName"
                name="companyName"
                required
                placeholder="e.g., Auckland Developments Ltd"
                icon={<Building2 className="h-6 w-6" strokeWidth={2} />}
              />
            </div>

            <div className="grid gap-3">
              <FieldLabel htmlFor="contactName" required>Primary Contact</FieldLabel>
              <IconField
                id="contactName"
                name="contactName"
                required
                placeholder="e.g., Michael Zhang"
              />
            </div>

            <div className="grid gap-6 md:grid-cols-2">
              <div className="grid gap-3">
                <FieldLabel htmlFor="email" required>Email</FieldLabel>
                <IconField
                  id="email"
                  name="email"
                  type="email"
                  required
                  placeholder="email@example.com"
                  icon={<Mail className="h-6 w-6" strokeWidth={2} />}
                />
              </div>

              <div className="grid gap-3">
                <FieldLabel htmlFor="phone" required>Phone</FieldLabel>
                <IconField
                  id="phone"
                  name="phone"
                  required
                  placeholder="+64 9 123 4567"
                  icon={<Phone className="h-6 w-6" strokeWidth={2} />}
                />
              </div>
            </div>

            <div className="grid gap-3">
              <FieldLabel htmlFor="profileTags">Profile Tags</FieldLabel>
              <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-5">
                <div className="mb-4 flex items-center gap-2 text-[var(--text-secondary)]">
                  <Tag className="h-5 w-5" strokeWidth={2} />
                  <p className="m-0 text-sm">
                    Add any relationship flags that help your team qualify this client faster.
                  </p>
                </div>
                <div className="flex flex-wrap gap-3">
                  {PROFILE_TAGS.map((tag) => (
                    <label
                      key={tag}
                      className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface-muted)] px-4 py-2 text-sm font-medium text-[var(--text-primary)]"
                    >
                      <input type="checkbox" name="profileTags" value={tag} className="h-4 w-4 rounded border-[var(--border)]" />
                      {tag}
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="border-t border-[var(--border)] pt-8">
              <div className="flex flex-wrap items-center justify-end gap-3">
                <Button asChild variant="secondary">
                  <Link href="/app/leads-clients/clients">Cancel</Link>
                </Button>
                <Button type="submit">
                  <Plus className="h-4 w-4" strokeWidth={2.4} />
                  Add Client
                </Button>
              </div>
            </div>
          </div>
        </OperationalPanel>
      </form>
    </main>
  );
}
