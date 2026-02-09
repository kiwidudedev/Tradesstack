export type UUID = string;

export interface UserProfile {
  id: UUID;
  email: string | null;
  fullName: string | null;
  gstRegistered: boolean;
  gstRate: number;
  accRate: number;
  createdAt: string;
  updatedAt: string;
}

export interface Client {
  id: UUID;
  userId: UUID;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Job {
  id: UUID;
  userId: UUID;
  clientId: UUID | null;
  title: string;
  status: "active" | "on_hold" | "completed";
  siteAddress: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LineItem {
  id: UUID;
  description: string;
  quantity: number;
  unitPrice: number;
}

export interface Quote {
  id: UUID;
  userId: UUID;
  clientId: UUID | null;
  jobId: UUID | null;
  title: string;
  status: "draft" | "sent" | "accepted" | "declined";
  gstRate: number;
  subtotal: number;
  gstAmount: number;
  total: number;
  lineItems: LineItem[];
  createdAt: string;
  updatedAt: string;
}

export interface Invoice {
  id: UUID;
  userId: UUID;
  clientId: UUID | null;
  jobId: UUID | null;
  title: string;
  status: "draft" | "sent" | "paid";
  gstRate: number;
  subtotal: number;
  gstAmount: number;
  total: number;
  dueDate: string | null;
  lineItems: LineItem[];
  createdAt: string;
  updatedAt: string;
}

export interface PurchaseOrder {
  id: UUID;
  userId: UUID;
  supplierName: string;
  title: string;
  gstRate: number;
  subtotal: number;
  gstAmount: number;
  total: number;
  lineItems: LineItem[];
  photoUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SafetyRecord {
  id: UUID;
  userId: UUID;
  jobId: UUID | null;
  type: "toolbox_talk" | "checklist";
  checklist: Array<{
    id: UUID;
    label: string;
    completed: boolean;
  }>;
  notes: string | null;
  photoUrl: string | null;
  createdAt: string;
  updatedAt: string;
}
