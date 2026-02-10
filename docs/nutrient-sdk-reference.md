# Nutrient Web SDK Reference

Complete reference of all Nutrient Web SDK (`@nutrient-sdk/viewer`) tools, calls, parameters, and patterns used in this project.

---

## Table of Contents

1. [Package & Import](#package--import)
2. [Viewer Lifecycle](#viewer-lifecycle)
3. [Core Modules](#core-modules)
4. [Text Search](#text-search)
5. [Annotations](#annotations)
6. [Content Editing](#content-editing)
7. [View State & Navigation](#view-state--navigation)
8. [Form Fields](#form-fields)
9. [Redaction Overlays](#redaction-overlays)
10. [Export](#export)
11. [Instant JSON](#instant-json)
12. [Events](#events)
13. [Key Gotchas & Patterns](#key-gotchas--patterns)
14. [File Locations](#file-locations)

---

## Package & Import

| Item | Value |
|------|-------|
| Package | `@nutrient-sdk/viewer` |
| Import | `import NutrientViewer from "@nutrient-sdk/viewer"` |
| Edition | Viewer (read-only; content editing and redaction require a higher-tier license) |
| CDN Mode | `useCDN: true` (loads WASM and CSS from CDN) |

---

## Viewer Lifecycle

### `NutrientViewer.load(config)`

Loads a PDF document and returns a viewer instance.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `config.container` | `HTMLElement` | Yes | DOM element to mount the viewer into |
| `config.document` | `string` | No | URL to the PDF file |
| `config.useCDN` | `boolean` | No | Load WASM/CSS from CDN (we use `true`) |
| `config.licenseKey` | `string` | No | License key for paid features |
| `config.requestHeaders` | `Record<string, string>` | No | Custom headers sent with document fetch (e.g., `Authorization`) |
| `config.instant` | `object` | No | Instant sync config (see below) |
| `config.instant.serverUrl` | `string` | No | Instant server URL |
| `config.instant.documentId` | `string` | No | Document identifier for Instant |
| `config.instant.jwt` | `string` | No | JWT for Instant auth |

**Returns:** `Promise<Instance>` — the viewer instance.

**Usage:**
```typescript
const instance = await NutrientViewer.load({
  container: document.getElementById("viewer"),
  document: "/files/document.pdf",
  useCDN: true,
  requestHeaders: { Authorization: "Bearer <token>" },
});
```

### `instance.unload()`

Destroys the viewer instance, freeing resources.

**Returns:** `Promise<void>`

**Usage:**
```typescript
await instance.unload();
```

---

## Core Modules

These are accessed as static properties on the `NutrientViewer` module (not on the instance).

| Module | Access | Purpose |
|--------|--------|---------|
| `NutrientViewer.Annotations` | Static | Annotation class constructors |
| `NutrientViewer.Geometry` | Static | Geometry types (`Rect`, etc.) |
| `NutrientViewer.Color` | Static | Color constructor |
| `NutrientViewer.Immutable` | Static | Immutable.js integration (`List`, etc.) |
| `NutrientViewer.InteractionMode` | Static | Interaction mode constants |

They can also be accessed on the instance (as async properties), but the static module approach is preferred:
```typescript
// Preferred (static)
const Annotations = NutrientViewer.Annotations;

// Also works (from instance, may be async/promise)
const Annotations = await instance.Annotations;
```

### `NutrientViewer.Geometry.Rect`

Creates a rectangle object.

| Parameter | Type | Description |
|-----------|------|-------------|
| `left` | `number` | X position (PDF points) |
| `top` | `number` | Y position (PDF points) |
| `width` | `number` | Width (PDF points) |
| `height` | `number` | Height (PDF points) |

```typescript
const rect = new NutrientViewer.Geometry.Rect({
  left: 100,
  top: 200,
  width: 150,
  height: 20,
});
```

### `NutrientViewer.Color`

Creates a color object from RGB values (0-255 range).

| Parameter | Type | Description |
|-----------|------|-------------|
| `r` | `number` | Red (0-255) |
| `g` | `number` | Green (0-255) |
| `b` | `number` | Blue (0-255) |

```typescript
const color = new NutrientViewer.Color({ r: 239, g: 68, b: 68 });
```

### `NutrientViewer.Immutable.List`

Creates an immutable list. **Required** for `rects` parameters on annotations.

```typescript
const rectList = new NutrientViewer.Immutable.List([rect1, rect2]);
// or shorthand:
NutrientViewer.Immutable.List([rect]);
```

---

## Text Search

### `instance.search(text)`

Searches the entire document for a text string.

| Parameter | Type | Description |
|-----------|------|-------------|
| `text` | `string` | The text to search for |

**Returns:** `Immutable.List<SearchResult>` — **not** a regular JavaScript array.

**SearchResult properties:**

| Property | Type | Description |
|----------|------|-------------|
| `pageIndex` | `number` | Page where the match was found (0-based) |
| `rectsOnPage` | `Immutable.List<Rect>` | Bounding rectangles of the matched text on the page |

**Usage:**
```typescript
const results = await instance.search("John Smith");

// IMPORTANT: Use .size (not .length) and .get(i) (not [i])
if (results && results.size > 0) {
  const firstResult = results.get(0);
  console.log("Found on page:", firstResult.pageIndex);
  console.log("Number of rects:", firstResult.rectsOnPage.size);

  // Filter results by page
  const pageResults = results.filter((r) => r.pageIndex === targetPage);
  const match = pageResults.size > 0 ? pageResults.get(0) : results.get(0);
}
```

---

## Annotations

### Creating Annotations

All annotation constructors live under `NutrientViewer.Annotations`.

#### `HighlightAnnotation`

Highlights text regions. Used for marking issues on the PDF.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `pageIndex` | `number` | Yes | Page number (0-based) |
| `rects` | `Immutable.List<Rect>` | Yes | List of rectangles to highlight. **Must be Immutable.List, not a plain array.** |
| `color` | `Color` | No | Highlight color |

```typescript
const annotation = new NutrientViewer.Annotations.HighlightAnnotation({
  pageIndex: 0,
  rects: result.rectsOnPage, // Already Immutable.List from search results
  color: new NutrientViewer.Color({ r: 239, g: 68, b: 68 }),
});
```

#### `StrikeOutAnnotation`

Draws a strikethrough line through text. Used in the visual correction fallback strategy.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `pageIndex` | `number` | Yes | Page number (0-based) |
| `rects` | `Immutable.List<Rect>` | Yes | Rectangles to strike through. **Must be Immutable.List.** |

```typescript
const strikeout = new NutrientViewer.Annotations.StrikeOutAnnotation({
  pageIndex: result.pageIndex,
  rects: result.rectsOnPage,
});
```

#### `UnderlineAnnotation`

Draws an underline beneath text.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `pageIndex` | `number` | Yes | Page number (0-based) |
| `rects` | `Immutable.List<Rect>` | Yes | Rectangles to underline. **Must be Immutable.List.** |

```typescript
const underline = new NutrientViewer.Annotations.UnderlineAnnotation({
  pageIndex: 0,
  rects: NutrientViewer.Immutable.List([rect]),
});
```

#### `TextAnnotation` (Note/Comment)

Creates a text note (sticky-note icon that opens into a popup).

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `pageIndex` | `number` | Yes | Page number (0-based) |
| `boundingBox` | `Rect` | Yes | Position and size of the note icon |
| `text` | `object` | No | `{ format: "plain", value: "Note text" }` |

```typescript
const note = new NutrientViewer.Annotations.TextAnnotation({
  pageIndex: 0,
  boundingBox: rect,
  text: {
    format: "plain",
    value: 'CORRECTION: "Jhon" → "John"',
  },
});
```

#### `RectangleAnnotation`

Draws a rectangle outline/fill. Used as a fallback when HighlightAnnotation fails.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `pageIndex` | `number` | Yes | Page number (0-based) |
| `boundingBox` | `Rect` | Yes | Position and size |
| `strokeColor` | `Color` | No | Border color |
| `strokeWidth` | `number` | No | Border width |
| `fillColor` | `object` | No | Fill with alpha: `{ r, g, b, a }` where `a` is 0-1 |

```typescript
const rect = new NutrientViewer.Annotations.RectangleAnnotation({
  pageIndex: 0,
  boundingBox: geometryRect,
  strokeColor: color,
  strokeWidth: 2,
  fillColor: { r: 239, g: 68, b: 68, a: 0.3 },
});
```

#### `StampAnnotation`

Places a stamp (like "Approved", "Rejected"). Used for flag-type annotations.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `pageIndex` | `number` | Yes | Page number (0-based) |
| `boundingBox` | `Rect` | Yes | Position and size |
| `stampType` | `string` | No | Stamp label (e.g., `"Approved"`) |

```typescript
const stamp = new NutrientViewer.Annotations.StampAnnotation({
  pageIndex: 0,
  boundingBox: rect,
  stampType: "Approved",
});
```

### Annotation CRUD on the Instance

#### `instance.create(annotation)`

Creates an annotation on the PDF.

**Returns:** The created annotation object with an `id` property.

```typescript
const created = await instance.create(highlightAnnotation);
console.log("Annotation ID:", created.id);
```

#### `instance.update(annotation)`

Updates an existing annotation.

```typescript
existing.text.value = "Updated text";
await instance.update(existing);
```

#### `instance.delete(annotationId)`

Deletes an annotation by its ID.

```typescript
await instance.delete(annotationId);
```

#### `instance.deleteAnnotation(annotationId)`

Alternative method to delete an annotation.

```typescript
await instance.deleteAnnotation(annotationId);
```

#### `instance.getAnnotation(id)`

Retrieves a single annotation by ID.

**Returns:** The annotation object or `null`.

```typescript
const annotation = await instance.getAnnotation(annotationId);
```

#### `instance.getAnnotations(pageIndex?)`

Retrieves annotations, optionally filtered by page.

**Returns:** Array of annotation objects.

```typescript
const allAnnotations = await instance.getAnnotations();
const pageAnnotations = await instance.getAnnotations(0);
```

#### `instance.setSelectedAnnotation(annotationId)`

Selects/highlights an annotation in the viewer (visual focus).

```typescript
await instance.setSelectedAnnotation(annotationId);
```

#### `instance.setEditingAnnotation(annotationId)`

Puts an annotation into editing mode (for annotations that support inline editing).

```typescript
await instance.setEditingAnnotation(annotationId);
```

---

## Content Editing

Content editing allows modifying the actual text content of a PDF. **Requires a higher-tier license** (not available with the Viewer edition).

### `instance.beginContentEditingSession()`

Opens a content editing session.

**Returns:** `Promise<ContentEditingSession>`

```typescript
const session = await instance.beginContentEditingSession();
```

### `session.getTextBlocks(pageIndex)`

Gets all text blocks on a page.

| Parameter | Type | Description |
|-----------|------|-------------|
| `pageIndex` | `number` | Page number (0-based) |

**Returns:** Array of text blocks, each with:

| Property | Type | Description |
|----------|------|-------------|
| `id` | `string` | Block identifier |
| `text` | `string` | Text content |
| `boundingBox` | `Rect` | Position on the page |

```typescript
const textBlocks = await session.getTextBlocks(0);
for (const block of textBlocks) {
  if (block.text.includes("Jhon")) {
    // Found the text block to edit
  }
}
```

### `session.updateTextBlocks(updates)`

Replaces text in one or more text blocks.

| Parameter | Type | Description |
|-----------|------|-------------|
| `updates` | `Array<{ id: string, text: string }>` | Blocks to update |

```typescript
await session.updateTextBlocks([
  { id: targetBlock.id, text: updatedText },
]);
```

### `session.commit()`

Commits changes made in the session (saves to document).

```typescript
await session.commit();
```

### `session.cancel()` / `session.discard()`

Discards changes and closes the session.

```typescript
await session.cancel();
// or
await session.discard();
```

### `instance.supportsContentEditing` / Capability Check

```typescript
const canEdit = typeof instance.beginContentEditingSession === "function";
```

---

## View State & Navigation

### `instance.setViewState(updater)`

Updates the viewer state (page, zoom, interaction mode, etc.). Takes a callback that receives the current view state and returns the updated one.

```typescript
// Navigate to a page
await instance.setViewState((viewState) =>
  viewState.set("currentPageIndex", 3)
);

// Enter content editor interaction mode
await instance.setViewState((viewState) =>
  viewState.set("interactionMode", NutrientViewer.InteractionMode.CONTENT_EDITOR)
);
```

### `instance.jumpToRect(pageIndex, rect)`

Scrolls the viewer to bring a specific rectangle into view.

| Parameter | Type | Description |
|-----------|------|-------------|
| `pageIndex` | `number` | Target page (0-based) |
| `rect` | `Rect` | Rectangle to scroll to |

```typescript
// Jump to the first rect from a search result
await instance.jumpToRect(result.pageIndex, result.rectsOnPage.get(0));
```

### `instance.totalPageCount`

Read-only property. Total number of pages in the document.

```typescript
const pageCount = instance.totalPageCount;
```

### `NutrientViewer.InteractionMode`

Constants for viewer interaction modes:

| Constant | Description |
|----------|-------------|
| `CONTENT_EDITOR` | Allows direct text editing in the PDF |

---

## Form Fields

### `instance.getFormFields()`

Gets all interactive form fields in the document.

**Returns:** Array of form field objects.

| Property | Type | Description |
|----------|------|-------------|
| `name` | `string` | Field name |
| `value` | `string` | Current value |
| `type` | `string` | Field type |
| `required` | `boolean` | Whether the field is required |

```typescript
const fields = await instance.getFormFields();
const targetField = fields.find((f) => f.name === "claimant_name");
```

### `instance.setFormFieldValues(updates)`

Sets values for one or more form fields.

| Parameter | Type | Description |
|-----------|------|-------------|
| `updates` | `Array<{ name: string, value: string }>` | Fields to update |

```typescript
await instance.setFormFieldValues([
  { name: "claimant_name", value: "John Smith" },
]);
```

---

## Redaction Overlays

Creates a redaction overlay (covers text with a box and optional replacement text). **Requires a higher-tier license.**

### `instance.createRedactionOverlay(config)`

| Parameter | Type | Description |
|-----------|------|-------------|
| `config.pageIndex` | `number` | Target page |
| `config.rects` | `Immutable.List<Rect>` | Areas to redact. **Must be Immutable.List.** |
| `config.overlayText` | `string` | Replacement text shown over redaction |

```typescript
await instance.createRedactionOverlay({
  pageIndex: 0,
  rects: NutrientViewer.Immutable.List([rect]),
  overlayText: "REDACTED",
});
```

---

## Export

### `instance.export(format)`

Exports the current document (with annotations and edits) as a Blob.

| Parameter | Type | Description |
|-----------|------|-------------|
| `format` | `"pdf"` or `"pdf-a"` | Output format |

**Returns:** `Promise<Blob>`

```typescript
const blob = await instance.export("pdf");
const url = URL.createObjectURL(blob);
```

---

## Instant JSON

### `instance.getInstantJSON()`

Gets a JSON snapshot of all annotations and changes made in the viewer session.

**Returns:** `Promise<object>` — JSON-serializable object.

```typescript
const json = await instance.getInstantJSON();
```

---

## Events

### `instance.addEventListener(event, callback)`

Listens for viewer events.

| Event | Callback Signature | Description |
|-------|--------------------|-------------|
| `"viewState.currentPageIndex.change"` | `(pageIndex: number) => void` | Fired when the user navigates to a different page |

```typescript
instance.addEventListener(
  "viewState.currentPageIndex.change",
  (pageIndex) => {
    console.log("Now on page:", pageIndex);
  }
);
```

---

## Key Gotchas & Patterns

### 1. Immutable.List is Required for `rects`

The `rects` parameter on `HighlightAnnotation`, `StrikeOutAnnotation`, and `UnderlineAnnotation` **must** be an `Immutable.List`, not a plain JavaScript array. Passing a plain array will silently fail or throw.

```typescript
// WRONG
rects: [rect1, rect2]

// CORRECT
rects: NutrientViewer.Immutable.List([rect1, rect2])

// ALSO CORRECT (search results already return Immutable.List)
rects: searchResult.rectsOnPage  // Already Immutable.List<Rect>
```

### 2. Search Results Use Immutable Collections

`instance.search()` returns `Immutable.List`, not a regular array. Use `.size` instead of `.length`, and `.get(i)` instead of `[i]`.

```typescript
// WRONG
if (results.length > 0) { results[0] }

// CORRECT
if (results.size > 0) { results.get(0) }

// Filtering also returns Immutable.List
const filtered = results.filter((r) => r.pageIndex === 0);
if (filtered.size > 0) { filtered.get(0) }
```

### 3. Memoize `requestHeaders` to Prevent Infinite Re-renders

When passing `requestHeaders` as a prop to the viewer hook, always wrap it in `useMemo`. A new object reference on every render causes the `useEffect` to re-fire, unloading and reloading the viewer in an infinite loop.

```typescript
// WRONG - creates new object every render
const { instance } = useNutrientViewer({
  requestHeaders: { Authorization: `Bearer ${token}` },
});

// CORRECT - stable reference
const requestHeaders = useMemo(() => {
  if (!token) return undefined;
  return { Authorization: `Bearer ${token}` };
}, [token]);

const { instance } = useNutrientViewer({ requestHeaders });
```

### 4. Viewer Edition Limitations

The **Viewer** edition is read-only. These methods exist in the API but will throw errors without a paid license:

- `instance.beginContentEditingSession()` — requires Editor/Complete edition
- `instance.createRedactionOverlay()` — requires Redaction add-on

Our application falls back to visual annotations (strikethrough + note) when content editing is unavailable.

### 5. Color Values Are 0-255 Range

The `NutrientViewer.Color` constructor expects RGB values in the 0-255 range, not 0-1.

```typescript
// CORRECT
new NutrientViewer.Color({ r: 239, g: 68, b: 68 })

// WRONG
new NutrientViewer.Color({ r: 0.94, g: 0.27, b: 0.27 })
```

### 6. Module Access: Static vs Instance

Prefer static module access from the `NutrientViewer` import rather than from the instance:

```typescript
// Preferred (synchronous, always available)
const Annotations = NutrientViewer.Annotations;
const Geometry = NutrientViewer.Geometry;

// Alternative (may require await)
const Annotations = await instance.Annotations;
```

### 7. Viewer Cleanup

Always unload the viewer when the component unmounts or the document changes to prevent memory leaks:

```typescript
useEffect(() => {
  return () => {
    if (instance) {
      instance.unload().catch(console.error);
    }
  };
}, []);
```

---

## File Locations

| File | Purpose |
|------|---------|
| `client/src/hooks/use-nutrient-viewer.ts` | React hook for loading/managing the Nutrient viewer instance |
| `client/src/lib/adapters/nutrient.adapter.ts` | Adapter class implementing `PDFProcessorAdapter` for Nutrient SDK |
| `client/src/lib/adapters/pdf-processor.interface.ts` | Abstract interface that the adapter implements |
| `client/src/lib/adapters/adapter-factory.ts` | Factory for creating the correct adapter by type |
| `client/src/lib/fix-engine.ts` | Orchestrates corrections using the adapter + location resolver |
| `client/src/lib/location-resolver.ts` | Dual location strategy (bbox first, search_text fallback) |
| `client/src/pages/workbench.tsx` | Main UI — viewer setup, issue highlighting, correction application |
| `client/src/components/annotation-panel.tsx` | Annotation management UI panel |

---

## Correction Strategies (How We Use These Tools Together)

### Strategy 1: Content Editing (Preferred)
1. `instance.beginContentEditingSession()` → get session
2. `session.getTextBlocks(pageIndex)` → find the text block containing `foundValue`
3. `session.updateTextBlocks([{ id, text }])` → replace text
4. `session.commit()` → save

### Strategy 2: Visual Annotation (Fallback)
Used when content editing is unavailable (Viewer edition):
1. `instance.search(foundValue)` → find text location
2. Create `StrikeOutAnnotation` over the found text
3. Create `TextAnnotation` with correction details as a note
4. Record the correction in the audit log

### Issue Highlighting Flow
1. `instance.search(searchText || foundValue)` → find text
2. Use `rectsOnPage` from search result (already `Immutable.List`)
3. Create `HighlightAnnotation` with severity-based color
4. Track annotation ID in `issueAnnotations` map
5. On click: `instance.setSelectedAnnotation(id)` to focus
