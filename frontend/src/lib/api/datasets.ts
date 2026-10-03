import { request } from './client';
import type {
  Dataset,
  DatasetListResponse,
  DatasetPreviewResponse,
  DatasetResponse,
  QualityResult,
  SchemaDiscovery,
  SchemaResponse,
} from './types';

/**
 * The dataset surface only. There is no hierarchy endpoint and never was in the
 * ten-stage backend: a dataset row carries counts (buildings, floors, rooms,
 * devices) but not the code lists behind them. Pages that need a building or
 * device code read it out of the stage payload they already have -- anomaly
 * roll-ups, forecast scope totals, recommendation programme keys -- rather than
 * asking for a tree the server does not hold.
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
  params: { start?: number; limit?: number } = {},
): Promise<DatasetPreviewResponse> {
  const search = new URLSearchParams();
  if (params.start != null) search.set('start', String(params.start));
  if (params.limit != null) search.set('limit', String(params.limit));
  const qs = search.toString();
  return request<DatasetPreviewResponse>(`/datasets/${datasetId}/content${qs ? `?${qs}` : ''}`);
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
