import { describe, it, expect } from 'vitest';

import { DEFAULT_FERRIES } from '../data/liveFerries';

describe('live ferry seed data', () => {
  it('provides at least one vessel with a route label', () => {
    expect(DEFAULT_FERRIES.length).toBeGreaterThan(0);
    for (const ferry of DEFAULT_FERRIES) {
      expect(ferry.name.length).toBeGreaterThan(0);
      expect(ferry.routeName.length).toBeGreaterThan(0);
    }
  });

  it('gives every vessel a hex colour and a valid heading', () => {
    for (const ferry of DEFAULT_FERRIES) {
      expect(ferry.color).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(ferry.heading).toBeGreaterThanOrEqual(0);
      expect(ferry.heading).toBeLessThan(360);
    }
  });

  it('keeps names within the entity length limit', () => {
    for (const ferry of DEFAULT_FERRIES) {
      expect(ferry.name.length).toBeLessThanOrEqual(100);
      expect(ferry.routeName.length).toBeLessThanOrEqual(60);
    }
  });
});
