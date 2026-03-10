import { cn } from "@/lib/utils";

type HeadingTag = "h2" | "h3";

interface SectionHeaderProps {
  eyebrow?: string;
  title: string;
  description?: string;
  titleTag?: HeadingTag;
  className?: string;
}

export function SectionHeader({
  eyebrow,
  title,
  description,
  titleTag = "h2",
  className,
}: SectionHeaderProps) {
  const Heading = titleTag;

  return (
    <div className={cn("space-y-2", className)}>
      {eyebrow ? (
        <p className="font-body text-xs font-medium uppercase tracking-[0.2em] text-[#5a0a06]/80">
          {eyebrow}
        </p>
      ) : null}
      <Heading className="font-heading text-2xl font-semibold tracking-tight text-[#1f2833] sm:text-3xl">
        {title}
      </Heading>
      {description ? (
        <p className="max-w-3xl font-body text-sm leading-relaxed text-[#1f2833]/80 sm:text-base">
          {description}
        </p>
      ) : null}
    </div>
  );
}
