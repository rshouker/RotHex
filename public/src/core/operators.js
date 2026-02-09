// @ts-check

import { cell_key, create_hex_points, neighbor_cell } from "./coords.js";

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
 * @typedef {{
 *   operator_id: string,
 *   anchor_id: string,
 *   anchor_world: WorldPoint,
 *   cells: string[],
 *   spin_cells?: string[],
 *   rotation_steps_cw: number
 * }} AnchorInstance
 */

/**
 * @typedef {{
 *   id: string,
 *   rotation_steps_cw: number
 * }} OperatorDef
 */

/**
 * @param {Cell} cell
 * @param {number[]} direction_indices
 * @returns {Cell[]}
 */
function collect_direction_cells(cell, direction_indices) {
  return direction_indices.map((direction_index) => neighbor_cell(cell, direction_index));
}

/**
 * @param {Grid} grid
 * @param {Cell[]} cells
 * @returns {boolean}
 */
function all_cells_exist(grid, cells) {
  for (const cell of cells) {
    if (!grid.has_cell(cell)) {
      return false;
    }
  }
  return true;
}

/**
 * @returns {OperatorDef[]}
 */
export function get_operator_defs() {
  return [
    { id: "ring6_60", rotation_steps_cw: 1 },
    { id: "alt3_even_120", rotation_steps_cw: 2 },
    { id: "alt3_odd_120", rotation_steps_cw: 2 },
    { id: "vertex3_120", rotation_steps_cw: 2 }
  ];
}

/**
 * @param {Grid} grid
 * @param {string} operator_id
 * @param {(cell: Cell) => WorldPoint} get_cell_world
 * @param {number} tile_size_px
 * @returns {AnchorInstance[]}
 */
export function build_anchor_instances(grid, operator_id, get_cell_world, tile_size_px) {
  if (operator_id === "ring6_60") {
    return build_cell_operator_instances(grid, operator_id, [0, 1, 2, 3, 4, 5], 1, get_cell_world);
  }
  if (operator_id === "alt3_even_120") {
    return build_cell_operator_instances(grid, operator_id, [0, 2, 4], 2, get_cell_world);
  }
  if (operator_id === "alt3_odd_120") {
    return build_cell_operator_instances(grid, operator_id, [1, 3, 5], 2, get_cell_world);
  }
  if (operator_id === "vertex3_120") {
    return build_vertex_instances(grid, get_cell_world, tile_size_px);
  }
  throw new Error(`Unknown operator id: ${operator_id}`);
}

/**
 * @param {Grid} grid
 * @param {string} operator_id
 * @param {number[]} direction_indices
 * @param {number} rotation_steps_cw
 * @param {(cell: Cell) => WorldPoint} get_cell_world
 * @returns {AnchorInstance[]}
 */
function build_cell_operator_instances(
  grid,
  operator_id,
  direction_indices,
  rotation_steps_cw,
  get_cell_world
) {
  /** @type {AnchorInstance[]} */
  const instances = [];
  for (const anchor_cell of grid.all_cells) {
    const target_cells = collect_direction_cells(anchor_cell, direction_indices);
    if (!all_cells_exist(grid, target_cells)) {
      continue;
    }
    const anchor_suffix =
      operator_id === "alt3_even_120" ? ":even" : operator_id === "alt3_odd_120" ? ":odd" : "";
    instances.push({
      operator_id,
      anchor_id: `cell:${cell_key(anchor_cell)}${anchor_suffix}`,
      anchor_world: get_cell_world(anchor_cell),
      cells: target_cells.map((cell) => cell_key(cell)),
      spin_cells: [cell_key(anchor_cell)],
      rotation_steps_cw
    });
  }
  return instances;
}

/**
 * @param {Grid} grid
 * @param {(cell: Cell) => WorldPoint} get_cell_world
 * @param {number} tile_size_px
 * @returns {AnchorInstance[]}
 */
function build_vertex_instances(grid, get_cell_world, tile_size_px) {
  /** @type {AnchorInstance[]} */
  const instances = [];
  const dedup_anchor_ids = new Set();
  const corner_offsets = create_hex_points(tile_size_px);

  /**
   * @param {Cell} cell
   * @returns {WorldPoint[]}
   */
  function get_cell_corners(cell) {
    const center_point = get_cell_world(cell);
    return corner_offsets.map((offset) => ({
      x: center_point.x + offset.x,
      y: center_point.y + offset.y
    }));
  }

  /**
   * @param {Cell} cell_a
   * @param {Cell} cell_b
   * @param {Cell} cell_d
   * @returns {WorldPoint}
   */
  function get_shared_vertex_world(cell_a, cell_b, cell_d) {
    const corners_a = get_cell_corners(cell_a);
    const corners_b = get_cell_corners(cell_b);
    const corners_d = get_cell_corners(cell_d);
    /** @type {{ x: number, y: number, score: number } | null} */
    let best_corner_match = null;

    for (const corner_a of corners_a) {
      for (const corner_b of corners_b) {
        for (const corner_d of corners_d) {
          const distance_ab = Math.hypot(corner_a.x - corner_b.x, corner_a.y - corner_b.y);
          const distance_ad = Math.hypot(corner_a.x - corner_d.x, corner_a.y - corner_d.y);
          const distance_bd = Math.hypot(corner_b.x - corner_d.x, corner_b.y - corner_d.y);
          const score = Math.max(distance_ab, distance_ad, distance_bd);
          if (!best_corner_match || score < best_corner_match.score) {
            best_corner_match = {
              x: (corner_a.x + corner_b.x + corner_d.x) / 3,
              y: (corner_a.y + corner_b.y + corner_d.y) / 3,
              score
            };
          }
        }
      }
    }

    if (!best_corner_match) {
      throw new Error("Failed to derive vertex anchor position.");
    }
    return { x: best_corner_match.x, y: best_corner_match.y };
  }

  for (const anchor_cell of grid.all_cells) {
    for (let direction_index = 0; direction_index < 6; direction_index += 1) {
      const cell_a = anchor_cell;
      const cell_b = neighbor_cell(anchor_cell, direction_index);
      const cell_d = neighbor_cell(anchor_cell, (direction_index + 1) % 6);

      if (!all_cells_exist(grid, [cell_a, cell_b, cell_d])) {
        continue;
      }

      const cell_keys = [cell_key(cell_a), cell_key(cell_b), cell_key(cell_d)];
      const sorted_cell_keys = [...cell_keys].sort();
      const anchor_id = `vtx:${sorted_cell_keys.join("|")}`;

      if (dedup_anchor_ids.has(anchor_id)) {
        continue;
      }
      dedup_anchor_ids.add(anchor_id);

      const anchor_world = get_shared_vertex_world(cell_a, cell_b, cell_d);

      instances.push({
        operator_id: "vertex3_120",
        anchor_id,
        anchor_world,
        cells: cell_keys,
        rotation_steps_cw: 2
      });
    }
  }

  return instances;
}

