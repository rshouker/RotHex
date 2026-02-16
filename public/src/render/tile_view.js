// @ts-check

import { Container, Graphics, Sprite, Text } from "pixi.js";
import { cell_key, create_hex_points, parse_cell_key } from "../core/coords.js";
import { cell_to_label } from "../core/cell_label.js";

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
 *   w: number,
 *   h: number,
 *   all_cells: Cell[],
 *   has_cell: (cell: Cell) => boolean
 * }} Grid
 */

/**
 * @typedef {{
 *   container: Container,
 *   border: Graphics,
 *   hex_fill?: Graphics,
 *   sprite?: Sprite,
 *   label_text?: Text,
 *   overline_graphics?: Graphics
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
 * Draw a hex fill (for number-mode tiles).
 *
 * @param {Graphics} graphics
 * @param {number} tile_size_px
 * @param {number} fill_color
 * @param {number} alpha
 */
function draw_hex_fill(graphics, tile_size_px, fill_color, alpha) {
  const hex_points = create_hex_points(tile_size_px);
  const flattened_points = hex_points.flatMap((point) => [point.x, point.y]);
  graphics.clear();
  graphics.poly(flattened_points);
  graphics.fill({ color: fill_color, alpha });
}

/**
 * @param {{
 *   mode: "n" | "i",
 *   tile_textures: Map<string, import("pixi.js").Texture>,
 *   grid: Grid | null,
 *   board_state: BoardState,
 *   get_cell_world: (cell: Cell) => WorldPoint,
 *   tile_size_px: number,
 *   border_color: number,
 *   border_thickness_px: number,
 *   number_mode_style?: { font_family: string, tile_font_size_px: number, tile_fill_color: number, tile_fill_alpha: number }
 * }} options
 * @returns {{
 *   tiles_layer: Container,
 *   tile_views: Map<string, TileView>,
 *   set_pose: (tile_id: string, world_pos: WorldPoint, rot_steps: number) => void,
 *   set_layout: (tile_size_px: number, get_cell_world: (cell: Cell) => WorldPoint) => void,
 *   set_tile_textures: (tile_textures: Map<string, import("pixi.js").Texture>) => void,
 *   set_border_thickness: (border_thickness_px: number) => void,
 *   set_number_mode_font_size: (tile_font_size_px: number) => void,
 *   set_border_color: (tile_id: string, color: number) => void,
 *   set_emphasis: (tile_id: string, is_emphasized: boolean) => void,
 *   sync_all_from_state: (state: BoardState) => void
 * }}
 */
export function create_tile_views(options) {
  const tiles_layer = new Container();
  tiles_layer.sortableChildren = true;
  let tile_size_px = options.tile_size_px;
  let get_cell_world = options.get_cell_world;
  let border_thickness_px = options.border_thickness_px;
  const overline_gap_px = 2;
  const overline_height_px = 1;
  const overline_width_ratio = 0.6;
  /** @type {Map<string, TileView>} */
  const tile_views = new Map();

  if (options.mode === "n" && options.grid) {
    const style = options.number_mode_style ?? {
      font_family: "Open Sans, sans-serif",
      tile_font_size_px: Math.max(12, Math.min(32, Math.round(options.tile_size_px * 0.32))),
      tile_fill_color: 0x333333,
      tile_fill_alpha: 0.6
    };

    for (let cell_index = 0; cell_index < options.grid.all_cells.length; cell_index += 1) {
      const cell = options.grid.all_cells[cell_index];
      const tile_id = cell_key(cell);
      const display_label = cell_to_label(cell);

      const container = new Container();
      const hex_fill = new Graphics();
      draw_hex_fill(
        hex_fill,
        tile_size_px,
        style.tile_fill_color,
        style.tile_fill_alpha
      );
      const label_text = new Text({
        text: display_label,
        style: {
          fontFamily: style.font_family,
          fontSize: style.tile_font_size_px,
          fill: 0xffffff
        }
      });
      label_text.anchor.set(0.5, 0.5);

      const overline = new Graphics();
      const text_half_width = style.tile_font_size_px * 0.65 * overline_width_ratio;
      const line_y = -style.tile_font_size_px / 2 - overline_gap_px;
      overline.moveTo(-text_half_width, line_y);
      overline.lineTo(text_half_width, line_y);
      overline.stroke({ width: overline_height_px, color: 0xffffff });

      const border = new Graphics();
      draw_border(
        border,
        tile_size_px,
        options.border_color,
        border_thickness_px
      );

      container.addChild(hex_fill);
      container.addChild(label_text);
      container.addChild(overline);
      container.addChild(border);
      tiles_layer.addChild(container);
      tile_views.set(tile_id, {
        container,
        border,
        hex_fill,
        label_text,
        overline_graphics: overline
      });
    }
  } else {
    for (const [tile_id, texture] of options.tile_textures.entries()) {
      const container = new Container();
      const sprite = new Sprite(texture);
      sprite.anchor.set(0.5, 0.5);
      const border = new Graphics();
      draw_border(
        border,
        tile_size_px,
        options.border_color,
        border_thickness_px
      );

      container.addChild(sprite);
      container.addChild(border);
      tiles_layer.addChild(container);
      tile_views.set(tile_id, { container, border, sprite });
    }
  }

  /**
   * @param {Graphics} overline_graphics
   * @param {number} tile_font_size_px
   */
  function redraw_number_mode_overline(overline_graphics, tile_font_size_px) {
    const text_half_width = tile_font_size_px * 0.65 * overline_width_ratio;
    const line_y = -tile_font_size_px / 2 - overline_gap_px;
    overline_graphics.clear();
    overline_graphics.moveTo(-text_half_width, line_y);
    overline_graphics.lineTo(text_half_width, line_y);
    overline_graphics.stroke({ width: overline_height_px, color: 0xffffff });
  }

  /**
   * @param {number} next_tile_size_px
   */
  function redraw_tile_geometry(next_tile_size_px) {
    for (const tile_view of tile_views.values()) {
      draw_border(tile_view.border, next_tile_size_px, options.border_color, border_thickness_px);
      if (options.mode !== "n") {
        continue;
      }
      if (tile_view.hex_fill) {
        const style = options.number_mode_style ?? {
          font_family: "Open Sans, sans-serif",
          tile_font_size_px: Math.max(12, Math.min(32, Math.round(next_tile_size_px * 0.32))),
          tile_fill_color: 0x333333,
          tile_fill_alpha: 0.6
        };
        draw_hex_fill(tile_view.hex_fill, next_tile_size_px, style.tile_fill_color, style.tile_fill_alpha);
      }
    }
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
   * @param {number} next_tile_size_px
   * @param {(cell: Cell) => WorldPoint} next_get_cell_world
   */
  function set_layout(next_tile_size_px, next_get_cell_world) {
    tile_size_px = next_tile_size_px;
    get_cell_world = next_get_cell_world;
    redraw_tile_geometry(tile_size_px);
  }

  /**
   * @param {Map<string, import("pixi.js").Texture>} next_tile_textures
   */
  function set_tile_textures(next_tile_textures) {
    if (options.mode !== "i") {
      return;
    }
    for (const [tile_id, tile_view] of tile_views.entries()) {
      if (!tile_view.sprite) {
        continue;
      }
      const next_texture = next_tile_textures.get(tile_id);
      if (!next_texture) {
        continue;
      }
      tile_view.sprite.texture = next_texture;
    }
  }

  /**
   * @param {number} next_border_thickness_px
   */
  function set_border_thickness(next_border_thickness_px) {
    border_thickness_px = next_border_thickness_px;
    for (const tile_view of tile_views.values()) {
      draw_border(tile_view.border, tile_size_px, options.border_color, border_thickness_px);
    }
  }

  /**
   * @param {number} tile_font_size_px
   */
  function set_number_mode_font_size(tile_font_size_px) {
    if (options.mode !== "n") {
      return;
    }
    for (const tile_view of tile_views.values()) {
      if (!tile_view.label_text || !tile_view.overline_graphics) {
        continue;
      }
      tile_view.label_text.style.fontSize = tile_font_size_px;
      redraw_number_mode_overline(tile_view.overline_graphics, tile_font_size_px);
    }
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
    draw_border(tile_view.border, tile_size_px, color, border_thickness_px);
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
      const world_pos = get_cell_world(parse_cell_key(cell_key));
      set_pose(tile_id, world_pos, rotation_steps);
    }
  }

  return {
    tiles_layer,
    tile_views,
    set_pose,
    set_layout,
    set_tile_textures,
    set_border_thickness,
    set_number_mode_font_size,
    set_border_color,
    set_emphasis,
    sync_all_from_state
  };
}

