import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Inter } from "next/font/google";

const interMedium = Inter({
  subsets: ["latin"],
  weight: ["500"],
  display: "swap",
});

interface ProjectSectionCardProps {
  title: string;
  description: string;
}

export function ProjectSectionCard({ title, description }: ProjectSectionCardProps) {
  return (
    <main className="space-y-8 pb-8">
      <Card className="relative overflow-hidden border-[#E6EAF0] bg-white shadow-none">
        <CardHeader className="pt-7">
          <CardTitle className="text-2xl font-semibold tracking-[-0.02em] text-[#0F172A]">{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className={`${interMedium.className} max-w-3xl text-base font-medium leading-relaxed text-[#4f5f79]`}>{description}</p>
        </CardContent>
      </Card>
    </main>
  );
}
