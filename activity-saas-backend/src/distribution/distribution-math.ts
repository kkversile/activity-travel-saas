export function channelPublishedCapacity(canonicalRemaining: number, capacityBuffer: number, maxPublishedCapacity?: number | null) {
  const buffered = Math.max(0, canonicalRemaining - Math.max(0, capacityBuffer));
  return Math.min(maxPublishedCapacity ?? Number.MAX_SAFE_INTEGER, buffered);
}

export function channelAvailability(canonicalRemaining: number, capacityBuffer: number, maxPublishedCapacity?: number | null, open = true) {
  return { available: open && channelPublishedCapacity(canonicalRemaining, capacityBuffer, maxPublishedCapacity) > 0, remainingCapacity: channelPublishedCapacity(canonicalRemaining, capacityBuffer, maxPublishedCapacity) };
}
