"use client";

import { useState, type FormEvent } from "react";
import { Check } from "lucide-react";
import { Input } from "@/components/ui/input";
import type { TakeoffDisplayUnit, TakeoffUnitSystem } from "@/lib/takeoff/units";
import {
  footerContainerClassName,
  inputClassName,
  labelClassName,
  primaryButtonClassName,
  secondaryButtonClassName,
  selectClassName,
} from "@/components/app/TradesstackDialogPrimitives";
import { DraggableTakeoffPanel } from "@/components/app/DraggableTakeoffPanel";

export type ConfigurableTool = "calibrate" | "distance" | "polyline" | "area" | "count";

export interface MeasureToolSetupState {
  calibrate: {
    name: string;
    referenceLengthInput: string;
    displayUnit: TakeoffDisplayUnit;
    unitSystem: TakeoffUnitSystem;
  };
  distance: {
    name: string;
    description: string;
    colorHex: string;
    countValue: number;
  };
  polyline: {
    name: string;
    description: string;
    colorHex: string;
    countValue: number;
  };
  area: {
    name: string;
    description: string;
    colorHex: string;
    countValue: number;
  };
  count: {
    name: string;
    description: string;
    colorHex: string;
    countValue: number;
  };
}

interface TakeoffMeasureToolDialogProps {
  open: boolean;
  tool: ConfigurableTool | null;
  resetKey: string;
  initialValues: MeasureToolSetupState;
  onOpenChange: (open: boolean) => void;
  onConfirm: (values: MeasureToolSetupState[ConfigurableTool]) => void;
}

type ToolDialogValues =
  | MeasureToolSetupState["calibrate"]
  | MeasureToolSetupState["distance"]
  | MeasureToolSetupState["polyline"]
  | MeasureToolSetupState["area"]
  | MeasureToolSetupState["count"];

export const measurementColorOptions = [
  { label: "Orange", value: "#F15A29" },
  { label: "Teal", value: "#0F766E" },
  { label: "Blue", value: "#2563EB" },
  { label: "Crimson", value: "#DC2626" },
  { label: "Amber", value: "#D97706" },
  { label: "Emerald", value: "#059669" },
  { label: "Indigo", value: "#4F46E5" },
  { label: "Slate", value: "#475569" },
];

const unitOptions: Array<{
  label: string;
  value: TakeoffDisplayUnit;
  unitSystem: TakeoffUnitSystem;
}> = [
  { label: "Millimetres (mm)", value: "mm", unitSystem: "metric" },
  { label: "Centimetres (cm)", value: "cm", unitSystem: "metric" },
  { label: "Metres (m)", value: "m", unitSystem: "metric" },
];

function getDialogCopy(tool: ConfigurableTool) {
  if (tool === "calibrate") {
    return {
      title: "Calibrate Measurement",
      submitLabel: "Measure",
    };
  }

  if (tool === "distance") {
    return {
      title: "Distance Setup",
      submitLabel: "Measure",
    };
  }

  if (tool === "polyline") {
    return {
      title: "Linear Setup",
      submitLabel: "Measure",
    };
  }

  if (tool === "area") {
    return {
      title: "Area Setup",
      submitLabel: "Measure",
    };
  }

  return {
    title: "Count Setup",
    submitLabel: "Measure",
  };
}

export function TakeoffMeasureToolDialog({
  open,
  tool,
  resetKey,
  initialValues,
  onOpenChange,
  onConfirm,
}: TakeoffMeasureToolDialogProps) {
  if (!open || !tool) {
    return null;
  }

  return (
    <TakeoffMeasureToolDialogForm
      key={`${tool}:${resetKey}`}
      tool={tool}
      resetKey={resetKey}
      initialValues={initialValues[tool]}
      onOpenChange={onOpenChange}
      onConfirm={onConfirm}
    />
  );
}

export function MeasurementColorSelector({
  value,
  onChange,
  options,
  disabled = false,
}: {
  value: string;
  onChange: (hex: string) => void;
  options: Array<{ label: string; value: string }>;
  disabled?: boolean;
}) {
  return (
    <div className="grid grid-cols-4 gap-2">
      {options.map((option) => {
        const isSelected = value === option.value;

        return (
          <button
            key={option.value}
            type="button"
            disabled={disabled}
            onClick={() => onChange(option.value)}
            aria-label={`Select ${option.label}`}
            aria-pressed={isSelected}
            title={option.label}
            className={`inline-flex h-11 items-center justify-center rounded-[0.6rem] border transition focus:outline-none focus:ring-2 focus:ring-[#F15A29]/30 disabled:cursor-not-allowed disabled:opacity-60 ${
              isSelected
                ? "border-[#F15A29] bg-[#FFF4EE] shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
                : "border-[#D9E3EE] bg-white hover:bg-[#F8FAFC]"
            }`}
          >
            <span
              className={`inline-flex h-6 w-6 items-center justify-center rounded-full border-2 ${
                isSelected ? "border-[#10283B]" : "border-white"
              }`}
              style={{ backgroundColor: option.value }}
            >
              {isSelected ? <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} /> : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function TakeoffMeasureToolDialogForm({
  tool,
  resetKey,
  initialValues,
  onOpenChange,
  onConfirm,
}: {
  tool: ConfigurableTool;
  resetKey: string;
  initialValues: ToolDialogValues;
  onOpenChange: (open: boolean) => void;
  onConfirm: (values: MeasureToolSetupState[ConfigurableTool]) => void;
}) {
  const [formValues, setFormValues] = useState<ToolDialogValues>(initialValues);
  const copy = getDialogCopy(tool);
  const calibrationValues = tool === "calibrate" ? (formValues as MeasureToolSetupState["calibrate"]) : null;
  const configuredToolValues =
    tool !== "calibrate"
      ? (formValues as
          | MeasureToolSetupState["distance"]
          | MeasureToolSetupState["polyline"]
          | MeasureToolSetupState["area"]
          | MeasureToolSetupState["count"])
      : null;
  const selectedDisplayUnit =
    calibrationValues && unitOptions.some((option) => option.value === calibrationValues.displayUnit)
      ? calibrationValues.displayUnit
      : unitOptions[0]?.value ?? "mm";

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (tool === "calibrate") {
      onConfirm(formValues as MeasureToolSetupState[ConfigurableTool]);
      return;
    }

    onConfirm({
      ...(formValues as
        | MeasureToolSetupState["distance"]
        | MeasureToolSetupState["polyline"]
        | MeasureToolSetupState["area"]
        | MeasureToolSetupState["count"]),
      description: configuredToolValues?.description.trim() ?? "",
    } as MeasureToolSetupState[ConfigurableTool]);
  };

  const handleUnitChange = (nextUnit: string) => {
    const nextOption = unitOptions.find((option) => option.value === nextUnit) ?? unitOptions[0];
    setFormValues((current) =>
      current && "displayUnit" in current
        ? {
            ...current,
            displayUnit: nextOption.value,
            unitSystem: nextOption.unitSystem,
          }
        : current
    );
  };

  const canSubmit =
    tool === "calibrate"
      ? "referenceLengthInput" in formValues && formValues.referenceLengthInput.trim().length > 0 && formValues.displayUnit.trim().length > 0
      : "name" in formValues && formValues.name.trim().length > 0;

  return (
    <DraggableTakeoffPanel accessibleLabel={copy.title} resetKey={resetKey}>
      <div className="w-full max-w-[400px] rounded-[18px] border border-[#E2E8F1] bg-white p-0 shadow-[0_8px_32px_rgba(15,23,42,0.12)]">
        <form onSubmit={handleSubmit}>
          <div className="space-y-3.5 px-7 pb-4 pt-5">
            {tool === "calibrate" ? (
              <>
              <div>
                <label htmlFor="measure-calibration-length" className={labelClassName}>
                  Reference Length <span className="text-[#FF4C14]">*</span>
                </label>
                <Input
                  id="measure-calibration-length"
                  type="number"
                  min="0"
                  step="0.0001"
                  value={calibrationValues?.referenceLengthInput ?? ""}
                  onChange={(event) =>
                    setFormValues((current) =>
                      current && "referenceLengthInput" in current
                        ? { ...current, referenceLengthInput: event.target.value }
                        : current
                    )
                  }
                  placeholder="1000"
                  className={inputClassName}
                  required
                />
              </div>
              <div>
                <label htmlFor="measure-calibration-unit" className={labelClassName}>
                  Unit <span className="text-[#FF4C14]">*</span>
                </label>
                <div className="relative">
                  <select
                    id="measure-calibration-unit"
                    value={selectedDisplayUnit}
                    onChange={(event) => handleUnitChange(event.target.value)}
                    className={selectClassName}
                    required
                  >
                    {unitOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <svg className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2" width="16" height="16" viewBox="0 0 20 20" fill="none">
                    <path d="M5 7.5L10 12.5L15 7.5" stroke="#6B7280" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
              </div>
              </>
            ) : (
              <>
              <div>
                <label htmlFor="measure-tool-name" className={labelClassName}>
                  Name <span className="text-[#FF4C14]">*</span>
                </label>
                <Input
                  id="measure-tool-name"
                  value={configuredToolValues?.name ?? ""}
                  onChange={(event) =>
                    setFormValues((current) =>
                      current && "name" in current
                        ? { ...current, name: event.target.value }
                        : current
                    )
                  }
                  className={inputClassName}
                  required
                />
              </div>
              <div>
                <label htmlFor="measure-tool-description" className={labelClassName}>
                  Description
                </label>
                <textarea
                  id="measure-tool-description"
                  rows={2}
                  value={configuredToolValues?.description ?? ""}
                  onChange={(event) =>
                    setFormValues((current) =>
                      current && "description" in current
                        ? { ...current, description: event.target.value }
                        : current
                    )
                  }
                  placeholder="Add description"
                  className={`${inputClassName} h-auto min-h-[4.75rem] resize-none py-2.5 leading-[1.5]`}
                />
              </div>
              <div>
                <label className={labelClassName}>Colour</label>
                <MeasurementColorSelector
                  value={configuredToolValues?.colorHex ?? measurementColorOptions[0]?.value ?? "#F15A29"}
                  onChange={(hex) =>
                    setFormValues((current) =>
                      current && "colorHex" in current
                        ? { ...current, colorHex: hex }
                        : current
                    )
                  }
                  options={measurementColorOptions}
                />
              </div>
              </>
            )}
          </div>

          <div className={footerContainerClassName}>
            <button type="button" onClick={() => onOpenChange(false)} className={secondaryButtonClassName}>
              Cancel
            </button>
            <button type="submit" disabled={!canSubmit} className={primaryButtonClassName}>
              {copy.submitLabel}
            </button>
          </div>
        </form>
      </div>
    </DraggableTakeoffPanel>
  );
}
