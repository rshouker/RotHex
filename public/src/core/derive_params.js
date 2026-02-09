// @ts-check

/**
 * @typedef {{
 *   x: number,
 *   y: number,
 *   width: number,
 *   height: number
 * }} Rect
 */

/**
 * @param {number} grid_w
 * @param {number} grid_h
 * @returns {number}
 */
export function get_cell_count_for_shape(grid_w, grid_h) {
  return grid_w * grid_h + (grid_h - 1) / 2;
}

/**
 * @param {number} grid_w
 * @param {number} padding_in_tile_units
 * @returns {number}
 */
export function get_padded_width_in_s(grid_w, padding_in_tile_units) {
  return Math.sqrt(3) * (grid_w + 1) + 2 * padding_in_tile_units;
}

/**
 * @param {number} grid_h
 * @param {number} padding_in_tile_units
 * @returns {number}
 */
export function get_padded_height_in_s(grid_h, padding_in_tile_units) {
  return 1.5 * grid_h + 0.5 + 2 * padding_in_tile_units;
}

/**
 * @param {number} grid_w
 * @param {number} grid_h
 * @param {number} padding_in_tile_units
 * @returns {number}
 */
export function get_board_aspect(grid_w, grid_h, padding_in_tile_units) {
  return (
    get_padded_width_in_s(grid_w, padding_in_tile_units) /
    get_padded_height_in_s(grid_h, padding_in_tile_units)
  );
}

/**
 * @param {number} source_width
 * @param {number} source_height
 * @param {number} target_width
 * @param {number} target_height
 * @returns {Rect}
 */
export function get_contain_rect(source_width, source_height, target_width, target_height) {
  const scale = Math.min(target_width / source_width, target_height / source_height);
  const fit_width = source_width * scale;
  const fit_height = source_height * scale;
  return {
    x: (target_width - fit_width) / 2,
    y: (target_height - fit_height) / 2,
    width: fit_width,
    height: fit_height
  };
}

/**
 * @param {{
 *   target_cell_count: number,
 *   image_aspect: number,
 *   padding_in_tile_units: number,
 *   candidate_h_min?: number,
 *   candidate_h_max?: number
 * }} options
 * @returns {{ grid_w: number, grid_h: number, cell_count: number, board_aspect: number }}
 */
export function derive_grid_shape(options) {
  const candidate_h_min = options.candidate_h_min ?? 3;
  const candidate_h_max = options.candidate_h_max ?? 35;
  /** @type {{ grid_w: number, grid_h: number, cell_count: number, board_aspect: number, cell_delta: number, aspect_delta: number } | null} */
  let best_match = null;

  for (let grid_h = candidate_h_min; grid_h <= candidate_h_max; grid_h += 2) {
    for (let grid_w = 1; grid_w <= 50; grid_w += 1) {
      const cell_count = get_cell_count_for_shape(grid_w, grid_h);
      const board_aspect = get_board_aspect(grid_w, grid_h, options.padding_in_tile_units);
      const cell_delta = Math.abs(cell_count - options.target_cell_count);
      const aspect_delta = Math.abs(board_aspect - options.image_aspect);
      const candidate = {
        grid_w,
        grid_h,
        cell_count,
        board_aspect,
        cell_delta,
        aspect_delta
      };

      if (!best_match) {
        best_match = candidate;
        continue;
      }

      const is_better =
        candidate.cell_delta < best_match.cell_delta ||
        (candidate.cell_delta === best_match.cell_delta &&
          candidate.aspect_delta < best_match.aspect_delta);

      if (is_better) {
        best_match = candidate;
      }
    }
  }

  if (!best_match) {
    throw new Error("Could not derive grid dimensions.");
  }

  return {
    grid_w: best_match.grid_w,
    grid_h: best_match.grid_h,
    cell_count: best_match.cell_count,
    board_aspect: best_match.board_aspect
  };
}

/**
 * @param {{
 *   viewport_width: number,
 *   viewport_height: number,
 *   image_width: number,
 *   image_height: number,
 *   grid_w: number,
 *   grid_h: number,
 *   padding_in_tile_units: number,
 *   viewport_margin_px: number
 * }} options
 * @returns {{ tile_size_px: number, image_rect: Rect }}
 */
export function derive_tile_size(options) {
  const usable_viewport_width = Math.max(1, options.viewport_width - 2 * options.viewport_margin_px);
  const usable_viewport_height = Math.max(1, options.viewport_height - 2 * options.viewport_margin_px);
  const image_rect_unoffset = get_contain_rect(
    options.image_width,
    options.image_height,
    usable_viewport_width,
    usable_viewport_height
  );
  const image_rect = {
    x: image_rect_unoffset.x + options.viewport_margin_px,
    y: image_rect_unoffset.y + options.viewport_margin_px,
    width: image_rect_unoffset.width,
    height: image_rect_unoffset.height
  };

  const padded_width_in_s = get_padded_width_in_s(options.grid_w, options.padding_in_tile_units);
  const padded_height_in_s = get_padded_height_in_s(options.grid_h, options.padding_in_tile_units);

  const tile_size_from_viewport = Math.min(
    usable_viewport_width / padded_width_in_s,
    usable_viewport_height / padded_height_in_s
  );
  const tile_size_from_image = Math.min(
    image_rect.width / padded_width_in_s,
    image_rect.height / padded_height_in_s
  );

  return {
    tile_size_px: Math.max(1, Math.min(tile_size_from_viewport, tile_size_from_image)),
    image_rect
  };
}

