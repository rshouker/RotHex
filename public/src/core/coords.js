// @ts-check

/**
 * @typedef {{ q: number, r: number }} Cell
 */

/**
 * @typedef {{ x: number, y: number }} WorldPoint
 */

/**
 * @param {Cell} cell
 * @returns {string}
 */
export function cell_key(cell) {
  return `${cell.q},${cell.r}`;
}

/**
 * @param {string} key
 * @returns {Cell}
 */
export function parse_cell_key(key) {
  const [q_value, r_value] = key.split(",");
  return { q: Number(q_value), r: Number(r_value) };
}

/**
 * @param {Cell} cell
 * @param {number} direction_index
 * @returns {Cell}
 */
export function neighbor_cell(cell, direction_index) {
  const normalized_index = ((direction_index % 6) + 6) % 6;
  const is_even_row = cell.r % 2 === 0;
  // Even rows are shifted right (hex_width/2) in world_from_cell,
  // so their diagonal neighbors use the "+1" q bias.
  const even_row_offsets = [
    { q: +1, r: 0 },
    { q: +1, r: -1 },
    { q: 0, r: -1 },
    { q: -1, r: 0 },
    { q: 0, r: +1 },
    { q: +1, r: +1 }
  ];
  // Odd rows are NOT shifted, so their diagonal neighbors use the "-1" q bias.
  const odd_row_offsets = [
    { q: +1, r: 0 },
    { q: 0, r: -1 },
    { q: -1, r: -1 },
    { q: -1, r: 0 },
    { q: -1, r: +1 },
    { q: 0, r: +1 }
  ];
  const direction_offset = is_even_row
    ? even_row_offsets[normalized_index]
    : odd_row_offsets[normalized_index];
  return { q: cell.q + direction_offset.q, r: cell.r + direction_offset.r };
}

/**
 * @param {number} tile_size_px
 * @returns {WorldPoint[]}
 */
export function create_hex_points(tile_size_px) {
  /** @type {WorldPoint[]} */
  const points = [];
  const angle_offset_radians = Math.PI / 6;
  for (let index = 0; index < 6; index += 1) {
    // Offset by 30° so polygon width/height match grid spacing math.
    const angle_radians = (Math.PI / 3) * index + angle_offset_radians;
    points.push({
      x: tile_size_px * Math.cos(angle_radians),
      y: tile_size_px * Math.sin(angle_radians)
    });
  }
  return points;
}

/**
 * @param {Cell} cell
 * @param {number} tile_size_px
 * @param {WorldPoint} board_origin
 * @returns {WorldPoint}
 */
export function world_from_cell(cell, tile_size_px, board_origin) {
  const hex_width = Math.sqrt(3) * tile_size_px;
  const row_step_y = 1.5 * tile_size_px;
  const row_offset_x = cell.r % 2 === 0 ? hex_width / 2 : 0;
  return {
    x: board_origin.x + cell.q * hex_width + row_offset_x,
    y: board_origin.y + cell.r * row_step_y
  };
}

