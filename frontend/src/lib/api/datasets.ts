import { request } from './client';
import type {
  AnomalyPageResponse,
  Dataset,
  DatasetHierarchy,
  DatasetListResponse,
  DatasetPreviewResponse,
  DatasetResponse,
  QualityResult,
  SchemaDiscovery,
  SchemaResponse,
} from './types';

/**
 * The dataset surface.
 *
 * `getHierarchy` exists because the backend has always held the estate tree --
 * `dataset_service.get_hierarchy` reads `DatasetBuilding`, `DatasetFloor`,
 * `DatasetRoom` and `DatasetDevice` -- but nothing routed it, so the client had
 * no way to learn which buildings, floors, rooms or devices a dataset actually
 * contains. A dataset row carries only counts, and a count says how many exist,
 * never which. Every scope filter, estate navigator and cross-filter in the
 * product is built on this one call.
 */

export async function listDatasets(): Promise<Dataset[]> {
  const res = await request<DatasetListResponse>('/datasets');
  return res.datasets ?? [];
}

export async function getDataset(datasetId: string): Promise<Dataset> {
  const res = await request<Dataset>(`/datasets/${datasetId}`);
  return res;
}

export async function uploadDataset(file: File): Promise<Dataset> {
  const body = new FormData();
  body.append('file', file);
  const res = await request<DatasetResponse>('/datasets/upload', {
    method: 'POST',
    body,
  });
  return res.dataset;
}

export async function deleteDataset(datasetId: string): Promise<void> {
  await request<{ ok?: boolean }>(`/datasets/${datasetId}`, { method: 'DELETE' });
}

export async function refreshDataset(datasetId: string): Promise<Dataset> {
  const res = await request<Dataset>(`/datasets/${datasetId}/refresh`, {
    method: 'POST',
  });
  return res;
}

export async function getPreview(
  datasetId: string,
  params: { start?: number; limit?: number } = {},
): Promise<DatasetPreviewResponse> {
  const search = new URLSearchParams();
  if (params.start != null) search.set('start', String(params.start));
  if (params.limit != null) search.set('limit', String(params.limit));
  const qs = search.toString();
  return request<DatasetPreviewResponse>(`/datasets/${datasetId}/preview${qs ? `?${qs}` : ''}`);
}

export async function getContent(
  datasetId: string,
  params: {
    start?: number;
    limit?: number;
    building?: string | null;
    floor?: string | null;
    room?: string | null;
    device?: string | null;
  } = {},
): Promise<DatasetPreviewResponse> {
  const search = new URLSearchParams();
  if (params.start != null) search.set('start', String(params.start));
  if (params.limit != null) search.set('limit', String(params.limit));
  if (params.building) search.set('building', params.building);
  if (params.floor) search.set('floor', params.floor);
  if (params.room) search.set('room', params.room);
  if (params.device) search.set('device', params.device);
  const qs = search.toString();
  return request<DatasetPreviewResponse>(`/datasets/${datasetId}/content${qs ? `?${qs}` : ''}`);
}

/**
 * A scoped page of anomalies.
 *
 * Scoping happens server-side on purpose. The stage output carries aggregates
 * (`by_severity`, `by_building`) but not the individual anomalies behind them,
 * so filtering in the browser and re-summing cannot reproduce totals, excess
 * energy or excess cost. The facet counts come back scoped too.
 */
export async function getAnomalies(
  datasetId: string,
  params: {
    page?: number;
    page_size?: number;
    severity?: string | null;
    anomaly_class?: string | null;
    building_code?: string | null;
  } = {},
): Promise<AnomalyPageResponse> {
  const search = new URLSearchParams();
  if (params.page != null) search.set('page', String(params.page));
  if (params.page_size != null) search.set('page_size', String(params.page_size));
  if (params.severity) search.set('severity', params.severity);
  if (params.anomaly_class) search.set('anomaly_class', params.anomaly_class);
  if (params.building_code) search.set('building_code', params.building_code);
  const qs = search.toString();
  return request<AnomalyPageResponse>(`/datasets/${datasetId}/anomalies${qs ? `?${qs}` : ''}`);
}

export async function getHierarchy(datasetId: string): Promise<DatasetHierarchy> {
  return request<DatasetHierarchy>(`/datasets/${datasetId}/hierarchy`);
}

export async function getSchema(datasetId: string): Promise<SchemaResponse> {
  return request<SchemaResponse>(`/datasets/${datasetId}/schema`);
}

export async function discoverSchema(datasetId: string): Promise<SchemaDiscovery> {
  return request<SchemaDiscovery>(`/datasets/${datasetId}/schema/discover`, {
    method: 'POST',
  });
}

export async function getDq(datasetId: string): Promise<QualityResult | null> {
  return request<QualityResult | null>(`/datasets/${datasetId}/dq`);
}

export async function runDq(datasetId: string): Promise<QualityResult> {
  return request<QualityResult>(`/datasets/${datasetId}/dq/run`, { method: 'POST' });
}
