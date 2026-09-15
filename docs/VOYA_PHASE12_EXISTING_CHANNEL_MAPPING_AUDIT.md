# VOYA Phase 12 Existing Channel Mapping Audit

Generated at: 2026-09-14T10:52:26.225Z

This is a read-only audit of the live PostgreSQL database before Phase 12 schema or backfill mutation. Existing channel data remains authoritative; no B2B/B2C legacy values are converted into channels by this audit.

## Existing distribution channels

DistributionChannel count: **1**

| ID | Code | Name | Active |
|---|---|---|---|
| bea5761d-7fa4-4888-8f09-afbb48476904 | VOYA_AGENT | Voya Travel Agent Marketplace | true |

## Rate-plan channel mappings

Total mappings: **1**; enabled: **1**; disabled: **0**.

| Channel | Mappings | Enabled | Disabled |
|---|---:|---:|---:|
| VOYA_AGENT | 1 | 1 | 0 |

VOYA_AGENT identity found: **yes (bea5761d-7fa4-4888-8f09-afbb48476904)**.
Rate Plans without a VOYA_AGENT mapping: **44**.

## Products and variants represented by mappings

VOYA_AGENT mapped products: **1**; variants: **1**; rate plans: **1**.

## Booking distribution state

| Channel code | Distribution channel ID | Legacy channel value | Bookings |
|---|---|---|---:|
| (no DistributionChannel) |  | Direct — Voya | 1 |
| (no DistributionChannel) |  | GetYourGuide | 1 |
| (no DistributionChannel) |  | Klook | 1 |
| (no DistributionChannel) |  | MakeMyTrip | 1 |
| (no DistributionChannel) |  | Viator | 1 |
| VOYA_AGENT | bea5761d-7fa4-4888-8f09-afbb48476904 | VOYA_AGENT | 82 |

## Legacy ProductRevision.channels

ProductRevision rows: **35**; rows with non-empty channels: **35**.

Distinct historical values (metadata only; not canonical distribution mappings):

| Historical value | Revisions |
|---|---:|
| B2B | 30 |
| B2C | 27 |

Decision: `ProductRevision.channels` remains legacy metadata and is not used as the Phase 12 eligibility source of truth. Values such as B2B/B2C, if present, are not automatically materialized as DistributionChannel rows.

## Duplicate and consistency checks

Duplicate Product.productCode values: **0**.
Duplicate ProductVariant.variantCode values within a product: **0**.
Duplicate RatePlan.ratePlanCode values within a variant: **0**.
VOYA_AGENT hierarchy inconsistencies: **0**.

### Raw exception details

```json
{
  "ratePlansWithoutAgent": [
    {
      "id": "1fb5ee81-b634-40a7-a415-d674c6970c38",
      "ratePlanCode": "RP-DEMO-LISTING-01",
      "status": "ACTIVE",
      "variantCode": "STANDARD",
      "productCode": "ACT-0064C75B"
    },
    {
      "id": "055123a3-d457-41c9-9df3-c64f3cbc3ce5",
      "ratePlanCode": "RP-DEMO-LISTING-07",
      "status": "ACTIVE",
      "variantCode": "STANDARD",
      "productCode": "ACT-05BFB93A"
    },
    {
      "id": "df475b78-d911-4387-94e9-5e9a3aab5886",
      "ratePlanCode": "RP-DEMO-LISTING-03",
      "status": "ACTIVE",
      "variantCode": "STANDARD",
      "productCode": "ACT-159BAD1D"
    },
    {
      "id": "c5942598-3031-498b-878f-d548ed2eb083",
      "ratePlanCode": "RP-DEMO-LISTING-10",
      "status": "ACTIVE",
      "variantCode": "STANDARD",
      "productCode": "ACT-19D95EA2"
    },
    {
      "id": "cdffa7a8-8ad9-4810-a43a-b8e11d46f884",
      "ratePlanCode": "RP-DEMO-LISTING-08",
      "status": "ACTIVE",
      "variantCode": "STANDARD",
      "productCode": "ACT-218B858D"
    },
    {
      "id": "697b4ece-74a6-4bc3-ba84-7e25a89cdab4",
      "ratePlanCode": "RP-DEMO-LISTING-05",
      "status": "ACTIVE",
      "variantCode": "STANDARD",
      "productCode": "ACT-37611763"
    },
    {
      "id": "345a7ca2-3405-4bac-81a9-536e35893fe3",
      "ratePlanCode": "RP-COASTALKAYAKCO-1",
      "status": "ACTIVE",
      "variantCode": "STANDARD",
      "productCode": "ACT-3F3D75CA"
    },
    {
      "id": "ab33a1b1-e1f1-46d2-8b29-fe9002a2ff21",
      "ratePlanCode": "RP-FORTKOCHIWALKS-2",
      "status": "ACTIVE",
      "variantCode": "STANDARD",
      "productCode": "ACT-40D01A20"
    },
    {
      "id": "553e1054-c8ca-4c41-812e-1577cd9d416d",
      "ratePlanCode": "RP-DEMO-LISTING-02",
      "status": "ACTIVE",
      "variantCode": "STANDARD",
      "productCode": "ACT-5945DAC8"
    },
    {
      "id": "67511e96-d321-4871-a313-407c3bc7924a",
      "ratePlanCode": "RP-FORTKOCHIWALKS-1",
      "status": "ACTIVE",
      "variantCode": "STANDARD",
      "productCode": "ACT-5F2EED62"
    },
    {
      "id": "25ed99e1-bbf2-45b1-9dcc-43487e82c7bb",
      "ratePlanCode": "RP-DEMO-LISTING-04",
      "status": "ACTIVE",
      "variantCode": "STANDARD",
      "productCode": "ACT-67BD0741"
    },
    {
      "id": "1d9e61e9-72b0-426e-ad35-3b58b3061f08",
      "ratePlanCode": "RP-DEMO-LISTING-06",
      "status": "ACTIVE",
      "variantCode": "STANDARD",
      "productCode": "ACT-7AD87FE8"
    },
    {
      "id": "b06acb55-d042-4b31-bdfb-5a4a6ff66d78",
      "ratePlanCode": "RP-MEAL-DINNER",
      "status": "ACTIVE",
      "variantCode": "MEAL_DINNER",
      "productCode": "ACT-7E85A5F1"
    },
    {
      "id": "146d5201-e9a3-4c17-b01b-ce1129d857c5",
      "ratePlanCode": "SEED-MEAL_DINNER",
      "status": "ACTIVE",
      "variantCode": "MEAL_DINNER",
      "productCode": "ACT-7E85A5F1"
    },
    {
      "id": "f2b335f7-e2a2-4e07-9378-9b36cebb149c",
      "ratePlanCode": "RP-MEAL-LUNCH",
      "status": "ACTIVE",
      "variantCode": "MEAL_LUNCH",
      "productCode": "ACT-7E85A5F1"
    },
    {
      "id": "c10e944b-4c4e-4491-9a24-99dd397693fc",
      "ratePlanCode": "SEED-MEAL_LUNCH",
      "status": "ACTIVE",
      "variantCode": "MEAL_LUNCH",
      "productCode": "ACT-7E85A5F1"
    },
    {
      "id": "59624c01-024d-4516-91c3-d44a3eb8d402",
      "ratePlanCode": "RP-DEMO-LISTING-09",
      "status": "ACTIVE",
      "variantCode": "STANDARD",
      "productCode": "ACT-92E4154C"
    },
    {
      "id": "f04e5a3b-5753-48c3-8288-1494269a9fb3",
      "ratePlanCode": "RP-KERALATRAILS-1",
      "status": "ACTIVE",
      "variantCode": "STANDARD",
      "productCode": "ACT-94FB96A7"
    },
    {
      "id": "3643644c-4cc4-4c5a-99ac-e92cab7211e6",
      "ratePlanCode": "SEED-ATHI_PRIVATE",
      "status": "ACTIVE",
      "variantCode": "ATHI_PRIVATE",
      "productCode": "ACT-B82B9C16"
    },
    {
      "id": "9742f116-6941-4233-b775-a9ea5d278610",
      "ratePlanCode": "RP-ATHI-PRIVATE",
      "status": "ACTIVE",
      "variantCode": "ATHI_PRIVATE_VEHICLE",
      "productCode": "ACT-B82B9C16"
    },
    {
      "id": "9d8095d7-5ca7-443f-bf6b-ab15eaeb12be",
      "ratePlanCode": "SEED-ATHI_STANDARD",
      "status": "ACTIVE",
      "variantCode": "ATHI_STANDARD",
      "productCode": "ACT-B82B9C16"
    },
    {
      "id": "57ba046c-bf0d-4d84-b058-5eec1dae0f91",
      "ratePlanCode": "RP-ATHI-STANDARD",
      "status": "ACTIVE",
      "variantCode": "ATHI_STANDARD_WATERFALL",
      "productCode": "ACT-B82B9C16"
    },
    {
      "id": "70ac9a06-42b0-4a8e-aeea-421e599a009c",
      "ratePlanCode": "RP-PHOTO-BASIC",
      "status": "ACTIVE",
      "variantCode": "PHOTO_BASIC",
      "productCode": "ACT-C2304359"
    },
    {
      "id": "711e7e83-c738-4035-890d-1bff5b9252fb",
      "ratePlanCode": "SEED-PHOTO_BASIC",
      "status": "ACTIVE",
      "variantCode": "PHOTO_BASIC",
      "productCode": "ACT-C2304359"
    },
    {
      "id": "3d53d85b-a4fa-4b57-a26d-c2bed23ad642",
      "ratePlanCode": "RP-DEMO-001",
      "status": "ACTIVE",
      "variantCode": "PHOTO_PREMIUM",
      "productCode": "ACT-C2304359"
    },
    {
      "id": "7d8baba3-55db-4f9c-82cc-f98ce74f0738",
      "ratePlanCode": "RP-DEMO-MTWEI4SR",
      "status": "ACTIVE",
      "variantCode": "PHOTO_PREMIUM",
      "productCode": "ACT-C2304359"
    },
    {
      "id": "5b92de86-0aee-4f86-b559-858ae2766a7a",
      "ratePlanCode": "RP-DEMO-MTWEO6SS",
      "status": "ACTIVE",
      "variantCode": "PHOTO_PREMIUM",
      "productCode": "ACT-C2304359"
    },
    {
      "id": "8dc6245f-9bfd-4f13-a0cf-3af660e6da4e",
      "ratePlanCode": "RP-PHOTO-PREMIUM",
      "status": "ACTIVE",
      "variantCode": "PHOTO_PREMIUM",
      "productCode": "ACT-C2304359"
    },
    {
      "id": "03760f51-e391-411d-a272-b6fcabe3237f",
      "ratePlanCode": "SEED-PHOTO_PREMIUM",
      "status": "ACTIVE",
      "variantCode": "PHOTO_PREMIUM",
      "productCode": "ACT-C2304359"
    },
    {
      "id": "905af3b1-ff58-4331-8bf8-200d2c49d274",
      "ratePlanCode": "RP-COASTALKAYAKCO-2",
      "status": "ACTIVE",
      "variantCode": "STANDARD",
      "productCode": "ACT-C919D3B2"
    },
    {
      "id": "f7e5bfcc-9eea-4755-a38e-35989204e53e",
      "ratePlanCode": "RP-KERALATRAILS-2",
      "status": "ACTIVE",
      "variantCode": "STANDARD",
      "productCode": "ACT-E73BDC0C"
    },
    {
      "id": "9c4900e5-3d34-4b96-8aa8-f54cf8993e5a",
      "ratePlanCode": "RP-TREK-PRIVATE",
      "status": "ACTIVE",
      "variantCode": "SUNRISE_PRIVATE_SUV",
      "productCode": "ACT-F7C5F1E9"
    },
    {
      "id": "dbcaffd8-bb70-4441-a0c0-a3705d01b040",
      "ratePlanCode": "SEED-SUNRISE_PRIVATE_SUV",
      "status": "ACTIVE",
      "variantCode": "SUNRISE_PRIVATE_SUV",
      "productCode": "ACT-F7C5F1E9"
    },
    {
      "id": "946afc1e-e80f-4721-823a-5d5d7bdbf3e1",
      "ratePlanCode": "RP-367422",
      "status": "ACTIVE",
      "variantCode": "SUNRISE_SHARED_0600",
      "productCode": "ACT-F7C5F1E9"
    },
    {
      "id": "f89f8e8c-3556-4723-bb6d-8dcc28a9bda8",
      "ratePlanCode": "RP-574420",
      "status": "ACTIVE",
      "variantCode": "SUNRISE_SHARED_0600",
      "productCode": "ACT-F7C5F1E9"
    },
    {
      "id": "0d400c97-a4b5-46a1-8c8f-efaf7425823f",
      "ratePlanCode": "RP-678803",
      "status": "ACTIVE",
      "variantCode": "SUNRISE_SHARED_0600",
      "productCode": "ACT-F7C5F1E9"
    },
    {
      "id": "2d99cea0-5093-494b-aae0-cfbd5395adb6",
      "ratePlanCode": "RP-TREK-SUNSET",
      "status": "ACTIVE",
      "variantCode": "SUNSET_TREK",
      "productCode": "ACT-F7C5F1E9"
    },
    {
      "id": "0e9e5bad-1308-497e-b58c-ea65bbcbdb43",
      "ratePlanCode": "SEED-SUNSET_TREK",
      "status": "ACTIVE",
      "variantCode": "SUNSET_TREK",
      "productCode": "ACT-F7C5F1E9"
    },
    {
      "id": "f33dbe44-e552-490e-adf7-4672236a21a9",
      "ratePlanCode": "RP-BUS-SEMI",
      "status": "ACTIVE",
      "variantCode": "BUS_SEMI_SLEEPER",
      "productCode": "ACT-FBA74995"
    },
    {
      "id": "b6fa03d3-feb0-4154-8206-06d567212e67",
      "ratePlanCode": "SEED-BUS_SEMI_SLEEPER",
      "status": "ACTIVE",
      "variantCode": "BUS_SEMI_SLEEPER",
      "productCode": "ACT-FBA74995"
    },
    {
      "id": "f2d0544d-ada6-4339-9335-8946b6c0c016",
      "ratePlanCode": "RP-DEMO-MTZEHIMA",
      "status": "ACTIVE",
      "variantCode": "SUNRISE_SHARED_DEMO-MTZEHIMA",
      "productCode": "DEMO-SUNRISE-TREK-MTZEHIMA"
    },
    {
      "id": "b501585b-6b98-4b88-9787-625d4e0710a2",
      "ratePlanCode": "SWAGGER-RP-1789095034978",
      "status": "ACTIVE",
      "variantCode": "SWAGGER-VAR-1789095034978",
      "productCode": "SWAGGER-FULL-1789095034978"
    },
    {
      "id": "9f319c37-aa64-4a60-b577-5138333016ff",
      "ratePlanCode": "UAT-AGENT",
      "status": "ACTIVE",
      "variantCode": "SHARED",
      "productCode": "UAT-1789073566374"
    },
    {
      "id": "4ffc25c9-ead1-4cec-999c-c673228ac711",
      "ratePlanCode": "UAT-B2B",
      "status": "ACTIVE",
      "variantCode": "SHARED",
      "productCode": "UAT-1789073566374"
    }
  ],
  "duplicateProductCodes": [],
  "duplicateVariantCodes": [],
  "duplicateRatePlanCodes": [],
  "hierarchyIssues": []
}
```

## Phase 12 migration consequence

The existing VOYA_AGENT channel must retain its ID and code. Phase 12 backfill may classify and enrich that channel, create only the required internal contract and canonical mappings, and must not fabricate external channels or rewrite bookings/snapshots.
