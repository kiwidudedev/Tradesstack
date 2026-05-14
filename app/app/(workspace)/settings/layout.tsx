import { SettingsTabs } from "./SettingsTabs";
import { SettingsHeaderActions } from "./SettingsHeaderActions";
import { ibmPlexSans } from "@/lib/fonts";

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className={`${ibmPlexSans.variable} ${ibmPlexSans.className} -mb-8 w-full space-y-6 pb-8`}>
      <section className="grid gap-4 pt-[25px] lg:grid-cols-[240px_minmax(0,672px)] lg:gap-8">
        <div>
          <h1 className="m-0 text-[clamp(1.24rem,2.24vw,2.08rem)] font-bold leading-[0.98] tracking-[-0.04em] text-[var(--text-primary)]">
            Settings
          </h1>
        </div>
        <div className="flex items-start justify-end gap-4">
          <SettingsHeaderActions />
        </div>
      </section>

      <section className="flex flex-col gap-8 lg:flex-row lg:items-stretch">
        <aside className="w-full shrink-0 lg:sticky lg:top-6 lg:self-start lg:w-[240px]">
          <SettingsTabs />
        </aside>

        <div className="min-w-0 max-w-[672px] flex-1">
          {children}
        </div>
      </section>
    </main>
  );
}
