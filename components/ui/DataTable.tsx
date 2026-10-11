import React from 'react';

export interface Column<T> {
  key: string;
  header: string;
  render?: (row: T) => React.ReactNode;
  className?: string;
}

export type DataTableProps<T = Record<string, any>> =
  | {
      columns: Column<T>[];
      data: T[];
      keyExtractor: (row: T) => string;
      emptyState?: React.ReactNode;
      className?: string;
      children?: never;
    }
  | {
      children: React.ReactNode;
      className?: string;
      columns?: never;
      data?: never;
      keyExtractor?: never;
      emptyState?: never;
    };

export function DataTable<T extends Record<string, any>>(props: DataTableProps<T>) {
  if ('children' in props && props.children) {
    return (
      <div className={`w-full overflow-hidden rounded-xl border border-neutral-200 bg-white ${props.className || ''}`}>
        <div className="overflow-x-auto">{props.children}</div>
      </div>
    );
  }

  const { columns, data, keyExtractor, emptyState, className = '' } = props;

  if (data && data.length === 0 && emptyState) {
    return <>{emptyState}</>;
  }

  return (
    <div className={`w-full overflow-hidden rounded-xl border border-neutral-200 bg-white ${className}`}>
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-sm">
          <thead>
            <tr className="border-b border-neutral-200 bg-neutral-50/75">
              {columns?.map((col) => (
                <th
                  key={col.key}
                  scope="col"
                  className={`py-3 px-4 text-xs font-semibold uppercase tracking-wider text-neutral-600 ${
                    col.className || ''
                  }`}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {data?.map((row) => (
              <tr
                key={keyExtractor(row)}
                className="hover:bg-neutral-50/60 transition-colors"
              >
                {columns?.map((col) => (
                  <td
                    key={col.key}
                    className={`py-3.5 px-4 text-neutral-800 ${col.className || ''}`}
                  >
                    {col.render ? col.render(row) : row[col.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
