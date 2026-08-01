import type { StoredPoint } from '../types'
import { toRow } from './mapping'

/**
 * RFC 4180 CSV. Notes are free text and will contain commas, quotes, and
 * newlines, so escaping is the whole job here.
 *
 * session_token is deliberately omitted: it is a bearer secret and this file
 * gets emailed around. The owner's Supabase dashboard export still includes it.
 */

export const CSV_COLUMNS = [
  'id',
  'created_at',
  'updated_at',
  'contributor_name',
  'contributor_email',
  'latitude',
  'longitude',
  'landcover_class',
  'class_other',
  'year',
  'floodable',
  'confidence',
  'notes',
  'placement_method',
  'gps_accuracy_m',
] as const

function escapeField(value: unknown): string {
  if (value === null || value === undefined) return ''
  const text = String(value)
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`
  }
  return text
}

export function toCsv(points: StoredPoint[]): string {
  const header = CSV_COLUMNS.join(',')
  const rows = points.map((point) => {
    const row = toRow(point)
    return CSV_COLUMNS.map((column) => escapeField(row[column])).join(',')
  })
  return [header, ...rows].join('\r\n')
}

/** Triggers a browser download. Not unit-tested — it is pure DOM plumbing. */
export function downloadCsv(filename: string, csv: string): void {
  // The BOM makes Excel open UTF-8 correctly instead of mangling accents.
  const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
