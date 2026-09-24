import { describe, it, expect } from 'vitest'
import { colLabel, normRows } from '../kit'

describe('colLabel', () => {
  it('passes plain string column names through', () => {
    expect(colLabel('energy_kwh')).toBe('energy_kwh')
    expect(colLabel('timestamp')).toBe('timestamp')
  })

  it('extracts name from backend column metadata objects', () => {
    expect(colLabel({ name: 'voltage_v', data_type: 'float' })).toBe('voltage_v')
    expect(colLabel({ name: 'asset_id', data_type: 'text' })).toBe('asset_id')
    expect(colLabel({ name: '' })).toBe('')
  })

  it('never throws on missing/unknown name fields', () => {
    expect(colLabel({} as { name?: string })).toBe('')
    expect(colLabel(undefined as unknown as { name?: string })).toBe('')
  })
})

describe('normRows', () => {
  const cols = ['timestamp', 'asset_id', 'energy_kwh'] as Array<string | { name: string }>

  it('keeps array rows untouched', () => {
    const rows = [['2024-01-01', 'BLDG-001', 4.38]]
    expect(normRows(rows, cols)).toEqual(rows)
  })

  it('flattens backend dict rows into column order', () => {
    const rows = [{ asset_id: 'BLDG-001', energy_kwh: 4.38, timestamp: '2024-01-01' }]
    expect(normRows(rows, cols)).toEqual([['2024-01-01', 'BLDG-001', 4.38]])
  })

  it('emits NULL placeholders for missing keys', () => {
    const rows = [{ asset_id: 'BLDG-001' }]
    expect(normRows(rows, cols)).toEqual([[null, 'BLDG-001', null]])
  })
})