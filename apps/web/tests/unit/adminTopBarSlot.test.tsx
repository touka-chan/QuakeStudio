import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  AdminTopBarActions,
  AdminTopBarSlotProvider,
  AdminTopBarSlotTarget,
} from '@/admin/AdminTopBarSlot';

/*
 * The feedback export lives in the top bar while it stays owned by the page.
 * If the portal did not land in the target, the button would silently vanish
 * from the workspace — so the slot gets its own small test.
 */
describe('admin top bar slot', () => {
  it('renders page actions inside the top bar target', () => {
    render(
      <AdminTopBarSlotProvider>
        <div data-testid="top-bar">
          <AdminTopBarSlotTarget />
        </div>
        <AdminTopBarActions>
          <button type="button">Export Excel</button>
        </AdminTopBarActions>
      </AdminTopBarSlotProvider>,
    );

    const button = screen.getByRole('button', { name: 'Export Excel' });
    expect(button.closest('[data-testid="top-bar"]')).not.toBeNull();
  });

  it('renders nothing when no provider is mounted', () => {
    const { container } = render(
      <AdminTopBarActions>
        <button type="button">Export Excel</button>
      </AdminTopBarActions>,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
