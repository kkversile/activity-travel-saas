import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { ErrorBox, Field, Loading, Panel } from "../components/Ui";

type Product = {
  id: string;
  productCode: string;
  name: string;
  type: string;
  subType?: string;
  cityName?: string | null;
  stateName?: string | null;
  countryName?: string | null;
  destination: string;
  vendor: { id: string; name: string };
  status: string;
  experienceMasterId?: string | null;
};
type Suggestion = {
  id: string;
  confidence: number;
  fingerprint: string;
  source: Product;
  candidate: Product;
};
type Master = {
  id: string;
  publicCode?: string | null;
  canonicalName: string;
  displayMode: "SINGLE_OFFER" | "ALL_OFFERS";
  selectionPolicy:
    "CHEAPEST" | "BALANCED" | "HIGHEST_COMMISSION" | "ADMIN_SELECTED";
  products: Product[];
  options?: Array<{ id: string; publicCode?: string | null; name: string; placements: Array<{ productVariantId: string; productVariant: { name: string; productId: string } }> }>;
  placements?: Array<{ productId: string; pinnedUntil?: string | null; pinnedById?: string | null; pinReason?: string | null }>;
};
type ProductSearchPage = { items: Product[]; pagination: { page: number; total: number; totalPages: number } };
type SelectionRules = {
  id: string;
  scope: string;
  objective: "MARGIN" | "LOWEST_PRICE";
  priceWeight: number;
  ratingWeight: number;
  reliabilityWeight: number;
  inventoryWeight: number;
  contractWeight: number;
  autoFailover: boolean;
  absorbPriceGap: "LOWER_OF_50_OR_5_PERCENT" | "100" | "NEVER";
  lockMinutes: 10 | 15 | 30;
  allocation: "WINNER_TAKES_ALL" | "SPLIT_70_30" | "ROUND_ROBIN";
  status: string;
  liveStatus?: string;
  pendingConfiguration?: Partial<SelectionRules> | null;
  pendingUpdatedById?: string | null;
};
type MasterPreview = {
  serviceDate: string;
  channel: "WEB" | "AGENT" | "API";
  rulesStatus: string;
  provisional?: boolean;
  marginFloorPercent?: number;
  allocationApplied?: boolean;
  masterOption?: { id: string; publicCode?: string | null } | null;
  offers: Array<{
    productId: string;
    productVariantId: string;
    productCode: string;
    vendor: string;
    vendorId: string;
    offerName: string;
    ratePlanCode: string;
    publicCode?: string | null;
    ratePlanPublicCode?: string | null;
    masterOptionCode?: string | null;
    masterOptionName?: string | null;
    price: number;
    currency: string;
    rating: number | null;
    ratingAvailable?: boolean;
    reliability?: number | null;
    reliabilityAvailable?: boolean;
    connectionType?: string | null;
    availableCapacity?: number;
    sessionId?: string | null;
    productPublished?: boolean;
    vendorVerified?: boolean;
    bookingMode?: string | null;
    channelAvailable: boolean;
    channelEligible?: boolean;
    channelEligibilityReasonCodes?: string[];
    marginFloorStatus?: "PASS" | "FAIL" | "UNVERIFIED";
    netMarginPercent?: number | null;
    commercialReady?: boolean;
    score: number;
    eligible: boolean;
    provisionalEligible?: boolean;
    selected: boolean;
  }>;
  winnerProductId: string | null;
  winnerRatePlanCode: string | null;
  pin?: { productId: string; productVariantId?: string | null; pinnedUntil?: string | null; reason?: string | null; applied: boolean; unavailable: boolean } | null;
};
type MatchingInsight = {
  vendorId: string;
  vendorName: string;
  mappedOffers: number;
  bookings30d: number;
  winRate: number | null;
  mainReasonWhenLosing: string;
  failoversHandled: number;
  declines30d: number;
};

const normalize = (value: unknown) =>
  String(value ?? "")
    .trim()
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
const scoreFields = [
  { key: "name", label: "Product name", weight: 40 },
  { key: "type", label: "Type", weight: 15 },
  { key: "cityName", label: "City", weight: 15 },
  { key: "stateName", label: "State", weight: 15 },
  { key: "countryName", label: "Country", weight: 15 },
] as const;

function connectionLabel(value?: string | null) {
  if (value === 'SUPPLIER_API') return 'Supplier API';
  if (value === 'SUPPLIER_BARCODE_POOL') return 'Barcode pool';
  if (value === 'PLATFORM') return 'Platform issued';
  if (value === 'NONE') return 'Manual';
  return 'Not configured';
}

export default function AdminExperienceMatching({ canApprove = false }: { canApprove?: boolean }) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [masters, setMasters] = useState<Master[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [productsA, setProductsA] = useState<Product[]>([]);
  const [productsB, setProductsB] = useState<Product[]>([]);
  const [productsAPagination, setProductsAPagination] = useState({ page: 1, total: 0, totalPages: 1 });
  const [productsBPagination, setProductsBPagination] = useState({ page: 1, total: 0, totalPages: 1 });
  const [vendors, setVendors] = useState<any[]>([]);
  const [selectionRules, setSelectionRules] = useState<SelectionRules | null>(
    null,
  );
  const [ruleDraft, setRuleDraft] = useState<SelectionRules | null>(null);
  const [ruleScope, setRuleScope] = useState<
    "GLOBAL" | "VOYA_WEB" | "VOYA_AGENT" | "VOYA_API"
  >("GLOBAL");
  const [previewMasterId, setPreviewMasterId] = useState("");
  const [previewOptionCode, setPreviewOptionCode] = useState("");
  const [previewDate, setPreviewDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [previewChannel, setPreviewChannel] = useState<"WEB" | "AGENT" | "API">(
    "WEB",
  );
  const [previewAgentTenantId, setPreviewAgentTenantId] = useState("");
  const [agents, setAgents] = useState<Array<{ id: string; name: string; agentProfile?: { verificationStatus?: string | null } | null }>>([]);
  const [preview, setPreview] = useState<MasterPreview | null>(null);
  const [insights, setInsights] = useState<MatchingInsight[]>([]);
  const [searchA, setSearchA] = useState("");
  const [searchB, setSearchB] = useState("");
  const [vendorA, setVendorA] = useState("");
  const [vendorB, setVendorB] = useState("");
  const [selectedProductA, setSelectedProductA] = useState("");
  const [selectedProductB, setSelectedProductB] = useState("");
  const [productPageA, setProductPageA] = useState(1);
  const [productPageB, setProductPageB] = useState(1);
  const [linkMasterId, setLinkMasterId] = useState("");
  const [linkSearch, setLinkSearch] = useState("");
  const [linkVendorId, setLinkVendorId] = useState("");
  const [linkPage, setLinkPage] = useState(1);
  const [linkProducts, setLinkProducts] = useState<Product[]>([]);
  const [linkPagination, setLinkPagination] = useState({ page: 1, total: 0, totalPages: 1 });
  const [linkRefreshKey, setLinkRefreshKey] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [activeTab, setActiveTab] = useState<
    "map" | "master" | "rules" | "insights"
  >("map");

  const load = async () => {
    const [
      nextSuggestions,
      nextMasters,
      nextProducts,
      nextVendors,
      nextAgents,
      nextSelectionRules,
      nextInsights,
    ] = await Promise.all([
      api.request<Suggestion[]>("/admin/experience-matching/suggestions"),
      api.request<Master[]>("/admin/experience-matching/masters"),
      api.request<ProductSearchPage>("/admin/experience-matching/products?limit=25"),
      api.request<any[]>("/admin/vendors"),
      api.request<any[]>("/admin/agents"),
      api.request<SelectionRules>(
        `/admin/experience-matching/selection-rules?scope=${ruleScope}`,
      ),
      api.request<MatchingInsight[]>("/admin/experience-matching/insights"),
    ]);
    setSuggestions(nextSuggestions);
    setMasters(nextMasters);
    setProducts(nextProducts.items || []);
    setProductsA(nextProducts.items || []);
    setProductsB(nextProducts.items || []);
    setProductsAPagination(nextProducts.pagination || { page: 1, total: nextProducts.items?.length || 0, totalPages: 1 });
    setProductsBPagination(nextProducts.pagination || { page: 1, total: nextProducts.items?.length || 0, totalPages: 1 });
    setVendors(nextVendors);
    setAgents(nextAgents);
    setSelectionRules(nextSelectionRules);
    setRuleDraft(nextSelectionRules);
    setInsights(nextInsights);
    setPreviewMasterId((current) => current || nextMasters[0]?.id || "");
    setLinkMasterId((current) => current || nextMasters[0]?.id || "");
    setPreviewAgentTenantId((current) => current || nextAgents.find((agent: any) => agent.agentProfile?.verificationStatus === "APPROVED")?.id || "");
  };

  useEffect(() => {
    load().catch((e) => setError((e as Error).message));
  }, []);
  useEffect(() => {
    if (!previewMasterId) {
      setPreview(null);
      return;
    }
    const path = previewOptionCode
      ? `/admin/master-options/${encodeURIComponent(previewOptionCode)}/ranking`
      : `/admin/experience-matching/masters/${previewMasterId}/preview`;
    api
      .request<MasterPreview>(`${path}?serviceDate=${previewDate}&channel=${previewChannel}${previewChannel === "AGENT" && previewAgentTenantId ? `&agentTenantId=${encodeURIComponent(previewAgentTenantId)}` : ""}`)
      .then(setPreview)
      .catch((e) => setError((e as Error).message));
  }, [previewMasterId, previewOptionCode, previewDate, previewChannel, previewAgentTenantId]);

  const productA = products.find((item) => item.id === selectedProductA) || productsA.find((item) => item.id === selectedProductA) || productsB.find((item) => item.id === selectedProductA);
  const productB = products.find((item) => item.id === selectedProductB) || productsA.find((item) => item.id === selectedProductB) || productsB.find((item) => item.id === selectedProductB);
  const differentVendors = Boolean(
    productA && productB && productA.vendor.id !== productB.vendor.id,
  );
  const pairReady = Boolean(productA && productB && differentVendors);
  const matchScore = useMemo(() => {
    if (!productA || !productB) return null;
    const fields = scoreFields.map((field) => ({
      ...field,
      matched:
        normalize(productA[field.key]) === normalize(productB[field.key]) &&
        Boolean(normalize(productA[field.key])),
    }));
    return {
      score: fields.reduce(
        (total, field) => total + (field.matched ? field.weight : 0),
        0,
      ),
      fields,
    };
  }, [productA, productB]);
  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams({ page: String(productPageA), limit: "25" });
      if (searchA.trim()) params.set("search", searchA.trim());
      if (vendorA) params.set("vendorId", vendorA);
      api.request<ProductSearchPage>(`/admin/experience-matching/products?${params}`).then((result) => {
        if (!active) return;
        setProductsA(result.items);
        setProductsAPagination(result.pagination);
        setProducts((current) => [...new Map([...current, ...result.items].map((item) => [item.id, item])).values()]);
      }).catch((e) => { if (active) setError((e as Error).message); });
    }, 200);
    return () => { active = false; window.clearTimeout(timer); };
  }, [searchA, vendorA, productPageA]);

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams({ page: String(productPageB), limit: "25" });
      if (searchB.trim()) params.set("search", searchB.trim());
      if (vendorB) params.set("vendorId", vendorB);
      api.request<ProductSearchPage>(`/admin/experience-matching/products?${params}`).then((result) => {
        if (!active) return;
        setProductsB(result.items);
        setProductsBPagination(result.pagination);
        setProducts((current) => [...new Map([...current, ...result.items].map((item) => [item.id, item])).values()]);
      }).catch((e) => { if (active) setError((e as Error).message); });
    }, 200);
    return () => { active = false; window.clearTimeout(timer); };
  }, [searchB, vendorB, productPageB]);

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams({ page: String(linkPage), limit: "25" });
      if (linkSearch.trim()) params.set("search", linkSearch.trim());
      if (linkVendorId) params.set("vendorId", linkVendorId);
      api.request<ProductSearchPage>(`/admin/experience-matching/products?${params}`).then((result) => {
        if (!active) return;
        const unlinked = result.items.filter((item) => !item.experienceMasterId);
        setLinkProducts(unlinked);
        setLinkPagination(result.pagination);
        setProducts((current) => [...new Map([...current, ...result.items].map((item) => [item.id, item])).values()]);
      }).catch((e) => { if (active) setError((e as Error).message); });
    }, 200);
    return () => { active = false; window.clearTimeout(timer); };
  }, [linkSearch, linkVendorId, linkPage, linkRefreshKey]);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function accept(suggestion: Suggestion) {
    await run(async () => {
      await api.request<Master>(`/admin/mapping-suggestions/${suggestion.id}/decide`, {
        method: "POST",
        body: JSON.stringify({ decision: "ACCEPT", canonicalName: suggestion.source.name }),
      });
      setNotice(
        `Created a new experience master for ${suggestion.source.name} and linked both products.`,
      );
    });
  }

  async function reject(id: string) {
    await run(async () => {
      await api.request(`/admin/mapping-suggestions/${id}/decide`, {
        method: "POST",
        body: JSON.stringify({ decision: "REJECT" }),
      });
    });
  }

  async function createMasterAndLinkPair() {
    if (!productA || !productB || !differentVendors) return;
    await run(async () => {
      const created = await api.request<Master>(
        "/admin/experience-matching/masters",
        {
          method: "POST",
          body: JSON.stringify({
            productId: productA.id,
            canonicalName: productA.name,
          }),
        },
      );
      await api.request(
        `/admin/experience-matching/masters/${created.id}/products`,
        {
          method: "POST",
          body: JSON.stringify({
            productId: productB.id,
            reason: "Manually confirmed cross-vendor match",
          }),
        },
      );
      setSelectedProductA("");
      setSelectedProductB("");
      setNotice(
        `Created a new experience master “${created.canonicalName}” with exactly these two vendor products.`,
      );
    });
  }

  async function updateMaster(master: Master, patch: Record<string, string>) {
    await run(async () => {
      await api.request(`/admin/experience-matching/masters/${master.id}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
    });
  }
  async function linkOffer(master: Master, product: Product) {
    await run(async () => {
      await api.request(`/admin/experience-matching/masters/${master.id}/products`, {
        method: "POST",
        body: JSON.stringify({ productId: product.id, reason: "Manually mapped by Admin" }),
      });
      setLinkRefreshKey((key) => key + 1);
      setNotice(`Linked ${product.name} to ${master.canonicalName}.`);
    });
  }
  async function unlinkOffer(master: Master, product: Product) {
    await run(async () => {
      await api.request(`/admin/experience-matching/masters/${master.id}/products/${product.id}`, {
        method: "DELETE",
      });
      setLinkRefreshKey((key) => key + 1);
      setNotice(`Unlinked ${product.name} from ${master.canonicalName}.`);
    });
  }
  async function pinOffer(master: Master, productId: string, pinned: boolean, productVariantId?: string) {
    await run(async () => {
      const pinTarget = productVariantId && previewOptionCode ? `/admin/master-options/${encodeURIComponent(previewOptionCode)}/pin` : `/admin/experience-matching/masters/${master.id}/pin`;
      await api.request(pinTarget, {
        method: "POST",
        body: JSON.stringify({ productId, ...(productVariantId ? { productVariantId } : {}), pinned, reason: pinned ? "Pinned by Admin" : undefined }),
      });
      setLinkRefreshKey((key) => key + 1);
      setNotice(pinned ? "Supplier offer pinned. It will be selected only while eligible." : "Supplier pin removed.");
    });
  }
  async function mapOption(source: NonNullable<Master["options"]>[number], productVariantId: string, targetMasterOptionId: string) {
    if (!source || targetMasterOptionId === source.id) return;
    await run(async () => {
      await api.request(`/admin/master-options/${encodeURIComponent(source.publicCode || source.id)}/map`, {
        method: "POST",
        body: JSON.stringify({ productVariantId, targetMasterOptionId }),
      });
      const nextMasters = await api.request<Master[]>("/admin/experience-matching/masters");
      setMasters(nextMasters);
      setNotice("Supplier option mapping saved.");
    });
  }
  async function updateSelectionRules(
    patch: Partial<SelectionRules> & { submitForApproval?: boolean },
  ) {
    if (!selectionRules) return;
    await run(async () => {
      const updated = await api.request<SelectionRules>(
        "/admin/experience-matching/selection-rules",
        {
          method: "PATCH",
          body: JSON.stringify({ ...patch, scope: ruleScope }),
        },
      );
      setSelectionRules(updated);
      setRuleDraft(updated);
      setNotice(
        updated.status === "PENDING_APPROVAL"
          ? "Selection rules submitted for approval."
          : "Selection rules saved.",
      );
    });
  }
  async function approveSelectionRules() {
    await run(async () => {
      const updated = await api.request<SelectionRules>(
        "/admin/experience-matching/selection-rules/approve",
        { method: "POST", body: JSON.stringify({ scope: ruleScope }) },
      );
      setSelectionRules(updated);
      setRuleDraft(updated);
      setNotice("Selection rules approved and are now live.");
    });
  }
  async function changeRuleScope(scope: typeof ruleScope) {
    setRuleScope(scope);
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const next = await api.request<SelectionRules>(
        `/admin/experience-matching/selection-rules?scope=${scope}`,
      );
      setSelectionRules(next);
      setRuleDraft(next);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const vendorOptions = vendors.map((vendor) => (
    <option key={vendor.id} value={vendor.id}>
      {vendor.vendorProfile?.legalBusinessName || vendor.name}
    </option>
  ));
  const mappedOfferCount = masters.reduce(
    (total, master) => total + master.products.length,
    0,
  );
  const multiVendorMasterCount = masters.filter(
    (master) =>
      new Set(master.products.map((product) => product.vendor.id)).size > 1,
  ).length;
  const failovers30d = insights.reduce(
    (total, item) => total + item.failoversHandled,
    0,
  );

  return (
    <div className="experience-matching-page">
      <div className="admin-hero">
        <div>
          <h2>Multi-supplier engine</h2>
          <p className="muted">
            One listing per experience on every channel. Vendors' rate plans are
            mapped to master options, and the engine picks which vendor gets
            each booking.
          </p>
        </div>
      </div>
      <Panel title="How it works">
        <div className="matching-flow">
          <span className="matching-flow-node">
            <b>Vendor uploads activity</b>
            <small>supplier offer</small>
          </span>
          <i>→</i>
          <span className="matching-flow-node">
            <b>Mapping</b>
            <small>merge into a master option</small>
          </span>
          <i>→</i>
          <span className="matching-flow-node">
            <b>Master product</b>
            <small>one listing on web, agents, API</small>
          </span>
          <i>→</i>
          <span className="matching-flow-node">
            <b>Selection</b>
            <small>eligible offers scored</small>
          </span>
          <i>→</i>
          <span className="matching-flow-node">
            <b>Winner gets booking</b>
            <small>backup takes over on failure</small>
          </span>
        </div>
      </Panel>
      <div className="matching-kpis">
        <div className="matching-kpi">
          <span>Master products</span>
          <b>{masters.length}</b>
          <small>from {mappedOfferCount} mapped supplier activities</small>
        </div>
        <div className="matching-kpi">
          <span>With 2+ vendors</span>
          <b>{multiVendorMasterCount}</b>
          <small>duplicate offers consolidated into one listing</small>
        </div>
        <div className="matching-kpi attention">
          <span>Mapping suggestions</span>
          <b>{suggestions.length}</b>
          <small>waiting for content team</small>
        </div>
        <div className="matching-kpi">
          <span>Failovers · 30 days</span>
          <b>{failovers30d}</b>
          <small>bookings saved by a backup vendor</small>
        </div>
      </div>
      <div
        className="admin-tabs"
        role="tablist"
        aria-label="Multi-supplier engine sections"
      >
        <button
          className={activeTab === "map" ? "active" : ""}
          role="tab"
          aria-selected={activeTab === "map"}
          onClick={() => setActiveTab("map")}
        >
          Mapping queue{" "}
          <span className="admin-tab-count">{suggestions.length}</span>
        </button>
        <button
          className={activeTab === "master" ? "active" : ""}
          role="tab"
          aria-selected={activeTab === "master"}
          onClick={() => setActiveTab("master")}
        >
          Master products
        </button>
        <button
          className={activeTab === "rules" ? "active" : ""}
          role="tab"
          aria-selected={activeTab === "rules"}
          onClick={() => setActiveTab("rules")}
        >
          Selection rules
        </button>
        <button
          className={activeTab === "insights" ? "active" : ""}
          role="tab"
          aria-selected={activeTab === "insights"}
          onClick={() => setActiveTab("insights")}
        >
          Vendor win rates
        </button>
      </div>
      {error && <ErrorBox error={error} />}
      {notice && <div className="alert info">{notice}</div>}
      <div className={activeTab === "map" ? "" : "admin-tab-panel-hidden"}>
        <Panel title="Possible same experiences">
          <p className="muted">
            Suggestions use an exact normalized match of product name, type,
            city, state and country, and only compare different vendors. Nothing
            is linked automatically.
          </p>
          {suggestions.length ? (
            <div className="matching-suggestion-list">
              {suggestions.map((item) => (
                <div className="matching-suggestion" key={item.id}>
                  <div>
                    <b>{item.source.name}</b>
                    <small>
                      {item.source.vendor.name} · {item.source.destination}
                    </small>
                  </div>
                  <span className="matching-arrow">↔</span>
                  <div>
                    <b>{item.candidate.name}</b>
                    <small>
                      {item.candidate.vendor.name} ·{" "}
                      {item.candidate.destination}
                    </small>
                  </div>
                  <span className="matching-confidence">
                    {item.confidence}% match
                  </span>
                  <div className="row-actions">
                    <button
                      className="btn primary small"
                      disabled={busy}
                      onClick={() => void accept(item)}
                    >
                      Create master
                    </button>
                    <button
                      className="btn small"
                      disabled={busy}
                      onClick={() => void reject(item.id)}
                    >
                      Not the same
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty">
              No new cross-vendor exact matches found.
            </div>
          )}
        </Panel>
      </div>
      <div className={activeTab === "master" ? "" : "admin-tab-panel-hidden"}>
        {masters.length > 0 && (
          <Panel title="Master product preview">
            <p className="muted">
              Check which eligible vendor offer wins for a date and channel.
              This preview uses the persisted selection rule set and live
              product, commercial and channel data.
            </p>
            <div className="form-grid four matching-preview-toolbar">
              <Field label="Master product">
                <select
                  value={previewMasterId}
                  onChange={(event) => { setPreviewMasterId(event.target.value); setPreviewOptionCode(""); }}
                >
                  {masters.map((master) => (
                    <option key={master.id} value={master.id}>
                      {master.canonicalName}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Master option">
                <select value={previewOptionCode} onChange={(event) => setPreviewOptionCode(event.target.value)}>
                  <option value="">All options</option>
                  {masters.find((master) => master.id === previewMasterId)?.options?.map((option) => <option key={option.id} value={option.publicCode || option.id}>{option.publicCode ? `${option.publicCode} · ` : ""}{option.name}</option>)}
                </select>
              </Field>
              <Field label="Who wins on">
                <input
                  type="date"
                  value={previewDate}
                  onChange={(event) => setPreviewDate(event.target.value)}
                />
              </Field>
              <Field label="Channel">
                <select
                  value={previewChannel}
                  onChange={(event) =>
                    setPreviewChannel(
                      event.target.value as typeof previewChannel,
                    )
                  }
                >
                  <option value="WEB">Website & app</option>
                  <option value="AGENT">Travel agents</option>
                  <option value="API">API partners</option>
                </select>
              </Field>
              {previewChannel === "AGENT" && (
                <Field label="Agent margin context">
                  <select
                    value={previewAgentTenantId}
                    onChange={(event) => setPreviewAgentTenantId(event.target.value)}
                  >
                    <option value="">No agent selected · provisional</option>
                    {agents.filter((agent) => agent.agentProfile?.verificationStatus === "APPROVED").map((agent) => (
                      <option key={agent.id} value={agent.id}>{agent.name}</option>
                    ))}
                  </select>
                  <small>Choose an approved agent to include its active commission terms in the 4% margin check.</small>
                </Field>
              )}
            </div>
            {preview && (
              <>
                <div className="matching-preview-summary">
                  <span>Rules: {preview.rulesStatus.replaceAll("_", " ")}</span>
                  <span>
                    {preview.offers.filter((offer) => offer.eligible).length} eligible
                    {preview.provisional ? ` · ${preview.offers.filter((offer) => offer.provisionalEligible).length} provisional` : ""}
                  </span>
                  <b>
                    {preview.winnerProductId
                      ? `${preview.provisional ? "Provisional winner" : "Winner"}: ${preview.offers.find((offer) => offer.selected)?.vendor || "selected offer"}`
                      : "No eligible winner"}
                  </b>
                </div>
                {preview.provisional && <p className="muted">This result is provisional. Select an approved agent to evaluate agent commission and confirm the {preview.marginFloorPercent ?? 4}% net-margin floor.</p>}
                {preview.offers.length ? (
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Vendor</th>
                          <th>Offer</th>
                          <th>Price</th>
                          <th>Net margin</th>
                          <th>Rating</th>
                          <th>Reliability</th>
                          <th>Connection</th>
                          <th>Score</th>
                          <th>Availability</th>
                          <th>Outcome</th>
                          <th>Supplier pin</th>
                        </tr>
                      </thead>
                      <tbody>
                        {preview.offers.map((offer) => (
                          <tr key={`${offer.productId}-${offer.ratePlanCode}`}>
                            <td>
                              <b>{offer.vendor}</b>
                              <small className="muted">
                                {offer.productCode}
                                {offer.publicCode ? ` · ${offer.publicCode}` : ""}
                              </small>
                            </td>
                            <td>
                              {offer.offerName}
                              <small className="muted">
                                {offer.ratePlanCode}
                                {offer.ratePlanPublicCode ? ` · ${offer.ratePlanPublicCode}` : ""}
                                {offer.masterOptionCode ? ` · ${offer.masterOptionCode}` : ""}
                              </small>
                            </td>
                            <td>
                              {offer.price > 0
                                ? `${offer.currency} ${offer.price.toLocaleString("en-IN")}`
                                : "—"}
                            </td>
                            <td>{offer.netMarginPercent == null ? "Not evaluated" : `${offer.netMarginPercent.toFixed(1)}%`}</td>
                            <td>{offer.ratingAvailable && offer.rating != null ? offer.rating.toFixed(1) : "No data"}</td>
                            <td>{offer.reliabilityAvailable && offer.reliability != null ? `${offer.reliability.toFixed(0)}%` : "No data"}</td>
                            <td>{connectionLabel(offer.connectionType)}</td>
                            <td>{offer.score}</td>
                            <td>
                              {offer.eligible
                                ? `Eligible · ${offer.availableCapacity} available`
                                : offer.provisionalEligible
                                  ? "Margin check needs agent"
                                : offer.channelAvailable && offer.channelEligible === false
                                  ? (offer.channelEligibilityReasonCodes?.[0]?.replaceAll("_", " ") || "Channel eligibility failed")
                                : !offer.channelAvailable
                                  ? "Not mapped to channel"
                                  : !offer.productPublished
                                    ? "Product not published"
                                    : !offer.vendorVerified
                                      ? "Vendor not verified"
                                    : offer.marginFloorStatus === "FAIL"
                                      ? "Below net-margin floor"
                                      : !offer.commercialReady
                                        ? "Commercial quote unavailable"
                                      : offer.price <= 0
                                        ? "No active price"
                                        : "No live inventory"}
                            </td>
                            <td>
                              {offer.selected ? (
                                <span className="badge active">{preview.provisional ? "Provisional" : "Winner"}</span>
                              ) : (
                                "—"
                              )}
                            </td>
                            <td>
                              {(() => {
                                const master = masters.find((item) => item.id === previewMasterId);
                                const activePin = previewOptionCode ? preview.pin : master?.placements?.find((placement) => placement.pinnedById && (!placement.pinnedUntil || new Date(placement.pinnedUntil) > new Date()));
                                const isPinned = previewOptionCode
                                  ? Boolean(activePin && "productVariantId" in activePin && activePin.productVariantId === offer.productVariantId)
                                  : Boolean(activePin && "productId" in activePin && activePin.productId === offer.productId);
                                return master ? <button className="btn small" disabled={busy || (Boolean(previewOptionCode) && !offer.masterOptionCode)} onClick={() => void pinOffer(master, offer.productId, !isPinned, previewOptionCode ? offer.productVariantId : undefined)}>{isPinned ? "Unpin" : "Pin supplier"}</button> : "—";
                              })()}
                              {preview.pin?.productId === offer.productId && !preview.pin.applied && <small className="muted">Pinned; currently ineligible</small>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="empty">
                    No linked commercial offers for this date.
                  </div>
                )}
              </>
            )}
          </Panel>
        )}
        <Panel title="Create experience master from two products">
          <p className="muted">
            Select exactly one product from each vendor. Each pair creates a
            separate experience master, so the next pair can create another
            master.
          </p>
          <div className="matching-pair-grid">
            <div className="matching-pair-card">
              <h3>Product A</h3>
              <div className="form-grid two">
                <Field label="Vendor A">
                  <select
                    value={vendorA}
                    onChange={(e) => {
                      setVendorA(e.target.value);
                      setSelectedProductA("");
                      setProductPageA(1);
                    }}
                  >
                    <option value="">Select vendor</option>
                    {vendorOptions}
                  </select>
                </Field>
                <Field label="Search Product A">
                  <input
                    value={searchA}
                    onChange={(e) => { setSearchA(e.target.value); setProductPageA(1); }}
                    placeholder="Name or product code"
                  />
                </Field>
              </div>
              <div className="matching-product-picker matching-product-picker-single">
                {productsA.map((item) => (
                  <button
                    type="button"
                    className={`matching-product-option ${selectedProductA === item.id ? "selected" : ""}`}
                    key={item.id}
                    disabled={Boolean(item.experienceMasterId)}
                    onClick={() => setSelectedProductA(item.id)}
                  >
                    <b>{item.name}</b>
                    <small>
                      {item.vendor.name} · {item.destination}
                    </small>
                    {item.experienceMasterId && <em>Already linked to an experience master</em>}
                  </button>
                ))}
              </div>
              <div className="experience-footer-actions">
                <small>Page {productsAPagination.page} of {productsAPagination.totalPages} · {productsAPagination.total} products</small>
                <button type="button" className="btn" disabled={productPageA <= 1} onClick={() => setProductPageA((page) => page - 1)}>Previous</button>
                <button type="button" className="btn" disabled={productPageA >= productsAPagination.totalPages} onClick={() => setProductPageA((page) => page + 1)}>Next</button>
              </div>
              {productA && (
                <div className="matching-selected-product">
                  <b>Selected:</b> {productA.name} · {productA.vendor.name}
                </div>
              )}
            </div>
            <div className="matching-pair-card">
              <h3>Product B</h3>
              <div className="form-grid two">
                <Field label="Vendor B">
                  <select
                    value={vendorB}
                    onChange={(e) => {
                      setVendorB(e.target.value);
                      setSelectedProductB("");
                      setProductPageB(1);
                    }}
                  >
                    <option value="">Select vendor</option>
                    {vendorOptions}
                  </select>
                </Field>
                <Field label="Search Product B">
                  <input
                    value={searchB}
                    onChange={(e) => { setSearchB(e.target.value); setProductPageB(1); }}
                    placeholder="Name or product code"
                  />
                </Field>
              </div>
              <div className="matching-product-picker matching-product-picker-single">
                {productsB.map((item) => (
                  <button
                    type="button"
                    className={`matching-product-option ${selectedProductB === item.id ? "selected" : ""}`}
                    key={item.id}
                    disabled={Boolean(item.experienceMasterId)}
                    onClick={() => setSelectedProductB(item.id)}
                  >
                    <b>{item.name}</b>
                    <small>
                      {item.vendor.name} · {item.destination}
                    </small>
                    {item.experienceMasterId && <em>Already linked to an experience master</em>}
                  </button>
                ))}
              </div>
              <div className="experience-footer-actions">
                <small>Page {productsBPagination.page} of {productsBPagination.totalPages} · {productsBPagination.total} products</small>
                <button type="button" className="btn" disabled={productPageB <= 1} onClick={() => setProductPageB((page) => page - 1)}>Previous</button>
                <button type="button" className="btn" disabled={productPageB >= productsBPagination.totalPages} onClick={() => setProductPageB((page) => page + 1)}>Next</button>
              </div>
              {productB && (
                <div className="matching-selected-product">
                  <b>Selected:</b> {productB.name} · {productB.vendor.name}
                </div>
              )}
            </div>
          </div>
          {productA && productB && !differentVendors && (
            <div className="alert warning">
              Select products from two different vendors. Linking two products
              from the same vendor is not allowed.
            </div>
          )}
          {pairReady && matchScore && (
            <div
              className={`matching-score-card ${matchScore.score >= 80 ? "strong" : matchScore.score >= 50 ? "possible" : "weak"}`}
            >
              <div>
                <h3>Pair match score: {matchScore.score}%</h3>
                <p>
                  Score is advisory; the admin confirms whether this pair is the
                  same real-world experience.
                </p>
              </div>
              <div className="matching-score-fields">
                {matchScore.fields.map((field) => (
                  <span
                    className={field.matched ? "matched" : "unmatched"}
                    key={field.key}
                  >
                    {field.matched ? "✓" : "×"} {field.label} ({field.weight}%)
                  </span>
                ))}
              </div>
            </div>
          )}
          <div className="experience-footer-actions">
            <button
              className="btn primary"
              disabled={busy || !pairReady}
              onClick={() => void createMasterAndLinkPair()}
            >
              Create new master and link pair
            </button>
          </div>
        </Panel>
        <div className={activeTab === "master" ? "" : "admin-tab-panel-hidden"}>
          <Panel title="Linked experience masters">
            <p className="muted">
              One master is the agent-facing identity. Each linked product
              remains vendor-owned and keeps its own commercial and operational
              data.
            </p>
            {masters.length ? (
              <div className="matching-master-list">
                {masters.map((master) => (
                  <div className="matching-master" key={master.id}>
                    <div className="matching-master-heading">
                      <div>
                        <h3>{master.canonicalName}</h3>
                        <small>
                          {master.products.length} vendor offer
                          {master.products.length === 1 ? "" : "s"}
                        </small>
                      </div>
                      <div className="form-grid two matching-settings">
                        <Field label="Agent display">
                          <select
                            value={master.displayMode}
                            onChange={(e) =>
                              void updateMaster(master, {
                                displayMode: e.target.value,
                              })
                            }
                          >
                            <option value="SINGLE_OFFER">Show one offer</option>
                            <option value="ALL_OFFERS">Show all offers</option>
                          </select>
                        </Field>
                        <Field label="Selection policy">
                          <select
                            value={master.selectionPolicy}
                            onChange={(e) =>
                              void updateMaster(master, {
                                selectionPolicy: e.target.value,
                              })
                            }
                          >
                            <option value="CHEAPEST">Cheapest</option>
                            <option value="BALANCED">Balanced</option>
                            <option value="HIGHEST_COMMISSION">
                              Highest internal commission
                            </option>
                            <option value="ADMIN_SELECTED">
                              Admin selected
                            </option>
                          </select>
                        </Field>
                      </div>
                    </div>
                    <div className="matching-offers">
                      {master.products.map((product) => (
                        <span key={product.id}>
                          {product.vendor.name}: {product.name}
                          <button type="button" className="btn" disabled={busy || master.products.length <= 1} title={master.products.length <= 1 ? "A master must keep at least one linked product" : "Unlink this offer"} onClick={() => void unlinkOffer(master, product)}>Unlink</button>
                        </span>
                      ))}
                    </div>
                    <div className="matching-offers matching-master-options" aria-label="Stable master options">
                      {(master.options || []).map((option) => (
                        <span key={option.id}>
                          <b>{option.publicCode || "Option code pending"}</b> · {option.name}
                          {option.placements.map((placement) => {
                            const supplier = master.products.find((product) => product.id === placement.productVariant.productId);
                            return <label key={placement.productVariantId} className="master-option-mapping">{supplier?.vendor.name || "Supplier"}: {placement.productVariant.name}<select aria-label={`Map ${placement.productVariant.name} to master option`} value={option.id} disabled={busy} onChange={(event) => void mapOption(option, placement.productVariantId, event.target.value)}>{(master.options || []).map((target) => <option key={target.id} value={target.id}>{target.publicCode || target.name} · {target.name}</option>)}</select></label>;
                          })}
                          {!option.placements.length && <small className="muted">No supplier variants currently mapped</small>}
                        </span>
                      ))}
                      {!master.options?.length && <small className="muted">Options are generated from linked supplier variants when products are mapped.</small>}
                    </div>
                    <div className="matching-add-offer">
                      <h4>Add supplier offer</h4>
                      <div className="form-grid two">
                        <Field label="Supplier">
                          <select value={linkVendorId} onChange={(event) => { setLinkVendorId(event.target.value); setLinkPage(1); }}>
                            <option value="">All suppliers</option>
                            {vendorOptions}
                          </select>
                        </Field>
                        <Field label="Search products">
                          <input value={linkSearch} onChange={(event) => { setLinkSearch(event.target.value); setLinkPage(1); }} placeholder="Name or product code" />
                        </Field>
                      </div>
                      <div className="matching-product-picker matching-product-picker-single">
                        {linkProducts.map((product) => (
                          <div className="matching-product-option matching-product-link-result" key={product.id}>
                            <b>{product.name}</b>
                            <small>{product.vendor.name} · {product.destination}</small>
                            <button type="button" className="btn" disabled={busy || master.products.some((item) => item.id === product.id)} onClick={() => void linkOffer(master, product)}>
                              {master.products.some((item) => item.id === product.id) ? "Already linked" : "Link offer"}
                            </button>
                          </div>
                        ))}
                        {!linkProducts.length && <div className="empty">No unlinked products found on this page.</div>}
                      </div>
                      <div className="experience-footer-actions">
                        <small>Page {linkPagination.page} of {linkPagination.totalPages} · {linkPagination.total} products matching the search</small>
                        <button type="button" className="btn" disabled={linkPage <= 1} onClick={() => setLinkPage((page) => page - 1)}>Previous</button>
                        <button type="button" className="btn" disabled={linkPage >= linkPagination.totalPages} onClick={() => setLinkPage((page) => page + 1)}>Next</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty">
                No experience masters yet. Accept a suggestion or create one
                manually.
              </div>
            )}
          </Panel>
        </div>
      </div>
      <div className={activeTab === "rules" ? "" : "admin-tab-panel-hidden"}>
        {selectionRules?.pendingConfiguration && (
          <Panel title="Selection-rule change awaiting approval">
            <p className="muted">The current live rules remain active until a different Admin approves this proposal.</p>
            <div className="table-wrap"><table><tbody>
              <tr><td>Objective</td><td>{selectionRules.pendingConfiguration.objective === "LOWEST_PRICE" ? "Lowest customer price" : "Our margin"}</td></tr>
              <tr><td>Weights</td><td>Price {selectionRules.pendingConfiguration.priceWeight}% · Rating {selectionRules.pendingConfiguration.ratingWeight}% · Reliability {selectionRules.pendingConfiguration.reliabilityWeight}% · Inventory {selectionRules.pendingConfiguration.inventoryWeight}% · Contract {selectionRules.pendingConfiguration.contractWeight}%</td></tr>
              <tr><td>Failover &amp; allocation</td><td>{selectionRules.pendingConfiguration.autoFailover ? "Auto failover" : "No auto failover"} · {selectionRules.pendingConfiguration.allocation?.replaceAll("_", " ")}</td></tr>
              <tr><td>Submitted by</td><td>{selectionRules.pendingUpdatedById || "Admin"}</td></tr>
            </tbody></table></div>
            {canApprove && <button type="button" className="btn primary" disabled={busy} onClick={() => void approveSelectionRules()}>Approve and publish proposal</button>}
          </Panel>
        )}
        <div className="matching-rule-layout">
          <Panel title="Scoring weights">
            <p className="muted">
              Applies to:{" "}
              <select
                aria-label="Selection rule scope"
                value={ruleScope}
                onChange={(event) =>
                  void changeRuleScope(event.target.value as typeof ruleScope)
                }
              >
                <option value="GLOBAL">Global default</option>
                <option value="VOYA_WEB">Website &amp; app</option>
                <option value="VOYA_AGENT">Travel agents</option>
                <option value="VOYA_API">API partners</option>
              </select>
              . The rule is stored in the database and applied to the selected
              channel.
            </p>
            {ruleDraft && (
              <>
                <Field label="Optimise price factor for">
                  <div className="rule-segment">
                    <button
                      type="button"
                      className={
                        ruleDraft.objective === "MARGIN" ? "active" : ""
                      }
                      onClick={() =>
                        setRuleDraft({ ...ruleDraft, objective: "MARGIN" })
                      }
                    >
                      Our margin
                    </button>
                    <button
                      type="button"
                      className={
                        ruleDraft.objective === "LOWEST_PRICE" ? "active" : ""
                      }
                      onClick={() =>
                        setRuleDraft({
                          ...ruleDraft,
                          objective: "LOWEST_PRICE",
                        })
                      }
                    >
                      Lowest customer price
                    </button>
                  </div>
                </Field>
                <div className="rule-weight-list">
                  {(
                    [
                      ["priceWeight", "Price factor"],
                      ["ratingWeight", "Rating & complaints"],
                      ["reliabilityWeight", "Confirmation reliability"],
                      [
                        "inventoryWeight",
                        "Live inventory (API > barcode > manual)",
                      ],
                      ["contractWeight", "Contract priority"],
                    ] as const
                  ).map(([key, label]) => (
                    <label className="rule-weight" key={key}>
                      <span>
                        <b>{label}</b>
                        <output>{ruleDraft[key]}%</output>
                      </span>
                      <input
                        aria-label={label}
                        type="range"
                        min="0"
                        max="60"
                        step="5"
                        value={ruleDraft[key]}
                        onChange={(event) =>
                          setRuleDraft({
                            ...ruleDraft,
                            [key]: Number(event.target.value),
                          })
                        }
                      />
                    </label>
                  ))}
                </div>
                <div
                  className={`rule-total ${ruleDraft.priceWeight + ruleDraft.ratingWeight + ruleDraft.reliabilityWeight + ruleDraft.inventoryWeight + ruleDraft.contractWeight === 100 ? "valid" : "invalid"}`}
                >
                  Total:{" "}
                  {ruleDraft.priceWeight +
                    ruleDraft.ratingWeight +
                    ruleDraft.reliabilityWeight +
                    ruleDraft.inventoryWeight +
                    ruleDraft.contractWeight}
                  %
                </div>
                <div className="experience-footer-actions">
                  <span className="muted">
                    Status: {ruleDraft.status.replaceAll("_", " ")}
                  </span>
                  <button
                    type="button"
                    className="btn primary"
                    disabled={
                      busy ||
                      Boolean(selectionRules?.pendingConfiguration) ||
                      ruleDraft.priceWeight +
                        ruleDraft.ratingWeight +
                        ruleDraft.reliabilityWeight +
                        ruleDraft.inventoryWeight +
                        ruleDraft.contractWeight !==
                        100
                    }
                    onClick={() =>
                      void updateSelectionRules({
                        objective: ruleDraft.objective,
                        priceWeight: ruleDraft.priceWeight,
                        ratingWeight: ruleDraft.ratingWeight,
                        reliabilityWeight: ruleDraft.reliabilityWeight,
                        inventoryWeight: ruleDraft.inventoryWeight,
                        contractWeight: ruleDraft.contractWeight,
                        autoFailover: ruleDraft.autoFailover,
                        absorbPriceGap: ruleDraft.absorbPriceGap,
                        lockMinutes: ruleDraft.lockMinutes,
                        allocation: ruleDraft.allocation,
                        submitForApproval: true,
                      })
                    }
                  >
                    Submit for approval
                  </button>
                </div>
              </>
            )}
          </Panel>
          <div className="matching-rule-side">
            <Panel title="Eligibility (must pass first)">
              <ul className="rule-check-list">
                <li>✓ Available for the date, slot and number of guests</li>
                <li>✓ Allowed on this channel, inside booking cut-off</li>
                <li>✓ Vendor active, documents valid, not on payout hold</li>
                <li>✓ Net margin at or above the 4% floor for this channel</li>
              </ul>
            </Panel>
            <Panel title="Failover & allocation">
              {ruleDraft && (
                <div className="form-grid two">
                  <Field label="Auto-failover">
                    <div className="rule-segment">
                      <button
                        type="button"
                        className={ruleDraft.autoFailover ? "active" : ""}
                        onClick={() =>
                          setRuleDraft({ ...ruleDraft, autoFailover: true })
                        }
                      >
                        On
                      </button>
                      <button
                        type="button"
                        className={!ruleDraft.autoFailover ? "active" : ""}
                        onClick={() =>
                          setRuleDraft({ ...ruleDraft, autoFailover: false })
                        }
                      >
                        Off
                      </button>
                    </div>
                    <small>
                      If the winner declines or its API fails, book the next
                      vendor.
                    </small>
                  </Field>
                  <Field label="Absorb price gap up to">
                    <select
                      value={ruleDraft.absorbPriceGap}
                      onChange={(event) =>
                        setRuleDraft({
                          ...ruleDraft,
                          absorbPriceGap: event.target
                            .value as SelectionRules["absorbPriceGap"],
                        })
                      }
                    >
                      <option value="LOWER_OF_50_OR_5_PERCENT">
                        ₹50 or 5%, whichever is lower
                      </option>
                      <option value="100">₹100</option>
                      <option value="NEVER">Never (ask customer)</option>
                    </select>
                  </Field>
                  <Field label="Offer lock at checkout">
                    <select
                      value={ruleDraft.lockMinutes}
                      onChange={(event) =>
                        setRuleDraft({
                          ...ruleDraft,
                          lockMinutes: Number(
                            event.target.value,
                          ) as SelectionRules["lockMinutes"],
                        })
                      }
                    >
                      <option value={15}>15 minutes</option>
                      <option value={10}>10 minutes</option>
                      <option value={30}>30 minutes</option>
                    </select>
                  </Field>
                  <Field label="Allocation">
                    <select
                      value={ruleDraft.allocation}
                      onChange={(event) =>
                        setRuleDraft({
                          ...ruleDraft,
                          allocation: event.target
                            .value as SelectionRules["allocation"],
                        })
                      }
                    >
                      <option value="WINNER_TAKES_ALL">Winner takes all</option>
                      <option value="SPLIT_70_30">
                        70 / 30 when scores within 5 points
                      </option>
                      <option value="ROUND_ROBIN">
                        Round-robin when scores within 5 points
                      </option>
                    </select>
                  </Field>
                </div>
              )}
            </Panel>
            <Panel title="Rule set">
              <div className="table-wrap">
                <table>
                  <tbody>
                    <tr>
                      <td>
                        <b>
                          {ruleScope === "GLOBAL"
                            ? "Global default"
                            : ruleScope === "VOYA_WEB"
                              ? "Website & app"
                              : ruleScope === "VOYA_AGENT"
                                ? "Travel agents"
                                : "API partners"}
                        </b>
                      </td>
                      <td className="muted">
                        Persisted channel-specific scoring and failover settings
                      </td>
                      <td>
                        <span className="badge active">
                          {selectionRules?.status === "PENDING_APPROVAL"
                            ? "Pending approval"
                            : selectionRules?.status || "Live"}
                        </span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </Panel>
          </div>
        </div>
      </div>
      <div className={activeTab === "insights" ? "" : "admin-tab-panel-hidden"}>
        <Panel title="Vendor win rates">
          <p className="muted">
            Live booking outcomes are calculated from mapped products and
            booking events recorded during the last 30 days.
          </p>
          {insights.length ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Vendor</th>
                    <th>Mapped offers</th>
                    <th>Win rate</th>
                    <th>Main reason when losing</th>
                    <th>Failovers handled</th>
                    <th>Declines · 30 days</th>
                  </tr>
                </thead>
                <tbody>
                  {insights.map((item) => (
                    <tr key={item.vendorId}>
                      <td>
                        <b>{item.vendorName}</b>
                      </td>
                      <td>{item.mappedOffers}</td>
                      <td>{item.winRate == null ? "—" : `${item.winRate}%`}</td>
                      <td>{item.mainReasonWhenLosing}</td>
                      <td>{item.failoversHandled}</td>
                      <td>{item.declines30d}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty">No mapped vendor offers yet.</div>
          )}
        </Panel>
      </div>
      {busy && <Loading text="Updating experience matching…" />}
    </div>
  );
}
