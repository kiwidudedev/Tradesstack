import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { interMedium } from "@/lib/fonts";

interface ProjectSectionCardProps {
  title: string;
  description: string;
}

export function ProjectSectionCard({ title, description }: ProjectSectionCardProps) {
  return (
    <main className="space-y-8 pb-8">
      <Card className="relative overflow-hidden border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-sm)]">
        <CardHeader className="pt-7">
          <CardTitle className="text-2xl font-semibold tracking-[-0.02em] text-[var(--text-primary)]">{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className={`${interMedium.className} max-w-3xl text-base font-medium leading-relaxed text-[var(--text-secondary)]`}>{description}</p>
        </CardContent>
      </Card>
    </main>
  );
}
