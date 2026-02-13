// @ts-check

import { Application, Container, Graphics, Sprite, Text, Texture } from "pixi.js";
import { cell_to_label } from "./core/cell_label.js";
import { create_hex_points, world_from_cell } from "./core/coords.js";
import {
  derive_grid_shape,
  derive_tile_size,
  derive_tile_size_and_origin_viewport_only
} from "./core/derive_params.js";
import { create_grid, get_grid_bounds } from "./core/grid.js";
import { apply_move } from "./core/move.js";
import { build_anchor_instances, get_operator_defs } from "./core/operators.js";
import { create_solved_state, is_solved } from "./core/state.js";
import { bake_tile_textures } from "./render/bake.js";
import { create_tile_views } from "./render/tile_view.js";
import { create_input_controller } from "./ui/input.js";

const IMAGE_PATH = "./assets/Sandro_Botticelli_The_Birth_of_Venus.jpg";
const DEFAULT_TARGET_CELL_COUNT = 75;
const SCRAMBLE_MOVES = 120;
const PADDING_IN_TILE_UNITS = 0.5;
const VIEWPORT_MARGIN_PX = 24;
const PIVOT_HIT_RADIUS_MIN_PX = 10;
const ANIMATION_MS = 180;
const BORDER_THICKNESS_PX = 2;
const BORDER_COLOR = 0xe6e6e6;
const HOVER_HIGHLIGHT_COLOR = 0x26d6ff;
const HOVER_OUTLINE_THICKNESS_PX = 4;
const HOVER_OUTLINE_EDGE_KEY_PRECISION = 3;
const OPERATOR_LABEL_COLOR = 0xffffff;
const PIVOT_MARKER_INNER_RADIUS_PX = 4;
const PIVOT_MARKER_STROKE_WIDTH_PX = 1;
const PIVOT_MARKER_FILL_COLOR = 0xffffff;
const PIVOT_MARKER_STROKE_COLOR = 0x000000;
const PIVOT_MARKER_ALPHA = 1.0;
const NORMAL_BACKGROUND_ALPHA = 0.75;
const PREVIEW_BACKGROUND_ALPHA = 1.0;
// CHANGE NOTE: runtime gameplay is restricted to vertex3 only.
// ROLLBACK: include the other operator ids again to re-enable full operator set.
const ENABLED_OPERATOR_IDS = ["vertex3_120"];
const NUMBER_MODE_DEFAULT_GRID_H = 3;
const NUMBER_MODE_DEFAULT_GRID_W = 7;
const NUMBER_MODE_TILE_FONT_SIZE_RATIO = 0.32;
const NUMBER_MODE_BACKGROUND_FONT_SIZE_RATIO = 0.5;
const NUMBER_MODE_BACKGROUND_X_OFFSET_RATIO = -0.44;
const NUMBER_MODE_TILE_FILL_COLOR = 0x333333;
const NUMBER_MODE_TILE_FILL_ALPHA = 0.6;
const FONT_FAMILY = "Open Sans, sans-serif";
const SUCCESS_POPUP_WIDTH_PX = 360;
const SUCCESS_POPUP_HEIGHT_PX = 132;
const SUCCESS_POPUP_MARGIN_TOP_PX = 52;
const SUCCESS_POPUP_BACKGROUND_COLOR = 0x202020;
const SUCCESS_POPUP_BORDER_COLOR = 0x66dd66;
const SUCCESS_POPUP_TEXT_COLOR = 0xffffff;
const SUCCESS_POPUP_BUTTON_BACKGROUND_COLOR = 0x2d7f2d;
const SUCCESS_POPUP_BUTTON_TEXT_COLOR = 0xffffff;
const SUCCESS_POPUP_BUTTON_WIDTH_PX = 96;
const SUCCESS_POPUP_BUTTON_HEIGHT_PX = 34;
const SUCCESS_POPUP_CORNER_RADIUS_PX = 12;

/**
 * @typedef {{
 *   mode: "n" | "i",
 *   grid_w: number,
 *   grid_h: number,
 *   target_cell_count: number,
 *   is_explore_mode: boolean
 * }} UrlParams
 */

/**
 * Parse and validate mode, h, w, n, explore from URL. In number mode n is ignored.
 * If exactly one of h or w is present, throws.
 *
 * @returns {UrlParams}
 */
function parse_url_params() {
  const search_params = new URLSearchParams(window.location.search);
  const mode_param = search_params.get("mode");
  const mode = mode_param === "i" ? "i" : "n";
  const h_param = search_params.get("h");
  const w_param = search_params.get("w");
  const n_param = search_params.get("n");
  const explore_param = search_params.get("explore");
  const is_explore_mode = explore_param === "1";

  if (mode === "n") {
    const has_h = h_param !== null && h_param !== "";
    const has_w = w_param !== null && w_param !== "";
    if (has_h !== has_w) {
      throw new Error("URL params h and w must both be present or both omitted.");
    }
    let grid_w = NUMBER_MODE_DEFAULT_GRID_W;
    let grid_h = NUMBER_MODE_DEFAULT_GRID_H;
    if (has_h && has_w) {
      const parsed_w = Number(w_param);
      const parsed_h = Number(h_param);
      if (!Number.isFinite(parsed_w) || !Number.isFinite(parsed_h)) {
        throw new Error("URL params h and w must be finite numbers.");
      }
      grid_w = Math.round(parsed_w);
      grid_h = Math.round(parsed_h);
      if (grid_w < 1 || grid_w > 50) {
        throw new Error("URL param w must be between 1 and 50.");
      }
      if (grid_h < 1 || grid_h > 35) {
        throw new Error("URL param h must be between 1 and 35.");
      }
      if (grid_h % 2 === 0) {
        throw new Error("URL param h (grid height) must be odd.");
      }
    }
    return { mode: "n", grid_w, grid_h, target_cell_count: 0, is_explore_mode };
  }

  // Image mode: derive grid from n (target cell count).
  let target_cell_count = DEFAULT_TARGET_CELL_COUNT;
  if (n_param !== null && n_param !== "") {
    const parsed = Number(n_param);
    if (Number.isFinite(parsed)) {
      const rounded = Math.round(parsed);
      if (rounded >= 7 && rounded <= 400) {
        target_cell_count = rounded;
      }
    }
  }
  return {
    mode: "i",
    grid_w: 0,
    grid_h: 0,
    target_cell_count,
    is_explore_mode
  };
}

/**
 * @typedef {{ q: number, r: number }} Cell
 */

/**
 * @typedef {{ x: number, y: number }} WorldPoint
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
 * @param {string} image_path
 * @returns {Promise<HTMLImageElement>}
 */
function load_image(image_path) {
  return new Promise((resolve, reject) => {
    const image_element = new Image();
    image_element.onload = () => resolve(image_element);
    image_element.onerror = () => reject(new Error(`Could not load image: ${image_path}`));
    image_element.src = image_path;
  });
}

/**
 * @param {number} duration_ms
 * @param {(progress: number) => void} on_update
 * @returns {Promise<void>}
 */
function tween_progress(duration_ms, on_update) {
  return new Promise((resolve) => {
    const start_time = performance.now();
    /**
     * @param {number} now
     */
    function frame(now) {
      const progress = Math.min(1, (now - start_time) / duration_ms);
      on_update(progress);
      if (progress >= 1) {
        resolve();
      } else {
        requestAnimationFrame(frame);
      }
    }
    requestAnimationFrame(frame);
  });
}

/**
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function random_int(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

const application = new Application();

await application.init({
  resizeTo: window,
  background: "#101010",
  antialias: true
});

const app_container_element = document.getElementById("app");
if (!app_container_element) {
  throw new Error("Missing #app container element.");
}
app_container_element.appendChild(application.canvas);

const url_params = parse_url_params();
const is_explore_mode = url_params.is_explore_mode;

/** @type {"n" | "i"} */
const game_mode = url_params.mode;
/** @type {import("./core/grid.js").Grid} */
let grid;
/** @type {{ tile_size_px: number, image_rect?: { x: number, y: number, width: number, height: number } }} */
let tile_derivation;
/** @type {{ x: number, y: number }} */
let board_origin;
/** @type {(cell: Cell) => WorldPoint} */
let get_cell_world;
/** @type {Map<string, import("pixi.js").Texture> | null} */
let tile_textures = null;
/** @type {Sprite | null} */
let background_sprite = null;
/** @type {{ font_family: string, tile_font_size_px: number, tile_fill_color: number, tile_fill_alpha: number } | undefined} */
let number_mode_style = undefined;

const background_layer = new Container();

if (game_mode === "i") {
  const source_image = await load_image(IMAGE_PATH);
  const image_aspect = source_image.width / source_image.height;
  const grid_derivation = derive_grid_shape({
    target_cell_count: url_params.target_cell_count,
    image_aspect,
    padding_in_tile_units: PADDING_IN_TILE_UNITS
  });
  tile_derivation = derive_tile_size({
    viewport_width: application.screen.width,
    viewport_height: application.screen.height,
    image_width: source_image.width,
    image_height: source_image.height,
    grid_w: grid_derivation.grid_w,
    grid_h: grid_derivation.grid_h,
    padding_in_tile_units: PADDING_IN_TILE_UNITS,
    viewport_margin_px: VIEWPORT_MARGIN_PX
  });
  const image_rect = tile_derivation.image_rect;
  if (!image_rect) {
    throw new Error("Image mode requires image_rect.");
  }
  grid = create_grid(grid_derivation.grid_w, grid_derivation.grid_h);
  const bounds_at_origin = get_grid_bounds(
    grid,
    tile_derivation.tile_size_px,
    { x: 0, y: 0 }
  );
  board_origin = {
    x: image_rect.x + image_rect.width / 2 - bounds_at_origin.center_x,
    y: image_rect.y + image_rect.height / 2 - bounds_at_origin.center_y
  };
  get_cell_world = (/** @param {Cell} cell */ cell) =>
    world_from_cell(cell, tile_derivation.tile_size_px, board_origin);

  tile_textures = bake_tile_textures({
    image: source_image,
    tile_size_px: tile_derivation.tile_size_px,
    home_cells: grid.all_cells,
    get_cell_world,
    image_rect
  });

  background_sprite = new Sprite(Texture.from(source_image));
  background_sprite.position.set(image_rect.x, image_rect.y);
  background_sprite.width = image_rect.width;
  background_sprite.height = image_rect.height;
  background_sprite.alpha = NORMAL_BACKGROUND_ALPHA;
  background_layer.addChild(background_sprite);
} else {
  grid = create_grid(url_params.grid_w, url_params.grid_h);
  const viewport_derivation = derive_tile_size_and_origin_viewport_only(
    {
      viewport_width: application.screen.width,
      viewport_height: application.screen.height,
      grid_w: url_params.grid_w,
      grid_h: url_params.grid_h,
      padding_in_tile_units: PADDING_IN_TILE_UNITS,
      viewport_margin_px: VIEWPORT_MARGIN_PX
    },
    (tile_size_px) => {
      const bounds = get_grid_bounds(grid, tile_size_px, { x: 0, y: 0 });
      return { center_x: bounds.center_x, center_y: bounds.center_y };
    }
  );
  tile_derivation = {
    tile_size_px: viewport_derivation.tile_size_px,
    image_rect: undefined
  };
  board_origin = viewport_derivation.board_origin;
  get_cell_world = (/** @param {Cell} cell */ cell) =>
    world_from_cell(cell, tile_derivation.tile_size_px, board_origin);

  const tile_font_size_px = Math.max(
    12,
    Math.min(
      32,
      Math.round(tile_derivation.tile_size_px * NUMBER_MODE_TILE_FONT_SIZE_RATIO)
    )
  );
  number_mode_style = {
    font_family: FONT_FAMILY,
    tile_font_size_px,
    tile_fill_color: NUMBER_MODE_TILE_FILL_COLOR,
    tile_fill_alpha: NUMBER_MODE_TILE_FILL_ALPHA
  };
  const bg_font_size_px = Math.round(
    tile_font_size_px * NUMBER_MODE_BACKGROUND_FONT_SIZE_RATIO
  );
  const bg_x_offset_px =
    tile_derivation.tile_size_px * NUMBER_MODE_BACKGROUND_X_OFFSET_RATIO;
  const overline_gap_px = 1;
  const overline_stroke_px = 1;
  const bg_color = 0x888888;
  for (let cell_index = 0; cell_index < grid.all_cells.length; cell_index += 1) {
    const cell = grid.all_cells[cell_index];
    const world = get_cell_world(cell);
    const bg_container = new Container();
    bg_container.position.set(world.x + bg_x_offset_px, world.y);
    const bg_label = new Text({
      text: cell_to_label(cell),
      style: {
        fontFamily: FONT_FAMILY,
        fontSize: bg_font_size_px,
        fill: bg_color
      }
    });
    bg_label.anchor.set(0.5, 0.5);
    const line_half = bg_font_size_px * 0.4;
    const line_y = -bg_font_size_px / 2 - overline_gap_px;
    const overline_graphics = new Graphics();
    overline_graphics.moveTo(-line_half, line_y);
    overline_graphics.lineTo(line_half, line_y);
    overline_graphics.stroke({ width: overline_stroke_px, color: bg_color });
    bg_container.addChild(bg_label);
    bg_container.addChild(overline_graphics);
    background_layer.addChild(bg_container);
  }
}

/** @type {Map<string, AnchorInstance[]>} */
const instances_by_operator_id = new Map();
// CHANGE NOTE: previously we built instances for all operators from get_operator_defs().
// ROLLBACK: remove this filter and iterate all operator defs directly.
for (const operator_def of get_operator_defs().filter((operator_def) =>
  ENABLED_OPERATOR_IDS.includes(operator_def.id)
)) {
  instances_by_operator_id.set(
    operator_def.id,
    build_anchor_instances(grid, operator_def.id, get_cell_world, tile_derivation.tile_size_px)
  );
}

const board_state = create_solved_state(grid);
// CHANGE NOTE: scramble now samples from ENABLED_OPERATOR_IDS only.
// ROLLBACK: use Array.from(instances_by_operator_id.keys()) to sample all active operators.
const scramble_operator_ids = ENABLED_OPERATOR_IDS.filter((operator_id) =>
  instances_by_operator_id.has(operator_id)
);
if (!is_explore_mode) {
  for (let scramble_index = 0; scramble_index < SCRAMBLE_MOVES; scramble_index += 1) {
    if (scramble_operator_ids.length === 0) {
      break;
    }
    const random_operator_id = scramble_operator_ids[random_int(0, scramble_operator_ids.length - 1)];
    const operator_instances = instances_by_operator_id.get(random_operator_id) ?? [];
    if (operator_instances.length === 0) {
      continue;
    }
    const random_anchor_instance = operator_instances[random_int(0, operator_instances.length - 1)];
    const direction_sign = Math.random() < 0.5 ? /** @type {1} */ (1) : /** @type {-1} */ (-1);
    apply_move(board_state, random_anchor_instance, direction_sign);
  }
}

const tile_renderer = create_tile_views({
  mode: game_mode,
  tile_textures: tile_textures ?? new Map(),
  grid: game_mode === "n" ? grid : null,
  board_state,
  get_cell_world,
  tile_size_px: tile_derivation.tile_size_px,
  border_color: BORDER_COLOR,
  border_thickness_px: BORDER_THICKNESS_PX,
  number_mode_style: number_mode_style
});
tile_renderer.sync_all_from_state(board_state);

application.stage.addChild(background_layer);
application.stage.addChild(tile_renderer.tiles_layer);
const hover_outline_graphics = new Graphics();
application.stage.addChild(hover_outline_graphics);
const pivots_layer = new Container();
application.stage.addChild(pivots_layer);

const operator_help_text = new Text({
  text: "",
  style: {
    fill: OPERATOR_LABEL_COLOR,
    fontFamily: "Arial",
    fontSize: 15
  }
});
operator_help_text.position.set(16, 12);
application.stage.addChild(operator_help_text);

const success_popup_layer = new Container();
success_popup_layer.visible = false;
const success_popup_background = new Graphics();
const success_popup_title = new Text({
  text: "Puzzle solved!",
  style: {
    fill: SUCCESS_POPUP_TEXT_COLOR,
    fontFamily: FONT_FAMILY,
    fontSize: 28
  }
});
const success_popup_message = new Text({
  text: "You can keep playing. Close this message to continue.",
  style: {
    fill: SUCCESS_POPUP_TEXT_COLOR,
    fontFamily: FONT_FAMILY,
    fontSize: 15
  }
});
const success_popup_close_button = new Graphics();
const success_popup_close_label = new Text({
  text: "Continue",
  style: {
    fill: SUCCESS_POPUP_BUTTON_TEXT_COLOR,
    fontFamily: FONT_FAMILY,
    fontSize: 14
  }
});
success_popup_layer.addChild(success_popup_background);
success_popup_layer.addChild(success_popup_title);
success_popup_layer.addChild(success_popup_message);
success_popup_layer.addChild(success_popup_close_button);
success_popup_layer.addChild(success_popup_close_label);
application.stage.addChild(success_popup_layer);

/** @type {AnchorInstance | null} */
let hovered_instance = null;
/** @type {Set<string>} */
let highlighted_tile_ids = new Set();
let interaction_locked = false;
let is_preview_mode = false;
let has_shown_solved_notification = is_explore_mode;

/**
 * Draw static visuals for solved popup.
 */
function draw_success_popup() {
  success_popup_background.clear();
  success_popup_background.roundRect(
    0,
    0,
    SUCCESS_POPUP_WIDTH_PX,
    SUCCESS_POPUP_HEIGHT_PX,
    SUCCESS_POPUP_CORNER_RADIUS_PX
  );
  success_popup_background.fill({ color: SUCCESS_POPUP_BACKGROUND_COLOR, alpha: 0.95 });
  success_popup_background.stroke({ color: SUCCESS_POPUP_BORDER_COLOR, width: 2 });

  success_popup_title.anchor.set(0.5, 0);
  success_popup_title.position.set(SUCCESS_POPUP_WIDTH_PX / 2, 14);
  success_popup_message.anchor.set(0.5, 0);
  success_popup_message.position.set(SUCCESS_POPUP_WIDTH_PX / 2, 54);

  const button_x = (SUCCESS_POPUP_WIDTH_PX - SUCCESS_POPUP_BUTTON_WIDTH_PX) / 2;
  const button_y = SUCCESS_POPUP_HEIGHT_PX - SUCCESS_POPUP_BUTTON_HEIGHT_PX - 12;
  success_popup_close_button.clear();
  success_popup_close_button.roundRect(
    button_x,
    button_y,
    SUCCESS_POPUP_BUTTON_WIDTH_PX,
    SUCCESS_POPUP_BUTTON_HEIGHT_PX,
    8
  );
  success_popup_close_button.fill({
    color: SUCCESS_POPUP_BUTTON_BACKGROUND_COLOR,
    alpha: 1
  });
  success_popup_close_button.stroke({ color: SUCCESS_POPUP_TEXT_COLOR, width: 1 });

  success_popup_close_label.anchor.set(0.5, 0.5);
  success_popup_close_label.position.set(
    button_x + SUCCESS_POPUP_BUTTON_WIDTH_PX / 2,
    button_y + SUCCESS_POPUP_BUTTON_HEIGHT_PX / 2
  );
}

/**
 * Keep solved popup centered on current viewport width.
 */
function layout_success_popup() {
  success_popup_layer.position.set(
    Math.round((application.screen.width - SUCCESS_POPUP_WIDTH_PX) / 2),
    SUCCESS_POPUP_MARGIN_TOP_PX
  );
}

function hide_success_popup() {
  success_popup_layer.visible = false;
}

function show_success_popup() {
  draw_success_popup();
  layout_success_popup();
  success_popup_layer.visible = true;
}

success_popup_close_button.eventMode = "static";
success_popup_close_button.cursor = "pointer";
success_popup_close_button.on("pointertap", () => {
  hide_success_popup();
});
window.addEventListener("resize", () => {
  layout_success_popup();
});

/**
 * @param {boolean} next_preview_mode
 */
function apply_preview_mode(next_preview_mode) {
  is_preview_mode = next_preview_mode;
  tile_renderer.tiles_layer.visible = !is_preview_mode;
  hover_outline_graphics.visible = !is_preview_mode;
  pivots_layer.visible = !is_preview_mode;
  if (background_sprite) {
    background_sprite.alpha = is_preview_mode
      ? PREVIEW_BACKGROUND_ALPHA
      : NORMAL_BACKGROUND_ALPHA;
  }
}

/**
 * @param {Iterable<string>} tile_ids
 * @param {boolean} is_emphasized
 */
function set_tile_emphasis(tile_ids, is_emphasized) {
  for (const tile_id of tile_ids) {
    tile_renderer.set_emphasis(tile_id, is_emphasized);
  }
}

/**
 * @param {AnchorInstance | null} instance
 * @returns {Set<string>}
 */
function collect_highlight_tile_ids(instance) {
  /** @type {Set<string>} */
  const tile_ids = new Set();
  if (!instance) {
    return tile_ids;
  }
  for (const cell_key of instance.cells) {
    const tile_id = board_state.cell_to_tile_id.get(cell_key);
    if (tile_id) {
      tile_ids.add(tile_id);
    }
  }
  return tile_ids;
}

/**
 * Convert world point numbers to a stable string token for edge keys.
 *
 * @param {number} value
 * @returns {string}
 */
function quantize_outline_value(value) {
  return value.toFixed(HOVER_OUTLINE_EDGE_KEY_PRECISION);
}

/**
 * Build an orientation-independent key for an undirected edge.
 *
 * @param {WorldPoint} edge_start
 * @param {WorldPoint} edge_end
 * @returns {string}
 */
function create_outline_edge_key(edge_start, edge_end) {
  const start_key =
    `${quantize_outline_value(edge_start.x)},${quantize_outline_value(edge_start.y)}`;
  const end_key =
    `${quantize_outline_value(edge_end.x)},${quantize_outline_value(edge_end.y)}`;
  return start_key < end_key ? `${start_key}|${end_key}` : `${end_key}|${start_key}`;
}

/**
 * Draw only the outside perimeter of the hovered cell set.
 *
 * @param {AnchorInstance | null} instance
 */
function redraw_hover_outline(instance) {
  hover_outline_graphics.clear();
  if (!instance) {
    return;
  }

  /**
   * @typedef {{ start: WorldPoint, end: WorldPoint, count: number }} OutlineEdgeRecord
   */
  /** @type {Map<string, OutlineEdgeRecord>} */
  const edge_records_by_key = new Map();
  const selected_cell_key_set = new Set(instance.cells);
  const hex_points = create_hex_points(tile_derivation.tile_size_px);
  for (const selected_cell_key of selected_cell_key_set) {
    const [q_text, r_text] = selected_cell_key.split(",");
    const selected_cell = { q: Number(q_text), r: Number(r_text) };
    const selected_cell_world = get_cell_world(selected_cell);
    for (let direction_index = 0; direction_index < 6; direction_index += 1) {
      const start_corner = hex_points[direction_index];
      const end_corner = hex_points[(direction_index + 1) % 6];
      const edge_start = {
        x: selected_cell_world.x + start_corner.x,
        y: selected_cell_world.y + start_corner.y
      };
      const edge_end = {
        x: selected_cell_world.x + end_corner.x,
        y: selected_cell_world.y + end_corner.y
      };
      const edge_key = create_outline_edge_key(edge_start, edge_end);
      const existing_record = edge_records_by_key.get(edge_key);
      if (existing_record) {
        existing_record.count += 1;
      } else {
        edge_records_by_key.set(edge_key, {
          start: edge_start,
          end: edge_end,
          count: 1
        });
      }
    }
  }

  // Only edges that appear once belong to the outer perimeter.
  for (const edge_record of edge_records_by_key.values()) {
    if (edge_record.count !== 1) {
      continue;
    }
    hover_outline_graphics.moveTo(edge_record.start.x, edge_record.start.y);
    hover_outline_graphics.lineTo(edge_record.end.x, edge_record.end.y);
  }
  hover_outline_graphics.stroke({
    width: HOVER_OUTLINE_THICKNESS_PX,
    color: HOVER_HIGHLIGHT_COLOR
  });
}

/**
 * @param {AnchorInstance | null} next_hovered_instance
 */
function update_hover_highlight(next_hovered_instance) {
  set_tile_emphasis(highlighted_tile_ids, false);
  hovered_instance = next_hovered_instance;
  highlighted_tile_ids = collect_highlight_tile_ids(hovered_instance);
  set_tile_emphasis(highlighted_tile_ids, true);
  redraw_hover_outline(hovered_instance);
}

/**
 * @param {string} operator_id
 */
function redraw_pivot_markers(operator_id) {
  pivots_layer.removeChildren();
  const instances = instances_by_operator_id.get(operator_id) ?? [];
  for (const instance of instances) {
    const pivot_marker = new Graphics();
    // Outer circle (black stroke/ring)
    pivot_marker.circle(0, 0, PIVOT_MARKER_INNER_RADIUS_PX + PIVOT_MARKER_STROKE_WIDTH_PX);
    pivot_marker.fill({ color: PIVOT_MARKER_STROKE_COLOR });
    // Inner circle (white fill)
    pivot_marker.circle(0, 0, PIVOT_MARKER_INNER_RADIUS_PX);
    pivot_marker.fill({ color: PIVOT_MARKER_FILL_COLOR, alpha: PIVOT_MARKER_ALPHA });
    pivot_marker.position.set(instance.anchor_world.x, instance.anchor_world.y);
    pivots_layer.addChild(pivot_marker);
  }
}

/**
 * @param {1 | -1} direction_sign
 * @param {AnchorInstance} anchor_instance
 * @returns {Promise<void>}
 */
async function run_move(direction_sign, anchor_instance) {
  if (interaction_locked) {
    return;
  }
  interaction_locked = true;
  input_controller.set_interaction_locked(true);
  update_hover_highlight(null);

  const moved_tile_ids_before = [...anchor_instance.cells, ...(anchor_instance.spin_cells ?? [])]
    .map((cell_key) => board_state.cell_to_tile_id.get(cell_key))
    .filter((tile_id) => typeof tile_id === "string");
  /** @type {Map<string, { x: number, y: number, angle: number }>} */
  const pose_before_by_tile_id = new Map();
  for (const tile_id of moved_tile_ids_before) {
    const cell_key = board_state.tile_id_to_cell.get(tile_id);
    if (!cell_key) {
      continue;
    }
    const [q_text, r_text] = cell_key.split(",");
    const world_pos = get_cell_world({ q: Number(q_text), r: Number(r_text) });
    const angle = (board_state.tile_rot.get(tile_id) ?? 0) * (Math.PI / 3);
    pose_before_by_tile_id.set(tile_id, { x: world_pos.x, y: world_pos.y, angle });
  }

  const moved_tile_ids = apply_move(board_state, anchor_instance, direction_sign);
  const angle_delta = -anchor_instance.rotation_steps_cw * direction_sign * (Math.PI / 3);
  const pivot_x = anchor_instance.anchor_world.x;
  const pivot_y = anchor_instance.anchor_world.y;

  await tween_progress(ANIMATION_MS, (progress) => {
    const theta = angle_delta * progress;
    const cosine_theta = Math.cos(theta);
    const sine_theta = Math.sin(theta);
    for (const tile_id of moved_tile_ids) {
      const pose_before = pose_before_by_tile_id.get(tile_id);
      const destination_cell_key = board_state.tile_id_to_cell.get(tile_id);
      if (!pose_before || !destination_cell_key) {
        continue;
      }
      const start_offset_x = pose_before.x - pivot_x;
      const start_offset_y = pose_before.y - pivot_y;
      const x = pivot_x + start_offset_x * cosine_theta - start_offset_y * sine_theta;
      const y = pivot_y + start_offset_x * sine_theta + start_offset_y * cosine_theta;
      const angle = pose_before.angle + angle_delta * progress;
      const tile_view = tile_renderer.tile_views.get(tile_id);
      if (!tile_view) {
        continue;
      }
      tile_view.container.position.set(x, y);
      tile_view.container.rotation = angle;
    }
  });

  tile_renderer.sync_all_from_state(board_state);
  if (is_solved(board_state) && !has_shown_solved_notification) {
    has_shown_solved_notification = true;
    show_success_popup();
    console.info("Puzzle solved.");
  }

  interaction_locked = false;
  input_controller.set_interaction_locked(false);
}

/**
 * @param {string} operator_id
 */
function update_operator_help_text(operator_id) {
  const operator_name_by_id = {
    ring6_60: "1: ring6_60 (6 tiles, 120°)",
    alt3_even_120: "2: alt3_even_120 (3 tiles, 120°)",
    alt3_odd_120: "3: alt3_odd_120 (3 tiles, 120°)",
    vertex3_120: "4: vertex3_120 (3 tiles, 120°)"
  };
  const selected_operator_label = operator_name_by_id[
    /** @type {"ring6_60" | "alt3_even_120" | "alt3_odd_120" | "vertex3_120"} */ (operator_id)
  ];
  operator_help_text.text =
    `Operator: ${selected_operator_label}\n` +
    "Switch operator: only 4 enabled (vertex3_120) | Space: image preview | Left click: CW | Right click: CCW";
}

const input_controller = create_input_controller({
  canvas_element: application.canvas,
  pivot_hit_radius_px: Math.max(PIVOT_HIT_RADIUS_MIN_PX, tile_derivation.tile_size_px * 0.33),
  /** @param {string} operator_id */
  on_operator_change(operator_id) {
    // CHANGE NOTE: block switching to disabled operators at runtime.
    // ROLLBACK: remove this guard to allow normal 1..4 operator switching.
    if (!ENABLED_OPERATOR_IDS.includes(operator_id)) {
      return;
    }
    const instances = instances_by_operator_id.get(operator_id) ?? [];
    input_controller.set_instances(instances);
    update_operator_help_text(operator_id);
    update_hover_highlight(null);
    redraw_pivot_markers(operator_id);
  },
  /** @param {AnchorInstance | null} instance */
  on_hover_change(instance) {
    if (interaction_locked) {
      return;
    }
    update_hover_highlight(instance);
  },
  /**
   * @param {1 | -1} direction_sign
   * @param {AnchorInstance} instance
   */
  on_move_request(direction_sign, instance) {
    if (is_preview_mode || success_popup_layer.visible) {
      return;
    }
    void run_move(direction_sign, instance);
  }
});

// CHANGE NOTE: initial operator is forced to vertex3_120 in restricted mode.
// ROLLBACK: restore previous ring6_60 initialization if full set is re-enabled.
input_controller.set_instances(instances_by_operator_id.get("vertex3_120") ?? []);
update_operator_help_text("vertex3_120");
redraw_pivot_markers("vertex3_120");

window.addEventListener("keydown", (keyboard_event) => {
  if (keyboard_event.code !== "Space") {
    return;
  }
  keyboard_event.preventDefault();
  apply_preview_mode(!is_preview_mode);
});
