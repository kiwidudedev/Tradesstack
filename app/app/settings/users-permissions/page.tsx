import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { interMedium } from "@/lib/fonts";
import { getSettingsContext } from "../settings-data";

export default async function UsersPermissionsPage() {
  const { currentMember, memberRows } = await getSettingsContext();

  return (
    <Card className="rounded-[32px] border border-[#d9dee5] bg-[#F6F7F9] shadow-none">
      <CardHeader className="pb-2 pt-7">
        <CardTitle className="text-[30px] font-semibold leading-tight tracking-[-0.02em] text-[#0F172A] sm:text-[32px]">
          Organization Users
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!currentMember ? (
          <p className={`${interMedium.className} text-sm text-[#5f6f89]`}>You must be signed in to view organization users.</p>
        ) : memberRows.length === 0 ? (
          <p className={`${interMedium.className} text-sm text-[#5f6f89]`}>No users found for this organization yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-[12px] border border-[#E2E8F0] bg-[#F8F9FC]">
            <table className="min-w-full border-collapse text-left">
              <thead className="bg-[#F2F4F7] text-xs uppercase tracking-[0.08em] text-[#6B7A90]">
                <tr>
                  <th className="px-5 py-3.5 font-semibold">Name</th>
                  <th className="px-5 py-3.5 font-semibold">Role</th>
                  <th className="px-5 py-3.5 font-semibold">User ID</th>
                </tr>
              </thead>
              <tbody className="text-[15px] text-[#1d2433]">
                {memberRows.map((member) => (
                  <tr key={member.id} className="border-t border-[#E2E8F0]">
                    <td className="px-5 py-3.5 font-medium">{member.display_name?.trim() || "Unnamed user"}</td>
                    <td className="px-5 py-3.5 capitalize">{member.role}</td>
                    <td className="px-5 py-3.5 font-mono text-xs text-[#607089]">{member.user_id}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
