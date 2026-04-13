import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Building2, Mail, Phone, Plus, Tag, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { interMedium, ibmPlexSans } from "@/lib/fonts";
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
    <label htmlFor={htmlFor} className={`${ibmPlexSans.className} text-[16px] font-semibold text-[#3E4F68]`}>
      {children}
      {required ? <span className="ml-1 text-[#FF4C14]">*</span> : null}
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
      {icon ? <span className="pointer-events-none absolute left-5 top-1/2 -translate-y-1/2 text-[#8EA0BC]">{icon}</span> : null}
      <Input
        id={id}
        name={name}
        type={type}
        required={required}
        placeholder={placeholder}
        className={`${ibmPlexSans.className} h-[4.75rem] rounded-[1rem] border-[1.3px] border-[#C8D7E8] bg-white ${icon ? "pl-14" : "pl-5"} pr-5 text-[18px] text-[#10283B] placeholder:text-[#8a8a8a]`}
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
    <main className={`${ibmPlexSans.variable} ${ibmPlexSans.className} bg-[#FBFEFE] pb-8 pt-[25px]`}>
      <form action={createClient} className="mx-auto max-w-[1120px]">
        <Card className="overflow-hidden rounded-[24px] border-[1.3px] border-[#E2E8F1] bg-[#FBFEFE] shadow-[0_1px_2px_rgba(15,23,42,0.05),0_3px_8px_rgba(15,23,42,0.04)]">
          <CardHeader className="flex flex-row items-center justify-between gap-4 border-b border-[#E2E8F1] px-8 py-7">
            <CardTitle className="m-0 text-[clamp(1.7rem,2.8vw,2.5rem)] font-bold leading-none tracking-[-0.04em] text-[#1D2740]">
              Add New Client
            </CardTitle>
            <Link
              href="/app/leads-clients/clients"
              className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[#D3DDEA] bg-white text-[#8EA0BC] transition hover:bg-[#F8FAFC]"
              aria-label="Close add client"
            >
              <X className="h-6 w-6" strokeWidth={2.2} />
            </Link>
          </CardHeader>

          <CardContent className="px-8 pb-8 pt-8">
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
                <div className="rounded-[1rem] border-[1.3px] border-[#E2E8F1] bg-white p-5">
                  <div className="mb-4 flex items-center gap-2 text-[#6A7A89]">
                    <Tag className="h-5 w-5" strokeWidth={2} />
                    <p className={`${interMedium.className} m-0 text-[14px]`}>
                      Add any relationship flags that help your team qualify this client faster.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    {PROFILE_TAGS.map((tag) => (
                      <label
                        key={tag}
                        className={`${interMedium.className} inline-flex items-center gap-2 rounded-full border border-[#D9E3EE] bg-[#FBFEFE] px-4 py-2 text-[14px] font-medium text-[#35567A]`}
                      >
                        <input type="checkbox" name="profileTags" value={tag} className="h-4 w-4 rounded border-[#C8D6E8]" />
                        {tag}
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              <div className="border-t border-[#E2E8F1] pt-8">
                <div className="flex flex-wrap items-center justify-end gap-3">
                  <Link
                    href="/app/leads-clients/clients"
                    className="inline-flex items-center justify-center rounded-[0.9rem] border border-[#CBD5E1] bg-white px-6 py-3 text-[16px] font-semibold text-[#475569] transition hover:bg-[#F8FAFC]"
                  >
                    Cancel
                  </Link>
                  <button
                    type="submit"
                    className="inline-flex items-center justify-center gap-2 rounded-[0.9rem] bg-[#F15A29] px-6 py-3 text-[16px] font-semibold text-white transition hover:bg-[#db4d1f]"
                  >
                    <Plus className="h-4 w-4" strokeWidth={2.4} />
                    Add Client
                  </button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </form>
    </main>
  );
}
