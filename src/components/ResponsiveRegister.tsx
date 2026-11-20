import React from 'react';

export interface RegisterColumn<Row> {
  title: string;
  render: (row: Row) => React.ReactNode;
}

export function ResponsiveRegister<Row extends { id: string }>({
  label,
  columns,
  rows,
}: {
  label: string;
  columns: readonly RegisterColumn<Row>[];
  rows: readonly Row[];
}) {
  return (
    <div tabIndex={0} role="region" aria-label={label} className="register-scroll">
      <table className="responsive-register" role="table">
        <caption className="sr-only">{label}</caption>
        <thead role="rowgroup">
          <tr role="row">
            {columns.map((column) => (
              <th key={column.title} role="columnheader" scope="col">
                {column.title}
              </th>
            ))}
          </tr>
        </thead>
        <tbody role="rowgroup">
          {rows.map((row) => (
            <tr role="row" key={row.id}>
              {columns.map((column, index) => {
                const content = <>
                  <span className="register-mobile-label" aria-hidden="true">{column.title}</span>
                  {column.render(row)}
                </>;
                return index === 0
                  ? <th scope="row" role="rowheader" key={column.title}>{content}</th>
                  : <td role="cell" key={column.title}>{content}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
