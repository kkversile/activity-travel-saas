# Phase 11 — Supply Workflow

Admin Demand is a lightweight operating queue with overview KPIs, filters, read-only preview, immutable generation evidence, source-trace detail, lifecycle actions, owner/priority controls, and manual Vendor targeting. Candidate Vendors are verified Vendor tenants only; Admin selection is explicit and never ranked by Tier or Quality.

Targeted Vendors see only their own `DemandOpportunityVendorTarget` projection. They may mark an opportunity Interested or Declined with an optional note. The projection contains aggregate demand and requested action only: no Agent PII, raw search history, competitor names, competitor prices, or other Vendor quality details.

Tier and latest Quality score are contextual information only. An ELITE Vendor that is not targeted has no access; a RESTRICTED Vendor that is explicitly targeted can respond. Interested/declined responses do not mutate Product, Schedule, Inventory, Commercial, Settlement, Payout, ranking, or eligibility. Supply changes remain in the existing Product Builder, Inventory, Schedules, and Commercial workflows.

The Admin workspace also provides a Demand Policy tab, manual opportunity form, owner selection restricted to active platform Admin/SubAdmin users, reasoned priority override, explicit target selection, and paginated filters for priority, destination, category, owner, target Vendor, and service-date range. Vendors have Active and Responded/History views so declined or interested work is not silently lost.

Vendor Active contains only TARGETED and VIEWED. Responded/History contains INTERESTED, DECLINED, and ACTION_TAKEN; REMOVED is Admin-only. Removal revokes detail, view, and response access immediately. Explicit retargeting re-stamps the current Admin and targeted time, clears the previous response cycle, and records VENDOR_RETARGETED plus Audit history.
