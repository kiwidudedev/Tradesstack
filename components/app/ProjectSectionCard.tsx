import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { interMedium } from "@/lib/fonts";

interface ProjectSectionCardProps {
  title: string;
  description: string;
}

export function ProjectSectionCard({ title, description }: ProjectSectionCardProps) {
  return (
    <main className="space-y-8 pb-8">
      <Card className="relative overflow-hidden border-[#E6EAF0] bg-[#F8F9FC] shadow-none">
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
