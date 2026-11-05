import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
} from "react";
import { api, type ProductVariant } from "../../api";
import { Field } from "../Ui";
import { SharedDatePicker } from "../SharedDatePicker";
import type { WizardStepProps } from "./types";

type PricingUnit = "PER_PERSON" | "PER_BOOKING" | "PER_UNIT" | "GROUP";
type DayPreset = "ALL_DAYS" | "WEEKDAYS" | "WEEKENDS" | "CUSTOM";
type SlotScope = "ALL" | "SELECTED";
type EditorSection = "pricing" | "availability" | "policies";
type CancellationRule = {
  minDaysBefore: string;
  maxDaysBefore: string;
  chargeValue: string;
  chargeType: string;
};
type PriceRow = {
  variantId: string;
  pricingUnit: PricingUnit;
  currency: string;
  adult: string;
  child: string;
  senior: string;
  mrp: string;
  base: string;
  maxPassengers: string;
  indian: string;
  foreign: string;
  indianChild: string;
  foreignChild: string;
  indianSenior: string;
  foreignSenior: string;
  minPax: string;
  maxPax: string;
  cutOffMinutes: string;
  expectedVersion?: number;
};
type SlotRow = { slotCode: string; startTime: string; endTime: string };
type Preview = {
  valid: boolean;
  errors: string[];
  conflicts?: Array<{ type?: string; message: string }>;
  summary?: any;
  inventoryWarnings?: any[];
  previousRates?: any[];
  proposedRates?: any[];
  unchangedFields?: string[];
};
type VisitorPricingSettings = {
  showEligibilityBasis: boolean;
  showVerificationRequired: boolean;
};
type SavedPriceResponse = {
  options?: Array<{
    variantId: string;
    ratePlans?: Array<{
      editable?: boolean;
      advanced?: boolean;
      protected?: boolean;
      unitType?: string;
      pricingUnit?: string;
      currency?: string;
      minPax?: number;
      maxPax?: number;
      cutOffMinutes?: number;
      cancellationRules?: any[];
      versions?: Array<{ currency?: string; [key: string]: any }>;
      schedules?: any[];
    }>;
  }>;
};
type CancellationPreset =
  "FLEXIBLE" | "MODERATE" | "STRICT" | "NON_REFUNDABLE" | "CUSTOM";
type MRPMode = "YES" | "NO";
type BookingType = "SLOT" | "DATE" | "OPEN";
type AvailabilityState = "OPEN" | "LOW" | "SOLD_OUT" | "BLACKOUT";
type RatePeriod = {
  name: string;
  from: string;
  to: string;
  days: string;
  adjustmentType: "PERCENT" | "FLAT";
  adjustmentValue: string;
};
const cancellationPresetOptions: Array<{
  value: CancellationPreset;
  label: string;
  rules: CancellationRule[];
}> = [
  {
    value: "FLEXIBLE",
    label: "Flexible",
    rules: [
      {
        minDaysBefore: "1",
        maxDaysBefore: "",
        chargeValue: "0",
        chargeType: "PERCENTAGE",
      },
      {
        minDaysBefore: "0",
        maxDaysBefore: "1",
        chargeValue: "100",
        chargeType: "PERCENTAGE",
      },
    ],
  },
  {
    value: "MODERATE",
    label: "Moderate",
    rules: [
      {
        minDaysBefore: "2",
        maxDaysBefore: "",
        chargeValue: "0",
        chargeType: "PERCENTAGE",
      },
      {
        minDaysBefore: "1",
        maxDaysBefore: "2",
        chargeValue: "50",
        chargeType: "PERCENTAGE",
      },
      {
        minDaysBefore: "0",
        maxDaysBefore: "1",
        chargeValue: "100",
        chargeType: "PERCENTAGE",
      },
    ],
  },
  {
    value: "STRICT",
    label: "Strict",
    rules: [
      {
        minDaysBefore: "7",
        maxDaysBefore: "",
        chargeValue: "0",
        chargeType: "PERCENTAGE",
      },
      {
        minDaysBefore: "3",
        maxDaysBefore: "7",
        chargeValue: "50",
        chargeType: "PERCENTAGE",
      },
      {
        minDaysBefore: "0",
        maxDaysBefore: "3",
        chargeValue: "100",
        chargeType: "PERCENTAGE",
      },
    ],
  },
  {
    value: "NON_REFUNDABLE",
    label: "Non-refundable",
    rules: [
      {
        minDaysBefore: "0",
        maxDaysBefore: "",
        chargeValue: "100",
        chargeType: "PERCENTAGE",
      },
    ],
  },
  { value: "CUSTOM", label: "Custom", rules: [] },
];
const travellerDetailOptions = [
  "Lead name",
  "Mobile",
  "Pickup hotel",
  "Every traveller's name",
  "Govt ID",
  "Age / DOB",
];

const days = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
const weekdays = days.slice(0, 5);
const weekends = days.slice(5);
const today = () => new Date().toISOString().slice(0, 10);
const nextYear = () =>
  new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10);
const text = (value: unknown) => (value == null ? "" : String(value));
const formatPrice = (value: string, currency: string) => {
  if (!value) return "Not set";
  const amount = Number(value);
  return Number.isFinite(amount)
    ? `${currency || "INR"} ${amount.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
    : value;
};
const emptyRow = (variant: ProductVariant): PriceRow => ({
  variantId: variant.id,
  pricingUnit: "PER_PERSON",
  currency: "",
  adult: "",
  child: "",
  senior: "",
  mrp: "",
  base: "",
  maxPassengers: "",
  indian: "",
  foreign: "",
  indianChild: "",
  foreignChild: "",
  indianSenior: "",
  foreignSenior: "",
  minPax: "1",
  maxPax: "99",
  cutOffMinutes: "0",
});
function unitFromSaved(value?: string): PricingUnit {
  const normalized = String(value || "").toLowerCase();
  if (normalized.includes("booking")) return "PER_BOOKING";
  if (normalized.includes("unit") || normalized.includes("resource"))
    return "PER_UNIT";
  if (normalized.includes("group")) return "GROUP";
  return "PER_PERSON";
}
function latestVersion(plan: any) {
  return (
    [
      ...(plan?.versions || []).filter(
        (version: any) =>
          version.status === "DRAFT" || version.status === "ACTIVE",
      ),
    ]
      .sort(
        (a, b) => Number(b.versionNumber || 0) - Number(a.versionNumber || 0),
      )
      .find((version) => version.status === "DRAFT") ||
    plan?.versions?.find((version: any) => version.status === "ACTIVE")
  );
}

export default function ActivityPricesAvailability({
  snapshot,
  locked,
  revisionForm,
  onSaveDraft,
  onSaveDraftWithId,
  onRevisionChange,
  onRefresh,
  onError,
  onPricingSaved,
  onPricingDirty,
  onRegisterPricingSave,
  section = "pricing",
}: WizardStepProps & { section?: EditorSection }) {
  const variants = snapshot.variants;
  const [rows, setRows] = useState<PriceRow[]>(() => variants.map(emptyRow));
  const isPricing = section === "pricing";
  const isPolicies = section === "policies";
  const [dateFrom, setDateFrom] = useState(today());
  const [dateTo, setDateTo] = useState(nextYear());
  const [pricingDayPreset, setPricingDayPreset] =
    useState<DayPreset>("ALL_DAYS");
  const [pricingDays, setPricingDays] = useState(days);
  const [operatingDayPreset, setOperatingDayPreset] =
    useState<DayPreset>("ALL_DAYS");
  const [operatingDays, setOperatingDays] = useState(days);
  const [slotScope, setSlotScope] = useState<SlotScope>("ALL");
  const [pricingSlotCodes, setPricingSlotCodes] = useState<string[]>([]);
  const [operatingModel, setOperatingModel] = useState("MULTIPLE_SLOTS");
  const [timezone, setTimezone] = useState("Asia/Kolkata");
  const [capacityUnit, setCapacityUnit] = useState("PERSON");
  const [capacity, setCapacity] = useState("");
  const [alsoUpdateCapacity, setAlsoUpdateCapacity] = useState(false);
  const [specificDateOverride, setSpecificDateOverride] = useState(false);
  const [overrideDate, setOverrideDate] = useState("");
  const [slots, setSlots] = useState<SlotRow[]>([
    { slotCode: "10:00", startTime: "10:00", endTime: "12:00" },
  ]);
  const [includeAvailability, setIncludeAvailability] = useState(false);
  const [availabilityTouched, setAvailabilityTouched] = useState(false);
  const [bookingMode, setBookingMode] = useState("INSTANT");
  const [confirmationSlaMinutes, setConfirmationSlaMinutes] = useState("");
  const [cancellationEnabled, setCancellationEnabled] = useState(false);
  const [mrpMode, setMrpMode] = useState<MRPMode>("YES");
  const [mrpProof, setMrpProof] = useState("");
  const [mrpProofFile, setMrpProofFile] = useState<File | null>(null);
  const [mrpProofUploading, setMrpProofUploading] = useState(false);
  const [commissionPercent, setCommissionPercent] = useState("");
  const [ratePeriods, setRatePeriods] = useState<RatePeriod[]>([]);
  const [bookingType, setBookingType] = useState<BookingType>("SLOT");
  const [openDatedValidityDays, setOpenDatedValidityDays] = useState("30");
  const [blackoutDates, setBlackoutDates] = useState<string[]>([]);
  const [availabilityStates, setAvailabilityStates] = useState<Record<string, AvailabilityState>>({});
  const [inventoryStates, setInventoryStates] = useState<Record<string, AvailabilityState>>({});
  const [visitorEligibilityBasis, setVisitorEligibilityBasis] = useState<
    "NATIONALITY" | "RESIDENCY"
  >("RESIDENCY");
  const [visitorVerificationMode, setVisitorVerificationMode] =
    useState("NONE");
  const [cancellationRules, setCancellationRules] = useState<
    CancellationRule[]
  >([
    {
      minDaysBefore: "7",
      maxDaysBefore: "",
      chargeValue: "0",
      chargeType: "PERCENTAGE",
    },
  ]);
  const [busy, setBusy] = useState(false);
  const [loadingExisting, setLoadingExisting] = useState(false);
  const [saved, setSaved] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [showExistingRates, setShowExistingRates] = useState(false);
  const [protectedRateCount, setProtectedRateCount] = useState(0);
  const [advancedRateCount, setAdvancedRateCount] = useState(0);
  const [bookingRulesTouched, setBookingRulesTouched] = useState(false);
  const [visitorPricingSettings, setVisitorPricingSettings] =
    useState<VisitorPricingSettings>({
      showEligibilityBasis: false,
      showVerificationRequired: false,
    });
  const idempotencyKeyRef = useRef(
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random()}`,
  );
  const visitorAdultRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [selectedVariantIds, setSelectedVariantIds] = useState<string[]>(() =>
    variants.map((variant) => variant.id),
  );
  const byId = useMemo(
    () => new Map(variants.map((variant) => [variant.id, variant])),
    [variants],
  );
  useEffect(() => {
    const next: Record<string, AvailabilityState> = {};
    variants.forEach((variant) => variant.schedules?.forEach((schedule) => schedule.sessions?.forEach((session) => {
      const inventory = session.inventoryState;
      const total = Number(inventory?.totalCapacity || schedule.defaultCapacity || 0);
      const used = Number(inventory?.blockedCapacity || 0) + Number(inventory?.heldCapacity || 0) + Number(inventory?.confirmedCapacity || 0);
      const available = Math.max(0, total - used);
      next[String(session.serviceDate).slice(0, 10)] = session.status !== "OPEN" || available <= 0 ? "SOLD_OUT" : total > 0 && available / total < 0.25 ? "LOW" : "OPEN";
    })));
    setInventoryStates(next);
  }, [variants]);
  const variantIds = useMemo(
    () => variants.map((variant) => variant.id).join(","),
    [variants],
  );
  const periodAdultSell = (period: RatePeriod) => {
    const row = rows.find((item) => selectedVariantIds.includes(item.variantId)) || rows[0];
    if (!row) return null;
    const base = Number(row.pricingUnit === "PER_PERSON" ? row.adult : row.base);
    const adjustment = Number(period.adjustmentValue || 0);
    if (!Number.isFinite(base) || base <= 0 || !Number.isFinite(adjustment)) return null;
    const result = period.adjustmentType === "FLAT" ? base + adjustment : base * (1 + adjustment / 100);
    return Number.isFinite(result) ? result : null;
  };
  const visitorPricing = Boolean(revisionForm.hasDifferentialVisitorPricing);
  const timed =
    operatingModel === "FIXED_SLOT" || operatingModel === "MULTIPLE_SLOTS";
  const calendarDays = useMemo(() => {
    const anchor = new Date(`${dateFrom || today()}T00:00:00Z`);
    const first = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), 1));
    const count = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() + 1, 0)).getUTCDate();
    const leading = first.getUTCDay();
    return Array.from({ length: leading + count }, (_, index) => index < leading ? "" : new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), index - leading + 1)).toISOString().slice(0, 10));
  }, [dateFrom]);
  const dirty = () => {
    setSaved(false);
    setPreview(null);
    onPricingDirty?.();
  };
  const updateRow = (id: string, key: keyof PriceRow, value: string) => {
    setRows((old) =>
      old.map((row) => (row.variantId === id ? { ...row, [key]: value } : row)),
    );
    dirty();
  };
  const pastePriceCells = (
    event: ClipboardEvent<HTMLInputElement>,
    rowIndex: number,
    key: keyof PriceRow,
  ) => {
    const pasted = event.clipboardData.getData("text/plain");
    if (!/[\t\n]/.test(pasted)) return;
    event.preventDefault();
    const row = rows[rowIndex];
    const keys: Array<keyof PriceRow> =
      row?.pricingUnit === "PER_PERSON"
        ? ["adult", "child", "senior", "minPax", "maxPax", "cutOffMinutes"]
        : row?.pricingUnit === "PER_UNIT"
          ? ["base", "maxPassengers", "minPax", "maxPax", "cutOffMinutes"]
          : ["base", "minPax", "maxPax", "cutOffMinutes"];
    const start = keys.indexOf(key);
    const matrix = pasted
      .trim()
      .split(/\r?\n/)
      .map((line) => line.split("\t").map((value) => value.trim()));
    setRows((old) =>
      old.map((row, index) => {
        const values = matrix[index - rowIndex];
        if (!values) return row;
        const next = { ...row };
        values.forEach((value, offset) => {
          const target = keys[start + offset];
          if (target && value !== "") (next as any)[target] = value;
        });
        return next;
      }),
    );
    dirty();
  };
  const selectDays = (value: DayPreset, pricing: boolean) => {
    if (pricing) {
      setPricingDayPreset(value);
      if (value === "ALL_DAYS") setPricingDays(days);
      if (value === "WEEKDAYS") setPricingDays(weekdays);
      if (value === "WEEKENDS") setPricingDays(weekends);
    } else {
      setOperatingDayPreset(value);
      if (value === "ALL_DAYS") setOperatingDays(days);
      if (value === "WEEKDAYS") setOperatingDays(weekdays);
      if (value === "WEEKENDS") setOperatingDays(weekends);
    }
    dirty();
  };
  const toggleDay = (day: string, pricing: boolean) => {
    if (pricing) {
      setPricingDayPreset("CUSTOM");
      setPricingDays((old) =>
        old.includes(day) ? old.filter((item) => item !== day) : [...old, day],
      );
    } else {
      setOperatingDayPreset("CUSTOM");
      setOperatingDays((old) =>
        old.includes(day) ? old.filter((item) => item !== day) : [...old, day],
      );
    }
    dirty();
  };
  const updateSlot = (index: number, key: keyof SlotRow, value: string) => {
    setSlots((old) =>
      old.map((slot, i) =>
        i === index
          ? {
              ...slot,
              [key]: value,
              ...(key === "startTime" ? { slotCode: value } : {}),
            }
          : slot,
      ),
    );
    dirty();
  };
  const toggleSlot = (code: string) => {
    setPricingSlotCodes((old) =>
      old.includes(code) ? old.filter((item) => item !== code) : [...old, code],
    );
    dirty();
  };
  const updateCancellation = (index: number, key: string, value: string) => {
    setCancellationRules((old) =>
      old.map((rule, i) => (i === index ? { ...rule, [key]: value } : rule)),
    );
    dirty();
  };
  const selectCancellationPreset = (preset: CancellationPreset) => {
    onRevisionChange("cancellationPreset", preset);
    const option = cancellationPresetOptions.find(
      (candidate) => candidate.value === preset,
    );
    if (preset !== "CUSTOM" && option)
      setCancellationRules(option.rules.map((rule) => ({ ...rule })));
    setCancellationEnabled(true);
    setBookingRulesTouched(true);
    dirty();
  };
  const toggleTravellerDetail = (detail: string) => {
    const selected = new Set(
      revisionForm.travellerDetails
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    );
    if (selected.has(detail)) selected.delete(detail);
    else selected.add(detail);
    onRevisionChange(
      "travellerDetails",
      travellerDetailOptions.filter((item) => selected.has(item)).join(", "),
    );
    dirty();
  };
  const addCancellationRule = () => {
    setCancellationRules((old) => [
      ...old,
      {
        minDaysBefore: "",
        maxDaysBefore: "",
        chargeValue: "",
        chargeType: "PERCENTAGE",
      },
    ]);
    setCancellationEnabled(true);
    setBookingRulesTouched(true);
    dirty();
  };
  const addRatePeriod = () => {
    setRatePeriods((old) => [
      ...old,
      {
        name: "",
        from: dateFrom,
        to: dateTo,
        days: "ALL",
        adjustmentType: "PERCENT",
        adjustmentValue: "",
      },
    ]);
    dirty();
  };
  const updateRatePeriod = (
    index: number,
    key: keyof RatePeriod,
    value: string,
  ) => {
    setRatePeriods((old) =>
      old.map((period, periodIndex) =>
        periodIndex === index ? { ...period, [key]: value } : period,
      ),
    );
    dirty();
  };
  const removeCancellationRule = (index: number) => {
    setCancellationRules((old) =>
      old.length > 1 ? old.filter((_, i) => i !== index) : old,
    );
    setBookingRulesTouched(true);
    dirty();
  };
  const moneyError = (value: string, label: string, required = false) => {
    if (!value) return required ? `Enter ${label}.` : "";
    return /^\d+(\.\d{1,4})?$/.test(value) && Number(value) >= 0
      ? ""
      : `Enter a valid non-negative ${label}.`;
  };
  const rowFieldError = (
    row: PriceRow,
    key: "adult" | "child" | "senior" | "base" | "maxPassengers",
  ) => {
    if (key === "adult")
      return row.pricingUnit === "PER_PERSON"
        ? moneyError(row.adult, "an adult price", true)
        : moneyError(row.base, "a booking, group or resource price", true);
    if (key === "child")
      return row.pricingUnit === "PER_PERSON"
        ? moneyError(row.child, "a child price")
        : "";
    if (key === "senior")
      return row.pricingUnit === "PER_PERSON"
        ? moneyError(row.senior, "a senior price")
        : "";
    if (key === "base")
      return row.pricingUnit !== "PER_PERSON"
        ? moneyError(row.base, "a booking, group or resource price", true)
        : "";
    return row.pricingUnit === "PER_UNIT" && !row.maxPassengers
      ? "Enter the maximum passengers for each resource."
      : "";
  };
  const rowError = (row: PriceRow) => {
    if (row.pricingUnit === "PER_PERSON" && !row.adult)
      return "Enter an adult price.";
    if (
      rowFieldError(row, "adult") ||
      rowFieldError(row, "child") ||
      rowFieldError(row, "senior") ||
      rowFieldError(row, "base") ||
      rowFieldError(row, "maxPassengers")
    )
      return (
        rowFieldError(row, "adult") ||
        rowFieldError(row, "child") ||
        rowFieldError(row, "senior") ||
        rowFieldError(row, "base") ||
        rowFieldError(row, "maxPassengers")
      );
    if (row.minPax && row.maxPax && Number(row.maxPax) < Number(row.minPax))
      return "Maximum travellers must be at least the minimum.";
    if (mrpMode === "YES" && row.mrp && !Number.isFinite(Number(row.mrp)))
      return "Enter a valid MRP / gate price.";
    if (mrpMode === "YES" && row.mrp) {
      const sellPrices = [row.adult, row.child, row.senior, row.base, row.foreign, row.foreignChild, row.foreignSenior]
        .filter(Boolean)
        .map(Number);
      if (sellPrices.some((price) => price > Number(row.mrp)))
        return "Selling prices cannot be above the MRP / gate price.";
    }
    return "";
  };
  const dateError =
    dateFrom && dateTo && dateTo <= dateFrom
      ? "Selling end must be after selling start (exclusive)."
      : "";
  const validationErrors = () => {
    const optionErrors = isPricing
      ? rows
          .map((row) => {
            const error = rowError(row);
            return error
              ? `${byId.get(row.variantId)?.name || "Selected option"}: ${error}`
              : "";
          })
          .filter(Boolean)
      : [];
    const errors = [...optionErrors, !isPolicies ? dateError : ""].filter(
      Boolean,
    ) as string[];
    if (!selectedVariantIds.length)
      errors.push("Select at least one option to update.");
    const missingVisitorPrices = isPricing
      ? rows.filter(
          (row) =>
            selectedVariantIds.includes(row.variantId) &&
            row.pricingUnit === "PER_PERSON" &&
            (!row.adult || !row.foreign),
        )
      : [];
    if (visitorPricing && missingVisitorPrices.length)
      errors.push(
        `${missingVisitorPrices.map((row) => byId.get(row.variantId)?.name || "Selected option").join(", ")}: enter the foreign adult price or turn off visitor pricing.`,
      );
    if (isPricing && slotScope === "SELECTED" && pricingSlotCodes.length === 0)
      errors.push(
        "Select at least one time slot when using Selected time slots.",
      );
    return errors;
  };
  const visitorAdultError = (row: PriceRow) => {
    if (
      !visitorPricing ||
      !selectedVariantIds.includes(row.variantId) ||
      row.pricingUnit !== "PER_PERSON"
    )
      return "";
    if (!row.adult) return "Enter the Indian adult price first.";
    if (!row.foreign)
      return "Enter the foreign adult price, or turn off visitor pricing.";
    return "";
  };
  const focusVisitorAdultError = () => {
    const row = rows.find((candidate) => visitorAdultError(candidate));
    if (!row) return;
    window.setTimeout(() => {
      const input = visitorAdultRefs.current[row.variantId];
      if (typeof input?.scrollIntoView === "function")
        input.scrollIntoView({ behavior: "smooth", block: "center" });
      input?.focus();
    }, 0);
  };

  useEffect(() => {
    setRows((old) =>
      variants.map(
        (variant) =>
          old.find((row) => row.variantId === variant.id) || emptyRow(variant),
      ),
    );
    setSelectedVariantIds((old) =>
      old.filter((id) => variants.some((variant) => variant.id === id)).length
        ? old.filter((id) => variants.some((variant) => variant.id === id))
        : variants.map((variant) => variant.id),
    );
  }, [variants]);
  useEffect(() => {
    let active = true;
    void api
      .request<VisitorPricingSettings>("/vendor/visitor-pricing-settings")
      .then((settings) => {
        if (active) setVisitorPricingSettings(settings);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    const productId = snapshot.product?.id;
    if (!productId) return;
    let active = true;
    setLoadingExisting(true);
    void api
      .request<SavedPriceResponse>(`/products/${productId}/prices-availability`)
      .then((data) => {
        if (!active) return;
        const savedByVariant = new Map(
          (data.options || []).map((item) => [item.variantId, item]),
        );
        setRows(
          variants.map((variant) => {
            const plans = savedByVariant.get(variant.id)?.ratePlans || [];
            const plan = plans.find((candidate) => candidate.editable);
            const version = latestVersion(plan);
            const traveller = new Map(
              (version?.travellerPrices || []).map((price: any) => [
                price.travellerType,
                text(price.amount),
              ]),
            );
            const payload = (version?.sourcePayload || {}) as any;
            const visitor = (payload.visitorPrices || []) as any[];
            const visitorPrice = (
              type: string,
              category: "indian" | "foreign",
            ) => {
              const item = visitor.find(
                (price) => price.travellerType === type,
              );
              return text(item?.[category]);
            };
            return {
              ...emptyRow(variant),
              pricingUnit: unitFromSaved(
                version?.pricingUnit || plan?.pricingUnit || plan?.unitType,
              ),
              currency: text(
                version?.currency ||
                  plan?.currency ||
                  snapshot.product?.currency ||
                  "INR",
              ),
              adult: text(traveller.get("ADULT")),
              child: text(traveller.get("CHILD")),
              senior: text(traveller.get("SENIOR")),
              mrp: text((version?.sourcePayload as any)?.mrpAmount),
              base: text(version?.supplierBaseAmount),
              maxPassengers: text(payload.maxPassengersPerResource),
              indian: visitorPrice("ADULT", "indian"),
              foreign: visitorPrice("ADULT", "foreign"),
              indianChild: visitorPrice("CHILD", "indian"),
              foreignChild: visitorPrice("CHILD", "foreign"),
              indianSenior: visitorPrice("SENIOR", "indian"),
              foreignSenior: visitorPrice("SENIOR", "foreign"),
              minPax: text(version?.minPax || plan?.minPax || 1),
              maxPax: text(version?.maxPax || plan?.maxPax || 99),
              cutOffMinutes: text(
                Number(version?.cutOffMinutes || plan?.cutOffMinutes || 0) / 60,
              ),
              expectedVersion: version?.versionNumber,
            };
          }),
        );
        const editablePlans = (data.options || [])
          .flatMap((item) => item.ratePlans || [])
          .filter((plan) => plan.editable);
        const hasExistingRateData = editablePlans.some((plan) =>
          plan.versions?.some(
            (version: any) =>
              version.status === "DRAFT" || version.status === "ACTIVE",
          ),
        );
        setProtectedRateCount(
          (data.options || []).reduce(
            (count, item) =>
              count +
              (item.ratePlans || []).filter((plan) => plan.protected).length,
            0,
          ),
        );
        setAdvancedRateCount(
          (data.options || []).reduce(
            (count, item) =>
              count +
              (item.ratePlans || []).filter(
                (plan) => plan.advanced && !plan.protected,
              ).length,
            0,
          ),
        );
        setBookingRulesTouched(!hasExistingRateData);
        const firstPlan = editablePlans[0];
        const firstVersion = latestVersion(firstPlan);
        if (firstVersion) {
          setDateFrom(text(firstVersion.effectiveFrom).slice(0, 10) || today());
          setDateTo(text(firstVersion.effectiveTo).slice(0, 10) || nextYear());
          setBookingMode(firstVersion.bookingMode || "INSTANT");
          setConfirmationSlaMinutes(text(firstVersion.confirmationSlaMinutes));
          const payload = firstVersion.sourcePayload || {};
          setTimezone(payload.pricingTimezone || "Asia/Kolkata");
          setVisitorEligibilityBasis(
            payload.visitorEligibilityBasis === "NATIONALITY"
              ? "NATIONALITY"
              : "RESIDENCY",
          );
          setVisitorVerificationMode(payload.visitorVerificationMode || "NONE");
          setMrpMode(payload.mrpMode === "NO" ? "NO" : "YES");
          setMrpProof(text(payload.mrpProof));
          setCommissionPercent(text((firstVersion as any).supplierCommissionPercent || payload.supplierCommissionPercent));
          setRatePeriods(
            Array.isArray(payload.ratePeriods)
              ? payload.ratePeriods.map((period: any) => ({
                  name: text(period.name),
                  from: text(period.from),
                  to: text(period.to),
                  days: text(period.days || "ALL"),
                  adjustmentType:
                    period.adjustmentType === "FLAT" ? "FLAT" : "PERCENT",
                  adjustmentValue: text(period.adjustmentValue),
                }))
              : [],
          );
          setBookingType(
            payload.availabilityBookingType === "DATE" ||
              payload.availabilityBookingType === "OPEN"
              ? payload.availabilityBookingType
              : "SLOT",
          );
          setOpenDatedValidityDays(text(payload.openDatedValidityDays || "30"));
          setBlackoutDates(
            Array.isArray(payload.availabilityBlackouts)
              ? payload.availabilityBlackouts.map((value: unknown) => text(value))
              : [],
          );
          setAvailabilityStates(
            payload.availabilityStates && typeof payload.availabilityStates === "object"
              ? Object.fromEntries(Object.entries(payload.availabilityStates).map(([date, state]) => [date, ["OPEN", "LOW", "SOLD_OUT", "BLACKOUT"].includes(String(state)) ? String(state) as AvailabilityState : "OPEN"]))
              : {},
          );
          if (
            Array.isArray(payload.pricingDays) &&
            payload.pricingDays.length
          ) {
            setPricingDays(payload.pricingDays);
            setPricingDayPreset(
              payload.pricingDays.length === 7
                ? "ALL_DAYS"
                : payload.pricingDays.join(",") === weekdays.join(",")
                  ? "WEEKDAYS"
                  : payload.pricingDays.join(",") === weekends.join(",")
                    ? "WEEKENDS"
                    : "CUSTOM",
            );
          }
          if (Array.isArray(payload.pricingSlotCodes)) {
            setSlotScope(payload.pricingSlotCodes.length ? "SELECTED" : "ALL");
            setPricingSlotCodes(payload.pricingSlotCodes);
          }
        }
        const schedule = data.options?.flatMap(
          (item) =>
            item.ratePlans?.flatMap((plan) => plan.schedules || []) || [],
        )[0];
        if (schedule) {
          setIncludeAvailability(true);
          setAvailabilityTouched(false);
          setOperatingModel(
            schedule.operatingModel ||
              (schedule.slotTemplates?.length
                ? "MULTIPLE_SLOTS"
                : "DATE_CAPACITY"),
          );
          setTimezone(schedule.timezone || "Asia/Kolkata");
          setCapacityUnit(schedule.capacityUnit || "PERSON");
          setCapacity(text(schedule.defaultCapacity));
          setOperatingDays(
            schedule.operatingDays?.length ? schedule.operatingDays : days,
          );
          setOperatingDayPreset(
            schedule.operatingDays?.join(",") === weekdays.join(",")
              ? "WEEKDAYS"
              : schedule.operatingDays?.join(",") === weekends.join(",")
                ? "WEEKENDS"
                : "CUSTOM",
          );
          setSlots(
            schedule.slotTemplates?.length
              ? schedule.slotTemplates.map((slot: any) => ({
                  slotCode: slot.slotCode,
                  startTime: slot.startTime,
                  endTime: slot.endTime || "",
                }))
              : [{ slotCode: "10:00", startTime: "10:00", endTime: "12:00" }],
          );
        }
        const rules = firstPlan?.cancellationRules || [];
        if (rules.length) {
          setCancellationEnabled(true);
          setCancellationRules(
            rules.map((rule: any) => ({
              minDaysBefore: text(rule.minDaysBefore),
              maxDaysBefore:
                rule.maxDaysBefore == null ? "" : text(rule.maxDaysBefore),
              chargeValue: text(rule.chargeValue),
              chargeType: rule.chargeType || "PERCENTAGE",
            })) as any,
          );
        }
        setSaved(hasExistingRateData);
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setLoadingExisting(false);
      });
    return () => {
      active = false;
    };
  }, [snapshot.product?.id, variantIds]);

  function rowPayload(row: PriceRow, proofOverride = mrpProof) {
    const travellerPrices =
      row.pricingUnit === "PER_PERSON"
        ? [
            row.adult && { travellerType: "ADULT", amount: row.adult },
            row.child && { travellerType: "CHILD", amount: row.child },
            row.senior && { travellerType: "SENIOR", amount: row.senior },
          ].filter(Boolean)
        : [];
    const visitorPrices = visitorPricing
      ? (
          [
            ["ADULT", row.adult, row.foreign],
            ["CHILD", row.child, row.foreignChild],
            ["SENIOR", row.senior, row.foreignSenior],
          ] as const
        )
          .filter(([, indian, foreign]) => indian && foreign)
          .map(([travellerType, indian, foreign]) => ({
            travellerType,
            indian,
            foreign,
          }))
      : [];
    const selectedSlots = slotScope === "SELECTED" ? pricingSlotCodes : [];
    const bookingRules = bookingRulesTouched
      ? {
          bookingMode,
          ...(confirmationSlaMinutes
            ? { confirmationSlaMinutes: Number(confirmationSlaMinutes) }
            : {}),
          cancellationRules: cancellationEnabled
            ? cancellationRules.map((rule) => ({
                minDaysBefore: Number(rule.minDaysBefore),
                ...(rule.maxDaysBefore
                  ? { maxDaysBefore: Number(rule.maxDaysBefore) }
                  : {}),
                chargeValue: rule.chargeValue,
                chargeType: rule.chargeType,
              }))
            : [],
        }
      : {};
    const availability =
      includeAvailability && (availabilityTouched || alsoUpdateCapacity)
        ? {
            scheduleCode: `ACTIVITY-${(byId.get(row.variantId)?.variantCode || row.variantId.slice(0, 8)).replace(/[^A-Za-z0-9]+/g, "-").toUpperCase()}`,
            name: "Standard operating availability",
            operatingModel,
            timezone,
            effectiveFrom: dateFrom,
            effectiveTo: dateTo,
            operatingDays,
            capacityUnit,
            capacityScope:
              capacityUnit === "UNIT" ? "RESOURCE_POOL" : "SESSION_SHARED",
            updateCapacity: alsoUpdateCapacity,
            ...(capacity ? { defaultCapacity: Number(capacity) } : {}),
            ...(selectedSlots.length ? { slotCodes: selectedSlots } : {}),
            slots: timed
              ? slots
                  .filter((slot) => slot.startTime)
                  .map((slot) => ({
                    ...slot,
                    slotCode: slot.slotCode || slot.startTime,
                  }))
              : [],
          }
        : undefined;
    return {
      variantId: row.variantId,
      pricingUnit: row.pricingUnit,
      ...(row.currency ? { currency: row.currency } : {}),
      ...bookingRules,
      effectiveFrom: dateFrom,
      effectiveTo: dateTo,
      timezone,
      mrpMode,
      mrpProof: proofOverride,
      ratePeriods,
      availabilityBookingType: bookingType,
      openDatedValidityDays: bookingType === "OPEN" ? Number(openDatedValidityDays || 0) : undefined,
      availabilityBlackouts: blackoutDates,
      availabilityStates,
      ...(row.expectedVersion ? { expectedVersion: row.expectedVersion } : {}),
      ...(travellerPrices.length ? { travellerPrices } : {}),
      ...(row.base ? { supplierBaseAmount: row.base } : {}),
      ...(row.pricingUnit === "PER_UNIT" && row.maxPassengers
        ? { maxPassengersPerResource: Number(row.maxPassengers) }
        : {}),
      ...(row.minPax ? { minPax: Number(row.minPax) } : {}),
      ...(row.maxPax ? { maxPax: Number(row.maxPax) } : {}),
      ...(row.cutOffMinutes
        ? { cutOffMinutes: Math.round(Number(row.cutOffMinutes) * 60) }
        : {}),
      ...(row.mrp ? { mrpAmount: row.mrp } : {}),
      pricingDays,
      ...(selectedSlots.length ? { pricingSlotCodes: selectedSlots } : {}),
      ...(visitorPrices.length
        ? {
            visitorPrices,
            ...(visitorPricingSettings.showEligibilityBasis
              ? { visitorEligibilityBasis }
              : {}),
            ...(visitorPricingSettings.showVerificationRequired
              ? { visitorVerificationMode }
              : {}),
          }
        : {}),
      ...(availability ? { availability } : {}),
    };
  }
  const requestBody = (proofOverride = mrpProof) => ({
    hasDifferentialVisitorPricing: visitorPricing,
    options: rows
      .filter((row) => selectedVariantIds.includes(row.variantId))
      .map((row) => rowPayload(row, proofOverride)),
  });
  async function runPreview() {
    const clientErrors = validationErrors();
    if (clientErrors.length) {
      onError(clientErrors.join(" "));
      focusVisitorAdultError();
      return;
    }
    try {
      const result = await api.request<Preview>(
        `/products/${snapshot.product!.id}/prices-availability/preview`,
        { method: "POST", body: JSON.stringify(requestBody()) },
      );
      setPreview(result);
      if (!result.valid) onError(result.errors.join(" "));
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error));
    }
  }
  async function saveAll(): Promise<boolean> {
    const clientErrors = validationErrors();
    if (clientErrors.length) {
      onError(clientErrors.join(" "));
      focusVisitorAdultError();
      return false;
    }
    if (includeAvailability && !operatingDays.length) {
      onError("Select at least one operating day.");
      return false;
    }
    if (alsoUpdateCapacity && !capacity) {
      onError("Enter a capacity before selecting Also update capacity.");
      return false;
    }
    if (!isPolicies && dateTo <= dateFrom) {
      onError(
        "Selling end date must be after the selling start date; the end date is exclusive.",
      );
      return false;
    }
    const savedDraft = await (onSaveDraftWithId
      ? onSaveDraftWithId()
      : onSaveDraft());
    if (!savedDraft) return false;
    const productId =
      snapshot.product?.id ||
      (typeof savedDraft === "string" ? savedDraft : "");
    if (!productId) {
      onError(
        "The product draft was saved, but its ID was not available for pricing. Reopen the draft and try again.",
      );
      return false;
    }
    let proofOverride = mrpProof;
    if (mrpProofFile) {
      setMrpProofUploading(true);
      try {
        const upload = new FormData();
        upload.append("file", mrpProofFile);
        const result = await api.request<{ fileAssetId: string }>(`/product-revisions/${snapshot.revision?.id}/rate-proof/upload`, { method: "POST", body: upload });
        proofOverride = `fileAsset:${result.fileAssetId}`;
        setMrpProof(proofOverride);
        setMrpProofFile(null);
      } catch (error) {
        onError(error instanceof Error ? error.message : String(error));
        return false;
      } finally {
        setMrpProofUploading(false);
      }
    }
    const body = requestBody(proofOverride);
    setBusy(true);
    try {
      const result = await api.request<Preview>(
        `/products/${productId}/prices-availability/preview`,
        { method: "POST", body: JSON.stringify(body) },
      );
      setPreview(result);
      if (!result.valid) {
        onError(result.errors.join(" "));
        return false;
      }
      await api.request(`/products/${productId}/prices-availability/apply`, {
        method: "POST",
        headers: { "Idempotency-Key": idempotencyKeyRef.current },
        body: JSON.stringify(body),
      });
      idempotencyKeyRef.current =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random()}`;
      setSaved(true);
      onPricingSaved?.();
      return true;
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error));
      return false;
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    onRegisterPricingSave?.(saveAll);
    return () => onRegisterPricingSave?.(null);
  }, [onRegisterPricingSave, saveAll]);

  return (
    <div className={`experience-step-stack activity-editor-section-${section}`}>
      <div className="experience-step-card activity-prices-card">
        <div className="experience-card-heading">
          <div>
            <h3>
              {isPricing
                ? "Rates"
                : isPolicies
                  ? "Booking policies"
                  : "Availability"}
            </h3>
            <p>
              {isPricing
                ? "How much the customer pays and the booking rules for each option."
                : isPolicies
                  ? "Confirmation, cancellation and what we must collect from the traveller."
                  : "How customers pick a date and time, and how much we can sell."}
            </p>
          </div>
          <span className="experience-pill">{rows.length} options</span>
        </div>
        <div className="experience-notice">
          <b>How this works:</b>{" "}
          {isPricing
            ? "Rates are saved as versioned commercial records. Existing contracts and booking snapshots remain untouched."
            : isPolicies
              ? "Policies apply to the selected options and remain reviewable before submission."
              : "Availability is saved as schedule and slot records. Price changes do not reset existing sessions or inventory."}
          {protectedRateCount > 0 && (
            <>
              <br />
              <b>Protected pricing:</b> {protectedRateCount} existing contract
              or channel-linked rate plan(s) are preserved.
            </>
          )}
          {advancedRateCount > 0 && (
            <>
              <br />
              <b>Advanced pricing:</b> {advancedRateCount} rate plan(s) need
              advanced management and are not editable in this simplified
              editor.
            </>
          )}
        </div>
        {isPricing && (
          <>
            <div className="prototype-commercial-terms">
              <div className="prototype-commercial-heading">
                <span>🔒 Your commercial terms · set at onboarding</span>
                <span className="experience-pill success">Agreement signed</span>
              </div>
              <div className="prototype-commercial-grid">
                <div><small>Commission</small><strong>{commissionPercent ? `${commissionPercent}%` : "Set by account"}</strong><em>of sell price</em></div>
                <div><small>Settlement</small><strong>Weekly</strong><em>T+7 after activity date</em></div>
                <div><small>Agreement valid</small><strong>{dateFrom} – {dateTo}</strong></div>
              </div>
              <p>These terms can't be changed here. Contact your account manager to revise them.</p>
            </div>
            <div className="prototype-rate-controls">
              <div className="prototype-rate-control">
                <b>Is there an MRP or gate price for this activity?</b>
                <div className="experience-segmented">
                  <button type="button" className={mrpMode === 'YES' ? 'active' : ''} onClick={() => { setMrpMode('YES'); dirty(); }} disabled={locked}>Yes</button>
                  <button type="button" className={mrpMode === 'NO' ? 'active' : ''} onClick={() => { setMrpMode('NO'); dirty(); }} disabled={locked}>No</button>
                </div>
                <small>The printed counter price or price on your own website. QC uses it to check the sell price.</small>
              </div>
              {mrpMode === 'YES' && <div className="mrp-proof-fields"><Field label="MRP proof"><input value={mrpProof.startsWith('fileAsset:') ? 'Uploaded rate-board / ticket proof' : mrpProof} onChange={(event) => { setMrpProof(event.target.value); setMrpProofFile(null); dirty(); }} disabled={locked || mrpProof.startsWith('fileAsset:')} placeholder="Link to your website price, or upload a ticket / rate board photo" /></Field><Field label="Upload proof photo"><input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(event) => { setMrpProofFile(event.target.files?.[0] || null); dirty(); }} disabled={locked || mrpProofUploading} /><small className="experience-help">Optional supplier evidence for QC. Saved privately with the draft.</small>{mrpProofFile && <small className="experience-pill success">{mrpProofFile.name}</small>}</Field></div>}
            </div>
            <div className="prototype-rate-periods">
              <div className="experience-card-heading"><div><h4>Rate periods</h4><p>Base rate applies outside these periods. Adjust in percentage or flat currency.</p></div><button type="button" className="btn small" onClick={addRatePeriod} disabled={locked}>+ Add period</button></div>
              {ratePeriods.length ? <div className="prototype-rate-period-list">{ratePeriods.map((period, index) => <div className="prototype-rate-period" key={`${index}-${period.name}`}>
                <Field label="Period"><input value={period.name} onChange={(event) => updateRatePeriod(index, 'name', event.target.value)} disabled={locked} placeholder="Peak season" /></Field>
                <Field label="From"><SharedDatePicker value={period.from} onChange={(value) => updateRatePeriod(index, 'from', value)} disabled={locked} placeholder="From" /></Field>
                <Field label="To"><SharedDatePicker value={period.to} onChange={(value) => updateRatePeriod(index, 'to', value)} disabled={locked} placeholder="To" /></Field>
                <Field label="Days"><select value={period.days} onChange={(event) => updateRatePeriod(index, 'days', event.target.value)} disabled={locked}><option value="ALL">All days</option><option value="WEEKDAYS">Weekdays</option><option value="WEEKENDS">Weekends</option></select></Field>
                <Field label="Adjustment"><div className="prototype-adjustment"><input value={period.adjustmentValue} onChange={(event) => updateRatePeriod(index, 'adjustmentValue', event.target.value)} disabled={locked} placeholder="0" /><select value={period.adjustmentType} onChange={(event) => updateRatePeriod(index, 'adjustmentType', event.target.value as RatePeriod['adjustmentType'])} disabled={locked}><option value="PERCENT">%</option><option value="FLAT">₹</option></select></div></Field>
                <div className="prototype-rate-period-preview"><small>Adult sell</small><b>{periodAdultSell(period) == null ? "—" : `₹${periodAdultSell(period)!.toFixed(2)}`}</b></div>
                {!locked && <button type="button" className="link-button" onClick={() => { setRatePeriods((old) => old.filter((_, periodIndex) => periodIndex !== index)); dirty(); }}>Remove</button>}
              </div>)}</div> : <p className="experience-help">No rate periods configured. The base rate applies to the selling dates above.</p>}
            </div>
          </>
        )}
        <div className="activity-date-toolbar">
          <Field label="Selling starts">
            <SharedDatePicker
              value={dateFrom}
              onChange={(value) => {
                setSpecificDateOverride(false);
                setDateFrom(value);
                dirty();
              }}
              disabled={locked || specificDateOverride}
              placeholder="Selling starts"
            />
          </Field>
          <Field
            label="Selling ends (exclusive)"
            error={dateError || undefined}
          >
            <SharedDatePicker
              value={dateTo}
              onChange={(value) => {
                setSpecificDateOverride(false);
                setDateTo(value);
                dirty();
              }}
              ariaInvalid={Boolean(dateError)}
              disabled={locked || specificDateOverride}
              placeholder="Selling ends"
            />
          </Field>
          <label className="wizard-check">
            <input
              type="checkbox"
              checked={specificDateOverride}
              onChange={(e) => {
                const checked = e.target.checked;
                const start = overrideDate || dateFrom;
                setSpecificDateOverride(checked);
                if (checked) {
                  setOverrideDate(start);
                  setDateFrom(start);
                  setDateTo(
                    new Date(
                      new Date(`${start}T00:00:00Z`).getTime() + 86400000,
                    )
                      .toISOString()
                      .slice(0, 10),
                  );
                }
                dirty();
              }}
              disabled={locked}
            />{" "}
            Exact date override
          </label>
          <Field label="Override date">
            <SharedDatePicker
              value={overrideDate || dateFrom}
              onChange={(value) => {
                setOverrideDate(value);
                setDateFrom(value);
                setDateTo(
                  new Date(new Date(value + "T00:00:00Z").getTime() + 86400000)
                    .toISOString()
                    .slice(0, 10),
                );
                dirty();
              }}
              disabled={locked || !specificDateOverride}
              placeholder="Override date"
            />
          </Field>
          <div>
            <b>Apply prices to</b>
            <div className="day-picker compact">
              <select
                aria-label="Pricing day preset"
                value={pricingDayPreset}
                onChange={(e) => selectDays(e.target.value as DayPreset, true)}
                disabled={locked}
              >
                <option value="ALL_DAYS">All days</option>
                <option value="WEEKDAYS">Weekdays</option>
                <option value="WEEKENDS">Weekends</option>
                <option value="CUSTOM">Custom</option>
              </select>
              {days.map((day) => (
                <button
                  type="button"
                  key={`price-${day}`}
                  className={pricingDays.includes(day) ? "selected" : ""}
                  onClick={() => toggleDay(day, true)}
                  disabled={locked}
                >
                  {day}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="activity-option-selection-toolbar">
          <div>
            <b>Options to update</b>
            <p className="experience-help">
              Choose which options receive these prices and rules. Paste
              tab-separated values into the first selected row: traveller
              pricing uses adult, child, senior, min, max and cutoff; resource
              pricing uses base, passengers per resource, min, max and cutoff.
            </p>
            <div className="activity-option-checks">
              {variants.map((variant) => (
                <label className="wizard-check" key={variant.id}>
                  <input
                    type="checkbox"
                    checked={selectedVariantIds.includes(variant.id)}
                    onChange={() => {
                      setSelectedVariantIds((old) =>
                        old.includes(variant.id)
                          ? old.filter((id) => id !== variant.id)
                          : [...old, variant.id],
                      );
                      dirty();
                    }}
                    disabled={locked}
                  />{" "}
                  {variant.name}
                </label>
              ))}
            </div>
          </div>
          <div className="activity-option-selection-actions">
            <button
              type="button"
              className="btn secondary"
              onClick={() => {
                setSelectedVariantIds(variants.map((variant) => variant.id));
                dirty();
              }}
              disabled={locked}
            >
              Select all
            </button>
            <button
              type="button"
              className="btn secondary"
              onClick={() => {
                setSelectedVariantIds([]);
                dirty();
              }}
              disabled={locked}
            >
              Clear
            </button>
            <span>{selectedVariantIds.length} selected</span>
          </div>
        </div>
        {rows.length ? (
          <div className="activity-price-table">
            <div className="activity-visitor-toggle">
              <label className="wizard-check">
                <input
                  type="checkbox"
                  checked={visitorPricing}
                  onChange={(e) => {
                    onRevisionChange(
                      "hasDifferentialVisitorPricing",
                      e.target.checked,
                    );
                    dirty();
                  }}
                  disabled={locked}
                />{" "}
                <b>Visitor pricing</b>{" "}
                <span className="experience-pill">Optional</span> Different
                Indian / foreign prices
              </label>
              {visitorPricing &&
                (visitorPricingSettings.showEligibilityBasis ||
                  visitorPricingSettings.showVerificationRequired) && (
                  <div className="experience-form-grid two">
                    {visitorPricingSettings.showEligibilityBasis && (
                      <Field label="Eligibility basis">
                        <select
                          value={visitorEligibilityBasis}
                          onChange={(e) => {
                            setVisitorEligibilityBasis(
                              e.target.value as "NATIONALITY" | "RESIDENCY",
                            );
                            dirty();
                          }}
                          disabled={locked}
                        >
                          <option value="RESIDENCY">Residency</option>
                          <option value="NATIONALITY">Nationality</option>
                        </select>
                      </Field>
                    )}
                    {visitorPricingSettings.showVerificationRequired && (
                      <Field label="Verification required">
                        <select
                          value={visitorVerificationMode}
                          onChange={(e) => {
                            setVisitorVerificationMode(e.target.value);
                            dirty();
                          }}
                          disabled={locked}
                        >
                          <option value="NONE">
                            No additional verification
                          </option>
                          <option value="DOCUMENT_AT_BOOKING">
                            Document at booking
                          </option>
                          <option value="CHECK_IN">
                            Check-in verification
                          </option>
                          <option value="BOTH">Booking and check-in</option>
                        </select>
                      </Field>
                    )}
                  </div>
                )}
            </div>
            <div className="activity-price-head">
              <span>Option</span>
              <span>Pricing basis</span>
              <span>Adult / base</span>
              <span>Child</span>
              <span>Senior</span>
            </div>
            {rows.map((row) => {
              const optionName = byId.get(row.variantId)?.name || "Option";
              const foreignError = visitorAdultError(row);
              return (
                <div
                  className="activity-price-option-group"
                  key={row.variantId}
                >
                  <div className="activity-price-row">
                    <div>
                      <b>{optionName}</b>
                      <small>{byId.get(row.variantId)?.variantCode}</small>
                    </div>
                    <select
                      aria-label={`${optionName} pricing basis`}
                      value={row.pricingUnit}
                      onChange={(e) =>
                        updateRow(
                          row.variantId,
                          "pricingUnit",
                          e.target.value as PricingUnit,
                        )
                      }
                      disabled={locked}
                    >
                      <option value="PER_PERSON">Per traveller</option>
                      <option value="PER_BOOKING">Per booking / group</option>
                      <option value="PER_UNIT">Per resource / vehicle</option>
                      <option value="GROUP">Group price</option>
                    </select>
                    <Field
                      label={
                        row.pricingUnit === "PER_PERSON"
                          ? "Adult price *"
                          : row.pricingUnit === "PER_UNIT"
                            ? "Price per resource"
                            : "Booking price"
                      }
                      error={
                        rowFieldError(
                          row,
                          row.pricingUnit === "PER_PERSON" ? "adult" : "base",
                        ) || undefined
                      }
                    >
                      <input
                        aria-label={`${optionName} adult or base price`}
                        aria-required={row.pricingUnit === "PER_PERSON"}
                        aria-invalid={Boolean(
                          rowFieldError(
                            row,
                            row.pricingUnit === "PER_PERSON" ? "adult" : "base",
                          ),
                        )}
                        type="number"
                        min="0"
                        step="0.01"
                        value={
                          row.pricingUnit === "PER_PERSON"
                            ? row.adult
                            : row.base
                        }
                        onPaste={(e) =>
                          pastePriceCells(
                            e,
                            rows.findIndex(
                              (candidate) =>
                                candidate.variantId === row.variantId,
                            ),
                            row.pricingUnit === "PER_PERSON" ? "adult" : "base",
                          )
                        }
                        onChange={(e) =>
                          updateRow(
                            row.variantId,
                            row.pricingUnit === "PER_PERSON" ? "adult" : "base",
                            e.target.value,
                          )
                        }
                        placeholder="Enter price"
                        disabled={locked}
                      />
                    </Field>
                    <Field
                      label="Child price"
                      error={rowFieldError(row, "child") || undefined}
                    >
                      <input
                        aria-label={`${optionName} child price`}
                        aria-invalid={Boolean(rowFieldError(row, "child"))}
                        type="number"
                        min="0"
                        step="0.01"
                        value={row.child}
                        onPaste={(e) =>
                          pastePriceCells(
                            e,
                            rows.findIndex(
                              (candidate) =>
                                candidate.variantId === row.variantId,
                            ),
                            "child",
                          )
                        }
                        onChange={(e) =>
                          updateRow(row.variantId, "child", e.target.value)
                        }
                        placeholder="Optional"
                        disabled={locked || row.pricingUnit !== "PER_PERSON"}
                      />
                    </Field>
                    <Field
                      label="Senior price"
                      error={rowFieldError(row, "senior") || undefined}
                    >
                      <input
                        aria-label={`${optionName} senior price`}
                        aria-invalid={Boolean(rowFieldError(row, "senior"))}
                        type="number"
                        min="0"
                        step="0.01"
                        value={row.senior}
                        onPaste={(e) =>
                          pastePriceCells(
                            e,
                            rows.findIndex(
                              (candidate) =>
                                candidate.variantId === row.variantId,
                            ),
                            "senior",
                          )
                        }
                        onChange={(e) =>
                          updateRow(row.variantId, "senior", e.target.value)
                        }
                        placeholder="Optional"
                        disabled={locked || row.pricingUnit !== "PER_PERSON"}
                      />
                    </Field>
                    <div className="activity-price-row-extra">
                      <Field label="Min travellers">
                        <input
                          type="number"
                          min="1"
                          value={row.minPax}
                          onChange={(e) =>
                            updateRow(row.variantId, "minPax", e.target.value)
                          }
                          disabled={locked}
                        />
                      </Field>
                      <Field
                        label="Max travellers"
                        error={
                          row.minPax &&
                          row.maxPax &&
                          Number(row.maxPax) < Number(row.minPax)
                            ? "Maximum travellers must be at least the minimum."
                            : undefined
                        }
                      >
                        <input
                          type="number"
                          min="1"
                          value={row.maxPax}
                          onChange={(e) =>
                            updateRow(row.variantId, "maxPax", e.target.value)
                          }
                          aria-invalid={Boolean(
                            row.minPax &&
                            row.maxPax &&
                            Number(row.maxPax) < Number(row.minPax),
                          )}
                          disabled={locked}
                        />
                      </Field>
                      {row.pricingUnit === "PER_UNIT" && (
                        <Field
                          label="Max passengers / resource"
                          error={
                            rowFieldError(row, "maxPassengers") || undefined
                          }
                        >
                          <input
                            type="number"
                            min="1"
                            value={row.maxPassengers}
                            onChange={(e) =>
                              updateRow(
                                row.variantId,
                                "maxPassengers",
                                e.target.value,
                              )
                            }
                            aria-invalid={Boolean(
                              rowFieldError(row, "maxPassengers"),
                            )}
                            disabled={locked}
                          />
                        </Field>
                      )}
                      {mrpMode === "YES" && (
                        <Field label="MRP / gate price">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={row.mrp}
                            onChange={(e) => updateRow(row.variantId, "mrp", e.target.value)}
                            placeholder="Enter MRP"
                            disabled={locked}
                          />
                        </Field>
                      )}
                      <Field label="Booking cut-off (hours)">
                        <input
                          type="number"
                          min="0"
                          value={row.cutOffMinutes}
                          onChange={(e) =>
                            updateRow(
                              row.variantId,
                              "cutOffMinutes",
                              e.target.value,
                            )
                          }
                          placeholder="0"
                          disabled={locked}
                        />
                      </Field>
                    </div>
                  </div>
                  {visitorPricing && row.pricingUnit === "PER_PERSON" && (
                    <div className="activity-foreign-price-row">
                      <div></div>
                      <span className="activity-foreign-price-label">
                        Foreign price
                      </span>
                      <div className="activity-foreign-price-input">
                        <input
                          ref={(input) => {
                            visitorAdultRefs.current[row.variantId] = input;
                          }}
                          aria-label={`${optionName} foreign adult price`}
                          aria-required={selectedVariantIds.includes(
                            row.variantId,
                          )}
                          aria-invalid={Boolean(foreignError)}
                          type="number"
                          min="0"
                          step="0.01"
                          value={row.foreign}
                          onChange={(e) =>
                            updateRow(row.variantId, "foreign", e.target.value)
                          }
                          placeholder="Adult price *"
                          disabled={locked}
                        />
                        {foreignError && (
                          <small className="field-error">{foreignError}</small>
                        )}
                      </div>
                      <div className="activity-foreign-price-input">
                        <input
                          aria-label={`${optionName} foreign child price`}
                          type="number"
                          min="0"
                          step="0.01"
                          value={row.foreignChild}
                          onChange={(e) =>
                            updateRow(
                              row.variantId,
                              "foreignChild",
                              e.target.value,
                            )
                          }
                          placeholder="Optional"
                          disabled={locked}
                        />
                      </div>
                      <div className="activity-foreign-price-input">
                        <input
                          aria-label={`${optionName} foreign senior price`}
                          type="number"
                          min="0"
                          step="0.01"
                          value={row.foreignSenior}
                          onChange={(e) =>
                            updateRow(
                              row.variantId,
                              "foreignSenior",
                              e.target.value,
                            )
                          }
                          placeholder="Optional"
                          disabled={locked}
                        />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="experience-empty">
            Add at least one option before setting prices.
          </div>
        )}
        {rows.length > 0 && <section className="prototype-rate-preview" aria-label="Customer price preview">
          <div className="experience-card-heading"><div><h4>Commercial price preview</h4><p>Review the customer price, commission and supplier settlement before saving.</p></div><span className="experience-pill">Commission {commissionPercent || "—"}%</span></div>
          <div className="prototype-rate-breakdown"><div className="prototype-rate-breakdown-head"><span>Option</span><span>MRP</span><span>Your sell price</span><span>Commission</span><span>You receive</span><span>Saving shown</span></div>{rows.map((row) => { const sell = Number(row.pricingUnit === "PER_PERSON" ? row.adult : row.base); const mrp = Number(row.mrp); const commission = Number(commissionPercent || 0); const fee = sell && commission ? sell * commission / 100 : 0; const receive = sell ? sell - fee : 0; const saving = mrp > 0 && sell > 0 ? Math.max(0, (mrp - sell) / mrp * 100) : 0; const name = byId.get(row.variantId)?.name || "Option"; return <div className="prototype-rate-breakdown-row" key={`breakdown-${row.variantId}`}><b>{name}</b><span>{mrp > 0 ? `₹${mrp.toFixed(2)}` : "—"}</span><span>{sell > 0 ? `₹${sell.toFixed(2)}` : "—"}</span><span>{fee > 0 ? `₹${fee.toFixed(2)}` : "—"}</span><span>{receive > 0 ? `₹${receive.toFixed(2)}` : "—"}</span><span>{saving > 0 ? `${saving.toFixed(1)}%` : "—"}</span></div>; })}</div>
          <div className="prototype-final-price-preview"><b>Final price preview</b>{rows.map((row) => { const sell = Number(row.pricingUnit === "PER_PERSON" ? row.adult : row.base); const name = byId.get(row.variantId)?.name || "Option"; return <span key={`final-${row.variantId}`}>{name}: <strong>{sell > 0 ? `₹${sell.toFixed(2)}` : "Enter a sell price"}</strong> per traveller</span>; })}</div>
        </section>}
      </div>
      <div className="experience-step-card activity-availability-card">
        <div className="experience-card-heading">
          <div>
            <h4>
              Availability <span className="experience-pill">Optional</span>
            </h4>
            <p>Price-only saves never reset sessions or inventory.</p>
          </div>
          <label className="wizard-check">
            <input
              type="checkbox"
              checked={includeAvailability}
              onChange={(e) => {
                setIncludeAvailability(e.target.checked);
                setAvailabilityTouched(true);
                dirty();
              }}
              disabled={locked}
            />{" "}
            Configure availability now
          </label>
        </div>
        <div className="prototype-availability-booking-type">
          <b>Booking type</b>
          <div className="option-card-grid">
            {([
              ["SLOT", "Date + time slot", "Tours, shows, timed entry"],
              ["DATE", "Date only", "Theme parks, day passes"],
              ["OPEN", "Open-dated", "Valid N days from purchase"],
            ] as const).map(([value, label, description]) => <button type="button" key={value} className={`option-pricing-mode-card ${bookingType === value ? "selected" : ""}`} onClick={() => { setBookingType(value); setOperatingModel(value === "SLOT" ? "MULTIPLE_SLOTS" : value === "DATE" ? "DATE_CAPACITY" : "ALL_DAY"); setIncludeAvailability(true); setAvailabilityTouched(true); dirty(); }} disabled={locked}><b>{label}</b><span>{description}</span></button>)}
          </div>
        </div>
        <div className="experience-form-grid three">
          <Field label="Timezone">
            <input
              value={timezone}
              onChange={(e) => {
                setTimezone(e.target.value);
                setAvailabilityTouched(true);
                dirty();
              }}
              disabled={locked}
            />
          </Field>
          <Field label="Operating model">
            <select
              value={operatingModel}
              onChange={(e) => {
                setOperatingModel(e.target.value);
                setAvailabilityTouched(true);
                dirty();
              }}
              disabled={locked}
            >
              <option value="ALL_DAY">All day</option>
              <option value="DATE_CAPACITY">Date capacity</option>
              <option value="FIXED_SLOT">Fixed slot</option>
              <option value="MULTIPLE_SLOTS">Multiple slots</option>
            </select>
          </Field>
          <Field label="Capacity unit">
            <select
              value={capacityUnit}
              onChange={(e) => {
                setCapacityUnit(e.target.value);
                setAvailabilityTouched(true);
                dirty();
              }}
              disabled={locked}
            >
              <option value="PERSON">People · shared per session</option>
              <option value="BOOKING">Bookings · shared per session</option>
              <option value="UNIT">
                Resources / vehicles · separate resource pool
              </option>
            </select>
          </Field>
          <Field label="Default capacity">
            <input
              type="number"
              min="0"
              value={capacity}
              onChange={(e) => {
                setCapacity(e.target.value);
                setAvailabilityTouched(true);
                dirty();
              }}
              disabled={locked}
              placeholder="Optional"
            />
          </Field>
        </div>
        {bookingType === "OPEN" && <Field label="Valid days from purchase"><input type="number" min="1" value={openDatedValidityDays} onChange={(e) => { setOpenDatedValidityDays(e.target.value); setAvailabilityTouched(true); dirty(); }} disabled={locked} /></Field>}
        <p className="experience-help">
          People and booking capacity use one InventoryState per session shared
          across Adult/Child/Senior. Resources / vehicles use the resource pool
          and the per-resource passenger limit; price-only saves never change
          either pool.
        </p>
        <div className="day-picker">
          <span>Operating days</span>
          <select
            aria-label="Operating day preset"
            value={operatingDayPreset}
            onChange={(e) => {
              setAvailabilityTouched(true);
              selectDays(e.target.value as DayPreset, false);
            }}
            disabled={locked}
          >
            <option value="ALL_DAYS">All days</option>
            <option value="WEEKDAYS">Weekdays</option>
            <option value="WEEKENDS">Weekends</option>
            <option value="CUSTOM">Custom</option>
          </select>
          {days.map((day) => (
            <button
              type="button"
              key={`open-${day}`}
              className={operatingDays.includes(day) ? "selected" : ""}
              onClick={() => {
                setAvailabilityTouched(true);
                toggleDay(day, false);
              }}
              disabled={locked}
            >
              {day}
            </button>
          ))}
        </div>
        {timed && (
          <div className="activity-slot-editor">
            <div className="experience-card-heading">
              <div>
                <b>Time slots</b>
                <small>
                  Changing a price does not create a new operating time.
                </small>
              </div>
              <select
                aria-label="Price time slot scope"
                value={slotScope}
                onChange={(e) => {
                  setSlotScope(e.target.value as SlotScope);
                  setAvailabilityTouched(true);
                  dirty();
                }}
                disabled={locked}
              >
                <option value="ALL">All time slots</option>
                <option value="SELECTED">Selected time slots</option>
              </select>
            </div>
            {slotScope === "SELECTED" && (
              <div className="day-picker compact">
                {slots.map((slot) => (
                  <label key={`pick-${slot.slotCode}`} className="wizard-check">
                    <input
                      type="checkbox"
                      checked={pricingSlotCodes.includes(slot.slotCode)}
                      onChange={() => {
                        setAvailabilityTouched(true);
                        toggleSlot(slot.slotCode);
                      }}
                      disabled={locked}
                    />{" "}
                    {slot.slotCode}
                  </label>
                ))}
              </div>
            )}
            {slots.map((slot, index) => (
              <div
                className="activity-slot-row"
                key={`${index}-${slot.slotCode}`}
              >
                <Field label={`Slot ${index + 1} start`}>
                  <input
                    type="time"
                    value={slot.startTime}
                    onChange={(e) => {
                      setAvailabilityTouched(true);
                      updateSlot(index, "startTime", e.target.value);
                    }}
                    disabled={locked}
                  />
                </Field>
                <Field label="End time">
                  <input
                    type="time"
                    value={slot.endTime}
                    onChange={(e) => {
                      setAvailabilityTouched(true);
                      updateSlot(index, "endTime", e.target.value);
                    }}
                    disabled={locked}
                  />
                </Field>
                {!locked && (
                  <button
                    type="button"
                    className="btn small"
                    onClick={() => {
                      setAvailabilityTouched(true);
                      setSlots((old) => old.filter((_, i) => i !== index));
                      dirty();
                    }}
                    disabled={slots.length === 1}
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
            {!locked && (
              <button
                type="button"
                className="btn small"
                onClick={() => {
                  const n = slots.length + 10;
                  setAvailabilityTouched(true);
                  setSlots((old) => [
                    ...old,
                    {
                      slotCode: `${String(n).padStart(2, "0")}:00`,
                      startTime: `${String(n).padStart(2, "0")}:00`,
                      endTime: `${String(n + 2).padStart(2, "0")}:00`,
                    },
                  ]);
                  dirty();
                }}
              >
                + Add time slot
              </button>
            )}
          </div>
        )}
        {includeAvailability && <div className="prototype-availability-calendar">
          <div className="experience-card-heading"><div><h4>{new Date(`${dateFrom || today()}T00:00:00Z`).toLocaleString(undefined, { month: "long", year: "numeric", timeZone: "UTC" })} · {slots[0]?.slotCode || "all day"} slot</h4><p>Saved session inventory determines Open, Under 25% and Sold out. Tap a date only to toggle a manual blackout.</p></div><div className="prototype-calendar-legend"><span><i className="open" />Open</span><span><i className="low" />Under 25%</span><span><i className="sold-out" />Sold out</span><span><i className="blackout" />Blackout</span></div></div>
          <div className="prototype-calendar-weekdays">{["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((day) => <span key={day}>{day}</span>)}</div>
          <div className="prototype-calendar-grid">{calendarDays.map((day, index) => { if (!day) return <span key={`blank-${index}`} aria-hidden="true" />; const derived = inventoryStates[day] || "OPEN"; const state = blackoutDates.includes(day) ? "BLACKOUT" : availabilityStates[day] || derived; const nextState: AvailabilityState = state === "BLACKOUT" ? derived : "BLACKOUT"; return <button type="button" key={day} className={state.toLowerCase().replace("_", "-")} onClick={() => { setAvailabilityStates((old) => ({ ...old, [day]: nextState })); setBlackoutDates((old) => nextState === "BLACKOUT" ? (old.includes(day) ? old : [...old, day]) : old.filter((value) => value !== day)); setAvailabilityTouched(true); dirty(); }} disabled={locked} aria-label={`${day} ${state.toLowerCase().replace("_", " ")}`}>{new Date(`${day}T00:00:00Z`).getUTCDate()}</button>; })}</div>
        </div>}
        {includeAvailability && (
          <label className="wizard-check activity-capacity-check">
            <input
              type="checkbox"
              checked={alsoUpdateCapacity}
              onChange={(e) => {
                setAlsoUpdateCapacity(e.target.checked);
                setAvailabilityTouched(true);
                dirty();
              }}
              disabled={locked}
            />{" "}
            Also update capacity{" "}
            <small>
              Reductions below held or confirmed inventory are blocked.
            </small>
          </label>
        )}
      </div>
      <details className="experience-step-card activity-booking-rules" open>
        <summary>
          <b>{isPolicies ? "Booking policies" : "Booking rules"}</b>
          <span>Confirmation, traveller limits and cancellation policy</span>
        </summary>
        <p className="experience-help">
          These rules are unchanged for existing options until you edit this
          section. When changed, they apply to the selected options.
        </p>
        <div className="experience-form-grid three">
          <Field label="Confirmation method">
            <select
              value={bookingMode}
              onChange={(e) => {
                setBookingMode(e.target.value);
                setBookingRulesTouched(true);
                dirty();
              }}
              disabled={locked}
            >
              <option value="INSTANT">Instant</option>
              <option value="MANUAL_ON_REQUEST">On request</option>
              <option value="VENDOR_CONFIRMATION">Vendor confirmation</option>
            </select>
          </Field>
          {bookingMode !== "INSTANT" && (
            <Field label="Confirmation SLA (minutes)">
              <input
                type="number"
                min="1"
                value={confirmationSlaMinutes}
                onChange={(e) => {
                  setConfirmationSlaMinutes(e.target.value);
                  setBookingRulesTouched(true);
                  dirty();
                }}
                disabled={locked}
                placeholder="Required"
              />
            </Field>
          )}
          <label className="wizard-check">
            <input
              type="checkbox"
              checked={cancellationEnabled}
              onChange={(e) => {
                setCancellationEnabled(e.target.checked);
                setBookingRulesTouched(true);
                dirty();
              }}
              disabled={locked}
            />{" "}
            Use explicit cancellation policy
          </label>
        </div>
        {isPolicies && (
          <>
            <div className="activity-policy-field">
              <b>Cancellation policy</b>
              <div className="experience-segmented policy-preset-chips">
                {cancellationPresetOptions.map((option) => (
                  <button
                    type="button"
                    key={option.value}
                    className={
                      revisionForm.cancellationPreset === option.value
                        ? "active"
                        : ""
                    }
                    onClick={() => selectCancellationPreset(option.value)}
                    disabled={locked}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <small className="experience-help">
                Shown to the customer as the refund policy. Choose Custom to
                edit the rules below.
              </small>
            </div>
            <div className="policy-summary-table">
              <div>
                <span>If cancelled</span>
                <span>Refund to customer</span>
              </div>
              {cancellationRules.map((rule, index) => (
                <div key={"policy-" + index}>
                  <span>
                    {rule.maxDaysBefore
                      ? rule.minDaysBefore +
                        " to " +
                        rule.maxDaysBefore +
                        " days before"
                      : rule.minDaysBefore + " or more days before"}
                  </span>
                  <b>
                    {rule.chargeType === "PERCENTAGE"
                      ? Math.max(0, 100 - Number(rule.chargeValue || 0)) + "%"
                      : "Configured"}
                  </b>
                </div>
              ))}
            </div>
            <div className="experience-form-grid two">
              <div className="activity-policy-field">
                <b>Traveller details required</b>
                <div className="experience-segmented policy-detail-chips">
                  {travellerDetailOptions.map((detail) => (
                    <button
                      type="button"
                      key={detail}
                      className={
                        revisionForm.travellerDetails
                          .split(",")
                          .map((item) => item.trim())
                          .includes(detail)
                          ? "active"
                          : ""
                      }
                      onClick={() => toggleTravellerDetail(detail)}
                      disabled={locked}
                    >
                      {detail}
                    </button>
                  ))}
                </div>
                <small className="experience-help">
                  Ferries may need ID for every traveller.
                </small>
              </div>
              <Field label="Amendments">
                <select
                  value={revisionForm.amendmentPolicy}
                  onChange={(e) => {
                    onRevisionChange(
                      "amendmentPolicy",
                      e.target.value as typeof revisionForm.amendmentPolicy,
                    );
                    dirty();
                  }}
                  disabled={locked}
                >
                  <option value="DATE_CHANGE_24H">
                    Date change free up to 24h before
                  </option>
                  <option value="NO_AMENDMENTS">No amendments</option>
                  <option value="CANCEL_REBOOK">
                    Treat as cancel + rebook
                  </option>
                </select>
              </Field>
            </div>
          </>
        )}
        {cancellationEnabled && (
          <>
            <div className="activity-cancellation-grid">
              {cancellationRules.map((rule, index) => (
                <div className="activity-cancellation-row" key={index}>
                  <Field label="Minimum days before">
                    <input
                      type="number"
                      min="0"
                      value={rule.minDaysBefore}
                      onChange={(e) => {
                        updateCancellation(
                          index,
                          "minDaysBefore",
                          e.target.value,
                        );
                        setBookingRulesTouched(true);
                      }}
                      disabled={locked}
                    />
                  </Field>
                  <Field label="Maximum days before">
                    <input
                      type="number"
                      min="0"
                      value={rule.maxDaysBefore}
                      onChange={(e) => {
                        updateCancellation(
                          index,
                          "maxDaysBefore",
                          e.target.value,
                        );
                        setBookingRulesTouched(true);
                      }}
                      disabled={locked}
                      placeholder="No upper limit"
                    />
                  </Field>
                  <Field label="Charge">
                    <input
                      type="number"
                      min="0"
                      value={rule.chargeValue}
                      onChange={(e) => {
                        updateCancellation(
                          index,
                          "chargeValue",
                          e.target.value,
                        );
                        setBookingRulesTouched(true);
                      }}
                      disabled={locked}
                    />
                  </Field>
                  <select
                    aria-label={`Cancellation rule ${index + 1} charge type`}
                    value={rule.chargeType}
                    onChange={(e) => {
                      updateCancellation(index, "chargeType", e.target.value);
                      setBookingRulesTouched(true);
                    }}
                    disabled={locked}
                  >
                    <option value="PERCENTAGE">Percent</option>
                    <option value="ABSOLUTE">Fixed amount</option>
                  </select>
                  <button
                    type="button"
                    className="btn small activity-cancellation-remove"
                    onClick={() => removeCancellationRule(index)}
                    disabled={locked || cancellationRules.length <= 1}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
            <div className="activity-cancellation-actions">
              <button
                type="button"
                className="btn small"
                onClick={addCancellationRule}
                disabled={locked}
              >
                + Add cancellation rule
              </button>
            </div>
          </>
        )}
      </details>
      {!locked && (
        <div className="experience-step-card activity-prices-actions">
          <div>
            <b>
              {saved
                ? "Prices and availability saved"
                : loadingExisting
                  ? "Loading existing rates…"
                  : "Review before continuing"}
            </b>
            <small>
              {saved
                ? "Use Edit later to change these same fields."
                : "Preview the affected options and sessions, then save the complete batch."}
            </small>
          </div>
          <div className="experience-footer-actions">
            <button
              type="button"
              className="btn"
              disabled={busy || !rows.length}
              onClick={() => {
                setShowExistingRates((value) => !value);
                if (!preview) void runPreview();
              }}
            >
              {showExistingRates
                ? "Hide existing rates"
                : "View existing rates"}
            </button>
            <button
              type="button"
              className="btn"
              disabled={busy || !rows.length}
              onClick={() => void runPreview()}
            >
              Preview changes
            </button>
            <button
              type="button"
              className="btn accent"
              disabled={busy || !rows.length}
              onClick={() => void saveAll()}
            >
              {busy ? "Saving…" : saved ? "Save changes" : "Save all prices"}
            </button>
          </div>
          {preview && (
            <div
              className={`activity-preview ${preview.valid ? "valid" : "invalid"}`}
            >
              <b>
                {preview.valid ? "Preview valid" : "Preview needs attention"}
              </b>
              {preview.summary && (
                <span>
                  {preview.summary.optionCount} options ·{" "}
                  {preview.summary.affectedDates ?? 0} applicable date(s) ·{" "}
                  {preview.summary.availabilityCount ?? 0} schedule(s) ·{" "}
                  {preview.summary.existingRateCount ?? 0} existing rate
                  version(s)
                </span>
              )}
              {preview.inventoryWarnings?.length ? (
                <span>
                  {preview.inventoryWarnings
                    .map((warning: any) => warning.message)
                    .join(" ")}
                </span>
              ) : null}
              {preview.conflicts?.length ? (
                <div className="activity-preview-conflicts">
                  <b>History handling</b>
                  {preview.conflicts.map((conflict, index) => (
                    <span key={`${conflict.type || "conflict"}-${index}`}>
                      {conflict.message}
                    </span>
                  ))}
                </div>
              ) : null}
              {preview.errors.length > 0 && (
                <span>{preview.errors.join(" ")}</span>
              )}
              {showExistingRates && (
                <div className="activity-preview-details">
                  <b>Existing rates</b>
                  {preview.previousRates?.length ? (
                    preview.previousRates.map((rate: any, index: number) => (
                      <div key={`${rate.variantId}-${index}`}>
                        <span>
                          {byId.get(rate.variantId)?.name || rate.variantId} ·{" "}
                          {rate.ratePlanName ||
                            rate.ratePlanCode ||
                            "Rate plan"}
                        </span>
                        <small>
                          {rate.effectiveFrom
                            ? `${String(rate.effectiveFrom).slice(0, 10)} → ${rate.effectiveTo ? String(rate.effectiveTo).slice(0, 10) : "open"} · ${rate.pricingUnit || "pricing"}`
                            : "No effective dates"}
                        </small>
                      </div>
                    ))
                  ) : (
                    <span>
                      No existing active or draft rates were found for the
                      selected options.
                    </span>
                  )}
                  {preview.unchangedFields?.length ? (
                    <small>
                      Preserved: {preview.unchangedFields.join(", ")}.
                    </small>
                  ) : null}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
