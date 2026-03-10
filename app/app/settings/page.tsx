import { Inter } from "next/font/google";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const interMedium = Inter({
  subsets: ["latin"],
  weight: ["500"],
  display: "swap",
});

export default function SettingsPage() {
  return (
    <main className="space-y-8 pb-8">
      <Card className="relative overflow-hidden border-[#E6EAF0] bg-white shadow-none">
        <CardHeader className="pb-4 pt-7">
          <CardTitle className="text-2xl font-semibold tracking-[-0.02em] text-[#0F172A]">Settings</CardTitle>
        </CardHeader>
        <CardContent>
          <p className={`${interMedium.className} max-w-2xl text-base font-medium leading-relaxed text-[#4d5b74]`}>
            Configure organization preferences, user management rules, and platform defaults from this settings area.
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
