import { createElement } from "react";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  filterTenderClients,
  summarizeTenderClientSelection,
  TenderClientMultiSelect,
  toggleTenderClientSelection,
  withPrimaryTenderClient,
  type TenderClientOption,
} from "./TenderClientMultiSelect";

const clients: TenderClientOption[] = [
  { id: "fletcher", name: "Fletcher contact", company_name: "Fletcher Construction", email: "estimating@fletcher.test" },
  { id: "hawkins", name: "Hawkins contact", company_name: "Hawkins" },
  { id: "naylor", name: "Naylor contact", company_name: "Naylor Love" },
  { id: "harbour", name: "Harbour Side contact", company_name: "Harbour Side Builders" },
];

describe("TenderClientMultiSelect selection model", () => {
  it("renders one compact trigger without rendering every client while closed", () => {
    const markup = renderToStaticMarkup(createElement(TenderClientMultiSelect, {
      clients,
      selectedIds: [],
      primaryClientId: "",
      onChange: () => undefined,
    }));

    expect(markup.match(/<button/g)).toHaveLength(1);
    expect(markup).toContain("Select tender clients");
    expect(markup).not.toContain("Fletcher Construction");
    expect(markup).not.toContain("Harbour Side Builders");
  });

  it("owns the shared search, empty state, and open-focus behavior", () => {
    const source = readFileSync(new URL("./TenderClientMultiSelect.tsx", import.meta.url), "utf8");
    expect(source).toContain('placeholder="Search clients..."');
    expect(source).toContain("No clients found.");
    expect(source).toContain("searchRef.current?.focus()");
  });

  it("automatically includes the Primary Client without dropping other selections", () => {
    expect(withPrimaryTenderClient(["hawkins"], "fletcher")).toEqual(["hawkins", "fletcher"]);
    expect(withPrimaryTenderClient(["hawkins", "fletcher"], "naylor")).toEqual(["hawkins", "fletcher", "naylor"]);
  });

  it("selects multiple clients and keeps selections stable", () => {
    const first = toggleTenderClientSelection(["fletcher"], "hawkins", true, "fletcher");
    const second = toggleTenderClientSelection(first, "naylor", true, "fletcher");
    expect(second).toEqual(["fletcher", "hawkins", "naylor"]);
  });

  it("cannot remove the Primary Client", () => {
    expect(toggleTenderClientSelection(["fletcher", "hawkins"], "fletcher", false, "fletcher"))
      .toEqual(["fletcher", "hawkins"]);
  });

  it("filters by company and existing client contact text", () => {
    expect(filterTenderClients(clients, "harbour").map((client) => client.id)).toEqual(["harbour"]);
    expect(filterTenderClients(clients, "Naylor contact").map((client) => client.id)).toEqual(["naylor"]);
    expect(filterTenderClients(clients, "FLET").map((client) => client.id)).toEqual(["fletcher"]);
    expect(filterTenderClients(clients, "estimating@").map((client) => client.id)).toEqual(["fletcher"]);
    expect(filterTenderClients(clients, "no match")).toEqual([]);
  });

  it("filtering never changes the selected or Primary client state", () => {
    const selected = ["fletcher", "dynamic"];
    expect(filterTenderClients(clients, "harbour").map((client) => client.id)).toEqual(["harbour"]);
    expect(withPrimaryTenderClient(selected, "fletcher")).toEqual(selected);
    expect(toggleTenderClientSelection(selected, "harbour", true, "fletcher"))
      .toEqual(["fletcher", "dynamic", "harbour"]);
    expect(filterTenderClients(clients, "").map((client) => client.id))
      .toEqual(["fletcher", "hawkins", "naylor", "harbour"]);
  });

  it("keeps the closed field compact", () => {
    expect(summarizeTenderClientSelection(clients, [], "")).toBe("Select tender clients");
    expect(summarizeTenderClientSelection(clients, ["fletcher"], "fletcher")).toBe("Fletcher Construction");
    expect(summarizeTenderClientSelection(clients, ["fletcher", "hawkins"], "fletcher"))
      .toBe("Fletcher Construction, Hawkins");
    expect(summarizeTenderClientSelection(clients, ["fletcher", "hawkins", "naylor", "harbour"], "fletcher"))
      .toBe("Fletcher Construction, Hawkins +2 more");
  });
});
