import { describe, it, expect } from 'vitest';

import { DEFAULT_SITES } from '../data/harbourSites';

describe('harbour sites seed data', () => {
  it('includes the signature Sydney Harbour landmarks', () => {
    const names = DEFAULT_SITES.map((s) => s.name);
    expect(names).toContain('Sydney Opera House');
    expect(names).toContain('Sydney Harbour Bridge');
    expect(names).toContain('Circular Quay');
  });

  it('has a contiguous, unique, zero-based route order', () => {
    const orders = DEFAULT_SITES.map((s) => s.routeOrder).sort((a, b) => a - b);
    orders.forEach((order, index) => {
      expect(order).toBe(index);
    });
  });

  it('gives every site a hex colour and a non-empty description', () => {
    for (const site of DEFAULT_SITES) {
      expect(site.color).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(site.description.length).toBeGreaterThan(0);
      expect(site.name.length).toBeLessThanOrEqual(100);
      expect(site.description.length).toBeLessThanOrEqual(300);
    }
  });
});
