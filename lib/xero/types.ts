export type XeroTokenSet = {
  access_token: string;
  refresh_token: string;
  expires_in?: number;
  expires_at?: number;
  scope?: string | string[];
  token_type?: string;
  id_token?: string;
};

export type XeroConnection = {
  id: string;
  tenantId: string;
  tenantName: string;
  tenantType: string;
  createdDateUtc?: string;
  updatedDateUtc?: string;
};

export type XeroAccount = {
  accountID?: string;
  AccountID?: string;
  code?: string;
  Code?: string;
  name?: string;
  Name?: string;
  description?: string;
  Description?: string;
  type?: string;
  Type?: string;
  status?: string;
  Status?: string;
  bankAccountType?: string;
  BankAccountType?: string;
  taxType?: string;
  TaxType?: string;
  class?: string;
  Class?: string;
  enablePaymentsToAccount?: boolean;
  EnablePaymentsToAccount?: boolean;
  showInExpenseClaims?: boolean;
  ShowInExpenseClaims?: boolean;
  reportingCode?: string;
  ReportingCode?: string;
  reportingCodeName?: string;
  ReportingCodeName?: string;
};

export type XeroTaxRate = {
  Name?: string;
  TaxType?: string;
  DisplayTaxRate?: number;
  EffectiveRate?: number;
  Status?: string;
  CanApplyToAssets?: boolean;
  CanApplyToEquity?: boolean;
  CanApplyToExpenses?: boolean;
  CanApplyToLiabilities?: boolean;
  CanApplyToRevenue?: boolean;
  TaxComponents?: Array<{
    Name?: string;
    Rate?: number;
    IsCompound?: boolean;
    IsNonRecoverable?: boolean;
  }>;
};

export type XeroContactPhone = {
  phoneType?: string;
  PhoneType?: string;
  phoneNumber?: string;
  PhoneNumber?: string;
  phoneAreaCode?: string;
  PhoneAreaCode?: string;
  phoneCountryCode?: string;
  PhoneCountryCode?: string;
};

export type XeroContactAddress = {
  addressType?: string;
  AddressType?: string;
  addressLine1?: string;
  AddressLine1?: string;
  addressLine2?: string;
  AddressLine2?: string;
  city?: string;
  City?: string;
  region?: string;
  Region?: string;
  postalCode?: string;
  PostalCode?: string;
  country?: string;
  Country?: string;
  attentionTo?: string;
  AttentionTo?: string;
};

export type XeroContactValidationError = {
  message?: string;
  Message?: string;
};

export type XeroContactPerson = {
  firstName?: string;
  FirstName?: string;
  lastName?: string;
  LastName?: string;
  emailAddress?: string;
  EmailAddress?: string;
  includeInEmails?: boolean;
  IncludeInEmails?: boolean;
};

export type XeroPaymentTermType =
  | "DAYSAFTERBILLDATE"
  | "DAYSAFTERBILLMONTH"
  | "OFCURRENTMONTH"
  | "OFFOLLOWINGMONTH";

export type XeroPaymentTermBill = {
  day?: number;
  Day?: number;
  type?: XeroPaymentTermType;
  Type?: XeroPaymentTermType;
};

export type XeroPaymentTerms = {
  bills?: XeroPaymentTermBill;
  Bills?: XeroPaymentTermBill;
  sales?: XeroPaymentTermBill;
  Sales?: XeroPaymentTermBill;
};

export type XeroContact = {
  contactID?: string;
  ContactID?: string;
  mergedToContactID?: string;
  MergedToContactID?: string;
  contactNumber?: string;
  ContactNumber?: string;
  accountNumber?: string;
  AccountNumber?: string;
  contactStatus?: string;
  ContactStatus?: string;
  name?: string;
  Name?: string;
  firstName?: string;
  FirstName?: string;
  lastName?: string;
  LastName?: string;
  companyNumber?: string;
  CompanyNumber?: string;
  contactPersons?: XeroContactPerson[];
  ContactPersons?: XeroContactPerson[];
  emailAddress?: string;
  EmailAddress?: string;
  defaultCurrency?: string;
  DefaultCurrency?: string;
  paymentTerms?: XeroPaymentTerms;
  PaymentTerms?: XeroPaymentTerms;
  taxNumber?: string;
  TaxNumber?: string;
  taxNumberType?: string;
  TaxNumberType?: string;
  phones?: XeroContactPhone[];
  Phones?: XeroContactPhone[];
  addresses?: XeroContactAddress[];
  Addresses?: XeroContactAddress[];
  isSupplier?: boolean;
  IsSupplier?: boolean;
  isCustomer?: boolean;
  IsCustomer?: boolean;
  updatedDateUTC?: string | Date;
  UpdatedDateUTC?: string | Date;
  hasValidationErrors?: boolean;
  HasValidationErrors?: boolean;
  validationErrors?: XeroContactValidationError[];
  ValidationErrors?: XeroContactValidationError[];
};

export type XeroInvoiceLineItem = {
  Description?: string;
  Quantity?: number;
  UnitAmount?: number;
  LineAmount?: number;
  TaxAmount?: number;
  AccountID?: string;
  AccountCode?: string;
  TaxType?: string;
};

export type XeroInvoice = {
  Type?: "ACCPAY" | "ACCREC";
  Contact?: {
    ContactID?: string;
    Name?: string;
  };
  InvoiceID?: string;
  InvoiceNumber?: string;
  Date?: string;
  DueDate?: string;
  CurrencyCode?: string;
  LineAmountTypes?: "Exclusive" | "Inclusive" | "NoTax";
  Status?: string;
  LineItems?: XeroInvoiceLineItem[];
  SubTotal?: number;
  TotalTax?: number;
  Total?: number;
  AmountDue?: number;
  AmountPaid?: number;
  AmountCredited?: number;
  UpdatedDateUTC?: string | Date;
  FullyPaidOnDate?: string | Date;
  Payments?: Array<{
    PaymentID?: string;
    Date?: string | Date;
    Amount?: number;
    Status?: string;
    UpdatedDateUTC?: string | Date;
  }>;
  HasErrors?: boolean;
  ValidationErrors?: XeroContactValidationError[];
};

export type XeroAttachment = {
  AttachmentID?: string;
  FileName?: string;
  Url?: string;
  MimeType?: string;
  ContentLength?: number | string;
  IncludeOnline?: boolean;
};

export type StoredXeroTenant = {
  connectionId: string;
  tenantId: string;
  tenantName: string;
  tenantType: string;
  createdDateUtc: string | null;
  updatedDateUtc: string | null;
};
