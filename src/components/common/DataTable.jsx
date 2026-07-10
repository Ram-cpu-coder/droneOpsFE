const DataTable = ({ columns, rows, getRowKey, emptyMessage = "No records found.", onRowClick }) => {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key}>{column.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr className="table-empty-row">
              <td className="table-empty-cell" colSpan={columns.length}>{emptyMessage}</td>
            </tr>
          )}
          {rows.map((row, index) => (
            <tr
              key={getRowKey ? getRowKey(row) : index}
              className={onRowClick ? "clickable-row" : undefined}
              tabIndex={onRowClick ? 0 : undefined}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              onKeyDown={onRowClick ? (event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onRowClick(row);
                }
              } : undefined}
            >
              {columns.map((column) => (
                <td key={column.key} data-label={column.label}>
                  {column.render ? column.render(row) : row[column.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default DataTable;
