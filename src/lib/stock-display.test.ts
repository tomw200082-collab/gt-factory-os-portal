import { describe, it, expect } from 'vitest';
import { clampedOnHand, isBelowFloor, floorGap } from './stock-display';

describe('clampedOnHand', () => {
  it('returns 0 for negative', () => {
    expect(clampedOnHand(-5)).toBe(0);
    expect(clampedOnHand(-0.0001)).toBe(0);
  });
  it('returns the value for zero or positive', () => {
    expect(clampedOnHand(0)).toBe(0);
    expect(clampedOnHand(0.5)).toBe(0.5);
    expect(clampedOnHand(100)).toBe(100);
  });
  it('handles string inputs', () => {
    expect(clampedOnHand('-5')).toBe(0);
    expect(clampedOnHand('10.5')).toBe(10.5);
    expect(clampedOnHand('0')).toBe(0);
  });
  it('returns NaN for non-numeric strings', () => {
    expect(Number.isNaN(clampedOnHand('not a number'))).toBe(true);
  });
});

describe('isBelowFloor', () => {
  it('is true for strictly negative', () => {
    expect(isBelowFloor(-1)).toBe(true);
    expect(isBelowFloor(-0.0001)).toBe(true);
    expect(isBelowFloor('-5')).toBe(true);
  });
  it('is false for zero and positive', () => {
    expect(isBelowFloor(0)).toBe(false);
    expect(isBelowFloor(0.5)).toBe(false);
    expect(isBelowFloor('10')).toBe(false);
  });
  it('is false for non-numeric inputs', () => {
    expect(isBelowFloor('xyz')).toBe(false);
  });
});

describe('floorGap', () => {
  it('returns magnitude for negative', () => {
    expect(floorGap(-5)).toBe(5);
    expect(floorGap(-0.5)).toBe(0.5);
    expect(floorGap('-12.3')).toBe(12.3);
  });
  it('returns 0 for zero and positive', () => {
    expect(floorGap(0)).toBe(0);
    expect(floorGap(100)).toBe(0);
  });
  it('returns 0 for non-numeric inputs', () => {
    expect(floorGap('xyz')).toBe(0);
  });
});
