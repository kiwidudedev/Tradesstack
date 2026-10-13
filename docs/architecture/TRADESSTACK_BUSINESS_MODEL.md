# TradesStack Business and Product Model

## Purpose

This document defines the authoritative current business and product direction
for TradesStack. It exists to prevent product, architecture and customer
implementation work from drifting toward either undifferentiated self-service
SaaS or permanently bespoke customer products.

This document defines direction. It does not prove that a capability,
deployment, migration, provider configuration or operational process has been
implemented. Technical/runtime truth remains governed by the repository,
applied database state where available, tests and direct deployment evidence.

## Business Model

TradesStack is a managed, configurable construction operating platform built
on one core product, with a dedicated implementation for each construction
company.

The commercial model is:

1. an upfront implementation fee covering discovery, workflow mapping, setup,
   configuration, branding, permissions, templates, integrations, migration,
   training and supported customization;
2. a recurring subscription covering continued use, hosting/operations,
   maintenance, support and product improvements according to the agreement;
3. optional AI allowance, credits or usage-based charges; and
4. optional custom development for genuinely customer-specific requirements.

TradesStack is initially a high-touch implementation business. The TradesStack
team may operate provisioning and setup manually. The requirement is that the
process is safe, repeatable and understandable, not that customer signup is
self-service.

## Core Product Model

TradesStack Main is the authoritative product source for reusable core
functionality, including product behavior, domain semantics, security,
permissions, shared packages, migrations and supported integrations.

Useful bug fixes and broadly useful capabilities should be developed in Main
so they can be released to multiple customer implementations.

## Customer Implementation Model

Each construction company may receive a dedicated implementation with its own:

- deployment and repository;
- database, Supabase project and Storage;
- secrets, users and company data;
- branding, templates and terminology;
- permissions, workflows and integrations; and
- AI configuration and supported customer-specific functionality.

Dedicated implementations are operationally isolated, but they are not meant
to become unrelated products. Customer differences should primarily be
represented by configuration, database records, templates, permissions,
feature enablement, workflow definitions, integrations and controlled
extension points.

## Customization Rules

Use this hierarchy when evaluating a customer requirement:

1. configuration;
2. a reusable capability in TradesStack Main;
3. a controlled customer-specific extension; and
4. permanent customer-specific source divergence only when unavoidable.

Before implementing customer-specific functionality, determine whether the
requirement is actually a general product capability, a company configuration
difference, a reusable capability revealed by one customer, or a genuinely
unique extension. Do not create a permanent customer fork casually.

## Product Improvement Rule

If a customer fix or feature is useful beyond that customer, incorporate the
generic capability or correction into TradesStack Main. Customer-specific
implementations should receive controlled releases from Main, with their
configuration and supported extensions preserved.

## Customer Lifecycle

```text
Discovery
  → requirements and workflow mapping
  → implementation from TradesStack Main
  → configuration and supported customization
  → customer acceptance and testing
  → launch
  → support and maintenance
  → controlled upgrades from Main
```

## Operational Requirement

The operating model should make it increasingly easy to answer:

- which TradesStack version and Main release a customer runs;
- what configuration, extensions and source differences they have;
- which migrations are applied;
- whether their deployment, backups and integrations are healthy; and
- whether a defect belongs to Main or only to their implementation.

Provisioning, upgrades, support and recovery may begin operator-driven, but
must remain understandable, safe and repeatable as the customer base grows.

## What TradesStack Is Not

TradesStack is not:

- a cheap generic self-service SaaS product;
- one shared, undifferentiated runtime where every company must operate the
  same way;
- bespoke software rewritten from scratch for every company;
- a software agency producing unrelated applications; or
- a collection of customer repositories that permanently evolve independently
  with useful fixes trapped in individual implementations.

## Standing Decision Rules

All future TradesStack product, architecture, implementation and
customization decisions should respect these principles:

1. Main remains the source of truth.
2. Customers receive isolated dedicated implementations/environments.
3. Prefer configuration over permanent source-code divergence.
4. Useful improvements should flow into Main.
5. Creating, maintaining and upgrading customers must remain understandable,
   safe and repeatable.

## Authority Rule

This document defines current business/product intent. Where older
non-authoritative documentation describes a different commercial or product
model, this document governs future direction unless a newer explicit
architecture decision supersedes it.

It does not override technical/runtime truth. Current source code, migrations,
applied database state, generated contracts, tests and direct deployment
evidence determine what is actually implemented or proven.
