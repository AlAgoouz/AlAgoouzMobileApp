import React from 'react';

export interface RegisterColumn<Row> {
  title: string;
  render: (row: Row) => React.ReactNode;
}

export function ResponsiveRegister<Row extends {id: string}>({label, columns, rows}: {
  label: string;
  columns: readonly RegisterColumn<Row>[];
  rows: readonly Row[];
}) {
  return <table className="responsive-register" aria-label={label} role="table">
    <thead role="rowgroup"><tr role="row">{columns.map(column =>
      <th key={column.title} role="columnheader" scope="col">{column.title}</th>
    )}</tr></thead>
    <tbody role="rowgroup">{rows.map(row => <tr role="row" key={row.id}>{columns.map(column =>
      <td role="cell" key={column.title}>
        <span className="register-mobile-label" aria-hidden="true">{column.title}</span>
        {column.render(row)}
      </td>
    )}</tr>)}</tbody>
  </table>;
}
