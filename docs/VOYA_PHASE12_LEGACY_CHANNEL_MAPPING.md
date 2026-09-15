# Phase 12 Legacy Channel Mapping Decision

The pre-Phase-12 audit found one live `DistributionChannel` (`VOYA_AGENT`), one enabled Agent Rate Plan mapping, and historical `ProductRevision.channels` values `B2B` and `B2C`.

`ProductRevision.channels` is preserved as deprecated historical metadata. It is not a canonical Channel eligibility mechanism, and the Product Builder DTO no longer accepts it for new writes. `B2B` and `B2C` were not converted into DistributionChannel rows because free-form labels do not prove a governed channel contract, mapping hierarchy, external identifier, or credential boundary.

The canonical source is now DistributionChannel plus versioned contracts and Product/Variant/Rate Plan mapping entities. A later phase may remove the database column after an explicit compatibility review.
