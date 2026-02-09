// @ts-check

import { Application, Container, Graphics, Sprite, Text, Texture } from "pixi.js";
import { world_from_cell } from "./core/coords.js";
import { derive_grid_shape, derive_tile_size } from "./core/derive_params.js";
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
const OPERATOR_LABEL_COLOR = 0xffffff;
const PIVOT_MARKER_COLOR = 0xffd966;
const PIVOT_MARKER_RADIUS_PX = 4;

/**
 * @param {number} fallback_value
 * @returns {number}
 */
function get_target_cell_count_from_url(fallback_value) {
  const search_params = new URLSearchParams(window.location.search);
  const n_param = search_params.get("n");
  if (!n_param) {
    return fallback_value;
  }
  const parsed_value = Number(n_param);
  if (!Number.isFinite(parsed_value)) {
    return fallback_value;
  }
  const rounded_value = Math.round(parsed_value);
  if (rounded_value < 7 || rounded_value > 400) {
    return fallback_value;
  }
  return rounded_value;
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

const source_image = await load_image(IMAGE_PATH);
const image_aspect = source_image.width / source_image.height;
const target_cell_count = get_target_cell_count_from_url(DEFAULT_TARGET_CELL_COUNT);
const grid_derivation = derive_grid_shape({
  target_cell_count,
  image_aspect,
  padding_in_tile_units: PADDING_IN_TILE_UNITS
});
const tile_derivation = derive_tile_size({
  viewport_width: application.screen.width,
  viewport_height: application.screen.height,
  image_width: source_image.width,
  image_height: source_image.height,
  grid_w: grid_derivation.grid_w,
  grid_h: grid_derivation.grid_h,
  padding_in_tile_units: PADDING_IN_TILE_UNITS,
  viewport_margin_px: VIEWPORT_MARGIN_PX
});

const grid = create_grid(grid_derivation.grid_w, grid_derivation.grid_h);
const bounds_at_origin = get_grid_bounds(grid, tile_derivation.tile_size_px, { x: 0, y: 0 });
const board_origin = {
  x: tile_derivation.image_rect.x + tile_derivation.image_rect.width / 2 - bounds_at_origin.center_x,
  y: tile_derivation.image_rect.y + tile_derivation.image_rect.height / 2 - bounds_at_origin.center_y
};
/**
 * @param {Cell} cell
 * @returns {WorldPoint}
 */
const get_cell_world = (cell) => world_from_cell(cell, tile_derivation.tile_size_px, board_origin);

const background_layer = new Container();
const tile_textures = bake_tile_textures({
  image: source_image,
  tile_size_px: tile_derivation.tile_size_px,
  home_cells: grid.all_cells,
  get_cell_world,
  image_rect: tile_derivation.image_rect
});

const background_sprite = new Sprite(Texture.from(source_image));
background_sprite.position.set(tile_derivation.image_rect.x, tile_derivation.image_rect.y);
background_sprite.width = tile_derivation.image_rect.width;
background_sprite.height = tile_derivation.image_rect.height;
background_sprite.alpha = 0.75;
background_layer.addChild(background_sprite);

/** @type {Map<string, AnchorInstance[]>} */
const instances_by_operator_id = new Map();
for (const operator_def of get_operator_defs()) {
  instances_by_operator_id.set(
    operator_def.id,
    build_anchor_instances(grid, operator_def.id, get_cell_world, tile_derivation.tile_size_px)
  );
}

const board_state = create_solved_state(grid);
for (let scramble_index = 0; scramble_index < SCRAMBLE_MOVES; scramble_index += 1) {
  const operator_ids = Array.from(instances_by_operator_id.keys());
  const random_operator_id = operator_ids[random_int(0, operator_ids.length - 1)];
  const operator_instances = instances_by_operator_id.get(random_operator_id) ?? [];
  if (operator_instances.length === 0) {
    continue;
  }
  const random_anchor_instance = operator_instances[random_int(0, operator_instances.length - 1)];
  const direction_sign = Math.random() < 0.5 ? /** @type {1} */ (1) : /** @type {-1} */ (-1);
  apply_move(board_state, random_anchor_instance, direction_sign);
}

const tile_renderer = create_tile_views({
  tile_textures,
  board_state,
  get_cell_world,
  tile_size_px: tile_derivation.tile_size_px,
  border_color: BORDER_COLOR,
  border_thickness_px: BORDER_THICKNESS_PX
});
tile_renderer.sync_all_from_state(board_state);

application.stage.addChild(background_layer);
application.stage.addChild(tile_renderer.tiles_layer);
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

/** @type {AnchorInstance | null} */
let hovered_instance = null;
/** @type {Set<string>} */
let highlighted_tile_ids = new Set();
let interaction_locked = false;

/**
 * @param {Iterable<string>} tile_ids
 * @param {number} color
 */
function set_border_color_for_tiles(tile_ids, color) {
  for (const tile_id of tile_ids) {
    tile_renderer.set_border_color(tile_id, color);
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
 * @param {AnchorInstance | null} next_hovered_instance
 */
function update_hover_highlight(next_hovered_instance) {
  set_border_color_for_tiles(highlighted_tile_ids, BORDER_COLOR);
  set_tile_emphasis(highlighted_tile_ids, false);
  hovered_instance = next_hovered_instance;
  highlighted_tile_ids = collect_highlight_tile_ids(hovered_instance);
  set_tile_emphasis(highlighted_tile_ids, true);
  set_border_color_for_tiles(highlighted_tile_ids, HOVER_HIGHLIGHT_COLOR);
}

/**
 * @param {string} operator_id
 */
function redraw_pivot_markers(operator_id) {
  pivots_layer.removeChildren();
  const instances = instances_by_operator_id.get(operator_id) ?? [];
  for (const instance of instances) {
    const pivot_marker = new Graphics();
    pivot_marker.circle(0, 0, PIVOT_MARKER_RADIUS_PX);
    pivot_marker.fill({ color: PIVOT_MARKER_COLOR, alpha: 0.55 });
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

  await tween_progress(ANIMATION_MS, (progress) => {
    for (const tile_id of moved_tile_ids) {
      const pose_before = pose_before_by_tile_id.get(tile_id);
      const destination_cell_key = board_state.tile_id_to_cell.get(tile_id);
      if (!pose_before || !destination_cell_key) {
        continue;
      }
      const [destination_q_text, destination_r_text] = destination_cell_key.split(",");
      const destination_world = get_cell_world({
        q: Number(destination_q_text),
        r: Number(destination_r_text)
      });
      const x = pose_before.x + (destination_world.x - pose_before.x) * progress;
      const y = pose_before.y + (destination_world.y - pose_before.y) * progress;
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
  if (is_solved(board_state)) {
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
    ring6_60: "1: ring6_60 (6 tiles, 60°)",
    alt3_even_120: "2: alt3_even_120 (3 tiles, 120°)",
    alt3_odd_120: "3: alt3_odd_120 (3 tiles, 120°)",
    vertex3_120: "4: vertex3_120 (3 tiles, 120°)"
  };
  const selected_operator_label = operator_name_by_id[
    /** @type {"ring6_60" | "alt3_even_120" | "alt3_odd_120" | "vertex3_120"} */ (operator_id)
  ];
  operator_help_text.text =
    `Operator: ${selected_operator_label}\n` +
    "Switch operator: keyboard 1/2/3/4 | Left click: CW | Right click: CCW";
}

const input_controller = create_input_controller({
  canvas_element: application.canvas,
  pivot_hit_radius_px: Math.max(PIVOT_HIT_RADIUS_MIN_PX, tile_derivation.tile_size_px * 0.33),
  on_operator_change(operator_id) {
    const instances = instances_by_operator_id.get(operator_id) ?? [];
    input_controller.set_instances(instances);
    update_operator_help_text(operator_id);
    redraw_pivot_markers(operator_id);
  },
  on_hover_change(instance) {
    if (interaction_locked) {
      return;
    }
    update_hover_highlight(instance);
  },
  on_move_request(direction_sign, instance) {
    void run_move(direction_sign, instance);
  }
});

input_controller.set_instances(instances_by_operator_id.get("ring6_60") ?? []);
update_operator_help_text("ring6_60");
redraw_pivot_markers("ring6_60");
