// @ts-check

import { Container, Graphics, Sprite } from "pixi.js";
import { create_hex_points, parse_cell_key } from "../core/coords.js";

/**
 * @typedef {{ q: number, r: number }} Cell
 */

/**
 * @typedef {{ x: number, y: number }} WorldPoint
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
 * @typedef {{
 *   container: Container,
 *   border: Graphics
 * }} TileView
 */

/**
 * @param {Graphics} border_graphics
 * @param {number} tile_size_px
 * @param {number} color
 * @param {number} border_thickness_px
 */
function draw_border(border_graphics, tile_size_px, color, border_thickness_px) {
  const hex_points = create_hex_points(tile_size_px);
  const flattened_points = hex_points.flatMap((point) => [point.x, point.y]);
  border_graphics.clear();
  border_graphics.poly(flattened_points);
  border_graphics.stroke({ width: border_thickness_px, color });
}

/**
 * @param {{
 *   tile_textures: Map<string, import("pixi.js").Texture>,
 *   board_state: BoardState,
 *   get_cell_world: (cell: Cell) => WorldPoint,
 *   tile_size_px: number,
 *   border_color: number,
 *   border_thickness_px: number
 * }} options
 * @returns {{
 *   tiles_layer: Container,
 *   tile_views: Map<string, TileView>,
 *   set_pose: (tile_id: string, world_pos: WorldPoint, rot_steps: number) => void,
 *   set_border_color: (tile_id: string, color: number) => void,
 *   set_emphasis: (tile_id: string, is_emphasized: boolean) => void,
 *   sync_all_from_state: (state: BoardState) => void
 * }}
 */
export function create_tile_views(options) {
  const tiles_layer = new Container();
  tiles_layer.sortableChildren = true;
  /** @type {Map<string, TileView>} */
  const tile_views = new Map();

  for (const [tile_id, texture] of options.tile_textures.entries()) {
    const container = new Container();
    const sprite = new Sprite(texture);
    sprite.anchor.set(0.5, 0.5);
    const border = new Graphics();
    draw_border(border, options.tile_size_px, options.border_color, options.border_thickness_px);

    container.addChild(sprite);
    container.addChild(border);
    tiles_layer.addChild(container);
    tile_views.set(tile_id, { container, border });
  }

  /**
   * @param {string} tile_id
   * @param {WorldPoint} world_pos
   * @param {number} rot_steps
   */
  function set_pose(tile_id, world_pos, rot_steps) {
    const tile_view = tile_views.get(tile_id);
    if (!tile_view) {
      return;
    }
    tile_view.container.position.set(world_pos.x, world_pos.y);
    tile_view.container.rotation = (Math.PI / 3) * rot_steps;
  }

  /**
   * @param {string} tile_id
   * @param {number} color
   */
  function set_border_color(tile_id, color) {
    const tile_view = tile_views.get(tile_id);
    if (!tile_view) {
      return;
    }
    draw_border(tile_view.border, options.tile_size_px, color, options.border_thickness_px);
  }

  /**
   * @param {string} tile_id
   * @param {boolean} is_emphasized
   */
  function set_emphasis(tile_id, is_emphasized) {
    const tile_view = tile_views.get(tile_id);
    if (!tile_view) {
      return;
    }
    tile_view.container.zIndex = is_emphasized ? 10 : 0;
  }

  /**
   * @param {BoardState} state
   */
  function sync_all_from_state(state) {
    for (const [tile_id, cell_key] of state.tile_id_to_cell.entries()) {
      const rotation_steps = state.tile_rot.get(tile_id) ?? 0;
      const world_pos = options.get_cell_world(parse_cell_key(cell_key));
      set_pose(tile_id, world_pos, rotation_steps);
    }
  }

  return {
    tiles_layer,
    tile_views,
    set_pose,
    set_border_color,
    set_emphasis,
    sync_all_from_state
  };
}

