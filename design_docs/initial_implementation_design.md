# Implementation Spec (Web JS + PixiJS): Hex Tile Unscramble Prototype

## Overview
Implement a PixiJS-based prototype with:
- flat-top axial hex grid (rectangular-ish bounds),
- unique hex tiles baked from one image,
- 4 rotational operators (ring-6, alternating-3 even, alternating-3 odd, vertex triad),
- pivot hover detection + shape border highlighting,
- left click CW, right click CCW,
- scramble from solved via random moves.

Keep the move/operator logic library-agnostic.

## Constants (declare, leave values unassigned)
- `TILE_SIZE_PX: number`
- `GRID_W: number`, `GRID_H: number`
- `SCRAMBLE_MOVES: number`
- `PIVOT_HIT_RADIUS_PX: number`
- `ANIMATION_MS: number`
- `BORDER_THICKNESS_PX: number`
- `BORDER_COLOR: number` (e.g. 0xRRGGBB)
- `HOVER_HIGHLIGHT_COLOR: number`
- `PIVOT_MARKER_COLOR: number` (optional)

## Types / data model
Use these conceptual types (actual representation can be objects/maps):

- `type Cell = { q: number; r: number }`
- `type CellKey = string` // `"q,r"`
- `type TileId = string` // for prototype, same as CellKey of its home cell

- `type BoardState = {
    cellToTileId: Map<CellKey, TileId>,
    tileIdToCell: Map<TileId, CellKey>,
    tileRot: Map<TileId, number>, // 0..5
    tileHomeCell: Map<TileId, CellKey>
  }`

- `type AnchorInstance = {
    operatorId: string,
    anchorId: string,
    anchorWorld: { x: number; y: number },
    cells: CellKey[], // CW cycle order, length N
    rotationStepsCW: number // 1 or 2
  }`

- `type OperatorDef = {
    id: string,
    anchorKind: "CELL" | "VERTEX",
    rotationStepsCW: number,
    getInstances: (grid: Grid) => AnchorInstance[]
  }`

- `type Grid = {
    w: number,
    h: number,
    hasCell: (c: Cell) => boolean,
    allCells: Cell[]
  }`

## Coordinate helpers
### Cell keys
- `cellKey({q,r}) -> "${q},${r}"`
- `parseCellKey("q,r") -> Cell`

### Neighbor direction order (must be consistent)
Axial directions indexed 0..5:
- `(+1, 0), (+1,-1), (0,-1), (-1, 0), (-1,+1), (0,+1)`

### Flat-top axial -> world
Let `s = TILE_SIZE_PX`:
- \(x = s * \sqrt{3} * (q + r/2)\)
- \(y = s * 3/2 * r\)
Then add a board origin offset.

## Rendering layer (Pixi)
### Stage structure
- Root `app.stage`
  - `backgroundSprite` (optional)
  - `tilesLayer` (containers/sprites + borders)
  - `pivotsLayer` (optional pivot markers)

### TileView
For each `tileId`:
- Pixi `Container`
  - `Sprite` for the baked hex texture
  - `Graphics` border outline

Store:
- `tileViews: Map<TileId, TileView>`
- Provide methods:
  - `setBorderColor(tileId, color)`
  - `setPose(tileId, worldPos, rotSteps)` // rotSteps * 60°

### Baking hex textures
At load time, after the image is available:
- For each tileId/home cell:
  - create offscreen canvas sized to hex bounding box
  - clip to hex polygon
  - draw source image with offset so this home cell’s region lands inside the hex
  - create Pixi texture from canvas
- Attach texture to the tile’s sprite

Important:
- Baking is tied to home cell (tile identity), not current location.

### Hex polygon points (flat-top)
Define a function returning 6 points around the origin for radius `s`:
- angles: 0°, 60°, 120°, 180°, 240°, 300°
- points: `(s*cos(a), s*sin(a))`
Use the same points for:
- canvas clip path
- border outline Graphics

(Exact point order should match your aesthetic; consistency matters more than start angle.)

## Operator definitions (4)
Implement as `OperatorDef[]`.

### Common: generating CELL anchor instances
Iterate all cells `c` in the grid; for each operator, compute required cells via neighbor directions; include instance only if all required cells exist.

#### Op1: ring6_60
- `rotationStepsCW = 1`
- `cells = [c+dir0, c+dir1, c+dir2, c+dir3, c+dir4, c+dir5]`
- `anchorId = "cell:"+cellKey(c)`

#### Op2: alt3_even_120
- `rotationStepsCW = 2`
- `cells = [c+dir0, c+dir2, c+dir4]`
- `anchorId = "cell:"+cellKey(c)+":even"`

#### Op3: alt3_odd_120
- `rotationStepsCW = 2`
- `cells = [c+dir1, c+dir3, c+dir5]`
- `anchorId = "cell:"+cellKey(c)+":odd"`

### Vertex triad instances (dedup required)
#### Op4: vertex3_120
- `rotationStepsCW = 2`
- For each cell `c` and each `i in 0..5`:
  - `a = c`
  - `b = c + dir[i]`
  - `d = c + dir[(i+1) mod 6]`
  - if all exist: candidate triplet
- Dedup:
  - `tripletKeys = [key(a), key(b), key(d)]`
  - `sorted = sort(tripletKeys)`
  - `anchorId = "vtx:"+sorted.join("|")`
- `cells` cycle order:
  - use `[key(a), key(b), key(d)]` consistently for CW
- `anchorWorld`:
  - centroid of `world(a), world(b), world(d)`

## Move application (pure state update)
Function: `applyMove(state, anchorInstance, dirSign)`
- `dirSign = +1` for CW, `-1` for CCW
- Permute tiles among `anchorInstance.cells[]`:
  - CW write index `(i+1) mod N`
  - CCW write index `(i-1+N) mod N`
- Update `tileIdToCell` for moved tiles
- Update `tileRot[tileId] = (tileRot + rotationStepsCW*dirSign) mod 6`

Return updated state (or mutate in place; prototype can mutate).

## Animation
During a move:
- Capture old cell positions for moved tileIds
- After state update (or before), compute target positions/rotations
- Tween each moved TileView:
  - position old -> new
  - rotation += `rotationStepsCW * dirSign * 60°`
- Lock input until all tweens complete

Prototype simplification: it’s acceptable to update state immediately and animate views to the new state.

## Input & pivot hover (left/right click)
### Operator selection
- Keys `1..4` set `selectedOperatorId`
- When selected operator changes:
  - regenerate `anchorInstances[]` for that operator
  - optionally redraw pivot markers

### Hover detection
On pointer move:
- find nearest `AnchorInstance` with distance <= `PIVOT_HIT_RADIUS_PX` to cursor world
- set `hoverAnchorId` (or null)

### Shape border highlighting
When `hoverAnchorId` changes:
1. Clear previous highlight:
   - for each cellKey in previous hover instance:
     - `tileId = state.cellToTileId.get(cellKey)`
     - set tile border to `BORDER_COLOR`
2. Apply new highlight:
   - for each cellKey in new hover instance:
     - `tileId = state.cellToTileId.get(cellKey)`
     - set tile border to `HOVER_HIGHLIGHT_COLOR`

Note: highlight depends on current `state`, not home mapping.

### Click actions
- Left click (primary):
  - if hover exists and not animating: apply move with `dirSign=+1`
- Right click (secondary):
  - prevent default context menu on the canvas
  - if hover exists and not animating: apply move with `dirSign=-1`

## Scramble
- Initialize solved state.
- Perform `SCRAMBLE_MOVES` random legal moves:
  - pick operator (either any of the 4, or a configured subset)
  - pick random anchor instance from that operator’s instance list
  - pick random dirSign
  - apply move without animation (or with very fast animation)

Optionally avoid immediate inverse of last move (not required).

## Suggested file/module layout
- `core/coords` — axial math, dirs, key helpers, world conversion
- `core/grid` — grid bounds, hasCell, allCells
- `core/state` — createSolvedState, solvedCheck
- `core/operators` — operator defs, anchor generation
- `core/move` — applyMove
- `render/bake` — bake hex textures from image
- `render/tileView` — TileView creation, border drawing, updates
- `ui/input` — operator selection, hover detection, click handling
- `main` — app bootstrap, load image, build state, bake, scramble

## Acceptance checklist
- ~100 tiles render as hexes with borders.
- Operator selection works (1..4).
- Cursor near a valid pivot highlights all tiles in that operator set.
- Left click rotates CW; right click rotates CCW (no context menu).
- Tiles move and rotate by 60° or 120° according to operator.
- Scramble creates solvable randomized state.
- Solved detection works.