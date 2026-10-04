import { useMemo } from 'react';
import { useDatasetScope, type HierarchyFilter } from '../lib/ActiveDatasetContext';
import { Select, type SelectOption } from '../lib/ui';
import type {
  DatasetHierarchy,
  HierarchyBuildingNode,
  HierarchyDevice,
  HierarchyFloor,
  HierarchyRoom,
} from '../lib/api/types';

/**
 * The global estate scope.
 *
 * Every enterprise analytics product has one of these permanently on screen:
 * Grafana's variable pickers, Power BI's slicers, EcoStruxure's asset selector.
 * They exist because the single most disorienting thing an operations tool can
 * do is lose your place — you narrow to one chiller, follow a link, and come
 * back to the whole campus with no memory that you ever left.
 *
 * EcoMind had no such control. Scope lived in React state inside individual
 * pages, so navigating anywhere discarded it, and no page could even *name*
 * the buildings and floors it was filtering by. That is why the product read as
 * a reader rather than a platform: you could look at data, but you could not
 * hold a question about one part of the estate across two screens.
 *
 * This bar is the answer, and it is deliberately dumb: it owns no data of its
 * own, reads the hierarchy the server returned, and writes one filter. Cascading
 * is derived from the nested tree rather than from flat code lists, because a
 * room dropdown that lists rooms from every building will happily produce a
 * scope matching nothing.
 */

type LevelKey = keyof HierarchyFilter;

/** Render order and human wording. Absence of a level is honoured, not faked. */
const LEVELS: readonly { key: LevelKey; label: string; placeholder: string }[] = [
  { key: 'building', label: 'Building', placeholder: 'All buildings' },
  { key: 'floor', label: 'Floor', placeholder: 'All floors' },
  { key: 'room', label: 'Room', placeholder: 'All rooms' },
  { key: 'device', label: 'Device', placeholder: 'All devices' },
];

type DeviceNode = HierarchyDevice;
type RoomNode = HierarchyRoom;
type FloorNode = HierarchyFloor;
type BuildingNode = HierarchyBuildingNode;

/** Prefer the human name for a device; fall back to the code when unnamed. */
function deviceLabel(d: DeviceNode): string {
  const cat = d.category ? d.category.replace(/_/g, ' ') : '';
  return d.name && d.name !== d.code ? `${d.name} — ${cat}` : `${d.code}${cat ? ` — ${cat}` : ''}`;
}

/**
 * Reduce the tree to whatever the current filter still admits.
 *
 * Each level's options are derived from the parent's *selection*, not from the
 * full estate, so choosing a building immediately narrows the floors to that
 * building's three rather than offering six across the campus.
 */
function optionsFor(tree: BuildingNode[], filter: HierarchyFilter) {
  const buildings: SelectOption[] = tree.map((b) => ({ value: b.code, label: b.name }));

  const scopedBuildings = filter.building ? tree.filter((b) => b.code === filter.building) : tree;
  const floors: SelectOption[] = scopedBuildings
    .flatMap((b) => b.floors.map((f) => ({ f, b })))
    .map(({ f, b }) => ({
      value: f.floor_no,
      // Floor numbers repeat across buildings, so the parent is named here.
      // Without it the dropdown reads "1, 2, 3" and cannot be told apart.
      label: `${b.name} · floor ${f.floor_no}${f.floor_type ? ` (${f.floor_type.replace(/_/g, ' ')})` : ''}`,
    }));

  const scopedFloors = scopedBuildings
    .flatMap((b) => b.floors)
    .filter((f) => (filter.floor ? f.floor_no === filter.floor : true));
  const rooms: SelectOption[] = scopedFloors
    .flatMap((f) => f.rooms)
    .map((r) => ({
      value: r.code,
      label: `${r.code} — ${r.room_type ? r.room_type.replace(/_/g, ' ') : 'room'}`,
    }));

  // Devices reachable from the current room/floor selection.
  //
  // The tree repeats a device at each level it belongs to so the navigator can
  // render it in place, which means a naive walk collects every device three
  // times: the estate's 102 devices became 306 dropdown entries. Dedupe by code,
  // keeping first appearance so the order stays depth-first.
  const seen = new Set<string>();
  const unique = (list: DeviceNode[]): DeviceNode[] =>
    list.filter((d) => {
      if (seen.has(d.code)) return false;
      seen.add(d.code);
      return true;
    });

  const devices: SelectOption[] = (() => {
    if (filter.room) {
      return unique(
        scopedFloors
          .flatMap((f) => f.rooms)
          .filter((r) => r.code === filter.room)
          .flatMap((r) => r.devices),
      ).map((d) => ({ value: d.code, label: deviceLabel(d) }));
    }
    if (filter.floor) {
      return unique(
        scopedFloors
          .filter((f) => f.floor_no === filter.floor)
          .flatMap((f) => [...f.devices, ...f.rooms.flatMap((r) => r.devices)]),
      ).map((d) => ({ value: d.code, label: deviceLabel(d) }));
    }
    return unique(
      scopedBuildings.flatMap((b) => [
        ...b.devices,
        ...b.floors.flatMap((f) => [...f.devices, ...f.rooms.flatMap((r) => r.devices)]),
      ]),
    ).map((d) => ({ value: d.code, label: deviceLabel(d) }));
  })();

  return { buildings, floors, rooms, devices };
}

export function ScopeBar({ hierarchy }: { hierarchy?: DatasetHierarchy | null }) {
  const { filter, drill, resetFilter, dataset } = useDatasetScope();
  const tree = useMemo(() => (hierarchy?.tree ?? []) as BuildingNode[], [hierarchy]);

  const opts = useMemo(() => optionsFor(tree, filter), [tree, filter]);
  const byKey: Record<LevelKey, SelectOption[]> = {
    building: opts.buildings,
    floor: opts.floors,
    room: opts.rooms,
    device: opts.devices,
  };

  // A dataset with no tree (meter-level BDG2, or a still-loading fetch) offers
  // nothing rather than a control that cannot do anything.
  if (!dataset || tree.length === 0) return null;

  const active = LEVELS.filter((l) => Boolean(filter[l.key]));
  const deepest = active.length > 0 ? active[active.length - 1] : null;

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-[var(--line)] bg-[var(--surface-1)] px-4 py-2">
      <span className="text-2xs font-semibold uppercase tracking-wide text-neutral-500">Scope</span>

      {LEVELS.map(({ key, label, placeholder }) => {
        const options = byKey[key];
        // Hide a level the dataset cannot resolve, and hide one with nothing
        // under it. BDG2 has no floors or rooms; offering them would be fiction.
        if (options.length === 0) return null;
        const value = filter[key] ?? '';
        return (
          <div key={key} className="flex items-center gap-1.5">
            {deepest && active.some((a) => a.key === key) && key !== deepest.key && (
              <span aria-hidden className="text-2xs text-neutral-400">
                ›
              </span>
            )}
            <Select
              label={<span className="sr-only">{label} scope</span>}
              value={value}
              placeholder={placeholder}
              onChange={(next) => drill(key, next || null)}
              options={options}
              className="min-w-[9rem]"
            />
          </div>
        );
      })}

      {deepest && (
        <button
          type="button"
          onClick={resetFilter}
          className="rounded border border-[var(--line)] px-2 py-1 text-2xs font-medium text-neutral-600 hover:bg-[var(--surface-2)]"
        >
          Clear scope
        </button>
      )}

      {deepest && (
        <span className="ml-auto text-2xs text-neutral-500">
          Showing <span className="font-medium text-neutral-700">{filter[deepest.key]}</span> ·{' '}
          {dataset.name}
        </span>
      )}
    </div>
  );
}
