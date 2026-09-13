export type TakeoffRouteOwner =
  | { kind: "opportunity"; slug: string }
  | { kind: "project"; slug: string };

export type TakeoffConversionMode = "workspace" | "promoted" | "legacy-reference" | "project";

export function takeoffOwnerKey(owner: TakeoffRouteOwner) {
  return `${owner.kind}:${owner.slug}`;
}

export function parseTakeoffOwnerKey(value: string): TakeoffRouteOwner {
  if (value.startsWith("project:")) return { kind: "project", slug: value.slice("project:".length) };
  if (value.startsWith("opportunity:")) return { kind: "opportunity", slug: value.slice("opportunity:".length) };
  return { kind: "opportunity", slug: value };
}
