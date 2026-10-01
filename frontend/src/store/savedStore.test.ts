import { describe, it, expect } from 'vitest';
import { useSavedStore } from './savedStore';

const car = { id: 'a', title: '2022 Honda Accord', price: '80.00 USD/day', place: 'SF' };

describe('savedStore', () => {
  it('saves then unsaves the same car on repeated toggle', () => {
    useSavedStore.getState().toggle(car);
    expect(useSavedStore.getState().cars.a).toBeDefined();
    useSavedStore.getState().toggle(car);
    expect(useSavedStore.getState().cars.a).toBeUndefined();
  });
});
