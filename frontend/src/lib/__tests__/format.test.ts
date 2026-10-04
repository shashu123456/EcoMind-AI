import { describe, it, expect } from 'vitest';
import { co2Kg, co2Tonnes, energy } from '../format';

describe('co2Kg', () => {
  // The backend records every `*_co2_kg` field in kilograms, so this is the
  // formatter those fields need. It used to be co2Tonnes, which prints the
  // raw number and appends "t" -- 461,733 kg rendered as "461,733.64 t".
  it('converts kilograms to tonnes once past a thousand', () => {
    expect(co2Kg(461733.64)).toBe('461.73 t');
    expect(co2Kg(1000)).toBe('1.00 t');
    expect(co2Kg(57_281)).toBe('57.28 t');
  });

  it('stays in kilograms below a tonne', () => {
    expect(co2Kg(999)).toBe('999.0 kg');
    expect(co2Kg(12.34)).toBe('12.3 kg');
  });

  it('converts a per-kWh multiplication into tonnes, not a five-digit kg figure', () => {
    // The Anomalies grid renders `excess_kwh * 0.5` through this. Before the
    // split that landed in co2Tonnes and printed "2,222.55 t".
    expect(co2Kg(4445.1 * 0.5)).toBe('2.22 t');
  });

  it('converts a negative value by magnitude', () => {
    expect(co2Kg(-461733.64)).toBe('-461.73 t');
  });

  it('falls back rather than printing NaN', () => {
    expect(co2Kg(null)).toBe('—');
    expect(co2Kg(undefined)).toBe('—');
    expect(co2Kg('not a number')).toBe('—');
  });
});

describe('co2Tonnes', () => {
  it('takes a value already in tonnes and does not scale it', () => {
    expect(co2Tonnes(1483.24)).toBe('1,483.24 t');
  });

  it('renders a sub-tonne value as a thousand kilograms', () => {
    expect(co2Tonnes(0.5)).toBe('500 kg');
  });
});

describe('energy', () => {
  // The input is always kWh. A ladder that divided by 1e3 for the "kWh" step
  // made every value between 1,000 and 1,000,000 kWh wrong by 1000x.
  it('leaves values below a thousand kWh alone', () => {
    expect(energy(0)).toBe('0.0 kWh');
    expect(energy(62.15)).toBe('62.2 kWh');
    expect(energy(999)).toBe('999.0 kWh');
  });

  it('does not divide the mid range by a thousand', () => {
    // 76,956 kWh is ~77 MWh, never "76.96 kWh".
    expect(energy(76956)).toBe('76,956.0 kWh');
    expect(energy(114562)).toBe('1,14,562.0 kWh');
  });

  it('switches to MWh at a million and GWh at a billion', () => {
    expect(energy(1e6)).toBe('1.00 MWh');
    expect(energy(2966473)).toBe('2.97 MWh');
    expect(energy(1e9)).toBe('1.00 GWh');
    expect(energy(2.5e9)).toBe('2.50 GWh');
  });

  it('handles negatives by magnitude', () => {
    expect(energy(-2e6)).toBe('-2.00 MWh');
  });

  it('falls back rather than printing NaN', () => {
    expect(energy(null)).toBe('—');
    expect(energy(undefined)).toBe('—');
  });
});
