export const DEFAULT_MIN_PLATFORM_MARGIN_PERCENT = 4;
export const DEFAULT_WEBSITE_GATEWAY_FEE_PERCENT = 1.8;

export function platformNetMarginAmount(input: {
  finalAmount: unknown;
  voyaRevenue: unknown;
  agentCommission: unknown;
  voyaPromotionFunding: unknown;
  channelCode?: string;
}, websiteGatewayFeePercent = DEFAULT_WEBSITE_GATEWAY_FEE_PERCENT): number | null {
  const finalAmount = Number(input.finalAmount);
  const voyaRevenue = Number(input.voyaRevenue);
  const agentCommission = Number(input.agentCommission ?? 0);
  const voyaPromotionFunding = Number(input.voyaPromotionFunding ?? 0);
  if (![finalAmount, voyaRevenue, agentCommission, voyaPromotionFunding].every(Number.isFinite) || finalAmount <= 0) return null;
  const gatewayFee = input.channelCode === "VOYA_WEB"
    ? finalAmount * websiteGatewayFeePercent / 100
    : 0;
  return voyaRevenue - agentCommission - voyaPromotionFunding - gatewayFee;
}

export function platformNetMarginPercent(input: Parameters<typeof platformNetMarginAmount>[0], websiteGatewayFeePercent = DEFAULT_WEBSITE_GATEWAY_FEE_PERCENT) {
  const amount = Number(input.finalAmount);
  const netMargin = platformNetMarginAmount(input, websiteGatewayFeePercent);
  return netMargin == null || !Number.isFinite(amount) || amount <= 0 ? null : netMargin / amount * 100;
}
