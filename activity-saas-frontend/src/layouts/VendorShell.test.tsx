import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import VendorShell from './VendorShell';
import { partnerHubNavigation } from './vendorNavigation';

describe('VendorShell navigation', () => {
  it('explains unavailable operational pages while keeping draft products accessible', () => {
    const navigate = vi.fn();
    render(<VendorShell activeKey="onboarding" navItems={partnerHubNavigation} onboardingStatus="DRAFT" vendorName="Goa Coastal" statusLabel="Draft" onNavigate={navigate} onSignOut={vi.fn()} onChangePassword={vi.fn()}><div>Onboarding</div></VendorShell>);
    const bookings = screen.getByRole('button', { name: 'Bookings After approval' });
    expect(bookings).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(bookings);
    expect(navigate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Products' }));
    expect(navigate).toHaveBeenCalledWith('products');
  });
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
