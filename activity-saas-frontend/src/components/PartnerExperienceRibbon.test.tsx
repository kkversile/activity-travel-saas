import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PartnerExperienceRibbon from './PartnerExperienceRibbon';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Voya experience ribbons', () => {
  it('offers a labelled gallery and hides loop copies from assistive technology', () => {
    render(<PartnerExperienceRibbon />);
    const gallery = screen.getByRole('region', { name: 'An experience for every kind of day.' });
    const firstGroup = gallery.querySelector('.partner-ribbon-group') as HTMLElement;
    expect(within(firstGroup).getAllByRole('listitem')).toHaveLength(8);
    expect(within(firstGroup).getByText('Cultural shows')).toBeInTheDocument();
    for (const clone of gallery.querySelectorAll('[data-clone=true]')) expect(clone).toHaveAttribute('aria-hidden', 'true');
    expect(gallery.querySelectorAll('.partner-ribbon-row')[1]).toHaveAttribute('aria-hidden', 'true');
    fireEvent.click(screen.getByText('Photo credits', { exact: true }));
    expect(screen.getByRole('link', { name: 'Varkala Cliff by KS' })).toHaveAttribute('href', 'https://commons.wikimedia.org/wiki/File:Varkala_Cliff_by_KS.jpg');
  });

  it('stops offscreen work and resumes when the gallery becomes visible', () => {
    let notify!: IntersectionObserverCallback;
    const disconnect = vi.fn();
    vi.stubGlobal('IntersectionObserver', class {
      constructor(callback: IntersectionObserverCallback) { notify = callback; }
      observe = vi.fn(); disconnect = disconnect;
    });
    const { unmount } = render(<PartnerExperienceRibbon />);
    const gallery = screen.getByRole('region');
    act(() => notify([{ isIntersecting: false } as IntersectionObserverEntry], {} as IntersectionObserver));
    expect(gallery).toHaveAttribute('data-paused', 'true');
    act(() => notify([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver));
    expect(gallery).toHaveAttribute('data-paused', 'false');
    unmount(); expect(disconnect).toHaveBeenCalledOnce();
  });
});
