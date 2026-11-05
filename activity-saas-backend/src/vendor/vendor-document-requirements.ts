export type VendorDocumentProduct = { type?: string | null; subType?: string | null; category?: string | null; subCategory?: string | null };

export function requiredVendorDocumentsForProduct(categoriesInput: unknown, product?: VendorDocumentProduct | null) {
  const categories = new Set(String(categoriesInput || '').split(',').map((value) => value.trim().toLowerCase()).filter(Boolean));
  const searchable = [product?.type, product?.subType, product?.category, product?.subCategory].filter(Boolean).join(' ').toLowerCase();
  const required = new Set<string>(['PUBLIC_LIABILITY_INSURANCE']);
  if (categories.has('day tours') || categories.has('attractions') || categories.has('camping')) required.add('TOURISM_REGISTRATION');
  if (categories.has('cruises & boats') || /cruise|boat|yacht|ferry/.test(searchable)) required.add('BOAT_LICENSE');
  if (categories.has('water sports') || categories.has('adventure') || /water sport|adventure/.test(searchable)) required.add('ADVENTURE_WATER_SPORTS_LICENSE');
  if (String(product?.type || '').toUpperCase() === 'TRANSFER' || /transport activity/.test(searchable)) required.add('VEHICLE_PERMIT');
  if (String(product?.type || '').toUpperCase() === 'MEALS' || /food|meal/.test(searchable)) required.add('FSSAI_LICENSE');
  return [...required];
}
