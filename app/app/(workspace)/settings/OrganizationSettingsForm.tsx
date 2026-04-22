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


  const fieldLabel = "mb-1 block text-[13px] font-semibold text-[#1d2433] font-[family-name:var(--font-ibm-plex-sans)]";
  const fieldInput = "h-[2.75rem] w-full rounded-[0.6rem] border border-[#D9E3EE] bg-white px-3.5 text-[14px] font-medium text-[#10283B] placeholder:text-[#9BAABB] outline-none transition focus:border-[#F15A29] font-[family-name:var(--font-ibm-plex-sans)]";
  const fieldSelect = "h-[2.75rem] w-full appearance-none rounded-[0.6rem] border border-[#D9E3EE] bg-white px-3.5 text-[14px] font-medium text-[#10283B] outline-none transition focus:border-[#F15A29] font-[family-name:var(--font-ibm-plex-sans)]";

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
            <p className={`${interMedium.className} rounded-[0.6rem] border border-[#f1c5c5] bg-[#fff1f1] px-3.5 py-2.5 text-[13px] text-[#8f2d2d]`}>{error}</p>
          ) : null}
          {message ? (
            <p className={`${interMedium.className} rounded-[0.6rem] border border-[#c5dfc1] bg-[#f1faf0] px-3.5 py-2.5 text-[13px] text-[#2d6b35]`}>{message}</p>
          ) : null}

          {/* Company Profile */}
          <div className="rounded-[18px] border border-[#E2E8F1] bg-white px-6 pb-6 pt-5">
            <h3 className="mb-4 text-[15px] font-semibold tracking-[-0.01em] text-[#1d2433]">Company Profile</h3>

            <div className="space-y-3.5">
              <div className="max-w-[220px] space-y-1.5">
                <p className={fieldLabel}>Company logo</p>
                <label className="group block">
                  <input type="file" accept="image/png,image/jpeg,image/webp" onChange={onUploadLogo} disabled={!props.canEdit || isUploading} className="hidden" />
                  <span className={`relative flex h-20 w-full items-center justify-center overflow-hidden rounded-[0.6rem] border border-[#D9E3EE] bg-white transition-colors ${!props.canEdit || isUploading ? "cursor-not-allowed opacity-70" : "cursor-pointer group-hover:border-[#9fb2ce] group-hover:bg-[#e9edf3]"}`}>
                    {logoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={logoUrl} alt="Organization logo" className="h-full w-full object-contain" />
                    ) : (
                      <span className={`${interMedium.className} text-[11px] text-[#9BAABB]`}>No logo uploaded</span>
                    )}
                    <span className={`${interMedium.className} pointer-events-none absolute inset-0 inline-flex items-center justify-center text-[13px] font-semibold text-[#1d2433] transition-opacity ${!props.canEdit || isUploading ? "opacity-0" : "opacity-0 group-hover:opacity-100"}`}>
                      {isUploading ? "Uploading..." : logoUrl ? "Change logo" : "Upload logo"}
                    </span>
                  </span>
                </label>
              </div>

              <div className="grid gap-3.5 md:grid-cols-2">
                <div className="md:col-span-2">
                  <label className={fieldLabel}>Company name</label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} disabled={!props.canEdit || isSaving} className={fieldInput} />
                </div>
                <div className="md:col-span-2">
                  <label className={fieldLabel}>Address line 1</label>
                  <Input value={addressLine1} onChange={(e) => setAddressLine1(e.target.value)} placeholder="Street number and name" disabled={!props.canEdit || isSaving} className={fieldInput} />
                </div>
                <div className="md:col-span-2">
                  <label className={fieldLabel}>Address line 2</label>
                  <Input value={addressLine2} onChange={(e) => setAddressLine2(e.target.value)} placeholder="Suburb, suite, or unit (optional)" disabled={!props.canEdit || isSaving} className={fieldInput} />
                </div>
                <div className="md:col-span-2">
                  <label className={fieldLabel}>City</label>
                  <Input value={city} onChange={(e) => setCity(e.target.value)} disabled={!props.canEdit || isSaving} className={fieldInput} />
                </div>
                <div>
                  <label className={fieldLabel}>Postcode</label>
                  <Input value={postcode} onChange={(e) => setPostcode(e.target.value)} disabled={!props.canEdit || isSaving} className={fieldInput} />
                </div>
                <div>
                  <label className={fieldLabel}>Country</label>
                  <Input value={country} onChange={(e) => setCountry(e.target.value)} disabled={!props.canEdit || isSaving} className={fieldInput} />
                </div>
                <div>
                  <label className={fieldLabel}>Contact name</label>
                  <Input value={contactName} onChange={(e) => setContactName(e.target.value)} disabled={!props.canEdit || isSaving} className={fieldInput} />
                </div>
                <div>
                  <label className={fieldLabel}>Contact phone</label>
                  <Input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} disabled={!props.canEdit || isSaving} className={fieldInput} />
                </div>
                <div className="md:col-span-2">
                  <label className={fieldLabel}>Contact email</label>
                  <Input value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} disabled={!props.canEdit || isSaving} className={fieldInput} />
                </div>
              </div>
            </div>
          </div>

          {/* Branding */}
          <div className="rounded-[18px] border border-[#E2E8F1] bg-white px-6 pb-6 pt-5">
            <h3 className="mb-4 text-[15px] font-semibold tracking-[-0.01em] text-[#1d2433]">Branding</h3>
            <div className="grid gap-3.5 md:grid-cols-2">
              <div>
                <label className={fieldLabel}>Brand primary colour</label>
                <div className="flex h-[2.75rem] items-center gap-2 rounded-[0.6rem] border border-[#D9E3EE] bg-white px-3">
                  <input type="color" value={brandPrimaryColor} onChange={(e) => setBrandPrimaryColor(e.target.value)} disabled={!props.canEdit || isSaving} className="h-7 w-9 cursor-pointer rounded border-0 bg-transparent p-0" />
                  <Input value={brandPrimaryColor} onChange={(e) => setBrandPrimaryColor(e.target.value)} disabled={!props.canEdit || isSaving} className={`${interMedium.className} h-7 border-none bg-transparent px-1 text-[13px] text-[#1d2433] shadow-none focus-visible:ring-0`} />
                </div>
              </div>
              <div>
                <label className={fieldLabel}>Brand accent colour</label>
                <div className="flex h-[2.75rem] items-center gap-2 rounded-[0.6rem] border border-[#D9E3EE] bg-white px-3">
                  <input type="color" value={brandAccentColor} onChange={(e) => setBrandAccentColor(e.target.value)} disabled={!props.canEdit || isSaving} className="h-7 w-9 cursor-pointer rounded border-0 bg-transparent p-0" />
                  <Input value={brandAccentColor} onChange={(e) => setBrandAccentColor(e.target.value)} disabled={!props.canEdit || isSaving} className={`${interMedium.className} h-7 border-none bg-transparent px-1 text-[13px] text-[#1d2433] shadow-none focus-visible:ring-0`} />
                </div>
              </div>
            </div>
          </div>

          {/* Financial Settings */}
          <div className="rounded-[18px] border border-[#E2E8F1] bg-white px-6 pb-6 pt-5">
            <h3 className="mb-4 text-[15px] font-semibold tracking-[-0.01em] text-[#1d2433]">Financial Settings</h3>
            <div className="grid gap-3.5 md:grid-cols-3">
              <div>
                <label className={fieldLabel}>ABN / NZBN</label>
                <Input value={businessNumber} onChange={(e) => setBusinessNumber(e.target.value)} placeholder="123-456-789" disabled={!props.canEdit || isSaving} className={fieldInput} />
              </div>
              <div>
                <label className={fieldLabel}>Bank account</label>
                <Input value={bankAccountDetails} onChange={(e) => setBankAccountDetails(e.target.value)} placeholder="12-1234-1234567-00" disabled={!props.canEdit || isSaving} className={fieldInput} />
              </div>
              <div>
                <label className={fieldLabel}>GST number</label>
                <Input value={gstNumber} onChange={(e) => setGstNumber(e.target.value)} placeholder="123-456-789" disabled={!props.canEdit || isSaving} className={fieldInput} />
              </div>
              <div className="md:col-span-2">
                <label className={fieldLabel}>Default tax mode</label>
                <select value={defaultTaxMode} onChange={(e) => setDefaultTaxMode(e.target.value)} disabled={!props.canEdit || isSaving} className={fieldSelect}>
                  <option value="GST Inclusive">GST Inclusive</option>
                  <option value="GST Exclusive">GST Exclusive</option>
                </select>
              </div>
              <div>
                <label className={fieldLabel}>Default tax rate (%)</label>
                <Input value={defaultTaxRate} onChange={(e) => setDefaultTaxRate(e.target.value)} disabled={!props.canEdit || isSaving} className={fieldInput} />
              </div>
            </div>
          </div>

          {/* Regional Settings */}
          <div className="rounded-[18px] border border-[#E2E8F1] bg-white px-6 pb-6 pt-5">
            <h3 className="mb-4 text-[15px] font-semibold tracking-[-0.01em] text-[#1d2433]">Regional Settings</h3>
            <div className="grid gap-3.5 md:grid-cols-2">
              <div>
                <label className={fieldLabel}>Default currency</label>
                <select value={defaultCurrency} onChange={(e) => setDefaultCurrency(e.target.value)} disabled={!props.canEdit || isSaving} className={fieldSelect}>
                  <option value="NZD">NZD</option>
                  <option value="AUD">AUD</option>
                </select>
              </div>
              <div>
                <label className={fieldLabel}>Timezone</label>
                <select value={timezone} onChange={(e) => setTimezone(e.target.value)} disabled={!props.canEdit || isSaving} className={fieldSelect}>
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
