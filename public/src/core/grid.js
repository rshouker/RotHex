// @ts-check

import { cell_key, world_from_cell } from "./coords.js";

/**
 * @typedef {{ q: number, r: number }} Cell
 */

/**
 * @typedef {{ x: number, y: number }} WorldPoint
 */

/**
 * @typedef {{
 *   w: number,
 *   h: number,
 *   all_cells: Cell[],
 *   has_cell: (cell: Cell) => boolean
 * }} Grid
 */

/**
 * @param {number} grid_w
 * @param {number} grid_h
 * @returns {Grid}
 */
export function create_grid(grid_w, grid_h) {
  if (grid_h % 2 === 0) {
    throw new Error("GRID_H must be odd.");
  }
  /** @type {Cell[]} */
  const all_cells = [];
  const playable_cells = new Set();

  for (let row_index = 0; row_index < grid_h; row_index += 1) {
    const row_length = row_index % 2 === 0 ? grid_w : grid_w + 1;
    for (let column_index = 0; column_index < row_length; column_index += 1) {
      const cell = { q: column_index, r: row_index };
      all_cells.push(cell);
      playable_cells.add(cell_key(cell));
    }
  }

  return {
    w: grid_w,
    h: grid_h,
    all_cells,
    has_cell: (cell) => playable_cells.has(cell_key(cell))
  };
}

/**
 * @param {Grid} grid
 * @returns {number}
 */
export function get_cell_count(grid) {
  return grid.all_cells.length;
}

/**
 * @param {Grid} grid
 * @param {number} tile_size_px
 * @param {WorldPoint} board_origin
 * @returns {{ min_x: number, max_x: number, min_y: number, max_y: number, center_x: number, center_y: number, width: number, height: number }}
 */
export function get_grid_bounds(grid, tile_size_px, board_origin) {
  const hex_width = Math.sqrt(3) * tile_size_px;
  const hex_height = 2 * tile_size_px;
  let min_x = Number.POSITIVE_INFINITY;
  let max_x = Number.NEGATIVE_INFINITY;
  let min_y = Number.POSITIVE_INFINITY;
  let max_y = Number.NEGATIVE_INFINITY;

  for (const cell of grid.all_cells) {
    const center_point = world_from_cell(cell, tile_size_px, board_origin);
    min_x = Math.min(min_x, center_point.x - hex_width / 2);
    max_x = Math.max(max_x, center_point.x + hex_width / 2);
    min_y = Math.min(min_y, center_point.y - hex_height / 2);
    max_y = Math.max(max_y, center_point.y + hex_height / 2);
  }

  return {
    min_x,
    max_x,
    min_y,
    max_y,
    center_x: (min_x + max_x) / 2,
    center_y: (min_y + max_y) / 2,
    width: max_x - min_x,
    height: max_y - min_y
  };
}

