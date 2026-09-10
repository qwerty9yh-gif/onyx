import React from 'react';
import { Search, ChevronLeft, ChevronRight } from 'lucide-react';

interface DataTableProps<T> {
  data: T[];
  columns: Array<{
    key: string;
    header: string;
    render?: (row: T) => React.ReactNode;
    className?: string;
  }>;
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onSearch?: (value: string) => void;
  searchPlaceholder?: string;
  searchValue?: string;
}

export function DataTable<T extends { id: string }>({
  data,
  columns,
  page,
  pageSize,
  total,
  onPageChange,
  onSearch,
  searchPlaceholder = 'Search...',
  searchValue = '',
}: DataTableProps<T>) {
  const totalPages = Math.ceil(total / pageSize) || 1;
  return (
    <div className="space-y-4">
      {(onSearch || searchValue !== undefined) && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-500" size={18} />
          <input
            type="text"
            placeholder={searchPlaceholder}
            value={searchValue}
            onChange={(e) => onSearch?.(e.target.value)}
            className="w-full rounded-xl border border-red-100 bg-red-50/60 py-2.5 pl-10 pr-4 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-brand-400 focus:bg-white focus:ring-2 focus:ring-brand-500/30"
          />
        </div>
      )}
      <div className="overflow-hidden overflow-x-auto rounded-2xl border border-red-100 shadow-glass-sm">
        <table className="w-full bg-white">
          <thead className="bg-gradient-to-r from-brand-700 to-brand-800">
            <tr>
              {columns.map((col) => (
                <th key={col.key} className={`px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-white ${col.className || ''}`}>
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-red-50">
            {data.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-10 text-center text-slate-500">No records found</td>
              </tr>
            ) : (
              data.map((row) => (
                <tr key={row.id} className="transition hover:bg-red-50/60">
                  {columns.map((col) => (
                    <td key={col.key} className={`px-4 py-3 text-sm ${col.className || ''}`}>
                      {col.render ? col.render(row) : String((row as Record<string, unknown>)[col.key] ?? '')}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-500">{total} records</span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onPageChange(page - 1)}
              disabled={page <= 1}
              className="rounded-lg border border-red-200 bg-white p-1 text-brand-700 transition hover:bg-red-50 disabled:opacity-50"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="font-semibold text-slate-700">Page {page} of {totalPages}</span>
            <button
              onClick={() => onPageChange(page + 1)}
              disabled={page >= totalPages}
              className="rounded-lg border border-red-200 bg-white p-1 text-brand-700 transition hover:bg-red-50 disabled:opacity-50"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}