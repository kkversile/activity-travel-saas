import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../api';
import AdminCommercial from './AdminCommercial';

afterEach(() => vi.restoreAllMocks());

describe('Admin commercial page permissions', () => {
  it('loads draft rules for a normal Admin without requesting Super Admin guardrails', async () => {
    const request = vi.spyOn(api, 'request').mockImplementation(async (path: string) => {
      if (path === '/admin/commercial-rules') return [{
        id: 'rule-1',
        code: 'ACTIVITY-MARGIN-product-1',
        name: 'Activity margin override: QA activity',
        kind: 'VOYA_REVENUE',
        scopeType: 'PRODUCT',
        versions: [{ id: 'version-1', versionNumber: 1, status: 'DRAFT', effectiveFrom: '2026-11-02T00:00:00.000Z', priority: 0, config: { model: 'MARKUP_PERCENT', percent: '12.5' }, createdById: 'admin-1' }],
      }] as never;
      if (path === '/admin/agent-groups') return [] as never;
      throw new Error(`Unexpected API request: ${path}`);
    });

    render(<AdminCommercial canApprove currentUserId="admin-1" />);

    expect(await screen.findByText(/ACTIVITY-MARGIN-product-1/)).toBeInTheDocument();
    expect(screen.getByText(/v1 · DRAFT/)).toBeInTheDocument();
    expect(screen.queryByText('Commercial guardrails')).not.toBeInTheDocument();
    expect(request).toHaveBeenCalledWith('/admin/commercial-rules');
    expect(request).not.toHaveBeenCalledWith('/admin/settings/commercial-guardrails');
  });
});
