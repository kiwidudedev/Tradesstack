export const mockUser = {
  name: "Corey Fenton",
  email: "coreyajfenton@gmail.com",
  initials: "CF"
};

export interface OrganizationProject {
  id: string;
  name: string;
  stage: "Pricing" | "Construction" | "Completion";
  location: string;
}

export const mockOrganizationProjects: OrganizationProject[] = [
  {
    id: "smith-renovation",
    name: "Smith Renovation",
    stage: "Pricing",
    location: "Auckland"
  },
  {
    id: "mangawhai-new-build",
    name: "Mangawhai New Build",
    stage: "Pricing",
    location: "Northland"
  },
  {
    id: "grey-lynn-extension",
    name: "Grey Lynn Extension",
    stage: "Construction",
    location: "Auckland"
  }
];

export const mockProjects = mockOrganizationProjects.map((project) => project.name);

export function getOrganizationProjectById(projectId: string) {
  return mockOrganizationProjects.find((project) => project.id === projectId) ?? null;
}

export const mockKpis = {
  scopesGenerated: 38,
  risksFlagged: 23,
  risksResolved: 18,
  variationsPrevented: 11,
  marginProtected: 12450,
  processingStatus: "Latest upload processed successfully"
};

export const recentActivity = [
  "Plans uploaded - Smith Renovation",
  "Scope generated - Framing + Cladding",
  "Risk flagged - Waterproofing detail mismatch"
];
