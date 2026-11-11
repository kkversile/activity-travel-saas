import { Fragment, useEffect, useRef, useState, type PointerEvent } from "react";
import { api, type VendorOnboardingApplication } from "../api";
import { Badge, ErrorBox, Loading, Panel } from "../components/Ui";
import { SharedDatePicker } from "../components/SharedDatePicker";
import ApprovedOnboardingDashboard from "../components/ApprovedOnboardingDashboard";

const steps = [
  "Business profile",
  "Contacts & escalation",
  "KYC documents",
  "Licences & insurance",
  "Bank & tax",
  "Commercial terms",
  "Agreement & e-sign",
  "Review & submit",
];
const agreementVersion = "VOYA-DRAFT-PARTNER-AGREEMENT-v1";
function agreementNameForSupplierType(value?: string) {
  if (value === "Aggregator / DMC" || value === "AGGREGATOR_DMC") return "Booking Facilitation Agreement";
  if (value === "Government body" || value === "GOVERNMENT_BODY") return "Activity Vendor Agreement (Govt annexure)";
  return "Activity Vendor Agreement";
}
const countryCodes = [
  { value: "+91", label: "India (+91)" },
  { value: "+1", label: "USA / Canada (+1)" },
  { value: "+44", label: "United Kingdom (+44)" },
  { value: "+61", label: "Australia (+61)" },
  { value: "+65", label: "Singapore (+65)" },
  { value: "+971", label: "UAE (+971)" },
] as const;
const operatingCityOptions = ["North Goa", "South Goa"];
const categoryOptions = [
  "Day tours",
  "Cruises & boats",
  "Water sports",
  "Adventure",
  "Attractions",
  "Camping",
];
const listingOptions = [
  "Thrillophilia",
  "Klook",
  "GetYourGuide",
  "Viator",
  "Headout",
  "TripXoXo",
  "Own website",
];
type Contact = {
  role: string;
  name: string;
  designation: string;
  mobile: string;
  email: string;
  hours: string;
};
type EscalationLevel = {
  code: string;
  trigger: string;
  contactRole: string;
  response: string;
};
type LicenceKey =
  | "tourismRegistration"
  | "vehiclePermit"
  | "publicLiabilityInsurance"
  | "boatLicense"
  | "adventureWaterSportsLicense"
  | "fssaiLicense";
type LicenceRow = {
  key: LicenceKey;
  label: string;
  neededFor: string;
  validTill: string;
  documentType: string;
  uploadKey:
    | "tourismRegistration"
    | "vehiclePermit"
    | "publicLiabilityInsurance"
    | "boatLicense"
    | "adventureWaterSportsLicense"
    | "fssaiLicense";
};
type SupplementalData = {
  supplierType: string;
  entityType: string;
  yearEstablished: string;
  operatingAddressSame: boolean;
  operatingCities: string;
  categories: string;
  website: string;
  googleBusinessListing: string;
  guestsServedMonthly: string;
  fleetAssets: string;
  listedOn: string[];
  bookingMethod: string;
  contacts: Contact[];
  escalationLevels: EscalationLevel[];
  customerHelpline: string;
  bookingAlerts: string[];
  insuranceAmount: string;
  insurerPolicy: string;
  tradeLicenseNeededFor: string;
  tradeLicenseValidTill: string;
  licences: LicenceRow[];
  agreementName?: string;
  commercialModel?: string;
  commission?: string;
  settlementCycle?: string;
  contractTerm?: string;
  accountManager?: string;
  tdsStatus: string;
  signingMethod: string;
};
const initialSupplemental: SupplementalData = {
  supplierType: "Direct operator",
  entityType: "",
  yearEstablished: "",
  operatingAddressSame: true,
  operatingCities: "",
  categories: "",
  website: "",
  googleBusinessListing: "",
  guestsServedMonthly: "",
  fleetAssets: "",
  listedOn: [],
  bookingMethod: "Phone / WhatsApp, manual register",
  contacts: [
    {
      role: "Owner / authorised signatory",
      name: "",
      designation: "",
      mobile: "",
      email: "",
      hours: "Business hours",
    },
    {
      role: "Reservations & operations",
      name: "",
      designation: "",
      mobile: "",
      email: "",
      hours: "07:00–22:00 daily",
    },
    {
      role: "Accounts & payouts",
      name: "",
      designation: "",
      mobile: "",
      email: "",
      hours: "Mon–Sat 10–18",
    },
    {
      role: "On-ground emergency",
      name: "",
      designation: "",
      mobile: "",
      email: "",
      hours: "24 × 7",
    },
  ],
  escalationLevels: [
    {
      code: "L1",
      trigger: "Any booking or pickup query",
      contactRole: "Reservations & operations",
      response: "15 min",
    },
    {
      code: "L2",
      trigger: "L1 unresolved in 30 min, or pickup delayed 30+ min",
      contactRole: "Reservations & operations",
      response: "30 min",
    },
    {
      code: "L3",
      trigger: "Safety incident, vehicle no-show, guest stranded, or L2 unresolved",
      contactRole: "Owner / authorised signatory",
      response: "15 min, 24 × 7",
    },
  ],
  customerHelpline: "",
  bookingAlerts: ["Email", "WhatsApp", "Vendor login"],
  insuranceAmount: "",
  insurerPolicy: "",
  tradeLicenseNeededFor: "",
  tradeLicenseValidTill: "",
  licences: [
    { key: "tourismRegistration", label: "Tourism trade registration", neededFor: "All tours in selected destinations", validTill: "", documentType: "TOURISM_REGISTRATION", uploadKey: "tourismRegistration" },
    { key: "vehiclePermit", label: "Tourist vehicle permits", neededFor: "Transport activities", validTill: "", documentType: "VEHICLE_PERMIT", uploadKey: "vehiclePermit" },
    { key: "publicLiabilityInsurance", label: "Public liability insurance", neededFor: "All activities", validTill: "", documentType: "PUBLIC_LIABILITY_INSURANCE", uploadKey: "publicLiabilityInsurance" },
    { key: "boatLicense", label: "Boat licence / Captain of Ports registration", neededFor: "Cruises & boats", validTill: "", documentType: "BOAT_LICENSE", uploadKey: "boatLicense" },
    { key: "adventureWaterSportsLicense", label: "Adventure / water sports licence", neededFor: "Not offered", validTill: "", documentType: "ADVENTURE_WATER_SPORTS_LICENSE", uploadKey: "adventureWaterSportsLicense" },
    { key: "fssaiLicense", label: "FSSAI licence", neededFor: "No food served", validTill: "", documentType: "FSSAI_LICENSE", uploadKey: "fssaiLicense" },
  ],
  // Commercial terms are offered by VOYA and are read-only for the vendor.
  // They still travel in supplementalData so the values are loaded from and
  // persisted to the onboarding application rather than being display-only.
  agreementName: "Activity Vendor Agreement",
  commercialModel: "Commission on sell price",
  commission: "18%",
  settlementCycle: "Weekly T+7 after activity date",
  contractTerm: "12 months auto-renews · 90 days' notice",
  accountManager: "Jatin M.",
  tdsStatus: "Not applicable",
  signingMethod: "Aadhaar eSign (OTP)",
};
const initialForm = {
  firstName: "",
  lastName: "",
  countryCode: "+91",
  contactNumber: "",
  businessDisplayName: "",
  legalBusinessName: "",
  panNumber: "",
  gstStatus: "",
  gstin: "",
  gstDeclarationAccepted: false,
  addressLine: "",
  city: "",
  state: "",
  pinCode: "",
  latitude: "",
  longitude: "",
  accountHolderName: "",
  bankName: "",
  bankAccountNumber: "",
  ifscCode: "",
  accountType: "",
  bankOwnershipConfirmed: false,
  authorizedBusinessName: "",
  authorizedRepresentative: "",
  agreementAccepted: false,
  signatureData: "",
  supplementalData: initialSupplemental,
};
type FormState = typeof initialForm;
type ReviewStatus = "ok" | "warn" | "bad";
type ReviewItem = {
  status: ReviewStatus;
  title: string;
  detail: string;
  fixStep?: number;
};
const placeholderBusinessName = "Vendor pending onboarding";
function onboardingBusinessName(value?: string | null) {
  return value === placeholderBusinessName ? "" : value || "";
}
function inferEntityType(value?: string | null) {
  const name = (value || "").toLowerCase();
  if (/\bllp\b/.test(name)) return "LLP";
  if (/private\s+limited|pvt\.?\s*ltd\.?/.test(name)) return "Private Limited";
  if (/public\s+limited|public\s+ltd\.?/.test(name)) return "Public Limited";
  if (/partnership/.test(name)) return "Partnership firm";
  return "";
}
function tourismRegistrationLabel(state?: string | null) {
  const normalized = (state || "").trim();
  return normalized ? `${normalized} Tourism trade registration` : "Tourism trade registration";
}
function normalizedPhone(value: string) {
  return value.replace(/[\s()-]/g, "");
}
function validPhone(value: string) {
  return /^\+?[1-9]\d{9,14}$/.test(normalizedPhone(value));
}
function splitPhone(value: string) {
  const normalized = normalizedPhone(value);
  const code =
    countryCodes.find((item) => normalized.startsWith(item.value))?.value ||
    "+91";
  return {
    countryCode: code,
    contactNumber:
      code === "+91" && !normalized.startsWith("+91")
        ? normalized
        : normalized.slice(code.length),
  };
}
function toggleCsvValue(value: string, item: string) {
  const values = value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  return values.includes(item)
    ? values.filter((entry) => entry !== item).join(", ")
    : [...values, item].join(", ");
}
function supplementalFrom(
  application: VendorOnboardingApplication,
): SupplementalData {
  const raw = (application.supplementalData || {}) as Partial<SupplementalData>;
  const applicantName = [application.firstName, application.lastName]
    .filter(Boolean)
    .join(" ")
    .trim();
  const applicantMobile = normalizedPhone(application.contactNumber || "");
  const defaultContacts = initialSupplemental.contacts.map((contact, index) =>
    index === 0
      ? {
          ...contact,
          name: contact.name || applicantName,
          mobile: contact.mobile || applicantMobile,
        }
      : contact,
  );
  const savedContacts = raw.contacts || [];
  const legacyPrimary = savedContacts.find(
    (contact) => contact.role === "Primary operations",
  );
  const legacyEmergency = savedContacts.find(
    (contact) => contact.role === "Emergency contact",
  );
  const contacts = initialSupplemental.contacts.map((contact, index) => {
    const saved =
      savedContacts.find((item) => item.role === contact.role) ||
      (index === 0 ? legacyPrimary : index === 3 ? legacyEmergency : undefined);
    return {
      ...contact,
      ...saved,
      role: contact.role,
      ...(index === 0
        ? {
            name: saved?.name || applicantName,
            mobile: saved?.mobile || applicantMobile,
          }
        : {}),
    };
  });
  const savedLicences = Array.isArray(raw.licences) ? raw.licences : [];
  const licences = initialSupplemental.licences.map((licence) => {
    const saved = savedLicences.find((item) => item.key === licence.key);
    return {
      ...licence,
      ...saved,
      key: licence.key,
      label: licence.key === "tourismRegistration"
        ? tourismRegistrationLabel(application.state)
        : licence.label,
      documentType: licence.documentType,
      uploadKey: licence.uploadKey,
    };
  });
  return {
    ...initialSupplemental,
    ...raw,
    agreementName: agreementNameForSupplierType(raw.supplierType || initialSupplemental.supplierType),
    commercialModel: raw.commercialModel || initialSupplemental.commercialModel,
    commission:
      raw.commission && raw.commission !== "To be confirmed"
        ? raw.commission
        : initialSupplemental.commission,
    settlementCycle: raw.settlementCycle
      ? raw.settlementCycle
          .replace(/^Weekly\s*[·•]\s*/, "Weekly ")
          .replace(/^Weekly\s+T\+7/, "Weekly T+7")
      : initialSupplemental.settlementCycle,
    contractTerm: raw.contractTerm
      ? (() => {
          const normalized = raw.contractTerm
            .replace("12 months · auto-renews", "12 months auto-renews")
            .replace(/\s*·\s*90 days' notice$/, " · 90 days' notice");
          return normalized === "12 months auto-renews"
            ? normalized + " · 90 days' notice"
            : normalized;
        })()
      : initialSupplemental.contractTerm,
    accountManager:
      raw.accountManager && raw.accountManager !== "Not assigned yet"
        ? raw.accountManager
        : initialSupplemental.accountManager,
    entityType: raw.entityType || inferEntityType(application.legalBusinessName),
    listedOn: raw.listedOn || initialSupplemental.listedOn,
    contacts: savedContacts.length ? contacts : defaultContacts,
    licences,
    escalationLevels: raw.escalationLevels?.length
      ? raw.escalationLevels
      : initialSupplemental.escalationLevels,
    bookingAlerts: raw.bookingAlerts?.length
      ? raw.bookingAlerts
      : initialSupplemental.bookingAlerts,
  };
}
function formFromApplication(
  application: VendorOnboardingApplication,
): FormState {
  const supplementalData = supplementalFrom(application);
  const primaryContactName = supplementalData.contacts[0]?.name.trim().split(/\s+/).filter(Boolean) || [];
  const firstName = application.firstName || primaryContactName[0] || "";
  const lastName = application.lastName || primaryContactName.slice(1).join(" ");
  const businessDisplayName = onboardingBusinessName(
    application.businessDisplayName,
  );
  const legalBusinessName = onboardingBusinessName(
    application.legalBusinessName,
  );
  return {
    ...initialForm,
    ...splitPhone(application.contactNumber || ""),
    firstName,
    lastName,
    businessDisplayName,
    legalBusinessName,
    panNumber: application.panNumber || "",
    gstStatus: application.gstStatus || "",
    gstin: application.gstin || "",
    gstDeclarationAccepted: application.gstDeclarationAccepted,
    addressLine: application.addressLine || "",
    city: application.city || "",
    state: application.state || "",
    pinCode: application.pinCode || "",
    latitude: application.latitude == null ? "" : String(application.latitude),
    longitude:
      application.longitude == null ? "" : String(application.longitude),
    accountHolderName: application.accountHolderName || "",
    bankName: application.bankName || "",
    ifscCode: application.ifscCode || "",
    accountType: application.accountType || "",
    bankOwnershipConfirmed: application.bankOwnershipConfirmed,
    authorizedBusinessName:
      application.authorizedBusinessName ||
      legalBusinessName ||
      businessDisplayName,
    authorizedRepresentative:
      application.authorizedRepresentative ||
      [firstName, lastName].filter(Boolean).join(" "),
    agreementAccepted: Boolean(application.agreementAcceptedAt),
    signatureData: application.signatureData || "",
    supplementalData,
  };
}
function documentFor(application: VendorOnboardingApplication, type: string) {
  return application.documents.find((item) => item.type === type);
}
function agreementTimestamp(value?: string | null) {
  return value
    ? new Date(value).toLocaleString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "Awaiting";
}

function UploadCard({
  label,
  document,
  disabled,
  onUpload,
}: {
  label: string;
  document?: VendorOnboardingApplication["documents"][number];
  disabled: boolean;
  onUpload: (file: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="upload-card">
      <div>
        <b>{label}</b>
        <small>PDF, JPG or PNG · maximum 8 MB</small>
        {document?.latestVersion ? (
          <span className="upload-status">
            ✓ {document.latestVersion.fileAsset.originalName} ·{" "}
            {document.latestVersion.status}
          </span>
        ) : (
          <span className="muted">No document uploaded</span>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,image/jpeg,image/png"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onUpload(file);
          event.currentTarget.value = "";
        }}
      />
      <button
        type="button"
        className="btn small"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
      >
        {document?.latestVersion ? "Replace" : "Upload"}
      </button>
    </div>
  );
}

function KycDocumentAction({
  label,
  document,
  disabled,
  onUpload,
  onView,
  onDownload,
}: {
  label: string;
  document?: VendorOnboardingApplication["documents"][number];
  disabled: boolean;
  onUpload: (file: File) => void;
  onView?: () => void | Promise<void>;
  onDownload?: () => void | Promise<void>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const hasDocument = Boolean(document?.latestVersion);
  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,image/jpeg,image/png"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onUpload(file);
          event.currentTarget.value = "";
        }}
      />
      <div className="kyc-document-action-buttons">
        <button
          type="button"
          className={`btn small ${document?.latestVersion ? "" : "accent"}`}
          disabled={disabled}
          aria-label={`${hasDocument ? "View" : "Upload"} ${label}`}
          onClick={() => {
            if (hasDocument && onView) void onView();
            else inputRef.current?.click();
          }}
        >
          {hasDocument ? "View" : "Upload"}
        </button>
        {hasDocument && (
          <button
            type="button"
            className="btn small"
            disabled={disabled}
            aria-label={`Replace ${label}`}
            onClick={() => inputRef.current?.click()}
          >
            Replace
          </button>
        )}
        {hasDocument && onDownload && (
          <button
            type="button"
            className="btn small"
            disabled={disabled}
            aria-label={`Download ${label}`}
            onClick={() => void onDownload()}
          >
            Download
          </button>
        )}
      </div>
    </>
  );
}

export default function Onboarding({
  onNavigate = () => undefined,
  onStatusChange = () => undefined,
}: {
  onNavigate?: (page: "products") => void;
  onStatusChange?: (status: string) => void;
}) {
  const [application, setApplication] =
    useState<VendorOnboardingApplication | null>(null);
  const [form, setForm] = useState<FormState>(initialForm);
  const [step, setStep] = useState(1);
  const [started, setStarted] = useState(false);
  const [otp, setOtp] = useState("");
  const [otpRequested, setOtpRequested] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [ifscLookupLabel, setIfscLookupLabel] = useState("");
  const [cityDraft, setCityDraft] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const agreementSignatureRef = useRef<HTMLDivElement>(null);
  const signatureInputRef = useRef<HTMLInputElement>(null);
  const drawingRef = useRef(false);
  async function load(preserveLocalForm = false) {
    setLoading(true);
    setError("");
    try {
      const data =
        await api.request<VendorOnboardingApplication>("/vendor/onboarding");
      setApplication(data);
      onStatusChange(data.status);
      setIfscLookupLabel(data.bankName || "");
      setForm((current) =>
        preserveLocalForm
          ? {
              ...formFromApplication(data),
              ...current,
              supplementalData: current.supplementalData,
            }
          : formFromApplication(data),
      );
      setStep(Math.min(8, data.currentStep || 1));
      setStarted(Boolean(data.startedAt));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  useEffect(() => {
    if (application?.status === "CHANGES_REQUESTED" && application.reviewReason)
      setError(
        `Changes requested by Voya: ${application.reviewReason} Please update the requested section, save your changes, and submit again.`,
      );
  }, [application]);
  useEffect(() => {
    const data = form.signatureData;
    if (
      step !== 7 ||
      !data ||
      !data.startsWith("data:image/") ||
      !canvasRef.current
    )
      return;
    const image = new Image();
    image.onload = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const scale = Math.min(
        canvas.width / image.width,
        canvas.height / image.height,
      );
      const width = image.width * scale;
      const height = image.height * scale;
      ctx.drawImage(
        image,
        (canvas.width - width) / 2,
        (canvas.height - height) / 2,
        width,
        height,
      );
    };
    image.src = data;
  }, [form.signatureData, step]);
  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setError("");
  }
  function updateSupplemental<K extends keyof SupplementalData>(
    key: K,
    value: SupplementalData[K],
  ) {
    setForm((current) => ({
      ...current,
      supplementalData: { ...current.supplementalData, [key]: value },
    }));
    setError("");
  }
  function updateSupplierType(value: string) {
    setForm((current) => ({
      ...current,
      supplementalData: {
        ...current.supplementalData,
        supplierType: value,
        agreementName: agreementNameForSupplierType(value),
      },
    }));
    setError("");
  }
  async function lookupIfsc() {
    const code = form.ifscCode.trim().toUpperCase();
    if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(code)) {
      setIfscLookupLabel("");
      return;
    }
    try {
      const result = await api.request<{
        bankName: string;
        branch: string;
        city: string;
        state: string;
      }>(`/vendor/onboarding/ifsc/${encodeURIComponent(code)}`);
      update("bankName", result.bankName);
      setIfscLookupLabel(
        [result.bankName, result.branch ? `${result.branch} branch` : ""]
          .filter(Boolean)
          .join(" · "),
      );
    } catch {
      setIfscLookupLabel("");
    }
  }
  function updateContact(index: number, key: keyof Contact, value: string) {
    updateSupplemental(
      "contacts",
      form.supplementalData.contacts.map((contact, contactIndex) =>
        contactIndex === index ? { ...contact, [key]: value } : contact,
      ),
    );
  }
  function payload(currentStep = step) {
    const { countryCode, supplementalData, ...rest } = form;
    return {
      ...rest,
      contactNumber: normalizedPhone(countryCode + form.contactNumber),
      supplementalData,
      currentStep,
      gstStatus: form.gstStatus || undefined,
      bankAccountNumber: form.bankAccountNumber || undefined,
      signatureData: form.signatureData.startsWith("data:image/png;base64,")
        ? form.signatureData
        : undefined,
    };
  }
  async function save(patch: Record<string, unknown> = {}) {
    const result = await api.request<VendorOnboardingApplication>(
      "/vendor/onboarding",
      { method: "PATCH", body: JSON.stringify(patch) },
    );
    setApplication(result);
    onStatusChange(result.status);
    setForm((current) => ({
      ...current,
      ...formFromApplication(result),
      bankAccountNumber: current.bankAccountNumber,
      signatureData:
        formFromApplication(result).signatureData || current.signatureData,
      supplementalData: current.supplementalData,
    }));
    return result;
  }
  async function start() {
    setBusy(true);
    try {
      await save({
        started: true,
        currentStep: 1,
        supplementalData: form.supplementalData,
      });
      setStarted(true);
      setNotice(
        "Your draft is saved automatically as you move through the application.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function requestOtp() {
    const contactNumber = normalizedPhone(
      form.countryCode + form.contactNumber,
    );
    setError("");
    if (!validPhone(contactNumber)) {
      setError("Enter a valid mobile number.");
      return;
    }
    setBusy(true);
    try {
      const result = await api.request<{ demoOtp?: string }>(
        "/vendor/onboarding/otp/request",
        { method: "POST", body: JSON.stringify({ contactNumber }) },
      );
      setOtpRequested(true);
      setNotice(
        result.demoOtp
          ? "Demo OTP: " + result.demoOtp
          : "OTP sent. It expires in 10 minutes.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function verifyOtp() {
    setBusy(true);
    setError("");
    try {
      await api.request("/vendor/onboarding/otp/verify", {
        method: "POST",
        body: JSON.stringify({ otp }),
      });
      await load(true);
      setNotice("Contact number verified.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function validStep() {
    if (
      step === 1 &&
      (!form.firstName.trim() ||
        !form.lastName.trim() ||
        !form.businessDisplayName.trim() ||
        !form.legalBusinessName.trim() ||
        !form.supplementalData.entityType ||
        !form.addressLine.trim() ||
        !form.city.trim() ||
        !form.state.trim() ||
        !/^\d{6}$/.test(form.pinCode.trim()))
    )
      return "Complete the business profile, legal identity and registered address.";
    if (
      step === 2 &&
      (!validPhone(form.countryCode + form.contactNumber) ||
        (application?.mobileVerificationEnabled === true && !application?.phoneVerifiedAt) ||
        !form.supplementalData.contacts[0]?.name.trim() ||
        !validPhone(form.supplementalData.contacts[0]?.mobile || ""))
    )
      return application?.mobileVerificationEnabled === true
        ? "Add a reachable primary contact and verify the mobile number with OTP."
        : "Add a reachable primary contact and valid mobile number.";
    if (
      step === 3 &&
      (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(form.panNumber.trim().toUpperCase()) ||
        !documentFor(application!, "PAN")?.latestVersion ||
        !form.gstStatus ||
        (form.gstStatus === "REGISTERED" &&
          (!/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(
            form.gstin.trim().toUpperCase(),
          ) ||
            !form.gstDeclarationAccepted ||
            !documentFor(application!, "GSTIN")?.latestVersion)) ||
        (form.gstStatus === "NOT_REGISTERED" && !form.gstDeclarationAccepted))
    )
      return "Complete the required KYC details and upload the applicable documents.";
    if (step === 5) {
      if (!form.accountHolderName.trim() || !form.bankName.trim())
        return "Enter the account holder and bank name.";
      if (
        !application?.bankAccountMasked &&
        !/^\d{9,18}$/.test(form.bankAccountNumber.replace(/\s+/g, ""))
      )
        return "Enter a valid 9–18 digit account number.";
      if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(form.ifscCode.trim().toUpperCase()))
        return "Enter a valid IFSC code.";
      if (
        !form.accountType ||
        !form.bankOwnershipConfirmed ||
        !documentFor(application!, "BANK_PROOF")?.latestVersion
      )
        return "Complete bank details, ownership confirmation and bank proof.";
    }
    if (
      step === 7 &&
      (!form.authorizedBusinessName.trim() ||
        !form.authorizedRepresentative.trim() ||
        !form.agreementAccepted ||
        (!form.signatureData && !application?.hasSignature))
    )
      return "Accept the agreement and add an authorized signature to continue.";
    return "";
  }
  async function next() {
    const message = validStep();
    if (message) {
      setError(message);
      window.setTimeout(
        () => window.scrollTo({ top: 0, behavior: "smooth" }),
        0,
      );
      return;
    }
    setBusy(true);
    setError("");
    try {
      if (step < 8) {
        await save(payload(step + 1));
        setStep(step + 1);
      } else {
        await save(payload(8));
        const submitted = await api.request<VendorOnboardingApplication>(
          "/vendor/onboarding/submit",
          { method: "POST" },
        );
        setApplication(submitted);
        onStatusChange(submitted.status);
        setNotice("Application submitted for review.");
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function upload(
    key:
      | "pan"
      | "gstin"
      | "bankProof"
      | "tradeLicense"
      | "llpAgreement"
      | "llpinCertificate"
      | "signatoryId"
      | "authorizationLetter"
      | "addressProof"
      | "udyamCertificate"
      | "tourismRegistration"
      | "vehiclePermit"
      | "publicLiabilityInsurance"
      | "boatLicense"
      | "adventureWaterSportsLicense"
      | "fssaiLicense",
    file?: File,
  ) {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const body = new FormData();
      body.append("file", file);
      const documentExpiry = form.supplementalData.licences.find((licence) => licence.uploadKey === key)?.validTill;
      if (documentExpiry) body.append("expiresAt", documentExpiry);
      await api.request(`/vendor/documents/${key}`, { method: "POST", body });
      await load(true);
      setNotice(
        `${
          key === "bankProof"
            ? "Bank proof"
            : key === "tradeLicense"
              ? "Trade licence"
              : key === "llpAgreement"
                ? "LLP agreement"
                : key === "llpinCertificate"
                  ? "LLPIN certificate"
                  : key === "signatoryId"
                    ? "Authorised signatory ID"
                    : key === "authorizationLetter"
                      ? "Authorisation letter"
                      : key === "addressProof"
                        ? "Address proof"
                        : key === "udyamCertificate"
                          ? "Udyam certificate"
                          : key === "tourismRegistration"
                            ? "Tourism registration"
                            : key === "vehiclePermit"
                              ? "Vehicle permit"
                              : key === "publicLiabilityInsurance"
                                ? "Public liability insurance"
                                : key === "boatLicense"
                                  ? "Boat licence"
                                  : key === "adventureWaterSportsLicense"
                                    ? "Adventure / water sports licence"
                                    : key === "fssaiLicense"
                                      ? "FSSAI licence"
                          : key.toUpperCase()
        } uploaded and pending review.`,
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function viewDocument(
    document?: VendorOnboardingApplication["documents"][number],
  ) {
    const fileAssetId = document?.latestVersion?.fileAsset.id;
    if (!fileAssetId) return;
    const preview = window.open("about:blank", "_blank");
    try {
      const blob = await api.blob(`/files/${fileAssetId}/content`);
      const url = URL.createObjectURL(blob);
      if (preview) preview.location.href = url;
      else window.open(url, "_blank");
    } catch (e) {
      preview?.close();
      setError((e as Error).message);
    }
  }
  async function downloadDocument(
    document?: VendorOnboardingApplication["documents"][number],
  ) {
    const fileAsset = document?.latestVersion?.fileAsset;
    if (!fileAsset?.id) return;
    setBusy(true);
    setError("");
    try {
      const blob = await api.blob(`/files/${fileAsset.id}/content`);
      const url = URL.createObjectURL(blob);
      const link = window.document.createElement("a");
      link.href = url;
      link.download = fileAsset.originalName || "vendor-document";
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
      setNotice(`${fileAsset.originalName || "Document"} downloaded.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function downloadAgreement() {
    setBusy(true);
    setError("");
    try {
      const blob = await api.blob("/vendor/onboarding/agreement.pdf");
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "voya-partner-agreement-" + (form.businessDisplayName || "vendor") + ".pdf";
      link.click();
      URL.revokeObjectURL(url);
      setNotice("Agreement PDF downloaded.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function reviewAgreement() {
    setBusy(true);
    setError("");
    try {
      // Persist the selected signing method and annexure edits before recording
      // that the agreement was opened for review.
      await save(payload(7));
      const result = await api.request<VendorOnboardingApplication>(
        "/vendor/onboarding/agreement/opened",
        { method: "POST", body: JSON.stringify({}) },
      );
      setApplication(result);
      setNotice("Agreement opened for review. Add your signature below.");
      window.setTimeout(
        () =>
          agreementSignatureRef.current?.scrollIntoView?.({
            behavior: "smooth",
            block: "center",
          }),
        0,
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function persistSignature(signatureData: string) {
    setBusy(true);
    setError("");
    try {
      await save({
        signatureData,
        currentStep: 7,
        supplementalData: form.supplementalData,
      });
      setNotice("Signature uploaded and saved.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function uploadSignature(file?: File) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Upload a PNG or JPG signature image.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const image = new Image();
      image.onload = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d")!;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const scale = Math.min(
          canvas.width / image.width,
          canvas.height / image.height,
        );
        const width = image.width * scale;
        const height = image.height * scale;
        ctx.drawImage(
          image,
          (canvas.width - width) / 2,
          (canvas.height - height) / 2,
          width,
          height,
        );
        const signatureData = canvas.toDataURL("image/png");
        update("signatureData", signatureData);
        void persistSignature(signatureData);
      };
      image.onerror = () => setError("The signature image could not be read.");
      image.src = String(reader.result);
    };
    reader.onerror = () => setError("The signature image could not be read.");
    reader.readAsDataURL(file);
  }
  function canvasPoint(event: PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!;
    const bounds = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - bounds.left) * (canvas.width / bounds.width),
      y: (event.clientY - bounds.top) * (canvas.height / bounds.height),
    };
  }
  function draw(event: PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    const point = canvasPoint(event);
    const ctx = canvasRef.current!.getContext("2d")!;
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#14213d";
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
    update("signatureData", canvasRef.current!.toDataURL("image/png"));
  }
  function clearSignature() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.getContext("2d")!.clearRect(0, 0, canvas.width, canvas.height);
    update("signatureData", "");
  }
  if (loading) return <Loading />;
  if (error && !application) return <ErrorBox error={error} />;
  if (!application) return null;
  if (application.status === "APPROVED")
    return (
      <ApprovedOnboardingDashboard
        application={application}
        onNavigate={onNavigate}
      />
    );
  if (
    application.status !== "DRAFT" &&
    application.status !== "CHANGES_REQUESTED"
  )
    return (
      <div className="onboarding-page">
        <Panel>
          <div className="onboarding-status">
            <span className="onboarding-mark">✓</span>
            <h2>Application under review</h2>
            <Badge value={application.status.replaceAll("_", " ")} />
            <p>
              Your application and documents are with the Voya team. We will
              update this workspace when the review is complete.
            </p>
            {application.reviewReason && (
              <div className="alert info">
                <b>Review note</b>
                <br />
                {application.reviewReason}
              </div>
            )}
          </div>
        </Panel>
      </div>
    );
  if (!started)
    return (
      <div className="onboarding-page">
        <div className="onboarding-welcome">
          <div className="onboarding-eyebrow">Account / Business profile &amp; KYC · {application.id.slice(-6).toUpperCase()}</div>
          <h2>Build your partner profile</h2>
          <p>
            Complete the eight sections to verify your business, contacts,
            documents, payout details and agreement.
          </p>
          <div className="onboarding-benefits">
            <span>✓ Save and resume anytime</span>
            <span>✓ Private document storage</span>
            <span>✓ Review status in one place</span>
          </div>
          <button
            className="btn accent"
            disabled={busy}
            onClick={() => void start()}
          >
            {busy ? "Opening…" : "Start onboarding →"}
          </button>
        </div>
      </div>
    );
  const supplemental = form.supplementalData;
  const licenceRows = supplemental.licences?.length
    ? supplemental.licences
    : initialSupplemental.licences;
  const displayLicenceRows = licenceRows.map((licence) =>
    licence.key === "tourismRegistration"
      ? { ...licence, label: tourismRegistrationLabel(form.state) }
      : licence,
  );
  const docStatus = (type: string) =>
    documentFor(application, type)?.latestVersion?.status ||
    documentFor(application, type)?.currentStatus ||
    "Missing";
  const documentStatusLabel = (type: string) => {
    const raw = String(docStatus(type));
    const labels: Record<string, string> = {
      APPROVED: "Verified",
      VERIFIED: "Verified",
      PENDING: "Pending",
      PENDING_REVIEW: "Pending",
      UPLOADED: "Uploaded",
      REJECTED: "Rejected",
      MISSING: "Missing",
    };
    return labels[raw.toUpperCase()] || raw;
  };
  const sectionChecks = [
    Boolean(form.businessDisplayName && form.legalBusinessName && form.addressLine && supplemental.entityType),
    Boolean((application.mobileVerificationEnabled !== true || application.phoneVerifiedAt) && supplemental.contacts[0]?.name && supplemental.contacts[0]?.mobile),
    Boolean(form.panNumber && documentFor(application, "PAN")?.latestVersion && form.gstStatus),
    Boolean(
      documentFor(application, "TRADE_LICENSE")?.latestVersion ||
        supplemental.licences?.some((licence) =>
          Boolean(documentFor(application, licence.documentType)?.latestVersion),
        ) ||
        supplemental.insuranceAmount ||
        supplemental.insurerPolicy,
    ),
    Boolean(application.bankAccountMasked && documentFor(application, "BANK_PROOF")?.latestVersion),
    Boolean(supplemental.commercialModel),
    Boolean(form.agreementAccepted && (form.signatureData || application.hasSignature)),
  ];
  const completeSections = sectionChecks.filter(Boolean).length;
  const needsAction = sectionChecks.length - completeSections;
  const onboardingStatus = String(application.status);
  const agreementSentAt =
    application.agreementSentAt ||
    (application.currentStep >= 7 ? application.updatedAt : null);
  const agreementSigned = Boolean(
    application.agreementAcceptedAt &&
      (form.signatureData || application.hasSignature),
  );
  const lifecycle = [
    { title: "Signed up", detail: application.startedAt ? new Date(application.startedAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short" }) : "—", state: "done" },
    { title: "Details submitted", detail: application.currentStep > 1 ? new Date(application.updatedAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short" }) : "—", state: application.currentStep > 1 ? "done" : "pending" },
    { title: "Verification", detail: onboardingStatus === "UNDER_REVIEW" ? "Under review" : needsAction ? `${needsAction} items open` : "Ready for review", state: onboardingStatus === "APPROVED" ? "done" : needsAction ? "now" : "pending" },
    { title: "Agreement", detail: form.agreementAccepted ? "Signed" : "Waiting for your signature", state: form.agreementAccepted ? "done" : "now" },
    { title: "Approved · selling", detail: onboardingStatus === "APPROVED" ? "Live" : "—", state: onboardingStatus === "APPROVED" ? "done" : "pending" },
  ] as const;
  const hasDocument = (type: string) => Boolean(documentFor(application, type)?.latestVersion);
  const contactCount = supplemental.contacts.filter((contact) => contact.name || contact.mobile || contact.email).length;
  const primaryContactReady = Boolean((application.mobileVerificationEnabled !== true || application.phoneVerifiedAt) && supplemental.contacts[0]?.name && supplemental.contacts[0]?.mobile);
  const emergencyContactReady = Boolean(supplemental.contacts[3]?.name && supplemental.contacts[3]?.mobile);
  const contactsReady = primaryContactReady && emergencyContactReady;
  const authorisationMissing = !hasDocument("AUTHORIZATION_LETTER");
  const boatLicenceRequired = /cruises\s*&\s*boats/i.test(supplemental.categories || "");
  const boatLicenceMissing = boatLicenceRequired && !hasDocument("BOAT_LICENSE");
  const insurance = displayLicenceRows.find((licence) => licence.key === "publicLiabilityInsurance");
  const insuranceDocument = documentFor(application, "PUBLIC_LIABILITY_INSURANCE");
  const insuranceVersion = insuranceDocument?.latestVersion;
  const insuranceStatus = String(insuranceVersion?.status || insuranceDocument?.currentStatus || "MISSING").toUpperCase();
  const insuranceEvidenceUploaded = Boolean(insuranceVersion);
  const insuranceDetailsProvided = Boolean(supplemental.insuranceAmount && supplemental.insurerPolicy);
  const insuranceVerified = insuranceStatus === "VERIFIED" || insuranceStatus === "APPROVED";
  const insuranceRejected = insuranceStatus === "REJECTED";
  const insuranceExpiryValue = insurance?.validTill || insuranceVersion?.expiresAt;
  const insuranceExpiry = insuranceExpiryValue ? new Date(`${insuranceExpiryValue.slice(0, 10)}T23:59:59`) : null;
  const daysUntilInsuranceExpiry = insuranceExpiry && !Number.isNaN(insuranceExpiry.getTime())
    ? Math.ceil((insuranceExpiry.getTime() - Date.now()) / 86400000)
    : null;
  const insuranceMissing = !insuranceEvidenceUploaded && !insuranceDetailsProvided;
  const insuranceExpired = !insuranceMissing && daysUntilInsuranceExpiry !== null && daysUntilInsuranceExpiry < 0;
  const insuranceExpiring = insuranceVerified && !insuranceExpired && daysUntilInsuranceExpiry !== null && daysUntilInsuranceExpiry <= 30;
  const insurancePending = !insuranceMissing && !insuranceVerified && !insuranceRejected;
  const insuranceExpiryUnknown = insuranceVerified && daysUntilInsuranceExpiry === null;
  const insuranceDetail = insuranceRejected
    ? insuranceVersion?.rejectionReason || "The uploaded insurance evidence was rejected. Replace it with valid policy documentation."
    : insuranceMissing
      ? "Public liability cover and policy evidence are required before go-live."
      : insuranceExpired
        ? `Insurance expired ${insuranceExpiryValue}. Renew it before activation.`
        : insuranceExpiring
          ? `Insurance expires ${insuranceExpiryValue}. Products may auto-pause if it is not renewed.`
          : insurancePending
            ? "Insurance evidence is awaiting verification; cover is not confirmed."
            : insuranceExpiryUnknown
              ? "Insurance evidence is verified, but its expiry date is not recorded. Add the policy expiry date."
              : "Public liability evidence is verified and the policy has not expired.";
  const reviewItems: ReviewItem[] = [
    {
      status: form.businessDisplayName && form.legalBusinessName && form.addressLine && supplemental.entityType ? "ok" : "bad",
      title: "Business profile",
      detail: `${supplemental.supplierType || "Supplier type missing"} · ${supplemental.entityType || "Entity type missing"} · ${[form.city, form.state].filter(Boolean).join(", ") || "Address missing"} · ${supplemental.categories ? supplemental.categories.split(",").filter(Boolean).length : 0} categories`,
      fixStep: 1,
    },
    {
      status: contactsReady ? "ok" : "bad",
      title: "Contacts & escalation",
      detail: `${contactCount} contacts · ${supplemental.escalationLevels.length}-level escalation · ${emergencyContactReady ? "24 × 7 emergency line" : "emergency mobile required"}`,
      fixStep: 2,
    },
    {
      status: authorisationMissing ? "bad" : "ok",
      title: authorisationMissing ? "Authorisation letter missing" : "KYC documents",
      detail: authorisationMissing ? "Needed before we can countersign your agreement." : `PAN ${documentStatusLabel("PAN")} · GST ${form.gstStatus || "missing"}`,
      fixStep: authorisationMissing ? 3 : undefined,
    },
    {
      status: boatLicenceMissing ? "bad" : "ok",
      title: boatLicenceMissing ? "Boat licence missing" : "Activity licences",
      detail: boatLicenceMissing ? 'Required because "Cruises & boats" is selected. Remove the category or upload the licence.' : boatLicenceRequired ? "Boat licence is uploaded for the selected category." : "No boat licence is required for the selected categories.",
      fixStep: boatLicenceMissing ? 4 : undefined,
    },
    {
      status: insuranceMissing || insuranceExpired || insuranceRejected ? "bad" : insurancePending || insuranceExpiring || insuranceExpiryUnknown ? "warn" : "ok",
      title: insuranceRejected ? "Insurance rejected" : insuranceMissing ? "Insurance missing" : insurancePending ? "Insurance pending review" : insuranceExpired ? "Insurance expired" : insuranceExpiring ? "Insurance expires soon" : insuranceExpiryUnknown ? "Insurance expiry needed" : "Insurance verified",
      detail: insuranceDetail,
      fixStep: insuranceMissing || insuranceExpired || insuranceRejected || insurancePending || insuranceExpiring || insuranceExpiryUnknown ? 4 : undefined,
    },
    {
      status: application.bankAccountMasked && hasDocument("BANK_PROOF") ? "ok" : "bad",
      title: application.bankAccountMasked && hasDocument("BANK_PROOF") ? "Bank verified" : "Bank details incomplete",
      detail: application.bankAccountMasked && hasDocument("BANK_PROOF") ? `${application.bankAccountMasked} · bank proof uploaded` : "Complete bank details and upload bank proof.",
      fixStep: 5,
    },
    {
      status: supplemental.commercialModel ? "ok" : "warn",
      title: "Commercial terms received",
      detail: `${supplemental.commission || "Commission to be confirmed"} commission · ${supplemental.settlementCycle || "Settlement cycle to be confirmed"} · ${agreementNameForSupplierType(supplemental.supplierType)}`,
    },
    {
      status: agreementSigned ? "ok" : "warn",
      title: agreementSigned ? "Agreement signed" : "Agreement awaiting supplier signature",
      detail: agreementSigned ? "Signature and acceptance saved." : "Review the agreement, accept the terms and add your signature.",
      fixStep: agreementSigned ? undefined : 7,
    },
  ];
  return (
    <div className="onboarding-page">
      <div className="onboarding-heading">
        <div>
          <div className="onboarding-eyebrow">VOYA PARTNER WORKSPACE</div>
          <h2>Business profile &amp; verification</h2>
          <p>
            Complete these sections to start selling. You can create products while we verify; they go live once you&apos;re approved.
          </p>
        </div>
        <div className="onboarding-heading-actions">
          <Badge value={onboardingStatus === "APPROVED" ? "Approved · selling" : "Verification in progress"} />
          <button
            type="button"
            className="btn small"
            onClick={() => void save(payload(step))}
            disabled={busy}
          >
            Save
          </button>
        </div>
      </div>
      {error && (
        <div className="alert error" role="alert">
          {error}
        </div>
      )}
      {notice && (
        <div className="alert success" role="status">
          {notice}
        </div>
      )}
      <div className="onboarding-progress panel">
        <span className="label">Your progress</span>
        <div className="onboarding-lifecycle">
          {lifecycle.map((item, index) => (
            <Fragment key={item.title}>
              <div className={`onboarding-lifecycle-item ${item.state}`}>
                <b>{item.state === "done" ? "✓ " : ""}{item.title}</b>
                <small>{item.detail}</small>
              </div>
              {index < lifecycle.length - 1 && (
                <span className="onboarding-lifecycle-arrow" aria-hidden="true">→</span>
              )}
            </Fragment>
          ))}
        </div>
      </div>
      <div className="onboarding-layout">
        <nav className="onboarding-stepper" aria-label="Onboarding steps">
          {steps.map((label, index) => {
            const number = index + 1;
            const done = Boolean(sectionChecks[index]);
            return (
              <button
                type="button"
                key={label}
                className={`${number === step ? "active " : ""}${done ? "done" : ""}`}
                onClick={() => setStep(number)}
              >
                <span>{done ? "✓" : number}</span>
                <b>{label}</b>
              </button>
            );
          })}
          <div className="onboarding-stepper-summary">
            <span>Sections complete</span>
            <div><strong>{completeSections} / 7</strong><small>{needsAction ? `${needsAction} need action` : "Ready to submit"}</small></div>
            <div className="onboarding-summary-bar"><i style={{ width: `${Math.round((completeSections / 7) * 100)}%` }} /></div>
          </div>
        </nav>
        <main className="onboarding-card">
          {step === 1 && (
            <section>
              <header>
                <h3>1 · Business profile</h3>
                <p>
                  Who the supplier is and how they operate. Supplier type
                  decides which agreement is used.
                </p>
              </header>
              <div className="onboarding-option-grid">
                <button
                  type="button"
                  className={
                    supplemental.supplierType === "Direct operator"
                      ? "selected"
                      : ""
                  }
                  onClick={() =>
                    updateSupplierType("Direct operator")
                  }
                >
                  <b>Direct operator</b>
                  <small>Runs the tour or activity itself</small>
                </button>
                <button
                  type="button"
                  className={
                    supplemental.supplierType === "Attraction / venue"
                      ? "selected"
                      : ""
                  }
                  onClick={() =>
                    updateSupplierType("Attraction / venue")
                  }
                >
                  <b>Attraction / venue</b>
                  <small>Theme park, museum, water park</small>
                </button>
                <button
                  type="button"
                  className={
                    supplemental.supplierType === "Aggregator / DMC"
                      ? "selected"
                      : ""
                  }
                  onClick={() =>
                    updateSupplierType("Aggregator / DMC")
                  }
                >
                  <b>Aggregator / DMC</b>
                  <small>Resells other operators' inventory</small>
                </button>
                <button
                  type="button"
                  className={
                    supplemental.supplierType === "Government body"
                      ? "selected"
                      : ""
                  }
                  onClick={() =>
                    updateSupplierType("Government body")
                  }
                >
                  <b>Government body</b>
                  <small>ASI, state tourism or forest department</small>
                </button>
              </div>
              <div className="onboarding-form-grid two">
                <label className="field">
                  <span>Legal name (as on PAN) *</span>
                  <input
                    value={form.legalBusinessName}
                    onChange={(event) =>
                      update("legalBusinessName", event.target.value)
                    }
                  />
                </label>
                <label className="field">
                  <span>Brand / trade name</span>
                  <input
                    value={form.businessDisplayName}
                    onChange={(event) =>
                      update("businessDisplayName", event.target.value)
                    }
                  />
                  <small>Shown to customers as “Operated by”.</small>
                </label>
                <label className="field">
                  <span>Entity type *</span>
                  <select
                    value={supplemental.entityType}
                    onChange={(event) =>
                      updateSupplemental("entityType", event.target.value)
                    }
                  >
                    <option value="">Select entity type</option>
                    <option>Proprietorship</option>
                    <option>Partnership firm</option>
                    <option>LLP</option>
                    <option>Private Limited</option>
                    <option>Public Limited</option>
                    <option>Trust / Society</option>
                    <option>Government body</option>
                  </select>
                </label>
                <label className="field">
                  <span>Year established</span>
                  <input
                    type="number"
                    value={supplemental.yearEstablished}
                    onChange={(event) =>
                      updateSupplemental("yearEstablished", event.target.value)
                    }
                  />
                </label>
                <label className="field full">
                  <span>Registered address *</span>
                  <textarea
                    value={form.addressLine}
                    onChange={(event) =>
                      update("addressLine", event.target.value)
                    }
                  />
                  <label className="check-row">
                    <input
                      type="checkbox"
                      checked={supplemental.operatingAddressSame}
                      onChange={(event) =>
                        updateSupplemental(
                          "operatingAddressSame",
                          event.target.checked,
                        )
                      }
                    />{" "}
                    Operating address is the same
                  </label>
                </label>
                <label className="field">
                  <span>City *</span>
                  <input
                    value={form.city}
                    onChange={(event) => update("city", event.target.value)}
                  />
                </label>
                <label className="field">
                  <span>State / region *</span>
                  <input
                    value={form.state}
                    onChange={(event) => update("state", event.target.value)}
                  />
                </label>
                <label className="field">
                  <span>PIN code *</span>
                  <input
                    value={form.pinCode}
                    onChange={(event) =>
                      update(
                        "pinCode",
                        event.target.value.replace(/\D/g, "").slice(0, 6),
                      )
                    }
                  />
                </label>
                <label className="field">
                  <span>Website</span>
                  <input
                    value={supplemental.website}
                    onChange={(event) =>
                      updateSupplemental("website", event.target.value)
                    }
                    placeholder="https://"
                  />
                </label>
                <label className="field">
                  <span>Google Business listing</span>
                  <input
                    value={supplemental.googleBusinessListing}
                    onChange={(event) =>
                      updateSupplemental(
                        "googleBusinessListing",
                        event.target.value,
                      )
                    }
                    placeholder="Profile link or rating and reviews"
                  />
                  <small>Used as a quality signal during review.</small>
                </label>
                <label className="field">
                  <span>Guests served per month (approx.)</span>
                  <input
                    type="number"
                    value={supplemental.guestsServedMonthly}
                    onChange={(event) =>
                      updateSupplemental(
                        "guestsServedMonthly",
                        event.target.value,
                      )
                    }
                  />
                </label>
                <label className="field">
                  <span>Fleet / assets</span>
                  <input
                    value={supplemental.fleetAssets}
                    onChange={(event) =>
                      updateSupplemental("fleetAssets", event.target.value)
                    }
                  />
                </label>
                <div className="field">
                  <span>Operating cities *</span>
                  <div className="prototype-chips">
                    {Array.from(new Set([...operatingCityOptions, ...supplemental.operatingCities.split(",").map((city) => city.trim()).filter(Boolean)])).map((city) => (
                      <button
                        type="button"
                        key={city}
                        className={supplemental.operatingCities.split(",").map((item) => item.trim()).includes(city) ? "active" : ""}
                        onClick={() => updateSupplemental("operatingCities", toggleCsvValue(supplemental.operatingCities, city))}
                      >
                        {city}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => {
                        const city = cityDraft.trim();
                        if (!city) return;
                        updateSupplemental("operatingCities", toggleCsvValue(supplemental.operatingCities, city));
                        setCityDraft("");
                      }}
                    >
                      + Add city
                    </button>
                    <input aria-label="Add operating city" value={cityDraft} onChange={(event) => setCityDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); const city = cityDraft.trim(); if (city) { updateSupplemental("operatingCities", toggleCsvValue(supplemental.operatingCities, city)); setCityDraft(""); } } }} placeholder="Type another city" />
                  </div>
                </div>
                <div className="field">
                  <span>Categories *</span>
                  <div className="prototype-chips">
                    {categoryOptions.map((category) => (
                      <button
                        type="button"
                        key={category}
                        className={supplemental.categories.split(",").map((item) => item.trim()).includes(category) ? "active" : ""}
                        onClick={() => updateSupplemental("categories", toggleCsvValue(supplemental.categories, category))}
                      >
                        {category}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="field">
                  <span>Already listed on</span>
                  <div className="prototype-chips">
                    {listingOptions.map((listing) => (
                      <button
                        type="button"
                        key={listing}
                        className={supplemental.listedOn.includes(listing) ? "active" : ""}
                        onClick={() => updateSupplemental("listedOn", supplemental.listedOn.includes(listing) ? supplemental.listedOn.filter((item) => item !== listing) : [...supplemental.listedOn, listing])}
                      >
                        {listing}
                      </button>
                    ))}
                  </div>
                </div>
                <label className="field">
                  <span>How do they take bookings today?</span>
                  <select
                    value={supplemental.bookingMethod}
                    onChange={(event) =>
                      updateSupplemental("bookingMethod", event.target.value)
                    }
                  >
                    <option>Phone / WhatsApp, manual register</option>
                    <option>Excel / Google Sheet</option>
                    <option>Own booking system with API</option>
                    <option>Channel manager (Bokun, Rezdy, FareHarbor)</option>
                  </select>
                  <small>
                    Using a booking system or channel manager? We can connect to
                    it later.
                  </small>
                </label>
              </div>
            </section>
          )}
          {step === 2 && (
            <section className="onboarding-contacts-section">
              <header>
                <h3>Contacts &amp; escalation matrix</h3>
                <p>
                  Who we call for bookings, payments and on-ground issues. Every
                  role needs a reachable mobile number.
                </p>
              </header>
              <div className="onboarding-contact-section">
                <div className="onboarding-section-heading">
                  <h4>Key contacts</h4>
                </div>
                <div className="onboarding-table-wrap">
                  <table className="onboarding-table onboarding-contacts-table">
                    <thead>
                      <tr>
                        <th>Role</th>
                        <th>Name</th>
                        <th>Designation</th>
                        <th>Mobile</th>
                        <th>Email</th>
                        <th>Hours</th>
                      </tr>
                    </thead>
                    <tbody>
                      {supplemental.contacts.map((contact, index) => (
                        <tr key={contact.role}>
                          <td><b>{contact.role}</b></td>
                          <td>
                            <input
                              aria-label={`${contact.role} name`}
                              value={contact.name}
                              onChange={(event) => updateContact(index, "name", event.target.value)}
                            />
                          </td>
                          <td>
                            <input
                              aria-label={`${contact.role} designation`}
                              value={contact.designation}
                              onChange={(event) => updateContact(index, "designation", event.target.value)}
                            />
                          </td>
                          <td>
                            <input
                              aria-label={`${contact.role} mobile`}
                              value={contact.mobile}
                              onChange={(event) => updateContact(index, "mobile", event.target.value)}
                            />
                          </td>
                          <td>
                            <input
                              aria-label={`${contact.role} email`}
                              value={contact.email}
                              onChange={(event) => updateContact(index, "email", event.target.value)}
                            />
                          </td>
                          <td>
                            <input
                              aria-label={`${contact.role} hours`}
                              value={contact.hours}
                              onChange={(event) => updateContact(index, "hours", event.target.value)}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="onboarding-contact-section">
                <div className="onboarding-section-heading">
                  <div>
                    <h4>Escalation matrix</h4>
                    <p>Our support team follows this order when a customer issue isn&apos;t resolved.</p>
                  </div>
                  <button
                    type="button"
                    className="btn small"
                    onClick={() =>
                      updateSupplemental("escalationLevels", [
                        ...supplemental.escalationLevels,
                        {
                          code: `L${supplemental.escalationLevels.length + 1}`,
                          trigger: "Describe when to escalate",
                          contactRole: "Reservations & operations",
                          response: "30 min",
                        },
                      ])
                    }
                  >
                    + Add level
                  </button>
                </div>
                <div className="onboarding-table-wrap">
                  <table className="onboarding-table onboarding-escalation-table">
                    <thead>
                      <tr>
                        <th>Level</th>
                        <th>When to escalate</th>
                        <th>Contact</th>
                        <th>Mobile</th>
                        <th className="align-right">Must respond in</th>
                      </tr>
                    </thead>
                    <tbody>
                      {supplemental.escalationLevels.map((level) => {
                        const contact = supplemental.contacts.find(
                          (item) => item.role === level.contactRole,
                        );
                        return (
                          <tr key={level.code}>
                            <td><span className={`onboarding-level-tag ${level.code === "L3" ? "danger" : level.code === "L2" ? "warning" : "info"}`}>{level.code}</span></td>
                            <td>{level.trigger}</td>
                            <td>{contact?.name || level.contactRole}</td>
                            <td className="numeric">{contact?.mobile || "Mobile required"}</td>
                            <td className="align-right">{level.response}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
              {(!application.phoneVerifiedAt || application.mobileVerificationEnabled !== true) && (
                <div className="onboarding-contact-verification">
                  <label className="field">
                    <span>Primary contact number *</span>
                    <div className="phone-input">
                      <select aria-label="Country code" value={form.countryCode} onChange={(event) => update("countryCode", event.target.value)}>
                        {countryCodes.map((country) => <option key={country.value} value={country.value}>{country.label}</option>)}
                      </select>
                      <input value={form.contactNumber} onChange={(event) => update("contactNumber", event.target.value.replace(/\D/g, ""))} placeholder="9876543210" />
                    </div>
                    <small>{application.mobileVerificationEnabled === true ? "We will verify this number with a one-time password." : "Email verification is complete. Mobile OTP is currently disabled by platform settings."}</small>
                  </label>
                  {application.mobileVerificationEnabled === true && !application.phoneVerifiedAt && <div className="otp-row">
                    <button className="btn" disabled={busy || !validPhone(form.countryCode + form.contactNumber)} onClick={() => void requestOtp()}>{otpRequested ? "Resend OTP" : "Send OTP"}</button>
                    {otpRequested && <>
                      <input aria-label="Six digit OTP" className="otp-input" inputMode="numeric" maxLength={6} value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, ""))} placeholder="••••••" />
                      <button className="btn primary" disabled={busy || otp.length !== 6} onClick={() => void verifyOtp()}>Verify</button>
                    </>}
                  </div>}
                </div>
              )}
              <div className="onboarding-form-grid two">
                <div className="field">
                  <span>New booking alerts go to</span>
                  <div className="checkbox-chips">
                    {["Email", "WhatsApp", "SMS", "Vendor login"].map(
                      (channel) => (
                        <label key={channel}>
                          <input
                            type="checkbox"
                            checked={supplemental.bookingAlerts.includes(
                              channel,
                            )}
                            onChange={(event) =>
                              updateSupplemental(
                                "bookingAlerts",
                                event.target.checked
                                  ? [...supplemental.bookingAlerts, channel]
                                  : supplemental.bookingAlerts.filter(
                                      (item) => item !== channel,
                                    ),
                              )
                            }
                          />{" "}
                          {channel}
                        </label>
                      ),
                    )}
                  </div>
                </div>
                <label className="field">
                  <span>Customer helpline (printed on voucher)</span>
                  <input
                    value={supplemental.customerHelpline}
                    onChange={(event) =>
                      updateSupplemental("customerHelpline", event.target.value)
                    }
                    placeholder="+91 98220 41230"
                  />
                  <small>Must be answered 07:00–21:00 on activity days.</small>
                </label>
              </div>
            </section>
          )}
          {step === 3 && (
            <section className="onboarding-kyc-section">
              <header>
                <h3>KYC documents</h3>
                <p>
                  PAN, GSTIN and bank are verified automatically against
                  government and bank records. Other documents are checked by
                  the onboarding team.
                </p>
              </header>
              <div className="onboarding-table-wrap">
                <table className="onboarding-table onboarding-kyc-table">
                  <thead>
                    <tr>
                      <th>Document</th>
                      <th>Number / detail</th>
                      <th>Status</th>
                      <th>Check</th>
                      <th className="align-right" />
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>
                        <b>PAN (entity)</b>
                      </td>
                      <td>
                        <input
                          aria-label="PAN number *"
                          value={form.panNumber}
                          onChange={(event) =>
                            update(
                              "panNumber",
                              event.target.value.toUpperCase(),
                            )
                          }
                          maxLength={10}
                        />
                      </td>
                      <td>
                        <Badge value={documentStatusLabel("PAN")} />
                      </td>
                      <td>
                        <span className="muted">
                          {/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(form.panNumber)
                            ? "Format valid"
                            : "Required"}
                        </span>
                      </td>
                      <td className="align-right">
                        <KycDocumentAction
                          label="PAN document"
                          document={documentFor(application, "PAN")}
                          disabled={busy}
                          onUpload={(file) => void upload("pan", file)}
                          onView={() => viewDocument(documentFor(application, "PAN"))}
                          onDownload={() => downloadDocument(documentFor(application, "PAN"))}
                        />
                      </td>
                    </tr>
                    <tr>
                      <td>
                        <b>GSTIN</b>
                      </td>
                      <td>
                        {form.gstStatus === "REGISTERED" ? (
                          <input
                            aria-label="GSTIN *"
                            value={form.gstin}
                            onChange={(event) =>
                              update("gstin", event.target.value.toUpperCase())
                            }
                            maxLength={15}
                          />
                        ) : (
                          "Not registered / not applicable"
                        )}
                      </td>
                      <td>
                        <Badge
                          value={
                            form.gstStatus ? documentStatusLabel("GSTIN") : "Not selected"
                          }
                        />
                      </td>
                      <td>
                        <span className="muted">
                          {form.gstStatus === "REGISTERED"
                            ? "Active taxpayer details required"
                            : "Declaration required"}
                        </span>
                      </td>
                      <td className="align-right">
                        {form.gstStatus === "REGISTERED" && (
                          <KycDocumentAction
                            label="GST certificate"
                            document={documentFor(application, "GSTIN")}
                            disabled={busy}
                            onUpload={(file) => void upload("gstin", file)}
                            onView={() => viewDocument(documentFor(application, "GSTIN"))}
                            onDownload={() => downloadDocument(documentFor(application, "GSTIN"))}
                          />
                        )}
                      </td>
                    </tr>
                    <tr>
                      <td><b>LLP agreement + LLPIN certificate</b></td>
                      <td className="mono">
                        {["LLP_AGREEMENT", "LLPIN_CERTIFICATE"].map((type) => documentFor(application, type)?.latestVersion?.fileAsset.originalName).filter(Boolean).join(" · ") || (form.supplementalData.entityType === "LLP" ? "Required for LLP" : "Not applicable")}
                      </td>
                      <td><Badge value={form.supplementalData.entityType === "LLP" ? (documentFor(application, "LLP_AGREEMENT")?.latestVersion && documentFor(application, "LLPIN_CERTIFICATE")?.latestVersion ? "Uploaded" : "Pending") : "Not needed"} /></td>
                      <td><span className="muted">Checked by onboarding team</span></td>
                      <td className="align-right kyc-document-actions">
                        <KycDocumentAction label="LLP agreement" document={documentFor(application, "LLP_AGREEMENT")} disabled={busy} onUpload={(file) => void upload("llpAgreement", file)} onView={() => viewDocument(documentFor(application, "LLP_AGREEMENT"))} onDownload={() => downloadDocument(documentFor(application, "LLP_AGREEMENT"))} />
                        <KycDocumentAction label="LLPIN certificate" document={documentFor(application, "LLPIN_CERTIFICATE")} disabled={busy} onUpload={(file) => void upload("llpinCertificate", file)} onView={() => viewDocument(documentFor(application, "LLPIN_CERTIFICATE"))} onDownload={() => downloadDocument(documentFor(application, "LLPIN_CERTIFICATE"))} />
                      </td>
                    </tr>
                    <tr>
                      <td><b>Authorised signatory ID</b></td>
                      <td className="mono">{documentFor(application, "AUTH_SIGNATORY_ID")?.latestVersion?.fileAsset.originalName || form.authorizedRepresentative || "Not provided"}</td>
                      <td><Badge value={documentStatusLabel("AUTH_SIGNATORY_ID")} /></td>
                      <td><span className="muted">Signatory identity required</span></td>
                      <td className="align-right">
                        <KycDocumentAction label="authorised signatory ID" document={documentFor(application, "AUTH_SIGNATORY_ID")} disabled={busy} onUpload={(file) => void upload("signatoryId", file)} onView={() => viewDocument(documentFor(application, "AUTH_SIGNATORY_ID"))} onDownload={() => downloadDocument(documentFor(application, "AUTH_SIGNATORY_ID"))} />
                      </td>
                    </tr>
                    <tr>
                      <td><b>Authorisation letter for signatory</b></td>
                      <td className="mono">{documentFor(application, "AUTHORIZATION_LETTER")?.latestVersion?.fileAsset.originalName || "Not uploaded"}</td>
                      <td><Badge value={documentStatusLabel("AUTHORIZATION_LETTER")} /></td>
                      <td><span className="muted">Partner resolution naming who signs</span></td>
                      <td className="align-right">
                        <KycDocumentAction label="authorisation letter" document={documentFor(application, "AUTHORIZATION_LETTER")} disabled={busy} onUpload={(file) => void upload("authorizationLetter", file)} onView={() => viewDocument(documentFor(application, "AUTHORIZATION_LETTER"))} onDownload={() => downloadDocument(documentFor(application, "AUTHORIZATION_LETTER"))} />
                      </td>
                    </tr>
                    <tr>
                      <td><b>Address proof</b></td>
                      <td className="mono">{documentFor(application, "ADDRESS_PROOF")?.latestVersion?.fileAsset.originalName || form.addressLine || "Not provided"}</td>
                      <td><Badge value={documentStatusLabel("ADDRESS_PROOF")} /></td>
                      <td><span className="muted">{form.addressLine ? "Matches registered address" : "Registered address required"}</span></td>
                      <td className="align-right">
                        <KycDocumentAction label="address proof" document={documentFor(application, "ADDRESS_PROOF")} disabled={busy} onUpload={(file) => void upload("addressProof", file)} onView={() => viewDocument(documentFor(application, "ADDRESS_PROOF"))} onDownload={() => downloadDocument(documentFor(application, "ADDRESS_PROOF"))} />
                      </td>
                    </tr>
                    <tr>
                      <td><b>Shop &amp; establishment / trade licence</b></td>
                      <td className="mono">{form.supplementalData.tradeLicenseNeededFor || "Not specified"}</td>
                      <td><Badge value={documentStatusLabel("TRADE_LICENSE")} /></td>
                      <td><span className="muted">In review</span></td>
                      <td className="align-right">
                        <KycDocumentAction
                          label="trade licence"
                          document={documentFor(application, "TRADE_LICENSE")}
                          disabled={busy}
                          onUpload={(file) => void upload("tradeLicense", file)}
                          onView={() => viewDocument(documentFor(application, "TRADE_LICENSE"))}
                          onDownload={() => downloadDocument(documentFor(application, "TRADE_LICENSE"))}
                        />
                      </td>
                    </tr>
                    <tr>
                      <td><b>Udyam (MSME) certificate</b></td>
                      <td className="mono">{documentFor(application, "UDYAM_CERTIFICATE")?.latestVersion?.fileAsset.originalName || "Not captured"}</td>
                      <td><Badge value={documentStatusLabel("UDYAM_CERTIFICATE")} /></td>
                      <td><span className="muted">Optional; MSME payment timelines apply</span></td>
                      <td className="align-right">
                        <KycDocumentAction label="Udyam certificate" document={documentFor(application, "UDYAM_CERTIFICATE")} disabled={busy} onUpload={(file) => void upload("udyamCertificate", file)} onView={() => viewDocument(documentFor(application, "UDYAM_CERTIFICATE"))} onDownload={() => downloadDocument(documentFor(application, "UDYAM_CERTIFICATE"))} />
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <details className="onboarding-kyc-settings">
                <summary>GST registration and declaration</summary>
                <div className="onboarding-kyc-controls choice-grid">
                  <button
                    type="button"
                    className={form.gstStatus === "REGISTERED" ? "selected" : ""}
                    onClick={() => update("gstStatus", "REGISTERED")}
                  >
                    GST registered<small>Provide GSTIN and certificate.</small>
                  </button>
                  <button
                    type="button"
                    className={
                      form.gstStatus === "NOT_REGISTERED" ? "selected" : ""
                    }
                    onClick={() => update("gstStatus", "NOT_REGISTERED")}
                  >
                    Not registered / not applicable
                    <small>Voya may request clarification during review.</small>
                  </button>
                </div>
              {form.gstStatus === "REGISTERED" && (
                <>
                  <label className="field">
                    <span>GSTIN *</span>
                    <input
                      value={form.gstin}
                      onChange={(event) =>
                        update("gstin", event.target.value.toUpperCase())
                      }
                      maxLength={15}
                    />
                  </label>
                  <UploadCard
                    label="GST certificate *"
                    document={documentFor(application, "GSTIN")}
                    disabled={busy}
                    onUpload={(file) => void upload("gstin", file)}
                  />
                </>
              )}
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={form.gstDeclarationAccepted}
                  onChange={(event) =>
                    update("gstDeclarationAccepted", event.target.checked)
                  }
                />{" "}
                I confirm the KYC and tax details provided are accurate.
              </label>
              </details>
              <div className="onboarding-note">
                The required documents depend on entity type. For an LLP: LLP
                agreement, LLPIN certificate and an authorisation letter for the
                signatory. A Pvt Ltd needs a COI, MoA and board resolution. A
                proprietor needs PAN and Aadhaar only.
              </div>
            </section>
          )}
          {step === 4 && (
            <section>
              <header>
                <h3>4 · Licences, permits &amp; insurance</h3>
                <p>
                  Requirements depend on the categories selected in Business
                  profile. Expiry dates trigger reminders before a licence
                  lapses.
                </p>
              </header>
              <div className="onboarding-table-wrap">
                <table className="onboarding-table">
                  <thead>
                    <tr>
                      <th>Licence</th>
                      <th>Needed for</th>
                      <th>Valid till</th>
                      <th>Status</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td><b>Trade licence / activity permit</b></td>
                      <td>
                        <input
                          aria-label="Trade licence needed for"
                          value={supplemental.tradeLicenseNeededFor}
                          onChange={(event) => updateSupplemental("tradeLicenseNeededFor", event.target.value)}
                          placeholder="Activity, city or category"
                        />
                      </td>
                      <td>
                        <SharedDatePicker
                          value={supplemental.tradeLicenseValidTill}
                          onChange={(value) => updateSupplemental("tradeLicenseValidTill", value)}
                          placeholder="Valid till"
                          ariaLabel="Trade licence valid till"
                        />
                      </td>
                      <td><Badge value={docStatus("TRADE_LICENSE")} /></td>
                      <td className="align-right">
                        <KycDocumentAction
                          label="trade licence or permit"
                          document={documentFor(application, "TRADE_LICENSE")}
                          disabled={busy}
                          onUpload={(file) => void upload("tradeLicense", file)}
                          onView={() => viewDocument(documentFor(application, "TRADE_LICENSE"))}
                          onDownload={() => downloadDocument(documentFor(application, "TRADE_LICENSE"))}
                        />
                      </td>
                    </tr>
                    {displayLicenceRows.map((licence) => (
                      <tr key={licence.key}>
                        <td><b>{licence.label}</b></td>
                        <td>
                          <input
                            aria-label={`${licence.label} needed for`}
                            value={licence.neededFor}
                            onChange={(event) => updateSupplemental("licences", licenceRows.map((row) => row.key === licence.key ? { ...row, neededFor: event.target.value } : row))}
                          />
                        </td>
                        <td>
                          <SharedDatePicker
                            value={licence.validTill}
                            onChange={(value) => updateSupplemental("licences", licenceRows.map((row) => row.key === licence.key ? { ...row, validTill: value } : row))}
                            placeholder="Valid till"
                            ariaLabel={`${licence.label} valid till`}
                          />
                        </td>
                        <td><Badge value={documentStatusLabel(licence.documentType)} /></td>
                        <td className="align-right">
                          <KycDocumentAction
                            label={licence.label}
                            document={documentFor(application, licence.documentType)}
                            disabled={busy}
                            onUpload={(file) => void upload(licence.uploadKey, file)}
                            onView={() => viewDocument(documentFor(application, licence.documentType))}
                            onDownload={() => downloadDocument(documentFor(application, licence.documentType))}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="onboarding-form-grid two">
                <label className="field">
                  <span>Public liability cover (₹)</span>
                  <input
                    value={supplemental.insuranceAmount}
                    onChange={(event) =>
                      updateSupplemental(
                        "insuranceAmount",
                        event.target.value.replace(/\D/g, ""),
                      )
                    }
                    placeholder="For example 2500000"
                  />
                  <small>
                    Recommended minimum ₹25 lakh; ₹1 crore for adventure and
                    water sports.
                  </small>
                </label>
                <label className="field">
                  <span>Insurer &amp; policy number</span>
                  <input
                    value={supplemental.insurerPolicy}
                    onChange={(event) =>
                      updateSupplemental("insurerPolicy", event.target.value)
                    }
                  />
                </label>
              </div>
              <div className="onboarding-note">
                If a permit or insurance policy is not applicable, explain that
                during review. Voya may request evidence before the listing can
                go live.
              </div>
            </section>
          )}
          {step === 5 && (
            <section>
              <header>
                <h3>Bank &amp; tax</h3>
                <p>Where payouts go and how tax is deducted.</p>
              </header>
              <div className="onboarding-form-grid two">
                <label className="field" htmlFor="vendor-bank-account-holder">
                  <span>Account holder name *</span>
                  <input
                    id="vendor-bank-account-holder"
                    value={form.accountHolderName}
                    onChange={(event) =>
                      update("accountHolderName", event.target.value)
                    }
                  />
                </label>
                <label className="field" htmlFor="vendor-bank-account-type">
                  <span>Account type *</span>
                  <select
                    id="vendor-bank-account-type"
                    value={form.accountType}
                    onChange={(event) =>
                      update("accountType", event.target.value)
                    }
                  >
                    <option value="">Select account type</option>
                    <option value="CURRENT">Current</option>
                    <option value="SAVINGS">Savings</option>
                  </select>
                </label>
                <label className="field" htmlFor="vendor-bank-account-number">
                  <span>Account number *</span>
                  <input
                    id="vendor-bank-account-number"
                    type="password"
                    value={form.bankAccountNumber}
                    onChange={(event) =>
                      update(
                        "bankAccountNumber",
                        event.target.value.replace(/\D/g, ""),
                      )
                    }
                    placeholder={application.bankAccountMasked || "9–18 digits"}
                  />
                </label>
                <label className="field" htmlFor="vendor-bank-ifsc">
                  <span>IFSC *</span>
                  <input
                    id="vendor-bank-ifsc"
                    value={form.ifscCode}
                    onChange={(event) =>
                      update("ifscCode", event.target.value.toUpperCase())
                    }
                    onBlur={() => void lookupIfsc()}
                    maxLength={11}
                  />
                  <small>
                    {ifscLookupLabel || "Bank and branch fetched from IFSC"}
                  </small>
                </label>
              </div>
              <UploadCard
                label="Cancelled cheque / bank proof *"
                document={documentFor(application, "BANK_PROOF")}
                disabled={busy}
                onUpload={(file) => void upload("bankProof", file)}
              />
              <div className="onboarding-tax-card">
                <div className="row-between">
                  <b>Penny-drop verification</b>
                  <Badge
                    value={
                      application.bankAccountMasked ? "Verified" : "Pending"
                    }
                  />
                </div>
                <p>
                  {application.bankAccountMasked
                    ? `₹1 verification completed. Name returned by bank: ${form.accountHolderName || "—"} · 100% match with PAN name. Cancelled cheque uploaded.`
                    : "A ₹1 verification is run after the bank proof is reviewed. The returned account name must match the PAN name."}
                </p>
              </div>
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={form.bankOwnershipConfirmed}
                  onChange={(event) =>
                    update("bankOwnershipConfirmed", event.target.checked)
                  }
                />{" "}
                I confirm this bank account belongs to the business named above.
              </label>
              <div className="onboarding-form-grid two">
                <div className="field">
                  <span>GST registration</span>
                  <div className="segmented-options">
                    {[
                      ["REGISTERED", "Registered (regular)"],
                      ["COMPOSITION", "Composition"],
                      ["NOT_REGISTERED", "Not registered"],
                    ].map(([value, label]) => (
                      <button
                        type="button"
                        key={value}
                        className={form.gstStatus === value ? "selected" : ""}
                        onClick={() => update("gstStatus", value)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <small>
                    {form.gstStatus === "NOT_REGISTERED"
                      ? "Not registered needs a signed GST non-registration declaration."
                      : form.gstStatus === "REGISTERED"
                        ? `Registered · ${form.gstin || "GSTIN pending"}`
                        : "Select a GST status in KYC documents."}
                  </small>
                </div>
                <label className="field">
                  <span>Lower TDS certificate</span>
                  <select
                    value={supplemental.tdsStatus}
                    onChange={(event) =>
                      updateSupplemental("tdsStatus", event.target.value)
                    }
                  >
                    <option>Not applicable</option>
                    <option>Upload certificate (section 197)</option>
                  </select>
                </label>
              </div>
              <div className="onboarding-note info">
                Deductions on each payout: TDS under section 194-O and GST TCS
                under section 52, both at the current notified rates.
                Certificates are in Reports every quarter.
              </div>
            </section>
          )}
          {step === 6 && (
            <section>
              <header>
                <div className="commercial-heading">
                  <div>
                    <h3>Your commercial terms</h3>
                    <p>
                      Offered by our partnerships team after reviewing your
                      profile. You accept them by signing the agreement.
                    </p>
                  </div>
                  <span className="commercial-readonly-badge">🔒 Read-only</span>
                </div>
              </header>
              <div className="commercial-terms-card">
                <div>
                  <small>Agreement</small>
                  <b>
                    {agreementNameForSupplierType(supplemental.supplierType)}
                  </b>
                </div>
                <div>
                  <small>Model</small>
                  <b>
                    {supplemental.commercialModel || "Commission on sell price"}
                  </b>
                </div>
                <div>
                  <small>Commission</small>
                  <b>
                    {supplemental.commission || "To be confirmed"}
                  </b>
                  {supplemental.commission && (
                    <span className="commercial-muted-value">+ GST</span>
                  )}
                </div>
                <div>
                  <small>Payouts</small>
                  <b>
                    Weekly
                  </b>
                  <span className="commercial-muted-value">
                    {(supplemental.settlementCycle ||
                      "Weekly T+7 after activity date").replace(/^Weekly\s*/, "")}
                  </span>
                </div>
                <div>
                  <small>Contract</small>
                  <b>
                    12 months
                  </b>
                  <span className="commercial-muted-value">
                    {(supplemental.contractTerm ||
                      "12 months auto-renews · 90 days' notice").replace(/^12 months\s*/, "")}
                  </span>
                </div>
                <div>
                  <small>Account manager</small>
                  <b>{supplemental.accountManager || "Not assigned yet"}</b>
                </div>
              </div>
              <div className="commercial-agreement">
                <span className="commercial-agreement-title">YOU AGREE TO</span>
                <ul>
                  <li>
                    <span className="commercial-check-icon">✓</span>
                    <span>Rate parity: prices here are no higher than on your website or other platforms</span>
                  </li>
                  <li>
                    <span className="commercial-check-icon">✓</span>
                    <span>A cancellation policy no stricter than on other channels</span>
                  </li>
                  <li>
                    <span className="commercial-check-icon">✓</span>
                    <span>Honour every confirmed booking, and keep insurance valid</span>
                  </li>
                </ul>
              </div>
              <div className="commercial-contact">
                <button
                  type="button"
                  className="btn"
                  onClick={() => setNotice("Your Voya partnerships manager will contact you about these terms.")}
                >
                  Message account manager
                </button>
                <span>
                  Questions about these terms? Ask before you sign.
                </span>
              </div>
            </section>
          )}
          {step === 7 && (
            <section>
              <header>
                <div className="agreement-prototype-heading">
                  <div>
                    <h3>Agreement &amp; e-sign</h3>
                    <p>
                      Annexure 1 is filled from the profile and commission from
                      Commercials, so you only review and sign.
                    </p>
                  </div>
                  <div className="agreement-actions">
                    <button
                      type="button"
                      className="btn small"
                      disabled={busy}
                      onClick={() => void downloadAgreement()}
                    >
                      Download PDF
                    </button>
                    <button
                      type="button"
                      className="btn small accent"
                      disabled={busy}
                      onClick={() => void reviewAgreement()}
                    >
                      Review &amp; e-sign
                    </button>
                  </div>
                </div>
              </header>
              <div className="agreement-prototype-grid">
                <div>
                  <span className="agreement-prototype-label">Annexure 1 · auto-filled</span>
                  <div className="agreement-annexure-table">
                    <table>
                      <tbody>
                        <tr><td>Effective date</td><td>On signature</td></tr>
                        <tr><td>Business name</td><td>{form.businessDisplayName || "Not provided"}</td></tr>
                        <tr><td>Legal entity</td><td>{form.legalBusinessName || "Not provided"}</td></tr>
                        <tr><td>Address</td><td>{[form.addressLine, form.city, form.state, form.pinCode].filter(Boolean).join(", ") || "Not provided"}</td></tr>
                        <tr><td>Contact person</td><td>{[form.firstName, form.lastName].filter(Boolean).join(" ") || "Not provided"}</td></tr>
                        <tr><td>Phone / email</td><td>{[normalizedPhone(form.countryCode + form.contactNumber), application.contactEmail].filter(Boolean).join(" · ") || "Not provided"}</td></tr>
                        <tr><td>Commission (cl. 2.5)</td><td><b>{supplemental.commission || "To be confirmed"}</b></td></tr>
                      </tbody>
                    </table>
                  </div>
                </div>
                <div>
                  <span className="agreement-prototype-label">Signing status</span>
                  <div className="agreement-status-list agreement-prototype-status">
                    <div><span className="agreement-status-icon ok">✓</span><div><b>Sent for signature</b><small>{agreementTimestamp(agreementSentAt)} · to {[form.firstName, form.lastName].filter(Boolean).join(" ") || "authorized representative"}</small></div></div>
                    <div><span className={"agreement-status-icon " + (application.agreementOpenedAt ? "ok" : "pending")}>{application.agreementOpenedAt ? "✓" : ""}</span><div><b>Opened by you</b><small>{application.agreementOpenedAt ? agreementTimestamp(application.agreementOpenedAt) : "Open this agreement to begin review"}</small></div></div>
                    <div><span className={"agreement-status-icon " + (agreementSigned ? "ok" : "warn")}>{agreementSigned ? "✓" : "…"}</span><div><b>Your signature</b><small>{agreementSigned ? "Saved and accepted" : (supplemental.signingMethod || "Aadhaar eSign (OTP)") + " · reminder goes out automatically after 48h"}</small></div></div>
                    <div><span className={"agreement-status-icon " + (application.agreementCountersignedAt ? "ok" : "pending")}>{application.agreementCountersignedAt ? "✓" : ""}</span><div><b>Countersigned by us</b><small>{application.agreementCountersignedAt ? agreementTimestamp(application.agreementCountersignedAt) : "Within 1 working day of your signature"}</small></div></div>
                  </div>
                  <label className="field agreement-signing-method">
                    <span>Signing method</span>
                    <select value={supplemental.signingMethod} onChange={(event) => updateSupplemental("signingMethod", event.target.value)}>
                      <option>Aadhaar eSign (OTP)</option>
                      <option>DSC (digital signature certificate)</option>
                      <option>Wet signature, scanned upload</option>
                    </select>
                  </label>
                </div>
              </div>
              <div className="agreement-signature-details">
                <h4>VOYA Partner Agreement · Draft</h4>
                <p>
                  By partnering with Voya, the supplier agrees to provide
                  accurate activity, availability, pricing and fulfilment
                  information and to honour confirmed customer reservations
                  according to the published terms.
                </p>
                <p>
                  Voya may review submitted information, request corrections,
                  and suspend access when documents or operating information are
                  incomplete. This draft wording is not a legally approved
                  digital-signature agreement.
                </p>
              </div>
              <div className="onboarding-form-grid two">
                <label className="field">
                  <span>Authorized business name *</span>
                  <input
                    value={form.authorizedBusinessName}
                    onChange={(event) =>
                      update("authorizedBusinessName", event.target.value)
                    }
                  />
                </label>
                <label className="field">
                  <span>Authorized representative *</span>
                  <input
                    value={form.authorizedRepresentative}
                    onChange={(event) =>
                      update("authorizedRepresentative", event.target.value)
                    }
                  />
                </label>
              </div>
              <div className="signature-block" ref={agreementSignatureRef}>
                <div className="signature-head">
                  <b>Signature *</b>
                  <div className="signature-actions">
                    <button
                      type="button"
                      className="btn small"
                      onClick={() => signatureInputRef.current?.click()}
                    >
                      Upload signature image
                    </button>
                    <input
                      ref={signatureInputRef}
                      type="file"
                      accept="image/png,image/jpeg"
                      hidden
                      onChange={(event) => {
                        uploadSignature(event.target.files?.[0]);
                        event.currentTarget.value = "";
                      }}
                    />
                    <button
                      type="button"
                      className="link-button"
                      onClick={clearSignature}
                    >
                      Clear signature
                    </button>
                  </div>
                </div>
                <canvas
                  ref={canvasRef}
                  width={640}
                  height={180}
                  className="signature-canvas"
                  onPointerDown={(event) => {
                    drawingRef.current = true;
                    const point = canvasPoint(event);
                    const ctx = canvasRef.current!.getContext("2d")!;
                    ctx.beginPath();
                    ctx.moveTo(point.x, point.y);
                    canvasRef.current!.setPointerCapture(event.pointerId);
                  }}
                  onPointerMove={draw}
                  onPointerUp={() => {
                    drawingRef.current = false;
                  }}
                  onPointerLeave={() => {
                    drawingRef.current = false;
                  }}
                />
                <small>
                  {application.hasSignature
                    ? "A signature is already saved. Draw again to replace it."
                    : "Draw your signature using a mouse, trackpad or touch screen."}
                </small>
              </div>
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={form.agreementAccepted}
                  onChange={(event) =>
                    update("agreementAccepted", event.target.checked)
                  }
                />{" "}
                I have read and accept the draft partner agreement.
              </label>
            </section>
          )}
          {step === 8 && (
            <section>
              <header>
                <h3>Review &amp; submit</h3>
                <p>
                  We verify within 2 working days. Fix the items below to avoid
                  delays.
                </p>
              </header>
              <div className="review-checklist" role="list">
                {reviewItems.map((item) => (
                  <div className={`review-item ${item.status}`} role="listitem" key={item.title}>
                    <span className="check-icon" aria-hidden="true">{item.status === "ok" ? "✓" : "!"}</span>
                    <div className="review-item-copy">
                      <b>{item.title}</b>
                      <span>{item.detail}</span>
                    </div>
                    {item.fixStep && item.status !== "ok" && (
                      <button type="button" className="btn small" onClick={() => { setError(""); setStep(item.fixStep!); }}>
                        Fix
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <div className="onboarding-note">
                After submission, the application becomes read-only while the
                Voya team reviews it. Prices, rate plans, availability and
                fulfilment are completed in the main product wizard after
                approval.
              </div>
              <div className="review-guidance-grid">
                <div className="onboarding-tax-card">
                  <b>After approval</b>
                  <ul>
                    <li>Your products can go live after content QC.</li>
                    <li>Intro call with your account manager.</li>
                    <li>Payouts start from the next weekly cycle.</li>
                    <li>Listings show “Operated by” your business name.</li>
                  </ul>
                </div>
                <div className="onboarding-tax-card">
                  <b>Ongoing compliance</b>
                  <ul>
                    <li>
                      Expiry reminders 30, 15 and 3 days before a licence
                      lapses.
                    </li>
                    <li>
                      Products may auto-pause if insurance or a mandatory
                      licence expires.
                    </li>
                    <li>Annual re-KYC and bank re-verification.</li>
                    <li>GSTIN status re-checked monthly.</li>
                  </ul>
                </div>
              </div>
            </section>
          )}
          <footer className="onboarding-footer">
            {error && (
              <div className="onboarding-footer-error" role="alert">
                {error}
              </div>
            )}
            <button
              type="button"
              className="btn"
              onClick={() => setStep((value) => Math.max(1, value - 1))}
              disabled={busy || step === 1}
            >
              ← Back
            </button>
            <div>
              <button
                type="button"
                className="btn"
                onClick={() => void save(payload(step))}
                disabled={busy}
              >
                {step === 6 ? "Save" : "Save draft"}
              </button>
              <button
                type="button"
                className="btn accent"
                onClick={() => void next()}
                disabled={busy}
              >
                {busy
                  ? "Saving…"
                  : step === 8
                    ? "Submit for verification"
                    : "Next →"}
              </button>
            </div>
          </footer>
        </main>
      </div>
    </div>
  );
}
