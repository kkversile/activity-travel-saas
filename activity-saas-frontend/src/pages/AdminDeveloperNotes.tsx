import { Panel } from '../components/Ui';

const portals = [
  ['Vendor portal', 'Suppliers and their staff', 'Own supplier_id only', 'Onboard, list activities, rates, bookings, redeem, promotions, payouts'],
  ['Agent portal', 'Travel agents and their staff', 'Own agent_id; sees agent price only', 'Search, book, pay from wallet/credit, branded vouchers, cancel, statements'],
  ['Admin console', 'Internal staff', 'Everything, limited by staff role', 'Approve, edit any record, pricing rules, agent commission, finance, impersonate'],
];

const codes = [
  ['Supply', 'Vendor', 'SUP-NNNN', 'SUP-0207', 'Sequential'],
  ['Supply', 'Vendor short code', '3 letters', 'GCE', 'Prefix of voucher codes'],
  ['Supply', 'Vendor user', 'VU-NNNNN', 'VU-00412', 'One per login'],
  ['Supply', 'Vendor document', 'DOC-NNNNNN', 'DOC-004188', 'KYC, licences, insurance'],
  ['Catalogue', 'Activity (vendor product)', 'TA-{state}-NNNN', 'TA-GA-0318', 'State is ISO code and fixed at creation'],
  ['Catalogue', 'Rate plan / option', '{activity}-RNN', 'TA-GA-0318-R01', 'Child of activity'],
  ['Catalogue', 'Ticket type (age band)', '{rate plan}-{ADT|CHD|SNR|INF}', 'TA-GA-0318-R01-ADT', 'Custom bands use 3 letters'],
  ['Catalogue', 'Unit (per-unit pricing)', '{rate plan}-UNN', 'TA-GA-0331-R02-U01', 'Car, boat, yacht or tent'],
  ['Catalogue', 'Time slot', '{rate plan}-HHMM', 'TA-GA-0318-R01-0830', '24-hour clock'],
  ['Catalogue', 'Inventory row', '{rate plan}:YYYYMMDD:HHMM', 'TA-GA-0318-R01:20261114:0830', 'One per date and slot'],
  ['Catalogue', 'Master product', 'MP-NNNN', 'MP-0042', 'What agents and API partners see'],
  ['Catalogue', 'Master option', 'MO-NNNN-NN', 'MO-0042-01', 'Stable when the winning vendor changes'],
  ['Sales', 'Booking', '{BK|AG|AP}-YYMMNNNN', 'BK-26110482', 'BK website · AG agent · AP API'],
  ['Sales', 'Voucher code', '{short}-XXXX-XXXX', 'GCE-7H2K-91QZ', 'Random; no 0, O, 1 or I'],
  ['Sales', 'Vendor promotion', 'PRM-NNNN', 'PRM-0022', ''],
  ['Sales', 'Platform coupon', 'CPN-NNNN + public code', 'CPN-0007 · GOAFEST', 'Public code is what customers type'],
  ['Revenue', 'Pricing rule', 'RULE-NNNN', 'RULE-0042', ''],
  ['Revenue', 'Selection rule set', 'SRS-NN', 'SRS-01', 'Multi-supplier engine'],
  ['Distribution', 'Travel agent', 'AGT-NNNN', 'AGT-0118', ''],
  ['Distribution', 'API partner', 'APP-NNNN', 'APP-0003', 'Allocated to PARTNER_API channels. Channel codes (VOYA_API) and rotatable API credentials remain separate.'],
  ['Distribution', 'Channel', 'VOYA_WEB | VOYA_AGENT | VOYA_API', 'VOYA_AGENT', 'Operational channel code; API partner public ID is separate.'],
  ['Money', 'Vendor payout', 'PO-{vendor no}-YYWW', 'PO-0207-2645', 'One per vendor per ISO week'],
  ['Money', 'Payout batch', 'PB-YYYYMMDD', 'PB-20261104', ''],
  ['Money', 'Commission invoice', 'INV/{FY}/NNNNNN', 'INV/2627/000184', 'Persisted against one reconciled settlement batch with a vendor and source-line snapshot; issuing a draft requires a second Admin.'],
  ['Money', 'Refund', 'RF-YYMMNNNN', 'RF-26110031', ''],
  ['System', 'Approval', 'APR-NNNNNN', 'APR-001942', 'Stable public code; routes use the approval request UUID.'],
  ['System', 'Audit event', 'EVT-{UUID}', 'EVT-7f3c…', 'Append-only; derived from the audit event UUID.'],
];

const adminApi = [
  ['GET', '/admin/approvals?type={type}'], ['GET', '/admin/bookings?q={query}&channel={channel}&status={status}&statusGroup=REJECTED&recordType={type}&page={page}&limit={1..100}'], ['GET', '/admin/products?{filters}'], ['GET', '/admin/vendors'],
  ['POST', '/admin/vendors (no password in request; activation invite follows)'], ['POST', '/auth/vendor/email/request'], ['POST', '/admin/products'], ['PUT', '/admin/product-revisions/{revisionId}/location'], ['PUT', '/admin/product-revisions/{revisionId}/itinerary'], ['POST', '/admin/product-revisions/{revisionId}/publish'],
  ['PATCH', '/admin/vendors/{tenantId}/commercials'], ['POST', '/admin/vendors/{tenantId}/commercials/{requestId}/approve|reject'],
  ['POST', '/admin/commercial-rules'], ['POST', '/admin/commercial-rules/{ruleId}/versions'], ['POST', '/admin/commercial-rules/with-initial-version (atomic rule + draft version)'], ['POST', '/admin/commercial-rule-versions/{versionId}/activate'],
  ['PATCH', '/admin/agents/tiers'], ['POST', '/admin/agent-tier-change-requests/{requestId}/approve|reject'], ['PATCH', '/admin/agents/{tenantId}/commercials'], ['POST', '/admin/agent-commercial-change-requests/{requestId}/approve|reject'],
  ['POST', '/admin/agents/{tenantId}/wallet/credit'], ['POST', '/admin/agent-wallet-credit-requests/{requestId}/approve|reject'],
  ['POST', '/admin/payouts/{id}/record-release'], ['POST', '/admin/payout-release-requests/{requestId}/approve|reject'], ['GET', '/admin/mapping-suggestions'], ['POST', '/admin/mapping-suggestions/{id}/decide'], ['POST', '/admin/master-options/{id}/map'], ['POST', '/admin/master-options/{id}/pin'], ['PUT', '/admin/selection-rules/{scope}'], ['GET', '/admin/master-options/{id}/ranking?serviceDate=&channel='], ['GET', '/admin/audit-log'],
  ['GET|POST', '/admin/commission-invoices (one reconciled batch per invoice)'], ['POST', '/admin/commission-invoices/{id}/issue (second Admin required)'],
  ['GET|POST', '/admin/distribution/channels (APP-NNNN is separate from channel code)'], ['GET|POST', '/admin/distribution/credentials (rotatable API keys)'], ['GET', '/admin/lookup?q={code} (public IDs, DOC IDs, vendor voucher prefixes, voucher codes)'],
  ['POST', '/admin/platform-admins (Super Admin only)'], ['GET|PATCH', '/admin/settings/* (Super Admin only)'],
];

const buildRules = [
  ['Price resolution', 'product › vendor › city › category › global, filtered by channel and date; highest priority wins on ties. Then MRP cap, margin floor and rounding.'],
  ['Price snapshot', 'Every booking stores vendor rate, rule IDs, channel price, agent commission and our margin.'],
  ['Maker–checker', 'Vendor and agent commission changes, agent tier defaults, pricing-rule activation, payout release and manual wallet credits require a second Admin. Requests remain pending until approved; the maker cannot approve or reject their own request.'],
  ['Admin edits', 'Vendor content edits are versioned, tagged edited by admin and surfaced to the vendor.'],
  ['Activity approval', 'Normal Admin submissions enter QC. Only a Super Admin can use the persisted Publish directly mode; readiness, audit and publication outbox events still apply.'],
  ['Multi-supplier', 'Channels see master products and options. The winner is selected at search, locked at checkout and stored on the booking; vouchers, cancellations and payouts follow the winning vendor.'],
  ['Impersonation', 'Read-only by default, time-limited and audit-logged.'],
  ['Agent bookings', 'Bookings are blocked when wallet plus available credit is below the agent price.'],
  ['Admin bookings API', 'GET /admin/bookings returns { items, pagination } and applies search across booking/public IDs, voucher code, guest name/email/phone, traveller phone, product and vendor, plus channel, status, record type and date filters before pagination. statusGroup=REJECTED includes both vendor and manual rejections; limit is capped at 100.'],
];

export default function AdminDeveloperNotes() {
  return <div className="admin-developer-page">
    <div className="admin-hero"><div><h2>Developer notes</h2><p className="muted">Not part of the operational admin UI. Admin, vendor and agent portals share one database and one API; access is decided by role and scope.</p></div></div>
    <Panel title="Three portals, one platform"><div className="table-wrap"><table><thead><tr><th>Portal</th><th>Who</th><th>Data scope</th><th>Key actions</th></tr></thead><tbody>{portals.map((row) => <tr key={row[0]}>{row.map((value) => <td key={value}>{value}</td>)}</tr>)}</tbody></table></div></Panel>
    <Panel title="IDs & codes"><p className="muted">Where a public identifier is assigned, it is a searchable registry code separate from the UUID used by database relations and write routes. Some records still expose only their domain code or UUID; check the API response for a publicCode before relying on one.</p><div className="table-wrap"><table><thead><tr><th>Area</th><th>Record</th><th>Format</th><th>Example</th><th>Notes</th></tr></thead><tbody>{codes.map((row) => <tr key={`${row[0]}-${row[1]}`}>{row.map((value, index) => <td className={index > 1 && index < 4 ? 'mono' : ''} key={value}>{value || '—'}</td>)}</tr>)}</tbody></table></div></Panel>
    <div className="admin-developer-grid"><Panel title="Admin API"><div className="developer-api-list">{adminApi.map(([method, path]) => <span key={`${method}-${path}`}><b>{method}</b>{path}</span>)}</div></Panel><Panel title="Build rules"><ul className="rule-check-list">{buildRules.map(([title, text]) => <li key={title}><b>{title}:</b> {text}</li>)}</ul></Panel></div>
  </div>;
}
