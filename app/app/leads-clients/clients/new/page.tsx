import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { interMedium } from "@/lib/fonts";
import { getCurrentOrganizationMember } from "@/lib/projects-server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const PROFILE_TAGS = ["High Value", "Difficult", "Slow Payer", "Custom"] as const;
const CLIENT_TYPES = ["Builder", "Developer", "Homeowner", "Commercial"] as const;
const CLIENT_STATUSES = ["Active", "Prospect", "Past"] as const;
const PAYMENT_TERMS = ["7 days", "14 days", "30 days"] as const;
const CREDIT_RISKS = ["Low", "Medium", "High"] as const;

function SectionTitle({ title, description }: { title: string; description?: string }) {
  return (
    <div className="space-y-1">
      <h3 className="text-base font-semibold tracking-[-0.01em] text-[#0F172A]">{title}</h3>
      {description ? <p className={`${interMedium.className} text-sm font-medium text-[#5F7390]`}>{description}</p> : null}
    </div>
  );
}

export default async function NewClientPage() {
  const member = await getCurrentOrganizationMember();

  async function createClient(formData: FormData) {
    "use server";

    const currentMember = await getCurrentOrganizationMember();
    if (!currentMember) {
      redirect("/app/leads-clients/clients");
    }

    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      redirect("/app/leads-clients/clients");
    }

    const firstName = String(formData.get("firstName") ?? "").trim();
    const lastName = String(formData.get("lastName") ?? "").trim();
    const companyName = String(formData.get("companyName") ?? "").trim();
    const useCompanyAsPrimary = String(formData.get("useCompanyAsPrimary") ?? "") === "on";
    const contactName = useCompanyAsPrimary ? companyName : `${firstName} ${lastName}`.trim() || companyName;

    const phoneRaw =
      String(formData.get("phoneMain") ?? "").trim() ||
      String(formData.get("phoneAccounts") ?? "").trim() ||
      String(formData.get("phoneSite") ?? "").trim();

    const emailRaw =
      String(formData.get("emailMain") ?? "").trim() ||
      String(formData.get("emailAccounts") ?? "").trim() ||
      String(formData.get("emailSite") ?? "").trim();

    const profileTags = formData
      .getAll("profileTags")
      .map((value) => String(value))
      .filter((tag): tag is (typeof PROFILE_TAGS)[number] => PROFILE_TAGS.includes(tag as (typeof PROFILE_TAGS)[number]));

    const customTag = String(formData.get("customTag") ?? "").trim();
    const tags = profileTags.filter((tag) => tag !== "Custom");

    if (profileTags.includes("Custom") && customTag) {
      tags.push(customTag);
    }

    if (!contactName) {
      redirect("/app/leads-clients/clients/new?error=missing-contact-name");
    }

    if (!companyName) {
      redirect("/app/leads-clients/clients/new?error=missing-company-name");
    }

    const { error } = await supabase.from("organization_clients").insert({
      organization_id: currentMember.organization_id,
      created_by: user.id,
      name: contactName,
      company_name: companyName,
      email: emailRaw || null,
      phone: phoneRaw || null,
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
    <main className="space-y-4 pb-8">
      <Button
        variant="ghost"
        size="sm"
        asChild
        className={`${interMedium.className} h-8 rounded-[6px] px-2 text-xs font-medium text-[#667085] hover:bg-transparent hover:text-[#344054]`}
      >
        <Link href="/app/leads-clients/clients">
          <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
          Back to Clients
        </Link>
      </Button>

      <Card className="border-[#E6EAF0] bg-[#F8F9FC] shadow-none">
        <CardHeader className="pb-3 pt-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="text-2xl font-semibold tracking-[-0.02em] text-[#0F172A]">Add Client</CardTitle>
              <p className={`${interMedium.className} mt-1 text-sm font-medium text-[#5F7390]`}>
                Create a client record for lead and project tracking.
              </p>
            </div>
          </div>
        </CardHeader>
      </Card>

      <Card className="border-[#E6EAF0] bg-[#F8F9FC] shadow-none">
        <CardContent className="p-5">
          <form action={createClient} className="space-y-6">
            <section className="space-y-4 rounded-[10px] border border-[#E2E8F0] bg-white p-4 md:p-5">
              <SectionTitle title="Primary Contact" />
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1.5">
                  <label htmlFor="firstName" className={`${interMedium.className} text-xs font-semibold uppercase tracking-[0.1em] text-[#60748F]`}>
                    First Name
                  </label>
                  <Input id="firstName" name="firstName" placeholder="John" className="h-11 rounded-[6px]" />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="lastName" className={`${interMedium.className} text-xs font-semibold uppercase tracking-[0.1em] text-[#60748F]`}>
                    Last Name
                  </label>
                  <Input id="lastName" name="lastName" placeholder="Smith" className="h-11 rounded-[6px]" />
                </div>
                <div className="space-y-1.5 md:col-span-2">
                  <label htmlFor="companyName" className={`${interMedium.className} text-xs font-semibold uppercase tracking-[0.1em] text-[#60748F]`}>
                    Company Name
                  </label>
                  <Input id="companyName" name="companyName" required placeholder="Fletcher Construction Ltd" className="h-11 rounded-[6px]" />
                </div>
              </div>
              <label className={`${interMedium.className} inline-flex items-center gap-2 text-sm font-medium text-[#35567A]`}>
                <input type="checkbox" name="useCompanyAsPrimary" className="h-4 w-4 rounded border-[#C8D6E8]" />
                Use company as primary name
              </label>
            </section>

            <section className="space-y-4 rounded-[10px] border border-[#E2E8F0] bg-white p-4 md:p-5">
              <SectionTitle title="Communication" />
              <div className="space-y-3">
                <p className={`${interMedium.className} text-xs font-semibold uppercase tracking-[0.1em] text-[#60748F]`}>Phone(s)</p>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-1.5">
                    <label htmlFor="phoneMain" className={`${interMedium.className} text-xs font-semibold uppercase tracking-[0.1em] text-[#60748F]`}>
                      Main
                    </label>
                    <Input id="phoneMain" name="phoneMain" placeholder="+64 21 123 4567" className="h-11 rounded-[6px]" />
                  </div>
                </div>
                <details className="group rounded-[8px] border border-dashed border-[#D5E0EE] p-3">
                  <summary className={`${interMedium.className} cursor-pointer list-none text-xs font-semibold text-[#F74917]`}>
                    + Add phone
                  </summary>
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <div className="space-y-1.5">
                      <label htmlFor="phoneAccounts" className={`${interMedium.className} text-xs font-semibold uppercase tracking-[0.1em] text-[#60748F]`}>
                        Accounts
                      </label>
                      <Input id="phoneAccounts" name="phoneAccounts" placeholder="+64 9 123 0001" className="h-11 rounded-[6px]" />
                    </div>
                    <div className="space-y-1.5">
                      <label htmlFor="phoneSite" className={`${interMedium.className} text-xs font-semibold uppercase tracking-[0.1em] text-[#60748F]`}>
                        Site
                      </label>
                      <Input id="phoneSite" name="phoneSite" placeholder="+64 27 555 1024" className="h-11 rounded-[6px]" />
                    </div>
                  </div>
                </details>
              </div>

              <div className="space-y-3">
                <p className={`${interMedium.className} text-xs font-semibold uppercase tracking-[0.1em] text-[#60748F]`}>Email(s)</p>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-1.5">
                    <label htmlFor="emailMain" className={`${interMedium.className} text-xs font-semibold uppercase tracking-[0.1em] text-[#60748F]`}>
                      Main
                    </label>
                    <Input id="emailMain" name="emailMain" type="email" placeholder="estimating@client.co.nz" className="h-11 rounded-[6px]" />
                    <label className={`${interMedium.className} inline-flex items-center gap-2 text-xs font-medium text-[#35567A]`}>
                      <input type="checkbox" name="receivesMessagesMain" className="h-3.5 w-3.5 rounded border-[#C8D6E8]" defaultChecked />
                      Receives messages
                    </label>
                  </div>
                </div>
                <details className="group rounded-[8px] border border-dashed border-[#D5E0EE] p-3">
                  <summary className={`${interMedium.className} cursor-pointer list-none text-xs font-semibold text-[#F74917]`}>
                    + Add email
                  </summary>
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <div className="space-y-1.5">
                      <label htmlFor="emailAccounts" className={`${interMedium.className} text-xs font-semibold uppercase tracking-[0.1em] text-[#60748F]`}>
                        Accounts
                      </label>
                      <Input id="emailAccounts" name="emailAccounts" type="email" placeholder="accounts@client.co.nz" className="h-11 rounded-[6px]" />
                      <label className={`${interMedium.className} inline-flex items-center gap-2 text-xs font-medium text-[#35567A]`}>
                        <input type="checkbox" name="receivesMessagesAccounts" className="h-3.5 w-3.5 rounded border-[#C8D6E8]" />
                        Receives messages
                      </label>
                    </div>
                    <div className="space-y-1.5">
                      <label htmlFor="emailSite" className={`${interMedium.className} text-xs font-semibold uppercase tracking-[0.1em] text-[#60748F]`}>
                        Site
                      </label>
                      <Input id="emailSite" name="emailSite" type="email" placeholder="site@client.co.nz" className="h-11 rounded-[6px]" />
                      <label className={`${interMedium.className} inline-flex items-center gap-2 text-xs font-medium text-[#35567A]`}>
                        <input type="checkbox" name="receivesMessagesSite" className="h-3.5 w-3.5 rounded border-[#C8D6E8]" />
                        Receives messages
                      </label>
                    </div>
                  </div>
                </details>
              </div>
            </section>

            <section className="space-y-4 rounded-[10px] border border-[#E2E8F0] bg-white p-4 md:p-5">
              <SectionTitle title="Client Profile" />
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1.5">
                  <label htmlFor="clientType" className={`${interMedium.className} text-xs font-semibold uppercase tracking-[0.1em] text-[#60748F]`}>
                    Client Type
                  </label>
                  <select
                    id="clientType"
                    name="clientType"
                    className="h-11 w-full rounded-[6px] border border-input bg-background px-3 text-sm ring-offset-background"
                    defaultValue=""
                  >
                    <option value="" disabled>
                      Select type
                    </option>
                    {CLIENT_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="clientStatus" className={`${interMedium.className} text-xs font-semibold uppercase tracking-[0.1em] text-[#60748F]`}>
                    Client Status
                  </label>
                  <select
                    id="clientStatus"
                    name="clientStatus"
                    className="h-11 w-full rounded-[6px] border border-input bg-background px-3 text-sm ring-offset-background"
                    defaultValue=""
                  >
                    <option value="" disabled>
                      Select status
                    </option>
                    {CLIENT_STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="space-y-2">
                <p className={`${interMedium.className} text-xs font-semibold uppercase tracking-[0.1em] text-[#60748F]`}>Tags</p>
                <div className="flex flex-wrap gap-2">
                  {PROFILE_TAGS.map((tag) => (
                    <label
                      key={tag}
                      className={`${interMedium.className} inline-flex cursor-pointer items-center gap-2 rounded-[6px] border border-[#D5E0EE] bg-[#F8FAFC] px-3 py-1.5 text-xs font-medium text-[#35567A]`}
                    >
                      <input type="checkbox" name="profileTags" value={tag} className="h-3.5 w-3.5 rounded-[6px] border-[#C8D6E8]" />
                      {tag}
                    </label>
                  ))}
                </div>
                <div className="max-w-sm space-y-1.5">
                  <label htmlFor="customTag" className={`${interMedium.className} text-xs font-semibold uppercase tracking-[0.1em] text-[#60748F]`}>
                    Custom Tag
                  </label>
                  <Input id="customTag" name="customTag" placeholder="VIP Renovations" className="h-11 rounded-[6px]" />
                </div>
              </div>
            </section>

            <section className="space-y-4 rounded-[10px] border border-[#E2E8F0] bg-white p-4 md:p-5">
              <SectionTitle title="Financial Settings" />
              <div className="grid gap-3 md:grid-cols-3">
                <div className="space-y-1.5">
                  <label htmlFor="paymentTerms" className={`${interMedium.className} text-xs font-semibold uppercase tracking-[0.1em] text-[#60748F]`}>
                    Payment Terms
                  </label>
                  <select
                    id="paymentTerms"
                    name="paymentTerms"
                    className="h-11 w-full rounded-[6px] border border-input bg-background px-3 text-sm ring-offset-background"
                    defaultValue=""
                  >
                    <option value="" disabled>
                      Select terms
                    </option>
                    {PAYMENT_TERMS.map((term) => (
                      <option key={term} value={term}>
                        {term}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="creditRisk" className={`${interMedium.className} text-xs font-semibold uppercase tracking-[0.1em] text-[#60748F]`}>
                    Credit Risk
                  </label>
                  <select
                    id="creditRisk"
                    name="creditRisk"
                    className="h-11 w-full rounded-[6px] border border-input bg-background px-3 text-sm ring-offset-background"
                    defaultValue=""
                  >
                    <option value="" disabled>
                      Select risk
                    </option>
                    {CREDIT_RISKS.map((risk) => (
                      <option key={risk} value={risk}>
                        {risk}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label
                    htmlFor="defaultMarginPercent"
                    className={`${interMedium.className} text-xs font-semibold uppercase tracking-[0.1em] text-[#60748F]`}
                  >
                    Default Margin %
                  </label>
                  <Input
                    id="defaultMarginPercent"
                    name="defaultMarginPercent"
                    inputMode="decimal"
                    placeholder="e.g. 18"
                    className="h-11 rounded-[6px]"
                  />
                </div>
              </div>
            </section>

            <section className="space-y-4 rounded-[10px] border border-[#E2E8F0] bg-white p-4 md:p-5">
              <SectionTitle title="Project Locations" description="Add one or more known site addresses for this client." />
              <div className="space-y-3 rounded-[8px] border border-[#E6EAF0] p-3">
                <p className={`${interMedium.className} text-xs font-semibold uppercase tracking-[0.1em] text-[#60748F]`}>Primary Location</p>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-1.5 md:col-span-2">
                    <label htmlFor="siteAddress1" className={`${interMedium.className} text-xs font-semibold uppercase tracking-[0.1em] text-[#60748F]`}>
                      Address
                    </label>
                    <Input id="siteAddress1" name="siteAddress1" placeholder="123 Build Street" className="h-11 rounded-[6px]" />
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="siteCity1" className={`${interMedium.className} text-xs font-semibold uppercase tracking-[0.1em] text-[#60748F]`}>
                      City
                    </label>
                    <Input id="siteCity1" name="siteCity1" placeholder="Auckland" className="h-11 rounded-[6px]" />
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="siteRegion1" className={`${interMedium.className} text-xs font-semibold uppercase tracking-[0.1em] text-[#60748F]`}>
                      Region
                    </label>
                    <Input id="siteRegion1" name="siteRegion1" placeholder="Auckland" className="h-11 rounded-[6px]" />
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="siteCountry1" className={`${interMedium.className} text-xs font-semibold uppercase tracking-[0.1em] text-[#60748F]`}>
                      Country
                    </label>
                    <Input id="siteCountry1" name="siteCountry1" placeholder="New Zealand" className="h-11 rounded-[6px]" />
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="sitePostal1" className={`${interMedium.className} text-xs font-semibold uppercase tracking-[0.1em] text-[#60748F]`}>
                      Postal
                    </label>
                    <Input id="sitePostal1" name="sitePostal1" placeholder="1010" className="h-11 rounded-[6px]" />
                  </div>
                </div>
              </div>
              <details className="group rounded-[8px] border border-dashed border-[#D5E0EE] p-3">
                <summary className={`${interMedium.className} cursor-pointer list-none text-xs font-semibold text-[#F74917]`}>
                  + Add another address
                </summary>
                <div className="mt-3 space-y-3 rounded-[8px] border border-[#E6EAF0] p-3">
                  <p className={`${interMedium.className} text-xs font-semibold uppercase tracking-[0.1em] text-[#60748F]`}>Location 2</p>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-1.5 md:col-span-2">
                      <label htmlFor="siteAddress2" className={`${interMedium.className} text-xs font-semibold uppercase tracking-[0.1em] text-[#60748F]`}>
                        Address
                      </label>
                      <Input id="siteAddress2" name="siteAddress2" placeholder="22 Harbour Road" className="h-11 rounded-[6px]" />
                    </div>
                    <div className="space-y-1.5">
                      <label htmlFor="siteCity2" className={`${interMedium.className} text-xs font-semibold uppercase tracking-[0.1em] text-[#60748F]`}>
                        City
                      </label>
                      <Input id="siteCity2" name="siteCity2" placeholder="Wellington" className="h-11 rounded-[6px]" />
                    </div>
                    <div className="space-y-1.5">
                      <label htmlFor="siteRegion2" className={`${interMedium.className} text-xs font-semibold uppercase tracking-[0.1em] text-[#60748F]`}>
                        Region
                      </label>
                      <Input id="siteRegion2" name="siteRegion2" placeholder="Wellington" className="h-11 rounded-[6px]" />
                    </div>
                    <div className="space-y-1.5">
                      <label htmlFor="siteCountry2" className={`${interMedium.className} text-xs font-semibold uppercase tracking-[0.1em] text-[#60748F]`}>
                        Country
                      </label>
                      <Input id="siteCountry2" name="siteCountry2" placeholder="New Zealand" className="h-11 rounded-[6px]" />
                    </div>
                    <div className="space-y-1.5">
                      <label htmlFor="sitePostal2" className={`${interMedium.className} text-xs font-semibold uppercase tracking-[0.1em] text-[#60748F]`}>
                        Postal
                      </label>
                      <Input id="sitePostal2" name="sitePostal2" placeholder="6011" className="h-11 rounded-[6px]" />
                    </div>
                  </div>
                </div>
              </details>
            </section>

            <section className="space-y-4 rounded-[10px] border border-[#E2E8F0] bg-white p-4 md:p-5">
              <SectionTitle title="Lead Information" />
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1.5">
                  <label htmlFor="leadSource" className={`${interMedium.className} text-xs font-semibold uppercase tracking-[0.1em] text-[#60748F]`}>
                    Lead Source
                  </label>
                  <Input id="leadSource" name="leadSource" placeholder="Referral / Website / Social / Tender" className="h-11 rounded-[6px]" />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="referredBy" className={`${interMedium.className} text-xs font-semibold uppercase tracking-[0.1em] text-[#60748F]`}>
                    Referred By (Optional)
                  </label>
                  <Input id="referredBy" name="referredBy" placeholder="Sarah from Apex Plumbing" className="h-11 rounded-[6px]" />
                </div>
              </div>
            </section>

            <section className="space-y-4 rounded-[10px] border border-[#E2E8F0] bg-white p-4 md:p-5">
              <SectionTitle title="Notes" description="Capture context about preferences, risk, and relationship history." />
              <div className="space-y-1.5">
                <label htmlFor="notes" className={`${interMedium.className} text-xs font-semibold uppercase tracking-[0.1em] text-[#60748F]`}>
                  Notes
                </label>
                <textarea
                  id="notes"
                  name="notes"
                  rows={5}
                  placeholder="Any context that helps future project and sales conversations."
                  className="w-full rounded-[6px] border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                />
              </div>
            </section>

            <div className="flex items-center justify-end gap-2 pt-1">
              <Button variant="outline" asChild className="h-10 rounded-[6px] border-[#D6DFEB] px-4 text-sm">
                <Link href="/app/leads-clients/clients">Cancel</Link>
              </Button>
              <Button type="submit" className="h-10 rounded-[6px] bg-[#F74917] px-4 text-sm text-white hover:bg-[#e63f10]">
                Save Client
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
