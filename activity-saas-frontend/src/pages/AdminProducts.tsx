import { useEffect, useState } from "react";
import { api } from "../api";
import { Badge, ConfirmDialog, ErrorBox, Loading } from "../components/Ui";
import ExperienceWizardModal from "../components/product-wizard/ExperienceWizardModal";

type AdminProduct = {
  id: string;
  productCode: string;
  publicCode?: string | null;
  productStatus: string;
  workingRevisionId?: string | null;
  workingRevisionStatus?: string | null;
  name: string;
  type?: string | null;
  subCategory?: string | null;
  destination: string;
  channels?: string[];
  sellPrice?: number | null;
  sellCurrency?: string | null;
  netMargin?: number | null;
  contentScore?: number | null;
  vendor: { id: string; name: string; verificationStatus?: string | null };
  optionCount: number;
  ratePlanCount: number;
  updatedAt: string;
  distribution?: { ready: boolean; reasonCodes?: string[] } | null;
};
type ProductResponse = {
  items: AdminProduct[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};
type ProductAction = {
  kind: "publish" | "reject" | "deactivate" | "archive";
  productId: string;
  revisionId?: string | null;
  name: string;
};

const statusLabel = (product: AdminProduct) =>
  product.workingRevisionStatus === "UNDER_REVIEW"
    ? product.productStatus === "LIVE"
      ? "Changes pending"
      : "In QC"
    : product.productStatus === "LIVE"
      ? "Live"
      : product.productStatus === "SUSPENDED"
        ? "Suspended"
        : product.productStatus === "ARCHIVED"
          ? "Archived"
          : "Draft";

export default function AdminProducts() {
  const [data, setData] = useState<ProductResponse | null>(null);
  const [search, setSearch] = useState(() => new URLSearchParams(window.location.search).get("q") || "");
  const [vendorId, setVendorId] = useState(
    () => new URLSearchParams(window.location.search).get("vendorId") || "",
  );
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [viewingProductId, setViewingProductId] = useState<string | null>(null);
  const [viewingRevisionId, setViewingRevisionId] = useState<string | null>(null);
  const [viewingVendorName, setViewingVendorName] = useState<string | undefined>();
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<ProductAction | null>(
    null,
  );
  const [actionReason, setActionReason] = useState("");
  const [actionBusy, setActionBusy] = useState(false);
  useEffect(() => {
    const syncVendorFromUrl = () => {
      const nextVendorId =
        new URLSearchParams(window.location.search).get("vendorId") || "";
      setVendorId(nextVendorId);
      setPage(1);
    };
    window.addEventListener("popstate", syncVendorFromUrl);
    return () => window.removeEventListener("popstate", syncVendorFromUrl);
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setLoading(true);
      setError("");
      const params = new URLSearchParams({ page: String(page), limit: "25" });
      if (search.trim()) params.set("search", search.trim());
      if (vendorId) params.set("vendorId", vendorId);
      if (status) params.set("status", status);
      api
        .request<ProductResponse>(`/admin/products?${params}`)
        .then(setData)
        .catch((e) => setError(e instanceof Error ? e.message : String(e)))
        .finally(() => setLoading(false));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [search, vendorId, status, page, refreshKey]);
  const updateFilter = (setter: (value: string) => void, value: string) => {
    setter(value);
    setPage(1);
  };
  const beginAction = (action: ProductAction) => {
    setActionReason("");
    setConfirmAction(action);
  };
  const actionMessage =
    confirmAction?.kind === "publish"
      ? `Publish “${confirmAction.name}” and make this submitted revision live?`
      : confirmAction?.kind === "reject"
        ? `Reject “${confirmAction.name}” and return it to the vendor for corrections?`
        : confirmAction?.kind === "archive"
          ? `Archive “${confirmAction.name}” and remove it from normal product operations?`
          : `Deactivate “${confirmAction?.name}” and remove it from live marketplace availability?`;
  const runAction = async () => {
    if (!confirmAction) return;
    setActionBusy(true);
    setError("");
    try {
      if (
        confirmAction.kind === "deactivate" ||
        confirmAction.kind === "archive"
      )
        await api.request(
          `/admin/products/${confirmAction.productId}/${confirmAction.kind}`,
          { method: "POST" },
        );
      else {
        if (!confirmAction.revisionId)
          throw new Error(
            "The product revision is not available. Reload and try again.",
          );
        await api.request(
          `/admin/product-revisions/${confirmAction.revisionId}/${confirmAction.kind}`,
          {
            method: "POST",
            ...(confirmAction.kind === "reject"
              ? { body: JSON.stringify({ reason: actionReason.trim() }) }
              : {}),
          },
        );
      }
      setConfirmAction(null);
      setActionReason("");
      setRefreshKey((value) => value + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setActionBusy(false);
    }
  };
  const actionForRow = (
    kind: ProductAction["kind"],
    product: AdminProduct,
  ): ProductAction => ({
    kind,
    productId: product.id,
    revisionId: product.workingRevisionId,
    name: product.name,
  });
  const channelLabel = (channel: string) =>
    (
      ({
        WEBSITE_APP: "Website & app",
        TRAVEL_AGENTS: "Travel agents",
        API_PARTNERS: "API partners",
      }) as Record<string, string>
    )[channel] || channel.replaceAll("_", " ");
  return (
    <div className="admin-products-page">
      {error && <ErrorBox error={error} />}
      <section className="admin-products-filters" aria-label="Activity filters">
        <div className="admin-products-filter-row">
          <input
            aria-label="Search activity, vendor or code"
            value={search}
            onChange={(e) => updateFilter(setSearch, e.target.value)}
            placeholder="Search activity, vendor or code"
          />
          <div className="chips" role="group" aria-label="Filter activities by status">
            {[
              ["", "All"],
              ["LIVE", "Live"],
              ["UNDER_REVIEW", "In QC"],
              ["CHANGES_PENDING", "Changes pending"],
              ["SUSPENDED", "Paused"],
            ].map(([value, label]) => (
              <button
                key={value || "all"}
                type="button"
                className={`chip ${status === value ? "active" : ""}`}
                aria-pressed={status === value}
                onClick={() => updateFilter(setStatus, value)}
              >
                {label}
              </button>
            ))}
          </div>
          {vendorId && (
            <button className="btn small" onClick={() => updateFilter(setVendorId, "")}>
              Clear vendor filter
            </button>
          )}
          <span className="muted admin-products-count">
            Showing {data?.items.length || 0} of {data?.pagination.total || 0}
          </span>
        </div>
      </section>
      <section className="panel admin-products-table" aria-live="polite">
        {loading && !data ? (
          <Loading text="Loading products…" />
        ) : data?.items.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Activity</th>
                  <th>Vendor</th>
                  <th>Channels</th>
                  <th>Sell price</th>
                  <th>Net margin</th>
                  <th>Content</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((product) => {
                  const underReview =
                    product.workingRevisionStatus === "UNDER_REVIEW";
                  const live = product.productStatus === "LIVE" && !underReview;
                  return (
                    <tr key={product.id}>
                      <td>
                        <b>{product.name}</b>
                        <small className="mono">{product.publicCode || product.productCode}</small>
                        <small>
                          {product.destination || "Destination not set"}
                        </small>
                      </td>
                      <td>
                        <b>{product.vendor.name}</b>
                        <small>
                          {product.vendor.verificationStatus ||
                            "Verification pending"}
                        </small>
                      </td>
                      <td>
                        <div className="admin-product-chips">
                          {product.channels?.length ? (
                            product.channels.map((channel) => (
                              <span key={channel}>{channelLabel(channel)}</span>
                            ))
                          ) : (
                            <span className="muted">Not configured</span>
                          )}
                        </div>
                      </td>
                      <td>
                        {product.sellPrice != null
                          ? new Intl.NumberFormat("en-IN", {
                              style: "currency",
                              currency: product.sellCurrency || "INR",
                              maximumFractionDigits: 0,
                            }).format(product.sellPrice)
                          : "—"}
                      </td>
                      <td>
                        {product.netMargin != null
                          ? `${product.netMargin.toFixed(1)}%`
                          : "—"}
                      </td>
                      <td>
                        {product.contentScore != null
                          ? `${product.contentScore}%`
                          : "—"}
                      </td>
                      <td>
                        <Badge value={statusLabel(product)} />
                      </td>
                      <td>
                        <div className="status-actions product-row-actions">
                          <button
                            className="btn small"
                            onClick={() => { setViewingVendorName(product.vendor.name); setViewingRevisionId(product.workingRevisionStatus === "DRAFT" || product.workingRevisionStatus === "UNDER_REVIEW" ? product.workingRevisionId || null : null); setViewingProductId(product.id); }}
                          >
                            View
                          </button>
                          <button
                            className="btn small"
                            onClick={() => setEditingProductId(product.id)}
                          >
                            Edit
                          </button>
                          {underReview && (
                            <>
                              <button
                                className="btn small primary"
                                onClick={() =>
                                  beginAction(actionForRow("publish", product))
                                }
                              >
                                Publish
                              </button>
                              <button
                                className="btn small"
                                onClick={() =>
                                  beginAction(actionForRow("reject", product))
                                }
                              >
                                Reject
                              </button>
                            </>
                          )}
                          {live && (
                            <button
                              className="btn small"
                              onClick={() =>
                                beginAction(actionForRow("deactivate", product))
                              }
                            >
                              Deactivate
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty">
            {search || vendorId || status
              ? "No products match these filters."
              : "No products found."}
          </div>
        )}
        {data && (
          <div className="products-pagination">
            <span>
              Page {data.pagination.page} of {data.pagination.totalPages}
            </span>
            <div>
              <button
                className="btn small"
                disabled={page <= 1 || loading}
                onClick={() => setPage((value) => value - 1)}
              >
                Previous
              </button>
              <button
                className="btn small"
                disabled={page >= data.pagination.totalPages || loading}
                onClick={() => setPage((value) => value + 1)}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </section>
      {viewingProductId && (
        <ExperienceWizardModal
          product={{ id: viewingProductId } as any}
          preferredRevisionId={viewingRevisionId}
          viewOnly
          adminContext
          vendorNameOverride={viewingVendorName}
          onDone={() => setViewingProductId(null)}
          onChanged={() => setRefreshKey((value) => value + 1)}
        />
      )}
      {editingProductId && (
        <ExperienceWizardModal
          product={{ id: editingProductId } as any}
          adminContext
          onDone={() => setEditingProductId(null)}
          onChanged={() => setRefreshKey((value) => value + 1)}
        />
      )}
      {confirmAction && (
        <ConfirmDialog
          title={`${confirmAction.kind === "publish" ? "Publish product" : confirmAction.kind === "reject" ? "Reject product" : confirmAction.kind === "archive" ? "Archive product" : "Deactivate product"}?`}
          message={actionMessage}
          confirmLabel={
            confirmAction.kind === "publish"
              ? "Publish"
              : confirmAction.kind === "reject"
                ? "Reject"
                : confirmAction.kind === "archive"
                  ? "Archive"
                  : "Deactivate"
          }
          onCancel={() => {
            if (!actionBusy) {
              setConfirmAction(null);
              setActionReason("");
            }
          }}
          onConfirm={() => void runAction()}
          busy={actionBusy}
          reason={confirmAction.kind === "reject" ? actionReason : undefined}
          onReasonChange={
            confirmAction.kind === "reject" ? setActionReason : undefined
          }
          reasonLabel="Rejection reason"
          reasonPlaceholder="Explain what the vendor needs to correct"
        />
      )}
    </div>
  );
}
