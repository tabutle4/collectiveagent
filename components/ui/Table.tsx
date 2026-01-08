/**
 * Table Component
 * 
 * Usage:
 * <Table
 *   columns={[
 *     { key: 'name', label: 'Name' },
 *     { key: 'email', label: 'Email' }
 *   ]}
 *   data={[
 *     { name: 'John', email: 'john@example.com' },
 *     { name: 'Jane', email: 'jane@example.com' }
 *   ]}
 *   onRowClick={(row) => console.log(row)}
 * />
 */

import React from 'react'
import { cn } from '@/lib/utils'

export interface TableColumn<T = any> {
  key: string
  label: string
  render?: (value: any, row: T) => React.ReactNode
}

export interface TableProps<T = any> extends React.HTMLAttributes<HTMLDivElement> {
  columns: TableColumn<T>[]
  data: T[]
  onRowClick?: (row: T) => void
}

function Table<T extends Record<string, any>>({
  columns,
  data,
  onRowClick,
  className,
  ...props
}: TableProps<T>) {
  return (
    <div className={cn('overflow-x-auto', className)} {...props}>
      <table className="w-full">
        <thead>
          <tr className="border-b border-luxury-gray-5">
            {columns.map((column) => (
              <th
                key={column.key}
                className="text-left py-3 px-4 text-sm font-medium text-luxury-gray-1"
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                className="text-center py-12 text-luxury-gray-2"
              >
                No data available
              </td>
            </tr>
          ) : (
            data.map((row, rowIndex) => (
              <tr
                key={rowIndex}
                className={cn(
                  'border-b border-luxury-gray-5 transition-colors',
                  onRowClick && 'cursor-pointer hover:bg-luxury-light'
                )}
                onClick={() => onRowClick?.(row)}
              >
                {columns.map((column) => (
                  <td key={column.key} className="py-3 px-4 text-sm">
                    {column.render
                      ? column.render(row[column.key], row)
                      : row[column.key]}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}

export default Table

