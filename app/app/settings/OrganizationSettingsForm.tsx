"use client";

import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { interMedium } from "@/lib/fonts";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

interface OrganizationSettingsFormProps {
  organizationId: string;
  initialName: string;
  initialLogoPath: string | null;
  initialLogoUrl: string | null;
  initialBrandPrimaryColor?: string | null;
  initialBrandAccentColor?: string | null;
  initialBusinessNumber?: string | null;
  initialBankAccountDetails?: string | null;
  initialGstNumber?: string | null;
  initialAddressLine1?: string | null;
  initialAddressLine2?: string | null;
  initialCity?: string | null;
  initialPostcode?: string | null;
  initialCountry?: string | null;
  initialContactName?: string | null;
  initialContactEmail?: string | null;
  initialContactPhone?: string | null;
  initialDefaultCurrency?: string | null;
  initialTimezone?: string | null;
  initialDefaultTaxMode?: string | null;
  initialDefaultTaxRate?: number | null;
  canEdit: boolean;
}

const DEFAULT_BRAND_PRIMARY_COLOR = "#0B2739";
const ALLOWED_LOGO_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

function normalizeHexColor(value: string | null | undefined, fallback: string) {
  const normalized = (value ?? "").trim();
  return /^#(?:[0-9a-fA-F]{3}){1,2}$/.test(normalized) ? normalized : fallback;
}

function toSettingsErrorMessage(error: {
  message: string;
  code?: string;
  details?: string;
  hint?: string;
}) {
  const parts = [error.message];
  if (error.code) {
    parts.push(`code=${error.code}`);
  }
  if (error.details) {
    parts.push(`details=${error.details}`);
  }
  if (error.hint) {
    parts.push(`hint=${error.hint}`);
  }
  return parts.join(" | ");
}

function buildLogoPath(organizationId: string, fileName: string) {
  const ext = fileName.includes(".") ? fileName.split(".").pop()?.toLowerCase() ?? "png" : "png";
  return `${organizationId}/logo-${crypto.randomUUID()}.${ext}`;
}

export function OrganizationSettingsForm(props: OrganizationSettingsFormProps) {
  const [name, setName] = useState(props.initialName);
  const [logoPath, setLogoPath] = useState<string | null>(props.initialLogoPath);
  const [logoUrl, setLogoUrl] = useState<string | null>(props.initialLogoUrl);
  const [brandPrimaryColor, setBrandPrimaryColor] = useState(
    normalizeHexColor(props.initialBrandPrimaryColor, DEFAULT_BRAND_PRIMARY_COLOR),
  );
  const [brandAccentColor, setBrandAccentColor] = useState(props.initialBrandAccentColor?.trim() || "#F74917");
  const [businessNumber, setBusinessNumber] = useState(props.initialBusinessNumber?.trim() || "");
  const [gstNumber, setGstNumber] = useState(props.initialGstNumber?.trim() || "");
  const [bankAccountDetails, setBankAccountDetails] = useState(props.initialBankAccountDetails?.trim() || "");
  const [addressLine1, setAddressLine1] = useState(props.initialAddressLine1?.trim() || "");
  const [addressLine2, setAddressLine2] = useState(props.initialAddressLine2?.trim() || "");
  const [city, setCity] = useState(props.initialCity?.trim() || "");
  const [postcode, setPostcode] = useState(props.initialPostcode?.trim() || "");
  const [country, setCountry] = useState(props.initialCountry?.trim() || "New Zealand");
  const [contactName, setContactName] = useState(props.initialContactName?.trim() || "");
  const [contactEmail, setContactEmail] = useState(props.initialContactEmail?.trim() || "");
  const [contactPhone, setContactPhone] = useState(props.initialContactPhone?.trim() || "");
  const [defaultCurrency, setDefaultCurrency] = useState(props.initialDefaultCurrency?.trim() || "NZD");
  const [timezone, setTimezone] = useState(props.initialTimezone?.trim() || "Pacific/Auckland");
  const [defaultTaxMode, setDefaultTaxMode] = useState(props.initialDefaultTaxMode?.trim() || "GST Inclusive");
  const [defaultTaxRate, setDefaultTaxRate] = useState(
    props.initialDefaultTaxRate != null ? String(props.initialDefaultTaxRate) : "15",
  );
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const supabase = useMemo(() => {
    try {
      return createBrowserSupabaseClient();
    } catch {
      return null;
    }
  }, []);

  const onSaveName = async () => {
    if (!supabase) {
      setError("Supabase is not configured.");
      return;
    }

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Organization name is required.");
      return;
    }

    setIsSaving(true);
    setError(null);
    setMessage(null);

    const parsedTaxRate = Number(defaultTaxRate);
    const normalizedTaxRate = Number.isFinite(parsedTaxRate) ? parsedTaxRate : null;

    const { error: updateError } = await supabase
      .rpc("update_organization_settings" as never, {
        p_organization_id: props.organizationId,
        p_name: trimmedName,
        p_logo_path: null,
        p_brand_primary_color: normalizeHexColor(brandPrimaryColor, DEFAULT_BRAND_PRIMARY_COLOR),
        p_brand_accent_color: brandAccentColor.trim() || null,
        p_business_number: businessNumber.trim() || null,
        p_bank_account_details: bankAccountDetails.trim() || null,
        p_gst_number: gstNumber.trim() || null,
        p_address_line_1: addressLine1.trim() || null,
        p_address_line_2: addressLine2.trim() || null,
        p_city: city.trim() || null,
        p_postcode: postcode.trim() || null,
        p_country: country.trim() || null,
        p_contact_name: contactName.trim() || null,
        p_contact_email: contactEmail.trim() || null,
        p_contact_phone: contactPhone.trim() || null,
        p_default_currency: defaultCurrency.trim() || null,
        p_timezone: timezone.trim() || null,
        p_default_tax_mode: defaultTaxMode.trim() || null,
        p_default_tax_rate: normalizedTaxRate,
      } as never);

    if (updateError) {
      setError(toSettingsErrorMessage(updateError));
    } else {
      setMessage("Settings Saved.");
    }

    setIsSaving(false);
  };

  const onUploadLogo = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!supabase) {
      setError("Supabase is not configured.");
      return;
    }

    const file = event.target.files?.[0];
    event.currentTarget.value = "";
    if (!file) {
      return;
    }

    if (!ALLOWED_LOGO_MIME_TYPES.has(file.type)) {
      setError("Please upload a PNG, JPEG, or WebP logo.");
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setError("Logo must be under 10MB.");
      return;
    }

    setIsUploading(true);
    setError(null);
    setMessage(null);

    const nextPath = buildLogoPath(props.organizationId, file.name);
    const { error: uploadError } = await supabase.storage.from("organization-logos").upload(nextPath, file, {
      upsert: true,
      contentType: file.type,
      cacheControl: "3600",
    });

    if (uploadError) {
      setError(toSettingsErrorMessage(uploadError));
      setIsUploading(false);
      return;
    }

    const { error: updateError } = await supabase
      .rpc("update_organization_settings" as never, {
        p_organization_id: props.organizationId,
        p_name: null,
        p_logo_path: nextPath,
        p_brand_primary_color: null,
        p_bank_account_details: null,
        p_gst_number: null,
      } as never);

    if (updateError) {
      setError(toSettingsErrorMessage(updateError));
      setIsUploading(false);
      return;
    }

    if (logoPath && logoPath !== nextPath) {
      await supabase.storage.from("organization-logos").remove([logoPath]);
    }

    const { data } = supabase.storage.from("organization-logos").getPublicUrl(nextPath);
    setLogoPath(nextPath);
    setLogoUrl(data.publicUrl);
    setMessage("Logo uploaded.");
    setIsUploading(false);
  };


  return (
    <form
      id="organization-settings-form"
      onSubmit={(event) => {
        event.preventDefault();
        void onSaveName();
      }}
    >
      <section className="overflow-visible bg-transparent px-0 pb-0 pt-0">
        <div className="max-w-[672px] space-y-5">
          <div className="pb-1 pt-1">
            <p className="text-[24px] font-semibold leading-[1.15] tracking-[-0.02em] text-[#1d2433]">
              Organization
            </p>
          </div>

          {error ? (
            <p className={`${interMedium.className} rounded-[10px] border border-[#f1c5c5] bg-[#fff1f1] px-3 py-2 text-sm text-[#8f2d2d]`}>{error}</p>
          ) : null}
          {message ? (
            <p className={`${interMedium.className} rounded-[10px] border border-[#c5dfc1] bg-[#f1faf0] px-3 py-2 text-sm text-[#2d6b35]`}>{message}</p>
          ) : null}

          {/* Company Profile */}
          <div className="overflow-hidden rounded-[22px] border border-[#D9DEE5] bg-white px-5 pb-5 pt-4">
            <div className="pb-4">
              <h3 className="text-[19px] font-semibold leading-[1.1] tracking-[-0.02em] text-[#1d2433]">Company Profile</h3>
            </div>

            <div className="space-y-3">
                <div className="max-w-[220px] space-y-1.5">
                  <p className={`${interMedium.className} text-[12px] font-semibold uppercase tracking-[0.08em] text-[#64748B]`}>Company logo</p>
                  <label className="group block">
                    <input
                      type="file"
                        accept="image/png,image/jpeg,image/webp"
                      onChange={onUploadLogo}
                      disabled={!props.canEdit || isUploading}
                      className="hidden"
                    />
                    <span
                      className={`relative flex h-20 w-full items-center justify-center overflow-hidden rounded-[10px] border border-[#d8e0ec] bg-white transition-colors ${
                        !props.canEdit || isUploading
                          ? "cursor-not-allowed opacity-70"
                          : "cursor-pointer group-hover:border-[#9fb2ce] group-hover:bg-[#e9edf3]"
                      }`}
                    >
                      {logoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={logoUrl} alt="Organization logo" className="h-full w-full object-contain" />
                      ) : (
                        <span className={`${interMedium.className} text-[10px] text-[#72839d]`}>No logo uploaded</span>
                      )}
                      <span
                        className={`${interMedium.className} pointer-events-none absolute inset-0 inline-flex items-center justify-center text-[13px] font-semibold text-[#1d2433] transition-opacity ${
                          !props.canEdit || isUploading ? "opacity-0" : "opacity-0 group-hover:opacity-100"
                        }`}
                      >
                        {isUploading ? "Uploading..." : logoUrl ? "Change logo" : "Upload logo"}
                      </span>
                    </span>
                  </label>
                </div>

                <div className="grid gap-2.5 md:grid-cols-2">
                  <div className="space-y-1.5 md:col-span-2">
                    <label className={`${interMedium.className} text-[12px] font-semibold uppercase tracking-[0.08em] text-[#64748B]`}>Company name</label>
                    <Input
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      disabled={!props.canEdit || isSaving}
                      className={`${interMedium.className} h-10 rounded-[8px] border-[#D9DEE5] bg-white text-[14px] text-[#1d2433]`}
                    />
                  </div>

                  <div className="space-y-1.5 md:col-span-2">
                    <label className={`${interMedium.className} text-[12px] font-semibold uppercase tracking-[0.08em] text-[#64748B]`}>Address line 1</label>
                    <Input
                      value={addressLine1}
                      onChange={(event) => setAddressLine1(event.target.value)}
                      placeholder="Street number and name"
                      disabled={!props.canEdit || isSaving}
                      className={`${interMedium.className} h-10 rounded-[8px] border-[#D9DEE5] bg-white text-[14px] text-[#1d2433]`}
                    />
                  </div>

                  <div className="space-y-1.5 md:col-span-2">
                    <label className={`${interMedium.className} text-[12px] font-semibold uppercase tracking-[0.08em] text-[#64748B]`}>Address line 2</label>
                    <Input
                      value={addressLine2}
                      onChange={(event) => setAddressLine2(event.target.value)}
                      placeholder="Suburb, suite, or unit (optional)"
                      disabled={!props.canEdit || isSaving}
                      className={`${interMedium.className} h-10 rounded-[8px] border-[#D9DEE5] bg-white text-[14px] text-[#1d2433]`}
                    />
                  </div>

                  <div className="space-y-1.5 md:col-span-2">
                    <label className={`${interMedium.className} text-[12px] font-semibold uppercase tracking-[0.08em] text-[#64748B]`}>City</label>
                    <Input
                      value={city}
                      onChange={(event) => setCity(event.target.value)}
                      disabled={!props.canEdit || isSaving}
                      className={`${interMedium.className} h-10 rounded-[8px] border-[#D9DEE5] bg-white text-[14px] text-[#1d2433]`}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className={`${interMedium.className} text-[12px] font-semibold uppercase tracking-[0.08em] text-[#64748B]`}>Postcode</label>
                    <Input
                      value={postcode}
                      onChange={(event) => setPostcode(event.target.value)}
                      disabled={!props.canEdit || isSaving}
                      className={`${interMedium.className} h-10 rounded-[8px] border-[#D9DEE5] bg-white text-[14px] text-[#1d2433]`}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className={`${interMedium.className} text-[12px] font-semibold uppercase tracking-[0.08em] text-[#64748B]`}>Country</label>
                    <Input
                      value={country}
                      onChange={(event) => setCountry(event.target.value)}
                      disabled={!props.canEdit || isSaving}
                      className={`${interMedium.className} h-10 rounded-[8px] border-[#D9DEE5] bg-white text-[14px] text-[#1d2433]`}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className={`${interMedium.className} text-[12px] font-semibold uppercase tracking-[0.08em] text-[#64748B]`}>Contact name</label>
                    <Input
                      value={contactName}
                      onChange={(event) => setContactName(event.target.value)}
                      disabled={!props.canEdit || isSaving}
                      className={`${interMedium.className} h-10 rounded-[8px] border-[#D9DEE5] bg-white text-[14px] text-[#1d2433]`}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className={`${interMedium.className} text-[12px] font-semibold uppercase tracking-[0.08em] text-[#64748B]`}>Contact phone</label>
                    <Input
                      value={contactPhone}
                      onChange={(event) => setContactPhone(event.target.value)}
                      disabled={!props.canEdit || isSaving}
                      className={`${interMedium.className} h-10 rounded-[8px] border-[#D9DEE5] bg-white text-[14px] text-[#1d2433]`}
                    />
                  </div>

                  <div className="space-y-1.5 md:col-span-2">
                    <label className={`${interMedium.className} text-[12px] font-semibold uppercase tracking-[0.08em] text-[#64748B]`}>Contact email</label>
                    <Input
                      value={contactEmail}
                      onChange={(event) => setContactEmail(event.target.value)}
                      disabled={!props.canEdit || isSaving}
                      className={`${interMedium.className} h-10 rounded-[8px] border-[#D9DEE5] bg-white text-[14px] text-[#1d2433]`}
                    />
                  </div>
              </div>
            </div>
          </div>

          {/* Branding */}
          <div className="overflow-hidden rounded-[22px] border border-[#D9DEE5] bg-white px-5 pb-5 pt-4">
            <div className="pb-4">
              <h3 className="text-[19px] font-semibold leading-[1.1] tracking-[-0.02em] text-[#1d2433]">Branding</h3>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1.5">
                  <label className={`${interMedium.className} text-[12px] font-semibold uppercase tracking-[0.08em] text-[#64748B]`}>Brand primary colour</label>
                  <div className="flex h-10 items-center gap-2 rounded-[8px] border border-[#D9DEE5] bg-white px-2.5">
                    <input
                      type="color"
                      value={brandPrimaryColor}
                      onChange={(event) => setBrandPrimaryColor(event.target.value)}
                      disabled={!props.canEdit || isSaving}
                      className="h-8 w-10 cursor-pointer rounded border-0 bg-transparent p-0"
                    />
                    <Input
                      value={brandPrimaryColor}
                      onChange={(event) => setBrandPrimaryColor(event.target.value)}
                      disabled={!props.canEdit || isSaving}
                      className={`${interMedium.className} h-8 border-none bg-transparent px-1 text-[13px] text-[#1d2433] shadow-none focus-visible:ring-0`}
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className={`${interMedium.className} text-[12px] font-semibold uppercase tracking-[0.08em] text-[#64748B]`}>Brand accent colour</label>
                  <div className="flex h-10 items-center gap-2 rounded-[8px] border border-[#D9DEE5] bg-white px-2.5">
                    <input
                      type="color"
                      value={brandAccentColor}
                      onChange={(event) => setBrandAccentColor(event.target.value)}
                      disabled={!props.canEdit || isSaving}
                      className="h-8 w-10 cursor-pointer rounded border-0 bg-transparent p-0"
                    />
                    <Input
                      value={brandAccentColor}
                      onChange={(event) => setBrandAccentColor(event.target.value)}
                      disabled={!props.canEdit || isSaving}
                      className={`${interMedium.className} h-8 border-none bg-transparent px-1 text-[13px] text-[#1d2433] shadow-none focus-visible:ring-0`}
                    />
                  </div>
                </div>
              </div>
          </div>

          {/* Financial Settings */}
          <div className="overflow-hidden rounded-[22px] border border-[#D9DEE5] bg-white px-5 pb-5 pt-4">
            <div className="pb-4">
              <h3 className="text-[19px] font-semibold leading-[1.1] tracking-[-0.02em] text-[#1d2433]">Financial Settings</h3>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
                <div className="space-y-1.5">
                  <label className={`${interMedium.className} text-[12px] font-semibold uppercase tracking-[0.08em] text-[#64748B]`}>ABN / NZBN</label>
                  <Input
                    value={businessNumber}
                    onChange={(event) => setBusinessNumber(event.target.value)}
                    placeholder="e.g. 123-456-789"
                    disabled={!props.canEdit || isSaving}
                    className={`${interMedium.className} h-10 rounded-[8px] border-[#D9DEE5] bg-white text-[14px] text-[#1d2433]`}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className={`${interMedium.className} text-[12px] font-semibold uppercase tracking-[0.08em] text-[#64748B]`}>Bank account details</label>
                  <Input
                    value={bankAccountDetails}
                    onChange={(event) => setBankAccountDetails(event.target.value)}
                    placeholder="e.g. 12-1234-1234567-00"
                    disabled={!props.canEdit || isSaving}
                    className={`${interMedium.className} h-10 rounded-[8px] border-[#D9DEE5] bg-white text-[14px] text-[#1d2433]`}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className={`${interMedium.className} text-[12px] font-semibold uppercase tracking-[0.08em] text-[#64748B]`}>GST Number</label>
                  <Input
                    value={gstNumber}
                    onChange={(event) => setGstNumber(event.target.value)}
                    placeholder="e.g. 123-456-789"
                    disabled={!props.canEdit || isSaving}
                    className={`${interMedium.className} h-10 rounded-[8px] border-[#D9DEE5] bg-white text-[14px] text-[#1d2433]`}
                  />
                </div>

                <div className="space-y-1.5 md:col-span-2">
                  <label className={`${interMedium.className} text-[12px] font-semibold uppercase tracking-[0.08em] text-[#64748B]`}>Default tax mode</label>
                  <select
                    value={defaultTaxMode}
                    onChange={(event) => setDefaultTaxMode(event.target.value)}
                    disabled={!props.canEdit || isSaving}
                    className={`${interMedium.className} h-10 w-full rounded-[8px] border border-[#D9DEE5] bg-white px-3 text-[13px] text-[#1d2433] outline-none`}
                  >
                    <option value="GST Inclusive">GST Inclusive</option>
                    <option value="GST Exclusive">GST Exclusive</option>
                  </select>
                </div>

                <div className="space-y-1.5 md:col-span-1">
                  <label className={`${interMedium.className} text-[12px] font-semibold uppercase tracking-[0.08em] text-[#64748B]`}>Default tax rate (%)</label>
                  <Input
                    value={defaultTaxRate}
                    onChange={(event) => setDefaultTaxRate(event.target.value)}
                    disabled={!props.canEdit || isSaving}
                    className={`${interMedium.className} h-10 rounded-[8px] border-[#D9DEE5] bg-white text-[14px] text-[#1d2433]`}
                  />
                </div>
              </div>
          </div>

          {/* Regional Settings */}
          <div className="overflow-hidden rounded-[22px] border border-[#D9DEE5] bg-white px-5 pb-5 pt-4">
            <div className="pb-4">
              <h3 className="text-[19px] font-semibold leading-[1.1] tracking-[-0.02em] text-[#1d2433]">Regional Settings</h3>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1.5">
                <label className={`${interMedium.className} text-[12px] font-semibold uppercase tracking-[0.08em] text-[#64748B]`}>Default currency</label>
                <select
                  value={defaultCurrency}
                  onChange={(event) => setDefaultCurrency(event.target.value)}
                  disabled={!props.canEdit || isSaving}
                  className={`${interMedium.className} h-10 w-full rounded-[8px] border border-[#D9DEE5] bg-white px-3 text-[13px] text-[#1d2433] outline-none`}
                >
                  <option value="NZD">NZD</option>
                  <option value="AUD">AUD</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className={`${interMedium.className} text-[12px] font-semibold uppercase tracking-[0.08em] text-[#64748B]`}>Timezone</label>
                <select
                  value={timezone}
                  onChange={(event) => setTimezone(event.target.value)}
                  disabled={!props.canEdit || isSaving}
                  className={`${interMedium.className} h-10 w-full rounded-[8px] border border-[#D9DEE5] bg-white px-3 text-[13px] text-[#1d2433] outline-none`}
                >
                  <option value="Pacific/Auckland">Pacific/Auckland</option>
                  <option value="Australia/Sydney">Australia/Sydney</option>
                  <option value="UTC">UTC</option>
                </select>
              </div>
            </div>
          </div>

          {!props.canEdit ? (
            <p className={`${interMedium.className} text-sm text-[#5f6f89]`}>You do not have permission to update organization settings.</p>
          ) : null}
        </div>
      </section>
    </form>
  );
}
