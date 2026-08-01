"use client";

import { useId, useState, type ReactNode } from "react";

export type Column<T> = { key: string; label: string; render: (row: T) => ReactNode };

export function DataTable<T extends { id: string }>({ rows, columns, actions, label = "Data table", selectable = false, selectedIds = [], onSelectionChange }: { rows: T[]; columns: Column<T>[]; actions?: (row: T) => ReactNode; label?: string; selectable?: boolean; selectedIds?: string[]; onSelectionChange?: (ids: string[]) => void }) {
  const menuId = useId();
  const [visibleKeys, setVisibleKeys] = useState(() => new Set(columns.map((column) => column.key)));
  const visibleColumns = columns.filter((column) => visibleKeys.has(column.key));
  const toggle = (key: string) => setVisibleKeys((current) => {
    if (current.has(key) && current.size === 1) return current;
    const next = new Set(current);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  const selected = new Set(selectedIds);
  const allSelected = rows.length > 0 && rows.every((row) => selected.has(row.id));
  const toggleRow = (id: string) => onSelectionChange?.(selected.has(id) ? selectedIds.filter((value) => value !== id) : [...selectedIds, id]);
  const toggleAll = () => onSelectionChange?.(allSelected ? selectedIds.filter((id) => !rows.some((row) => row.id === id)) : [...new Set([...selectedIds, ...rows.map((row) => row.id)])]);
  return <div>
    <details className="column-visibility"><summary aria-controls={menuId}>Columns</summary><div id={menuId} role="group" aria-label="Column visibility">{columns.map((column) => <label key={column.key}><input type="checkbox" checked={visibleKeys.has(column.key)} onChange={() => toggle(column.key)} />{column.label}</label>)}</div></details>
    <div className="table-scroll"><table className="data-table" aria-label={label}><thead><tr>{selectable && <th scope="col"><input aria-label="Select all rows" type="checkbox" checked={allSelected} onChange={toggleAll} /></th>}{visibleColumns.map((column) => <th scope="col" key={column.key}>{column.label}</th>)}{actions && <th scope="col">Actions</th>}</tr></thead><tbody>{rows.map((row) => <tr key={row.id}>{selectable && <td><input aria-label={`Select row ${row.id}`} type="checkbox" checked={selected.has(row.id)} onChange={() => toggleRow(row.id)} /></td>}{visibleColumns.map((column) => <td key={column.key}>{column.render(row)}</td>)}{actions && <td>{actions(row)}</td>}</tr>)}</tbody></table></div>
  </div>;
}
