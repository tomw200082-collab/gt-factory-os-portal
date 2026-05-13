import { afterEach, describe, it, expect, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import * as Tooltip from '@radix-ui/react-tooltip';
import type { ReactNode } from 'react';
import { ReconcileBadge } from './ReconcileBadge';

function renderWithTooltipProvider(ui: ReactNode) {
  return render(<Tooltip.Provider>{ui}</Tooltip.Provider>);
}

afterEach(() => {
  cleanup();
});

describe('ReconcileBadge', () => {
  it('renders a button with the label "Reconcile"', () => {
    renderWithTooltipProvider(
      <ReconcileBadge floorGap={5} uom="unit" onClick={() => {}} />,
    );
    expect(
      screen.getByRole('button', { name: /reconcile/i }),
    ).toBeInTheDocument();
  });

  it('carries a short aria-label including the gap magnitude', () => {
    renderWithTooltipProvider(
      <ReconcileBadge floorGap={5} uom="unit" onClick={() => {}} />,
    );
    const btn = screen.getByRole('button', { name: /reconcile/i });
    expect(btn).toHaveAttribute(
      'aria-label',
      expect.stringMatching(/reconcile.*5.*unit/i),
    );
  });

  it('shows tooltip content on focus', async () => {
    const user = userEvent.setup();
    renderWithTooltipProvider(
      <ReconcileBadge floorGap={5} uom="unit" onClick={() => {}} />,
    );
    await user.tab(); // focus the badge
    // Radix renders the tooltip in a portal; on open it mounts BOTH a visible
    // content node AND a visually-hidden a11y mirror, so we expect ≥1 matches.
    const matches = await screen.findAllByText(
      /recorded outflows exceed receipts by 5\b.*unit/i,
    );
    expect(matches.length).toBeGreaterThan(0);
  });

  it('calls onClick when activated', async () => {
    const handler = vi.fn();
    const user = userEvent.setup();
    renderWithTooltipProvider(
      <ReconcileBadge floorGap={5} uom="unit" onClick={handler} />,
    );
    await user.click(screen.getByRole('button', { name: /reconcile/i }));
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('renders as a non-interactive span when disabled', () => {
    renderWithTooltipProvider(
      <ReconcileBadge
        floorGap={5}
        uom="unit"
        onClick={() => {}}
        disabled
      />,
    );
    expect(screen.queryByRole('button', { name: /reconcile/i })).toBeNull();
    expect(screen.getByText(/reconcile/i)).toBeInTheDocument();
  });
});
