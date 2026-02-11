// @ts-check

/**
 * Convert row index to Excel-style letter(s): 0→A, 1→B, ..., 25→Z, 26→AA, etc.
 *
 * @param {number} row_index
 * @returns {string}
 */
function row_index_to_letter(row_index) {
  if (row_index < 26) {
    return String.fromCharCode(65 + row_index);
  }
  return (
    String.fromCharCode(64 + Math.floor(row_index / 26)) +
    String.fromCharCode(65 + (row_index % 26))
  );
}

/**
 * Convert a cell to a display label: row letter + column number (1-based).
 * e.g. { q: 0, r: 0 } → "A1", { q: 1, r: 1 } → "B2", row 26 → "AA1".
 *
 * @param {{ q: number, r: number }} cell
 * @returns {string}
 */
export function cell_to_label(cell) {
  const row_letter = row_index_to_letter(cell.r);
  const col_number = cell.q + 1;
  return row_letter + String(col_number);
}
