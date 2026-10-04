// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ScopeBar } from '../../app/ScopeBar';
import { ActiveDatasetProvider, type ActiveDataset } from '../ActiveDatasetContext';
import type { DatasetHierarchy, HierarchyBuildingNode } from '../api/types';

/**
 * Two real bugs shipped in this component before, both found by hand in a
 * browser and neither caught by a test. Both are pinned here:
 *
 *   1. the device dropdown listed 306 entries for 102 devices, because the
 *      hierarchy repeats a device at every level it belongs to; and
 *   2. floor and room `<option>`s were keyed on a bare code, which is unique
 *      only within its parent, so the same floor appeared twice and React
 *      flagged duplicate keys.
 *
 * The fixture is deliberately small and exactly shaped: two buildings, two
 * floors each, and one shared device code repeated at three levels. Repetition
 * is the thing under test, so it is modelled rather than tidied away.
 */

const dataset: ActiveDataset = {
  id: 'ds-1',
  name: 'Fault Simulation Campus',
  granularity: 'asset',
  rowCount: 220466,
  topLevel: 'building',
};

const sharedDevice = {
  code: 'MTR-1',
  name: 'Energy Meter',
  category: 'meter',
};

const tree = [
  {
    code: 'BLD-A',
    name: 'Riverside Office',
    building_type: 'office',
    gross_area_sqm: 100,
    commissioned_year: 2010,
    rated_kw: 100,
    floors: [
      {
        floor_no: '1',
        floor_type: 'lobby',
        devices: [sharedDevice],
        rooms: [
          {
            code: 'A101',
            room_type: 'lobby',
            devices: [sharedDevice],
          },
        ],
      },
      {
        floor_no: '2',
        floor_type: 'open_plan',
        devices: [],
        rooms: [
          {
            code: 'A201',
            room_type: 'open_plan',
            devices: [{ code: 'HVAC-A201', name: 'Rooftop AHU', category: 'hvac' }],
          },
        ],
      },
    ],
    devices: [sharedDevice],
  },
  {
    code: 'BLD-B',
    name: 'Northgate Labs',
    building_type: 'lab',
    gross_area_sqm: 200,
    commissioned_year: 2015,
    rated_kw: 200,
    floors: [
      {
        floor_no: '1',
        floor_type: 'lobby',
        devices: [],
        rooms: [
          {
            code: 'B101',
            room_type: 'lobby',
            devices: [{ code: 'HVAC-B101', name: 'Rooftop AHU', category: 'hvac' }],
          },
        ],
      },
    ],
    devices: [],
  },
] as unknown as HierarchyBuildingNode[];

const hierarchy = {
  dataset_id: 'ds-1',
  granularity: 'asset',
  levels: [],
  buildings: [],
  tree,
} as unknown as DatasetHierarchy;

function renderScope() {
  return render(
    <ActiveDatasetProvider dataset={dataset}>
      <ScopeBar hierarchy={hierarchy} />
    </ActiveDatasetProvider>,
  );
}

const combo = (label: string) => screen.getByRole('combobox', { name: label });

describe('ScopeBar option identity', () => {
  it('gives every floor a unique option value across the whole estate', () => {
    renderScope();
    const floors = within(combo('Floor scope')).getAllByRole('option');
    const values = floors.map((o) => (o as HTMLOptionElement).value);
    // Three floors exist: A/1, A/2, B/1. The bug produced two options both
    // valued "1", which is why React flagged duplicate keys.
    expect(new Set(values).size).toBe(values.length);
  });

  it('prefixes floor and room values with their parent so a floor means one floor', () => {
    renderScope();
    const floorValues = within(combo('Floor scope'))
      .getAllByRole('option')
      .map((o) => (o as HTMLOptionElement).value);
    expect(floorValues).toContain('BLD-A|1');
    expect(floorValues).toContain('BLD-A|2');
    expect(floorValues).toContain('BLD-B|1');
  });

  it('gives every room a unique option value', () => {
    renderScope();
    const rooms = within(combo('Room scope'))
      .getAllByRole('option')
      .map((o) => (o as HTMLOptionElement).value);
    expect(new Set(rooms).size).toBe(rooms.length);
    expect(rooms).toContain('BLD-A|1|A101');
  });

  /**
   * The 306-entries bug. `sharedDevice` appears on the building, on its floor
   * and in its room, so a naive walk yields three copies of `MTR-1` for what is
   * one physical device.
   */
  it('lists each device once even though the tree repeats it at three levels', () => {
    renderScope();
    const devices = within(combo('Device scope'))
      .getAllByRole('option')
      .map((o) => (o as HTMLOptionElement).value)
      .filter(Boolean);
    expect(devices).toHaveLength(new Set(devices).size);
    expect(devices.filter((d) => d === 'MTR-1')).toHaveLength(1);
  });

  it('does not invent floors or rooms for a dataset with none', () => {
    render(
      <ActiveDatasetProvider dataset={dataset}>
        <ScopeBar hierarchy={null} />
      </ActiveDatasetProvider>,
    );
    expect(screen.queryByRole('combobox', { name: 'Floor scope' })).not.toBeInTheDocument();
  });
});

describe('ScopeBar cascading', () => {
  it('narrows floors to the chosen building rather than the whole estate', async () => {
    const user = userEvent.setup();
    renderScope();
    const before = within(combo('Floor scope')).getAllByRole('option').length;

    await user.selectOptions(combo('Building scope'), 'BLD-B');

    const after = within(combo('Floor scope'))
      .getAllByRole('option')
      .map((o) => (o as HTMLOptionElement).value)
      // '' is the "All floors" placeholder, which is a real choice and stays.
      .filter(Boolean);
    expect(after.length).toBeLessThan(before - 1);
    expect(after).toEqual(['BLD-B|1']);
  });

  it('stores the bare floor code, not the composite, so the backend can use it', async () => {
    // The select's value is composite for uniqueness; the filter that reaches
    // the backend must be the plain code. If this ever shows "BLD-A|1" in the
    // clear-scope readout, the wire contract has been broken.
    const user = userEvent.setup();
    renderScope();
    await user.selectOptions(combo('Building scope'), 'BLD-A');
    await user.selectOptions(combo('Floor scope'), 'BLD-A|2');

    expect(screen.getByRole('button', { name: /clear scope/i })).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.queryByText('BLD-A|2')).not.toBeInTheDocument();
  });

  it('offers a clear control only once something is scoped', () => {
    const { unmount } = renderScope();
    expect(screen.queryByRole('button', { name: /clear scope/i })).not.toBeInTheDocument();
    unmount();
  });
});
