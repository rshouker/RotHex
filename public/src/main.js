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
const BORDER_COLOR = 0xe6e6e6;
const HOVER_HIGHLIGHT_COLOR = 0x26d6ff;
const HOVER_OUTLINE_EDGE_KEY_PRECISION = 3;
const OPERATOR_LABEL_COLOR = 0xffffff;
const PIVOT_MARKER_FILL_COLOR = 0xffff00;
const PIVOT_MARKER_STROKE_COLOR = 0x000000;
const PIVOT_MARKER_ALPHA = 1.0;
const NORMAL_BACKGROUND_ALPHA = 0.75;
const PREVIEW_BACKGROUND_ALPHA = 1.0;
const NUMBER_MODE_DEFAULT_GRID_H = 3;
const NUMBER_MODE_DEFAULT_GRID_W = 7;
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
 * Relative sizing tuning section.
 * Values scale from min(grid_confines_rect.width, grid_confines_rect.height).
 *
 * @typedef {{ ratio: number, min_px: number, max_px?: number }} RelativeSizeRule
 */

/**
 * @typedef {{
 *   border_thickness: RelativeSizeRule,
 *   hover_outline_thickness: RelativeSizeRule,
 *   pivot_marker_inner_radius: RelativeSizeRule,
 *   pivot_marker_stroke_width: RelativeSizeRule,
 *   pivot_hit_radius: RelativeSizeRule,
 *   number_mode_tile_font_size: RelativeSizeRule,
 *   number_mode_background_font_size: RelativeSizeRule,
 *   operator_help_font_size: RelativeSizeRule,
 *   success_popup_title_font_size: RelativeSizeRule,
 *   success_popup_message_font_size: RelativeSizeRule,
 *   success_popup_button_font_size: RelativeSizeRule
 * }} RelativeSizeRuleSet
 */

/** @type {RelativeSizeRuleSet} */
const RELATIVE_SIZE_RULES = {
  border_thickness: { ratio: 0.0035, min_px: 1 },
  hover_outline_thickness: { ratio: 0.0047, min_px: 2 },
  pivot_marker_inner_radius: { ratio: 0.0058, min_px: 2 },
  pivot_marker_stroke_width: { ratio: 0.0023, min_px: 1 },
  pivot_hit_radius: { ratio: 0.012, min_px: Math.max(2, PIVOT_HIT_RADIUS_MIN_PX) },
  number_mode_tile_font_size: { ratio: 0.03, min_px: 12, max_px: 32 },
  number_mode_background_font_size: { ratio: 0.015, min_px: 8, max_px: 24 },
  operator_help_font_size: { ratio: 0.024, min_px: 12, max_px: 36 },
  success_popup_title_font_size: { ratio: 0.032, min_px: 14, max_px: 44 },
  success_popup_message_font_size: { ratio: 0.017, min_px: 10, max_px: 24 },
  success_popup_button_font_size: { ratio: 0.016, min_px: 10, max_px: 24 }
};

/**
 * @typedef {{
 *   border_thickness_px: number,
 *   hover_outline_thickness_px: number,
 *   pivot_marker_inner_radius_px: number,
 *   pivot_marker_stroke_width_px: number,
 *   pivot_hit_radius_px: number,
 *   number_mode_tile_font_size_px: number,
 *   number_mode_background_font_size_px: number,
 *   operator_help_font_size_px: number,
 *   success_popup_title_font_size_px: number,
 *   success_popup_message_font_size_px: number,
 *   success_popup_button_font_size_px: number
 * }} ResolvedRelativeSizes
 */

/**
 * Compute one relative pixel value with explicit clamp diagnostics.
 *
 * @param {number} reference_size_px
 * @param {RelativeSizeRule} rule
 * @param {string} context_label
 * @returns {number}
 */
function compute_relative_size_px(reference_size_px, rule, context_label) {
  const raw_size_px = reference_size_px * rule.ratio;
  const max_px = rule.max_px ?? Number.POSITIVE_INFINITY;
  const clamped_size_px = Math.max(rule.min_px, Math.min(raw_size_px, max_px));
  const resolved_size_px = Math.round(clamped_size_px);
  console.info("[Relative size] Calculation:", {
    context: context_label,
    reference_size_px,
    ratio: rule.ratio,
    raw_size_px,
    min_px: rule.min_px,
    max_px: Number.isFinite(max_px) ? max_px : null,
    clamped_size_px,
    resolved_size_px
  });
  return resolved_size_px;
}

/**
 * Resolve all runtime visual sizes from a confining rect.
 *
 * @param {{ x: number, y: number, width: number, height: number }} grid_confines_rect
 * @param {string} reason_label
 * @returns {ResolvedRelativeSizes}
 */
function resolve_relative_sizes(grid_confines_rect, reason_label) {
  const reference_size_px = Math.min(grid_confines_rect.width, grid_confines_rect.height);
  console.info("[Relative size] Source confinement:", {
    reason: reason_label,
    grid_confines_rect,
    reference_size_px
  });
  const resolved_sizes = {
    border_thickness_px: compute_relative_size_px(
      reference_size_px,
      RELATIVE_SIZE_RULES.border_thickness,
      "border_thickness_px"
    ),
    hover_outline_thickness_px: compute_relative_size_px(
      reference_size_px,
      RELATIVE_SIZE_RULES.hover_outline_thickness,
      "hover_outline_thickness_px"
    ),
    pivot_marker_inner_radius_px: compute_relative_size_px(
      reference_size_px,
      RELATIVE_SIZE_RULES.pivot_marker_inner_radius,
      "pivot_marker_inner_radius_px"
    ),
    pivot_marker_stroke_width_px: compute_relative_size_px(
      reference_size_px,
      RELATIVE_SIZE_RULES.pivot_marker_stroke_width,
      "pivot_marker_stroke_width_px"
    ),
    pivot_hit_radius_px: compute_relative_size_px(
      reference_size_px,
      RELATIVE_SIZE_RULES.pivot_hit_radius,
      "pivot_hit_radius_px"
    ),
    number_mode_tile_font_size_px: compute_relative_size_px(
      reference_size_px,
      RELATIVE_SIZE_RULES.number_mode_tile_font_size,
      "number_mode_tile_font_size_px"
    ),
    number_mode_background_font_size_px: compute_relative_size_px(
      reference_size_px,
      RELATIVE_SIZE_RULES.number_mode_background_font_size,
      "number_mode_background_font_size_px"
    ),
    operator_help_font_size_px: compute_relative_size_px(
      reference_size_px,
      RELATIVE_SIZE_RULES.operator_help_font_size,
      "operator_help_font_size_px"
    ),
    success_popup_title_font_size_px: compute_relative_size_px(
      reference_size_px,
      RELATIVE_SIZE_RULES.success_popup_title_font_size,
      "success_popup_title_font_size_px"
    ),
    success_popup_message_font_size_px: compute_relative_size_px(
      reference_size_px,
      RELATIVE_SIZE_RULES.success_popup_message_font_size,
      "success_popup_message_font_size_px"
    ),
    success_popup_button_font_size_px: compute_relative_size_px(
      reference_size_px,
      RELATIVE_SIZE_RULES.success_popup_button_font_size,
      "success_popup_button_font_size_px"
    )
  };
  console.info("[Relative size] Resolved size map:", {
    reason: reason_label,
    resolved_sizes
  });
  return resolved_sizes;
}

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
 * Parse and validate mode, h, w, n, explore from URL.
 * In number mode n is ignored.
 * In image mode, h/w (if both present) override n.
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
  console.info("[URL params] Raw query:", {
    search: window.location.search,
    mode: mode_param,
    h: h_param,
    w: w_param,
    n: n_param,
    explore: explore_param
  });
  if (mode_param !== "n" && mode_param !== "i" && mode_param !== null) {
    console.info(`[URL params] Unknown mode='${mode_param}', defaulting to number mode ('n').`);
  }
  if (explore_param !== null && explore_param !== "1") {
    console.info(
      `[URL params] explore='${explore_param}' is not '1'; explore mode remains disabled.`
    );
  }

  if (mode === "n") {
    // Number mode parses explicit h/w dimensions; both must be present together.
    const has_h = h_param !== null && h_param !== "";
    const has_w = w_param !== null && w_param !== "";
    if (has_h !== has_w) {
      throw new Error(
        `URL params h and w must both be present or both omitted (received h='${h_param}', w='${w_param}').`
      );
    }
    let grid_w = NUMBER_MODE_DEFAULT_GRID_W;
    let grid_h = NUMBER_MODE_DEFAULT_GRID_H;
    if (has_h && has_w) {
      const parsed_w = Number(w_param);
      const parsed_h = Number(h_param);
      if (!Number.isFinite(parsed_w) || !Number.isFinite(parsed_h)) {
        throw new Error(
          `URL params h and w must be finite numbers (received h='${h_param}', w='${w_param}').`
        );
      }
      grid_w = Math.round(parsed_w);
      grid_h = Math.round(parsed_h);
      if (grid_w < 1 || grid_w > 50) {
        throw new Error(`URL param w must be between 1 and 50 (received ${grid_w}).`);
      }
      if (grid_h < 1 || grid_h > 35) {
        throw new Error(`URL param h must be between 1 and 35 (received ${grid_h}).`);
      }
      if (grid_h % 2 === 0) {
        throw new Error(`URL param h (grid height) must be odd (received ${grid_h}).`);
      }
      console.info("[URL params] Number mode dimensions accepted:", {
        grid_w,
        grid_h
      });
    } else {
      console.info("[URL params] Number mode dimensions omitted; using defaults:", {
        grid_w,
        grid_h
      });
    }
    /** @type {UrlParams} */
    const parsed_params = {
      mode: "n",
      grid_w,
      grid_h,
      target_cell_count: 0,
      is_explore_mode
    };
    console.info("[URL params] Final parsed params:", parsed_params);
    return parsed_params;
  }

  // Image mode: use explicit h/w when provided, otherwise derive from n.
  const has_h = h_param !== null && h_param !== "";
  const has_w = w_param !== null && w_param !== "";
  if (has_h !== has_w) {
    throw new Error(
      `URL params h and w must both be present or both omitted (received h='${h_param}', w='${w_param}').`
    );
  }
  let grid_w = 0;
  let grid_h = 0;
  if (has_h && has_w) {
    const parsed_w = Number(w_param);
    const parsed_h = Number(h_param);
    if (!Number.isFinite(parsed_w) || !Number.isFinite(parsed_h)) {
      throw new Error(
        `URL params h and w must be finite numbers (received h='${h_param}', w='${w_param}').`
      );
    }
    grid_w = Math.round(parsed_w);
    grid_h = Math.round(parsed_h);
    if (grid_w < 1 || grid_w > 50) {
      throw new Error(`URL param w must be between 1 and 50 (received ${grid_w}).`);
    }
    if (grid_h < 1 || grid_h > 35) {
      throw new Error(`URL param h must be between 1 and 35 (received ${grid_h}).`);
    }
    if (grid_h % 2 === 0) {
      throw new Error(`URL param h (grid height) must be odd (received ${grid_h}).`);
    }
    console.info("[URL params] Image mode dimensions accepted:", {
      grid_w,
      grid_h
    });
  }

  let target_cell_count = DEFAULT_TARGET_CELL_COUNT;
  if (has_h && has_w) {
    if (n_param !== null && n_param !== "") {
      console.info("[URL params] Image mode h/w are present; n is ignored.");
    } else {
      console.info("[URL params] Image mode uses explicit h/w.");
    }
  } else if (n_param !== null && n_param !== "") {
    const parsed = Number(n_param);
    if (Number.isFinite(parsed)) {
      const rounded = Math.round(parsed);
      if (rounded >= 7 && rounded <= 400) {
        target_cell_count = rounded;
        console.info(
          `[URL params] Image mode n accepted: n='${n_param}' -> target_cell_count=${target_cell_count}.`
        );
      } else {
        console.info(
          `[URL params] Image mode n='${n_param}' rounded to ${rounded}, outside [7, 400]; using default ${DEFAULT_TARGET_CELL_COUNT}.`
        );
      }
    } else {
      console.info(
        `[URL params] Image mode n='${n_param}' is not a finite number; using default ${DEFAULT_TARGET_CELL_COUNT}.`
      );
    }
  } else if (!has_h && !has_w) {
    console.info(
      `[URL params] Image mode n omitted; using default ${DEFAULT_TARGET_CELL_COUNT}.`
    );
  }
  /** @type {UrlParams} */
  const parsed_params = {
    mode: "i",
    grid_w,
    grid_h,
    target_cell_count,
    is_explore_mode
  };
  console.info("[URL params] Final parsed params:", parsed_params);
  return parsed_params;
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

/**
 * @returns {{ viewport_width_px: number, viewport_height_px: number }}
 */
function get_viewport_size_px() {
  return {
    viewport_width_px: Math.max(1, window.innerWidth),
    viewport_height_px: Math.max(1, window.innerHeight)
  };
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
/** @type {HTMLImageElement | null} */
let source_image_element = null;
/** @type {{ grid_w: number, grid_h: number } | null} */
let image_grid_shape = null;
/** @type {ResolvedRelativeSizes} */
let resolved_relative_sizes;
/** @type {{ cell: Cell, container: Container, label_text: Text, overline_graphics: Graphics }[]} */
const number_mode_background_visuals = [];

const background_layer = new Container();

/**
 * @typedef {{
 *   tile_derivation: { tile_size_px: number, image_rect?: { x: number, y: number, width: number, height: number } },
 *   board_origin: { x: number, y: number },
 *   get_cell_world: (cell: Cell) => WorldPoint,
 *   grid_confines_rect: { x: number, y: number, width: number, height: number }
 * }} ViewportLayoutDerivation
 */

/**
 * Derive board geometry for the current viewport for both game modes.
 *
 * @param {string} reason_label
 * @returns {ViewportLayoutDerivation}
 */
function derive_layout_for_viewport(reason_label) {
  const viewport_size = get_viewport_size_px();
  if (game_mode === "i") {
    if (!source_image_element || !image_grid_shape) {
      throw new Error("Image mode layout derivation requires loaded image metadata.");
    }
    const next_tile_derivation = derive_tile_size({
      viewport_width: viewport_size.viewport_width_px,
      viewport_height: viewport_size.viewport_height_px,
      image_width: source_image_element.width,
      image_height: source_image_element.height,
      grid_w: image_grid_shape.grid_w,
      grid_h: image_grid_shape.grid_h,
      padding_in_tile_units: PADDING_IN_TILE_UNITS,
      viewport_margin_px: VIEWPORT_MARGIN_PX
    });
    const image_rect = next_tile_derivation.image_rect;
    if (!image_rect) {
      throw new Error("Image mode requires image_rect.");
    }
    const bounds_at_origin = get_grid_bounds(grid, next_tile_derivation.tile_size_px, { x: 0, y: 0 });
    const next_board_origin = {
      x: image_rect.x + image_rect.width / 2 - bounds_at_origin.center_x,
      y: image_rect.y + image_rect.height / 2 - bounds_at_origin.center_y
    };
    /** @type {(cell: Cell) => WorldPoint} */
    const next_get_cell_world = (cell) =>
      world_from_cell(cell, next_tile_derivation.tile_size_px, next_board_origin);
    const grid_confines_rect = {
      x: image_rect.x,
      y: image_rect.y,
      width: image_rect.width,
      height: image_rect.height
    };
    console.info("[Layout] Image mode viewport and fit confines:", {
      reason: reason_label,
      window_width_px: viewport_size.viewport_width_px,
      window_height_px: viewport_size.viewport_height_px,
      viewport_margin_px: VIEWPORT_MARGIN_PX,
      usable_viewport_width_px: Math.max(1, viewport_size.viewport_width_px - 2 * VIEWPORT_MARGIN_PX),
      usable_viewport_height_px: Math.max(1, viewport_size.viewport_height_px - 2 * VIEWPORT_MARGIN_PX),
      grid_confines_rect
    });
    return {
      tile_derivation: next_tile_derivation,
      board_origin: next_board_origin,
      get_cell_world: next_get_cell_world,
      grid_confines_rect
    };
  }

  const viewport_derivation = derive_tile_size_and_origin_viewport_only(
    {
      viewport_width: viewport_size.viewport_width_px,
      viewport_height: viewport_size.viewport_height_px,
      grid_w: grid.w,
      grid_h: grid.h,
      padding_in_tile_units: PADDING_IN_TILE_UNITS,
      viewport_margin_px: VIEWPORT_MARGIN_PX
    },
    (next_tile_size_px) => {
      const bounds = get_grid_bounds(grid, next_tile_size_px, { x: 0, y: 0 });
      return { center_x: bounds.center_x, center_y: bounds.center_y };
    }
  );
  const grid_confines_rect = {
    x: VIEWPORT_MARGIN_PX,
    y: VIEWPORT_MARGIN_PX,
    width: Math.max(1, viewport_size.viewport_width_px - 2 * VIEWPORT_MARGIN_PX),
    height: Math.max(1, viewport_size.viewport_height_px - 2 * VIEWPORT_MARGIN_PX)
  };
  const next_tile_derivation = {
    tile_size_px: viewport_derivation.tile_size_px,
    image_rect: undefined
  };
  /** @type {(cell: Cell) => WorldPoint} */
  const next_get_cell_world = (cell) =>
    world_from_cell(cell, next_tile_derivation.tile_size_px, viewport_derivation.board_origin);
  console.info("[Layout] Number mode viewport and fit confines:", {
    reason: reason_label,
    window_width_px: viewport_size.viewport_width_px,
    window_height_px: viewport_size.viewport_height_px,
    viewport_margin_px: VIEWPORT_MARGIN_PX,
    grid_confines_rect
  });
  return {
    tile_derivation: next_tile_derivation,
    board_origin: viewport_derivation.board_origin,
    get_cell_world: next_get_cell_world,
    grid_confines_rect
  };
}

if (game_mode === "i") {
  const source_image = await load_image(IMAGE_PATH);
  source_image_element = source_image;
  const has_explicit_image_grid = url_params.grid_w > 0 && url_params.grid_h > 0;
  const grid_derivation = has_explicit_image_grid
    ? {
        grid_w: url_params.grid_w,
        grid_h: url_params.grid_h
      }
    : (() => {
        const image_aspect = source_image.width / source_image.height;
        return derive_grid_shape({
          target_cell_count: url_params.target_cell_count,
          image_aspect,
          padding_in_tile_units: PADDING_IN_TILE_UNITS
        });
      })();
  grid = create_grid(grid_derivation.grid_w, grid_derivation.grid_h);
  image_grid_shape = {
    grid_w: grid_derivation.grid_w,
    grid_h: grid_derivation.grid_h
  };
  const initial_layout = derive_layout_for_viewport("initial-image");
  tile_derivation = initial_layout.tile_derivation;
  board_origin = initial_layout.board_origin;
  get_cell_world = initial_layout.get_cell_world;
  resolved_relative_sizes = resolve_relative_sizes(initial_layout.grid_confines_rect, "initial-image");
  const image_rect = tile_derivation.image_rect;
  if (!image_rect) {
    throw new Error("Image mode requires image_rect.");
  }

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
  const initial_layout = derive_layout_for_viewport("initial-number");
  tile_derivation = initial_layout.tile_derivation;
  board_origin = initial_layout.board_origin;
  get_cell_world = initial_layout.get_cell_world;
  resolved_relative_sizes = resolve_relative_sizes(initial_layout.grid_confines_rect, "initial-number");

  const tile_font_size_px = resolved_relative_sizes.number_mode_tile_font_size_px;
  number_mode_style = {
    font_family: FONT_FAMILY,
    tile_font_size_px,
    tile_fill_color: NUMBER_MODE_TILE_FILL_COLOR,
    tile_fill_alpha: NUMBER_MODE_TILE_FILL_ALPHA
  };
  const bg_font_size_px = resolved_relative_sizes.number_mode_background_font_size_px;
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
    number_mode_background_visuals.push({
      cell,
      container: bg_container,
      label_text: bg_label,
      overline_graphics
    });
    bg_container.addChild(bg_label);
    bg_container.addChild(overline_graphics);
    background_layer.addChild(bg_container);
  }
}

/** @type {Map<string, AnchorInstance[]>} */
const instances_by_operator_id = new Map();
const allowed_operator_defs = get_operator_defs();
if (allowed_operator_defs.length === 0) {
  throw new Error("No operators are enabled.");
}
const allowed_operator_ids = allowed_operator_defs.map(
  (operator_definition) => operator_definition.id
);
for (const operator_def of allowed_operator_defs) {
  instances_by_operator_id.set(
    operator_def.id,
    build_anchor_instances(grid, operator_def.id, get_cell_world, tile_derivation.tile_size_px)
  );
}

const board_state = create_solved_state(grid);
const scramble_operator_ids = allowed_operator_ids.filter((operator_id) =>
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
  border_thickness_px: resolved_relative_sizes.border_thickness_px,
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
    fontSize: resolved_relative_sizes.operator_help_font_size_px
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
    fontSize: resolved_relative_sizes.success_popup_title_font_size_px
  }
});
const success_popup_message = new Text({
  text: "You can keep playing. Close this message to continue.",
  style: {
    fill: SUCCESS_POPUP_TEXT_COLOR,
    fontFamily: FONT_FAMILY,
    fontSize: resolved_relative_sizes.success_popup_message_font_size_px
  }
});
const success_popup_close_button = new Graphics();
const success_popup_close_label = new Text({
  text: "Continue",
  style: {
    fill: SUCCESS_POPUP_BUTTON_TEXT_COLOR,
    fontFamily: FONT_FAMILY,
    fontSize: resolved_relative_sizes.success_popup_button_font_size_px
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
  success_popup_title.style.fontSize = resolved_relative_sizes.success_popup_title_font_size_px;
  success_popup_message.style.fontSize = resolved_relative_sizes.success_popup_message_font_size_px;
  success_popup_close_label.style.fontSize = resolved_relative_sizes.success_popup_button_font_size_px;
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
  const viewport_size = get_viewport_size_px();
  success_popup_layer.position.set(
    Math.round((viewport_size.viewport_width_px - SUCCESS_POPUP_WIDTH_PX) / 2),
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

/**
 * @param {number} background_font_size_px
 */
function redraw_number_mode_background_labels(background_font_size_px) {
  for (const visual of number_mode_background_visuals) {
    const world = get_cell_world(visual.cell);
    const background_x_offset_px = tile_derivation.tile_size_px * NUMBER_MODE_BACKGROUND_X_OFFSET_RATIO;
    visual.container.position.set(world.x + background_x_offset_px, world.y);
    visual.label_text.style.fontSize = background_font_size_px;
    const line_half = background_font_size_px * 0.4;
    const line_y = -background_font_size_px / 2 - 1;
    visual.overline_graphics.clear();
    visual.overline_graphics.moveTo(-line_half, line_y);
    visual.overline_graphics.lineTo(line_half, line_y);
    visual.overline_graphics.stroke({ width: 1, color: 0x888888 });
  }
}

/**
 * Rebuild anchor instances using the latest geometry.
 */
function rebuild_operator_instances() {
  instances_by_operator_id.clear();
  for (const operator_def of allowed_operator_defs) {
    instances_by_operator_id.set(
      operator_def.id,
      build_anchor_instances(grid, operator_def.id, get_cell_world, tile_derivation.tile_size_px)
    );
  }
}

success_popup_close_button.eventMode = "static";
success_popup_close_button.cursor = "pointer";
success_popup_close_button.on("pointertap", () => {
  hide_success_popup();
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
    width: resolved_relative_sizes.hover_outline_thickness_px,
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
    pivot_marker.circle(
      0,
      0,
      resolved_relative_sizes.pivot_marker_inner_radius_px +
        resolved_relative_sizes.pivot_marker_stroke_width_px
    );
    pivot_marker.fill({ color: PIVOT_MARKER_STROKE_COLOR });
    // Inner circle (white fill)
    pivot_marker.circle(0, 0, resolved_relative_sizes.pivot_marker_inner_radius_px);
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
    adjacent2_180: "1: adjacent2_180 (2 adjacent tiles, 180°)",
    vertex3_120: "2: vertex3_120 (3 tiles, 120°)"
  };
  const selected_operator_label = operator_name_by_id[
    /** @type {"adjacent2_180" | "vertex3_120"} */ (operator_id)
  ];
  operator_help_text.text =
    `Operator: ${selected_operator_label}\n` +
    "Switch operator: 1..2 | Space: image preview | Left click: CW | Right click: CCW";
}

/**
 * @param {string} reason_label
 */
function recompute_layout_and_visuals(reason_label) {
  const viewport_layout = derive_layout_for_viewport(reason_label);
  tile_derivation = viewport_layout.tile_derivation;
  board_origin = viewport_layout.board_origin;
  get_cell_world = viewport_layout.get_cell_world;
  resolved_relative_sizes = resolve_relative_sizes(viewport_layout.grid_confines_rect, reason_label);
  console.info("[Layout] Geometry summary:", {
    reason: reason_label,
    mode: game_mode,
    tile_size_px: tile_derivation.tile_size_px,
    board_origin,
    grid_confines_rect: viewport_layout.grid_confines_rect
  });
  tile_renderer.set_layout(tile_derivation.tile_size_px, get_cell_world);
  if (game_mode === "i") {
    if (!source_image_element) {
      throw new Error("Image mode requires loaded source image for resize.");
    }
    const image_rect = tile_derivation.image_rect;
    if (!image_rect) {
      throw new Error("Image mode requires image_rect for resize.");
    }
    if (background_sprite) {
      background_sprite.position.set(image_rect.x, image_rect.y);
      background_sprite.width = image_rect.width;
      background_sprite.height = image_rect.height;
    }
    const next_tile_textures = bake_tile_textures({
      image: source_image_element,
      tile_size_px: tile_derivation.tile_size_px,
      home_cells: grid.all_cells,
      get_cell_world,
      image_rect
    });
    tile_renderer.set_tile_textures(next_tile_textures);
    tile_textures = next_tile_textures;
  } else {
    redraw_number_mode_background_labels(resolved_relative_sizes.number_mode_background_font_size_px);
  }
  tile_renderer.set_border_thickness(resolved_relative_sizes.border_thickness_px);
  if (game_mode === "n") {
    tile_renderer.set_number_mode_font_size(resolved_relative_sizes.number_mode_tile_font_size_px);
  }
  tile_renderer.sync_all_from_state(board_state);
  rebuild_operator_instances();
  const selected_operator_id = input_controller.get_selected_operator_id();
  input_controller.set_instances(instances_by_operator_id.get(selected_operator_id) ?? []);
  operator_help_text.style.fontSize = resolved_relative_sizes.operator_help_font_size_px;
  success_popup_title.style.fontSize = resolved_relative_sizes.success_popup_title_font_size_px;
  success_popup_message.style.fontSize = resolved_relative_sizes.success_popup_message_font_size_px;
  success_popup_close_label.style.fontSize = resolved_relative_sizes.success_popup_button_font_size_px;
  input_controller.set_pivot_hit_radius(resolved_relative_sizes.pivot_hit_radius_px);
  update_operator_help_text(selected_operator_id);
  draw_success_popup();
  layout_success_popup();
  redraw_pivot_markers(selected_operator_id);
  redraw_hover_outline(hovered_instance);
  console.info("[Relative size] Applied runtime visual sizes:", {
    reason: reason_label,
    resolved_relative_sizes
  });
}

const initial_operator_id = allowed_operator_ids[0];

const input_controller = create_input_controller({
  canvas_element: application.canvas,
  pivot_hit_radius_px: resolved_relative_sizes.pivot_hit_radius_px,
  allowed_operator_ids,
  initial_operator_id,
  /** @param {string} operator_id */
  on_operator_change(operator_id) {
    if (!instances_by_operator_id.has(operator_id)) {
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

input_controller.set_instances(instances_by_operator_id.get(initial_operator_id) ?? []);
update_operator_help_text(initial_operator_id);
redraw_pivot_markers(initial_operator_id);
recompute_layout_and_visuals("post-init");

let resize_recompute_scheduled = false;
/**
 * @param {string} reason_label
 */
function schedule_resize_recompute(reason_label) {
  if (resize_recompute_scheduled) {
    return;
  }
  resize_recompute_scheduled = true;
  // Wait one frame so the renderer/window dimensions settle first.
  requestAnimationFrame(() => {
    resize_recompute_scheduled = false;
    recompute_layout_and_visuals(reason_label);
  });
}

window.addEventListener("resize", () => {
  schedule_resize_recompute("resize-window");
});
application.renderer.on("resize", () => {
  schedule_resize_recompute("resize-renderer");
});
if (window.visualViewport) {
  window.visualViewport.addEventListener("resize", () => {
    schedule_resize_recompute("resize-visual-viewport");
  });
}

window.addEventListener("keydown", (keyboard_event) => {
  if (keyboard_event.code !== "Space") {
    return;
  }
  keyboard_event.preventDefault();
  apply_preview_mode(!is_preview_mode);
});
