import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { interMedium } from "@/lib/fonts";

interface ProjectModulePlaceholderProps {
  title: string;
  description: string;
  bullets?: string[];
  ctaLabel?: string;
}

export function ProjectModulePlaceholder({
  title,
  description,
  bullets = [],
  ctaLabel = "Coming soon",
}: ProjectModulePlaceholderProps) {
  return (
    <main className="app-canvas space-y-6 pb-8">
      <Card className="app-surface app-surface-border relative overflow-hidden shadow-none">
        <CardHeader className="pt-7">
          <CardTitle className="text-2xl font-semibold tracking-[-0.02em] text-[#0F172A]">
            {title}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className={`${interMedium.className} max-w-3xl text-base font-medium leading-relaxed text-[#4F5F79]`}>
            {description}
          </p>
        </CardContent>
      </Card>

      <Card className="relative overflow-hidden border-[#D9E3EE] bg-white shadow-[0_1px_2px_rgba(15,23,42,0.05)]">
        <CardHeader className="pb-3">
          <CardTitle className="text-xl font-semibold tracking-[-0.02em] text-[#0F172A]">
            Nothing tracked here yet
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <p className={`${interMedium.className} max-w-2xl text-sm font-medium text-[#64748B]`}>
            This area is set up as a placeholder so the project team can start shaping the
            workflow without adding full health and safety tooling yet.
          </p>
          <Button
            type="button"
            disabled
            className="h-10 rounded-[10px] bg-[#F15A29] px-4 text-sm font-semibold text-white opacity-100 disabled:cursor-default disabled:opacity-100"
          >
            {ctaLabel}
          </Button>
        </CardContent>
      </Card>

      {bullets.length > 0 ? (
        <Card className="relative overflow-hidden border-[#D9E3EE] bg-[#FCFDFE] shadow-none">
          <CardHeader className="pb-3">
            <CardTitle className="text-xl font-semibold tracking-[-0.02em] text-[#0F172A]">
              What will live here later
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 md:grid-cols-2">
              {bullets.map((bullet) => (
                <div
                  key={bullet}
                  className="rounded-[14px] border border-[#E6EDF5] bg-white px-4 py-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
                >
                  <p className={`${interMedium.className} text-sm font-medium text-[#334155]`}>
                    {bullet}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}
    </main>
  );
}
