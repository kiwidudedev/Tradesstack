import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { interMedium } from "@/lib/fonts";

export function TodaysTodosCard({ userName }: { userName: string }) {
  return (
    <Card className="relative overflow-hidden rounded-none border-0 bg-transparent shadow-none">
      <CardHeader className="px-0 pb-5 pt-0">
        <CardTitle className="text-2xl font-semibold tracking-[-0.02em] text-[#0F172A]">Today&apos;s To Do&apos;s</CardTitle>
      </CardHeader>
      <CardContent className="rounded-[12px] border border-dashed border-[#c8cfdd] bg-white px-5 py-5">
        <p className={`${interMedium.className} text-base font-semibold text-[#0F172A]`}>{userName}&apos;s list will appear here.</p>
        <p className={`${interMedium.className} mt-1 text-sm font-medium text-[#64748B]`}>
          Placeholder: this section will show personalized tasks for today once to-do logic is connected.
        </p>
      </CardContent>
    </Card>
  );
}
