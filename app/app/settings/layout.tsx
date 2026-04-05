import { SettingsTabs } from "./SettingsTabs";
import { SettingsHeaderActions } from "./SettingsHeaderActions";

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="-mb-8 w-full space-y-6 pb-8">
      <section className="flex items-start justify-between gap-4">
        <h1 className="text-[38px] font-semibold leading-[0.98] tracking-[-0.03em] text-[#101828] sm:text-[44px]">Settings</h1>
        <SettingsHeaderActions />
      </section>

      <SettingsTabs />

      {children}
    </main>
  );
}
