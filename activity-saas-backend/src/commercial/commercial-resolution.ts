import { ConflictException } from '@nestjs/common';

export function selectEffectiveVersion<T extends { effectiveFrom: Date; effectiveTo: Date | null }>(versions: T[], serviceDate: Date): T | null {
  const effective = versions.filter((version) => version.effectiveFrom <= serviceDate && (!version.effectiveTo || version.effectiveTo > serviceDate));
  if (effective.length > 1) throw new ConflictException({ code: 'AMBIGUOUS_RULE', message: 'More than one active commercial version is effective for the service date' });
  return effective[0] || null;
}
