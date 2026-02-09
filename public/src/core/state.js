// @ts-check

import { cell_key } from "./coords.js";

/**
 * @typedef {{
 *   w: number,
 *   h: number,
 *   all_cells: { q: number, r: number }[],
 *   has_cell: (cell: { q: number, r: number }) => boolean
 * }} Grid
 */

/**
 * @typedef {{
 *   cell_to_tile_id: Map<string, string>,
 *   tile_id_to_cell: Map<string, string>,
 *   tile_rot: Map<string, number>,
 *   tile_home_cell: Map<string, string>
 * }} BoardState
 */

/**
 * @param {Grid} grid
 * @returns {BoardState}
 */
export function create_solved_state(grid) {
  /** @type {Map<string, string>} */
  const cell_to_tile_id = new Map();
  /** @type {Map<string, string>} */
  const tile_id_to_cell = new Map();
  /** @type {Map<string, number>} */
  const tile_rot = new Map();
  /** @type {Map<string, string>} */
  const tile_home_cell = new Map();

  for (const cell of grid.all_cells) {
    const key = cell_key(cell);
    const tile_id = key;
    cell_to_tile_id.set(key, tile_id);
    tile_id_to_cell.set(tile_id, key);
    tile_rot.set(tile_id, 0);
    tile_home_cell.set(tile_id, key);
  }

  return {
    cell_to_tile_id,
    tile_id_to_cell,
    tile_rot,
    tile_home_cell
  };
}

/**
 * @param {BoardState} state
 * @returns {boolean}
 */
export function is_solved(state) {
  for (const [tile_id, home_cell_key] of state.tile_home_cell.entries()) {
    const current_cell_key = state.tile_id_to_cell.get(tile_id);
    const rotation_steps = state.tile_rot.get(tile_id) ?? 0;
    if (current_cell_key !== home_cell_key || rotation_steps !== 0) {
      return false;
    }
  }
  return true;
}

