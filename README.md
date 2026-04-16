# Obsidian Graph Label Above

An Obsidian plugin that moves graph view node labels **above** nodes instead of below, so an enlarged mouse pointer does not obscure them.

Works with both the built-in 2D graph and the [3D Graph](https://github.com/Apoo711/obsidian-3d-graph) community plugin.

---

## The problem

Obsidian's graph view positions node labels directly below each node. When you hover, the label shifts down a further 21px — intended to clear the cursor tip. With a standard pointer this works. With an enlarged pointer (a common accessibility setting) the label sits underneath the cursor and is never visible.

This was [requested on the Obsidian forum](https://forum.obsidian.md/t/display-note-title-label-above-nodes-on-graph-to-prevent-pointer-from-covering-the-title/3875) and discussed several times. The team acknowledged it but the behaviour has not changed. This plugin fixes it.

---

## What it does

- Moves 2D graph labels **above** nodes (flips the Pixi.js render anchor and negates the y-offset)
- Moves 3D graph persistent labels above nodes (scales the Three.js sprite y-offset)
- Repositions the 3D graph hover tooltip above the cursor (CSS override)
- Adds a **label distance** slider so you can dial in how far above the node the label sits
- Adds an optional **colour override** for 2D graph labels

---

## Installation

### From the community plugin directory (once listed)

1. Settings > Community plugins > Browse
2. Search "Graph Label Above"
3. Install and enable

### Manual install

1. Download `main.js` and `manifest.json` from the [latest release](https://github.com/jsfarley/obsidian-graph-label-above/releases/latest)
2. Create a folder at `<your vault>/.obsidian/plugins/graph-label-above/`
3. Copy both files into that folder
4. Settings > Community plugins > reload and enable **Graph Label Above**

---

## Settings

| Setting | Description | Default |
|---------|-------------|---------|
| Label distance | Slider (0–200%). Controls how far the label sits above the node. 100 = default position. | 100% |
| Custom label colour | Toggle to override the theme's text colour for 2D graph labels. | Off |
| Label colour | Colour picker, shown when custom colour is enabled. | #ffffff |

Changes apply immediately without restarting Obsidian.

---

## 3D graph tooltip

The 3D graph hover tooltip is repositioned via a CSS snippet rather than the plugin itself (the tooltip is a DOM element, separate from the Three.js renderer).

The plugin ships with the snippet automatically. If it is not active:

1. Settings > Appearance > CSS snippets
2. Click the refresh icon
3. Toggle **3d-graph-tooltip** on

---

## How it works

Obsidian's graph view renders using **Pixi.js** on a WebGL canvas — labels are not DOM elements and cannot be repositioned with CSS. The plugin monkey-patches the node prototype's `render` method at runtime, flipping the text anchor from top to bottom and negating the y-offset formula.

The 3D graph uses **Three.js SpriteText** objects. Labels are positioned once at node creation (`createNodeObject`). The plugin patches that method to scale the sprite's y-offset, and walks the scene on load to fix existing nodes.

Both patches store the original method and restore it cleanly on unload.

---

## Compatibility

Tested on Obsidian 1.x. The 2D graph patch targets Obsidian's internal Pixi.js renderer and may break if Obsidian significantly changes its graph implementation. The 3D graph patch targets [obsidian-3d-graph](https://github.com/Apoo711/obsidian-3d-graph).

---

## Contributing

Issues and PRs welcome. The source is at `src/main.ts`. Build with:

```bash
npm install
npm run build
```

Output goes directly to `.obsidian/plugins/graph-label-above/` in your vault (configured in `esbuild.config.mjs` — update the path for your setup).

---

## Licence

MIT
