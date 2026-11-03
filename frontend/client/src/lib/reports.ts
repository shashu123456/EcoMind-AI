/**
 * Reports API — generation, history, comparison and exports.
 *
 * The stored report is a set of twelve sections plus a summary; the page renders
 * that data as a document, so preview and export always show the same numbers.
 */

import { api, getToken } from "./api";

export type ReportSection = {
  key: string;
  order?: number;
  title: string;
  body: string;
  figures: Record<string, unknown>;
};

export type ReportSummary = {
  overall_health?: Record<string, number | null>;
  spend?: Record<string, number | null>;
  opportunity?: Record<string, number | null>;
  sections?: number;
};

export type ReportDocument = {
  id: string;
  title: string;
  organization: string | null;
  dataset_id: string;
  dataset_name: string;
  status: string;
  generated_at: string | null;
  summary: ReportSummary;
  sections: ReportSection[];
  figures: Record<string, unknown>;
  error: string | null;
};

export type ReportListItem = {
  id: string;
  dataset_id: string;
  run_id: string | null;
  title: string;
  organization: string | null;
  status: string;
  format: string;
  created_at: string | null;
  generated_at: string | null;
  file_size_bytes: number | null;
  sections: number;
  error: string | null;
  generated_by: string;
  model: string | null;
  model_version: string | null;
  accuracy_r2: number | null;
  accuracy_mape: number | null;
  baseline_version: string | number | null;
  prediction_version: string | null;
  prediction_generated_at: string | null;
};

export type ReportList = {
  dataset_id: string;
  reports: ReportListItem[];
  total: number;
  formats: string[];
};

export type ReportComparison = {
  left: ReportListItem;
  right: ReportListItem;
  figures: Array<{
    metric: string;
    left: number | string | null;
    right: number | string | null;
    delta: number | null;
    direction: "up" | "down" | "same";
  }>;
  changes: Array<{ field: string; left: unknown; right: unknown }>;
};

export const reportsApi = {
  list: (datasetId: string) => api.get<ReportList>(`/datasets/${datasetId}/reports`),
  generate: (datasetId: string, body: { run_id?: string | null } = {}) =>
    api.post<{ report: ReportListItem; document: ReportDocument }>(`/datasets/${datasetId}/reports`, body),
  detail: (datasetId: string, reportId: string) =>
    api.get<{ report: ReportListItem; document: ReportDocument; context: Record<string, unknown> }>(
      `/datasets/${datasetId}/reports/${reportId}`,
    ),
  rename: (datasetId: string, reportId: string, title: string) =>
    api.post<ReportListItem>(`/datasets/${datasetId}/reports/${reportId}/rename`, { title }),
  duplicate: (datasetId: string, reportId: string) =>
    api.post<ReportListItem>(`/datasets/${datasetId}/reports/${reportId}/duplicate`, {}),
  remove: (datasetId: string, reportId: string) =>
    api.del<{ deleted: string }>(`/datasets/${datasetId}/reports/${reportId}`),
  compare: (datasetId: string, left: string, right: string) =>
    api.get<ReportComparison>(`/datasets/${datasetId}/reports/compare`, { left, right }),
};

export const REPORT_FORMATS = ["pdf", "docx", "xlsx", "pptx", "csv", "json"] as const;
export type ReportFormat = (typeof REPORT_FORMATS)[number];

const FORMAT_MIME: Record<ReportFormat, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  csv: "text/csv",
  json: "application/json",
};

/** Fetch an export as a blob and hand it to the browser as a download. */
export async function downloadReport(
  datasetId: string,
  reportId: string,
  format: ReportFormat,
  title: string,
): Promise<void> {
  const token = getToken();
  const response = await fetch(`/api/v1/datasets/${datasetId}/reports/${reportId}/export?format=${format}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) {
    let detail = `Export failed (${response.status})`;
    try {
      const payload = await response.json();
      if (payload?.detail) detail = String(payload.detail);
    } catch {
      /* non-JSON error body */
    }
    throw new Error(detail);
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(new Blob([blob], { type: FORMAT_MIME[format] }));
  const anchor = document.createElement("a");
  const safe = title.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "ecomind-report";
  anchor.href = url;
  anchor.download = `${safe}.${format}`;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}
