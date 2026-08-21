import { ChevronDown, ChevronUp, Search } from "lucide-react";
import { useMemo, useState } from "react";

const DEFAULT_PAGE_SIZE = 10;

const DataTable = ({
  columns,
  rows,
  getRowKey,
  emptyMessage = "No records found.",
  onRowClick,
  searchable = true,
  sortable = true,
  paginated = true,
  pageSize = DEFAULT_PAGE_SIZE,
  searchPlaceholder = "Search table"
}) => {
  const [searchValue, setSearchValue] = useState("");
  const [columnFilters, setColumnFilters] = useState({});
  const [sortState, setSortState] = useState({ key: "", direction: "asc" });
  const [page, setPage] = useState(1);

  const searchableColumns = useMemo(
    () => columns.filter((column) => column.searchable !== false),
    [columns]
  );

  const filterableColumns = useMemo(
    () => columns.filter((column) => column.filterable),
    [columns]
  );

  const filterOptions = useMemo(() => {
    return filterableColumns.map((column) => {
      const values = [...new Set(rows.map((row) => getFilterValue(row, column)).filter((value) => value !== ""))];
      return {
        key: column.key,
        label: column.label,
        options: values.sort(compareValues)
      };
    });
  }, [filterableColumns, rows]);

  const searchedRows = useMemo(() => {
    const query = searchValue.trim().toLowerCase();
    if (!query || !searchable) return rows;

    return rows.filter((row) => (
      searchableColumns.some((column) => stringifyCellValue(row, column).includes(query))
    ));
  }, [rows, searchValue, searchable, searchableColumns]);

  const filteredRows = useMemo(() => {
    const activeFilters = Object.entries(columnFilters).filter(([, value]) => value);
    if (!activeFilters.length) return searchedRows;

    return searchedRows.filter((row) => (
      activeFilters.every(([key, value]) => {
        const column = columns.find((item) => item.key === key);
        if (!column) return true;
        return getFilterValue(row, column) === value;
      })
    ));
  }, [columnFilters, columns, searchedRows]);

  const sortedRows = useMemo(() => {
    if (!sortable || !sortState.key) return filteredRows;

    const column = columns.find((item) => item.key === sortState.key);
    if (!column) return filteredRows;

    return [...filteredRows].sort((left, right) => {
      const leftValue = getComparableCellValue(left, column);
      const rightValue = getComparableCellValue(right, column);
      const result = compareValues(leftValue, rightValue);
      return sortState.direction === "asc" ? result : -result;
    });
  }, [columns, filteredRows, sortState, sortable]);

  const totalPages = paginated ? Math.max(1, Math.ceil(sortedRows.length / pageSize)) : 1;
  const safePage = Math.min(page, totalPages);
  const pageStart = paginated ? (safePage - 1) * pageSize : 0;
  const visibleRows = paginated ? sortedRows.slice(pageStart, pageStart + pageSize) : sortedRows;
  const showingStart = sortedRows.length ? pageStart + 1 : 0;
  const showingEnd = paginated ? Math.min(pageStart + pageSize, sortedRows.length) : sortedRows.length;

  const handleSearchChange = (value) => {
    setSearchValue(value);
    setPage(1);
  };

  const handleSort = (column) => {
    if (!sortable || column.sortable === false) return;

    setSortState((current) => {
      if (current.key !== column.key) return { key: column.key, direction: "asc" };
      return { key: column.key, direction: current.direction === "asc" ? "desc" : "asc" };
    });
    setPage(1);
  };

  const handleFilterChange = (key, value) => {
    setColumnFilters((current) => ({ ...current, [key]: value }));
    setPage(1);
  };

  return (
    <div className="data-table-shell">
      {(searchable || paginated || filterOptions.length > 0) && (
        <div className="data-table-toolbar">
          {searchable && (
            <label className="data-table-search">
              <Search size={16} />
              <input
                value={searchValue}
                onChange={(event) => handleSearchChange(event.target.value)}
                placeholder={searchPlaceholder}
              />
            </label>
          )}
          {filterOptions.length > 0 && (
            <div className="data-table-filters" aria-label="Table filters">
              {filterOptions.map((filter) => (
                <label className={`data-table-filter-field ${columnFilters[filter.key] ? "is-active" : ""}`} key={filter.key}>
                  <span>{filter.label}</span>
                  <select
                    value={columnFilters[filter.key] ?? ""}
                    onChange={(event) => handleFilterChange(filter.key, event.target.value)}
                  >
                    <option value="">All</option>
                    {filter.options.map((option) => (
                      <option key={option} value={option}>{formatFilterOption(option)}</option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          )}
          <span>
            Showing {showingStart}-{showingEnd} of {sortedRows.length}
          </span>
        </div>
      )}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {columns.map((column) => {
                const isSorted = sortState.key === column.key;
                const canSort = sortable && column.sortable !== false;
                return (
                  <th key={column.key}>
                    {canSort ? (
                      <button
                        className={`table-sort-button ${isSorted ? "is-sorted" : ""}`}
                        type="button"
                        onClick={() => handleSort(column)}
                      >
                        <span>{column.label}</span>
                        {isSorted && sortState.direction === "desc" ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
                      </button>
                    ) : (
                      column.label
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {visibleRows.length === 0 && (
              <tr className="table-empty-row">
                <td className="table-empty-cell" colSpan={columns.length}>{searchValue ? "No records match this search." : emptyMessage}</td>
              </tr>
            )}
            {visibleRows.map((row, index) => (
              <tr
                key={getRowKey ? getRowKey(row) : index}
                className={onRowClick ? "clickable-row" : undefined}
                tabIndex={onRowClick ? 0 : undefined}
                onClick={onRowClick ? (event) => {
                  if (isInteractiveEvent(event)) return;
                  onRowClick(row);
                } : undefined}
                onKeyDown={onRowClick ? (event) => {
                  if (isInteractiveEvent(event)) return;
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

      {paginated && totalPages > 1 && (
        <div className="data-table-pagination">
          <button type="button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={safePage === 1}>
            Previous
          </button>
          <span>Page {safePage} of {totalPages}</span>
          <button type="button" onClick={() => setPage((current) => Math.min(totalPages, current + 1))} disabled={safePage === totalPages}>
            Next
          </button>
        </div>
      )}
    </div>
  );
};

const stringifyCellValue = (row, column) => {
  return String(getComparableCellValue(row, column) ?? "").toLowerCase();
};

const getComparableCellValue = (row, column) => {
  if (column.sortValue) return column.sortValue(row);
  if (column.searchValue) return column.searchValue(row);
  return row[column.key];
};

const getFilterValue = (row, column) => {
  if (column.filterValue) return String(column.filterValue(row) ?? "");
  if (column.searchValue) return String(column.searchValue(row) ?? "");
  return String(row[column.key] ?? "");
};

const formatFilterOption = (value = "") => (
  value.toString().replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase())
);

const compareValues = (left, right) => {
  if (left == null && right == null) return 0;
  if (left == null) return -1;
  if (right == null) return 1;

  const leftDate = Date.parse(left);
  const rightDate = Date.parse(right);
  if (!Number.isNaN(leftDate) && !Number.isNaN(rightDate)) return leftDate - rightDate;

  const leftNumber = Number(left);
  const rightNumber = Number(right);
  if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) return leftNumber - rightNumber;

  return String(left).localeCompare(String(right), undefined, { numeric: true, sensitivity: "base" });
};

const isInteractiveEvent = (event) => {
  const interactiveTarget = event.target.closest?.(
    "a, button, input, select, textarea, label, [role='button'], [role='menuitem'], [data-row-action]"
  );
  return Boolean(interactiveTarget);
};

export default DataTable;
