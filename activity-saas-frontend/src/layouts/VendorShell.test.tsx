import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import VendorShell from './VendorShell';
import { partnerHubNavigation } from './vendorNavigation';

describe('VendorShell navigation', () => {
  it('keeps Add product active while editing a product', () => {
    render(
      <VendorShell
        activeKey="edit-product"
        navItems={partnerHubNavigation}
        vendorName="Goa Coastal"
        statusLabel="Vendor"
        onNavigate={vi.fn()}
        onSignOut={vi.fn()}
        onChangePassword={vi.fn()}
      >
        <div>Edit product</div>
      </VendorShell>,
    );

    expect(screen.getByRole('button', { name: 'Add product' })).toHaveClass('active');
    expect(screen.getByRole('button', { name: 'Products' })).not.toHaveClass('active');
  });
});
