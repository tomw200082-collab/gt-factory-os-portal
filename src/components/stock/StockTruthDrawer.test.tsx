import { afterEach, describe, it, expect, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@testing-library/jest-dom/vitest';
import type { ReactNode } from 'react';
import { StockTruthDrawer } from './StockTruthDrawer';

function renderWithQuery(ui: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

const baseProps = {
  itemId: 'X-001',
  itemType: 'FG',
  displayName: 'Test Beverage',
  onHandRaw: '-5',
  floorGap: '5',
  uom: 'unit',
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('StockTruthDrawer', () => {
  it('does not render when closed', () => {
    renderWithQuery(
      <StockTruthDrawer {...baseProps} open={false} onClose={() => {}} />,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders math summary, title, and ledger event when open', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        rows: [
          {
            movement_id: 'm1',
            movement_type: 'WASTE_POSTED',
            item_type: 'FG',
            item_id: 'X-001',
            qty_delta: '-5',
            uom: 'unit',
            event_at: '2026-05-10T10:00:00Z',
            posted_at: '2026-05-10T10:00:00Z',
            post_status: 'POSTED',
            reported_by_snapshot: 'Alex',
          },
        ],
        count: 1,
        total_matching: 1,
      }),
    } as Response);

    renderWithQuery(
      <StockTruthDrawer {...baseProps} open={true} onClose={() => {}} />,
    );

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    // Title in the canonical Drawer header.
    expect(screen.getByText('Test Beverage')).toBeInTheDocument();
    expect(
      screen.getByText(/More outflows recorded than receipts/i),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText('WASTE_POSTED')).toBeInTheDocument();
    });
    // CTA opens in a new tab (INTER-002).
    const cta = screen.getByRole('link', { name: /Post corrective Goods Receipt/i });
    expect(cta).toHaveAttribute('target', '_blank');
    expect(cta).toHaveAttribute('rel', expect.stringContaining('noopener'));

    fetchSpy.mockRestore();
  });

  it('renders Try again button on error and calls refetch (INTER-003)', async () => {
    const fetchSpy = vi
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ rows: [], count: 0, total_matching: 0 }),
      } as Response);

    renderWithQuery(
      <StockTruthDrawer {...baseProps} open={true} onClose={() => {}} />,
    );

    const retry = await screen.findByRole('button', { name: /try again/i });
    expect(retry).toBeInTheDocument();
    // Raw API code is not surfaced in the default error state.
    expect(screen.queryByText(/LEDGER_FETCH_500/)).toBeNull();

    fetchSpy.mockRestore();
  });

  it('renders the no-events disabled CTA when ledger is empty (INTER-004)', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ rows: [], count: 0, total_matching: 0 }),
    } as Response);

    renderWithQuery(
      <StockTruthDrawer {...baseProps} open={true} onClose={() => {}} />,
    );

    // GR link should not be present.
    await waitFor(() => {
      expect(
        screen.queryByRole('link', { name: /Post corrective Goods Receipt/i }),
      ).toBeNull();
    });
    // With no ledger events the corrective CTA is a physical-count link.
    const countLink = await screen.findByRole('link', {
      name: /Post physical count/i,
    });
    expect(countLink).toBeInTheDocument();
    expect(countLink).toHaveAttribute(
      'href',
      expect.stringContaining('/stock/physical-count'),
    );

    fetchSpy.mockRestore();
  });
});
