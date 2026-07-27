import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  CommercialLineDescriptionField,
  CommercialLineItemsAddButton,
  CommercialLineItemsCell,
  CommercialLineItemsRow,
  CommercialLineItemsTable,
  CommercialLineMoneyDisplay,
  CommercialLinePrefixedNumberInput,
  CommercialLineTextInput,
  CommercialSummaryCard,
  CommercialSummaryRow,
  formatCommercialDocumentMoney,
} from "@/components/app/CommercialLineItemsTable";

describe("CommercialLineItemsTable", () => {
  it("renders the shared commercial invoice table shell and summary card", () => {
    const markup = renderToStaticMarkup(
      <div>
        <CommercialLineItemsTable
          columns={[
            { key: "description", label: "Description" },
            { key: "qty", label: "Qty" },
            { key: "unitPrice", label: "Unit Price" },
            { key: "amount", label: "Amount", align: "right" },
            { key: "actions", label: "" },
          ]}
          gridTemplateColumns="minmax(340px,1fr) 72px 104px 104px 44px"
        >
          <CommercialLineItemsRow gridTemplateColumns="minmax(340px,1fr) 72px 104px 104px 44px">
            <CommercialLineItemsCell>
              <CommercialLineDescriptionField
                primaryValue="92mm Track"
                secondaryValue="SUP-001"
                onPrimaryChange={vi.fn()}
                onSecondaryChange={vi.fn()}
                primaryAriaLabel="Line 1 description"
                secondaryAriaLabel="Line 1 supplier item code"
              />
            </CommercialLineItemsCell>
            <CommercialLineItemsCell withBorder>
              <CommercialLineTextInput value="110" onChange={vi.fn()} ariaLabel="Line 1 quantity" />
            </CommercialLineItemsCell>
            <CommercialLineItemsCell withBorder>
              <CommercialLinePrefixedNumberInput value="8.99" onChange={vi.fn()} ariaLabel="Line 1 unit price" prefix="$" />
            </CommercialLineItemsCell>
            <CommercialLineItemsCell withBorder className="justify-end">
              <CommercialLineMoneyDisplay value={988.9} />
            </CommercialLineItemsCell>
            <CommercialLineItemsCell withBorder />
          </CommercialLineItemsRow>
        </CommercialLineItemsTable>

        <CommercialLineItemsAddButton onClick={vi.fn()} />

        <CommercialSummaryCard title="Invoice Summary">
          <CommercialSummaryRow label="Subtotal" value="NZ$8,268.48" />
          <CommercialSummaryRow label="GST (15%)" value="NZ$1,240.27" />
          <CommercialSummaryRow label="Total" value="NZ$9,508.75" />
        </CommercialSummaryCard>
      </div>
    );

    expect(markup).toContain("Description");
    expect(markup).toContain("Qty");
    expect(markup).toContain("Unit Price");
    expect(markup).toContain("Amount");
    expect(markup).not.toContain(">Unit<");
    expect(markup).toContain("supplier item code");
    expect(markup).toContain("$");
    expect(markup).toContain("8.99");
    expect(markup).toContain("NZ$988.90");
    expect(markup).toContain("Add Item");
    expect(markup).toContain("Invoice Summary");
    expect(markup).toContain("GST (15%)");
  });

  it("renders the provided empty state when there are no rows", () => {
    const markup = renderToStaticMarkup(
      <CommercialLineItemsTable
        columns={[
          { key: "description", label: "Description" },
          { key: "qty", label: "Qty" },
        ]}
        gridTemplateColumns="1fr 92px"
        emptyState={<div>No invoice lines yet.</div>}
      />
    );

    expect(markup).toContain("No invoice lines yet.");
  });

  it("uses the same document money formatter for line totals and summaries", () => {
    expect(formatCommercialDocumentMoney(8268.48)).toBe("NZ$8,268.48");
    expect(formatCommercialDocumentMoney(1240.27)).toBe("NZ$1,240.27");
  });

  it("can display a right-aligned currency prefix joined to its formatted value", () => {
    const markup = renderToStaticMarkup(
      <CommercialLinePrefixedNumberInput
        value="8268.48"
        onChange={vi.fn()}
        prefix="NZ$"
        align="right"
        formatter={(value) => value.toLocaleString("en-NZ", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}
        joinPrefixWithValue
      />
    );

    expect(markup).toContain('value="NZ$8,268.48"');
  });
});
