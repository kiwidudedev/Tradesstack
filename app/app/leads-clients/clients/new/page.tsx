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

const CLIENT_TAGS = ["Good Client", "High Value", "Difficult", "Slow Payer"] as const;

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

    const name = String(formData.get("name") ?? "").trim();
    const companyName = String(formData.get("companyName") ?? "").trim();
    const emailRaw = String(formData.get("email") ?? "").trim();
    const phoneRaw = String(formData.get("phone") ?? "").trim();
    const tags = formData
      .getAll("tags")
      .map((value) => String(value))
      .filter((tag): tag is (typeof CLIENT_TAGS)[number] => CLIENT_TAGS.includes(tag as (typeof CLIENT_TAGS)[number]));

    if (!name) {
      redirect("/app/leads-clients/clients/new?error=missing-name");
    }

    const { error } = await supabase.from("organization_clients").insert({
      organization_id: currentMember.organization_id,
      created_by: user.id,
      name,
      company_name: companyName || null,
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
          <form action={createClient} className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1.5">
                <label htmlFor="name" className={`${interMedium.className} text-xs font-semibold uppercase tracking-[0.1em] text-[#60748F]`}>
                  Client Name
                </label>
                <Input id="name" name="name" required placeholder="Fletcher Construction" className="h-11 rounded-[6px]" />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="companyName" className={`${interMedium.className} text-xs font-semibold uppercase tracking-[0.1em] text-[#60748F]`}>
                  Company
                </label>
                <Input id="companyName" name="companyName" placeholder="Fletcher Construction Ltd" className="h-11 rounded-[6px]" />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="email" className={`${interMedium.className} text-xs font-semibold uppercase tracking-[0.1em] text-[#60748F]`}>
                  Email
                </label>
                <Input id="email" name="email" type="email" placeholder="estimating@client.co.nz" className="h-11 rounded-[6px]" />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="phone" className={`${interMedium.className} text-xs font-semibold uppercase tracking-[0.1em] text-[#60748F]`}>
                  Phone
                </label>
                <Input id="phone" name="phone" placeholder="+64 21 123 4567" className="h-11 rounded-[6px]" />
              </div>
            </div>
            <div className="space-y-2">
              <p className={`${interMedium.className} text-xs font-semibold uppercase tracking-[0.1em] text-[#60748F]`}>Client Tags</p>
              <div className="flex flex-wrap gap-2">
                {CLIENT_TAGS.map((tag) => (
                  <label
                    key={tag}
                    className={`${interMedium.className} inline-flex cursor-pointer items-center gap-2 rounded-[6px] border border-[#D5E0EE] bg-[#F8FAFC] px-3 py-1.5 text-xs font-medium text-[#35567A]`}
                  >
                    <input type="checkbox" name="tags" value={tag} className="h-3.5 w-3.5 rounded-[6px] border-[#C8D6E8]" />
                    {tag}
                  </label>
                ))}
              </div>
            </div>

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
