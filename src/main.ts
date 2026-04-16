import { Plugin, PluginSettingTab, App, Setting, WorkspaceLeaf } from "obsidian";

interface GraphLabelSettings {
  offsetMultiplier: number; // 0–200, default 100
  useCustomColor: boolean;
  customColor: string;
}

const DEFAULT_SETTINGS: GraphLabelSettings = {
  offsetMultiplier: 100,
  useCustomColor: false,
  customColor: "#ffffff",
};

export default class GraphLabelAbovePlugin extends Plugin {
  settings: GraphLabelSettings;
  private patchedProto2D: any = null;
  private patchedProto3D: any = null;

  async onload() {
    await this.loadSettings();
    this.addSettingTab(new GraphLabelSettingTab(this.app, this));
    console.log("[graph-label-above] loaded");

    this.app.workspace.onLayoutReady(() => this.tryPatchAll());
    this.registerEvent(this.app.workspace.on("layout-change", () => this.tryPatchAll()));
    this.registerEvent(this.app.workspace.on("active-leaf-change", () => this.tryPatchAll()));
  }

  onunload() {
    if (this.patchedProto2D?.__origGraphRender) {
      this.patchedProto2D.render = this.patchedProto2D.__origGraphRender;
      delete this.patchedProto2D.__origGraphRender;
    }
    if (this.patchedProto3D?.__origCreateNodeObject) {
      this.patchedProto3D.createNodeObject = this.patchedProto3D.__origCreateNodeObject;
      delete this.patchedProto3D.__origCreateNodeObject;
    }
    // Restore natural y on all existing 3D sprites
    for (const leaf of this.app.workspace.getLeavesOfType("3d-graph-view")) {
      this.apply3DOffset(leaf.view, 1.0);
    }
    console.log("[graph-label-above] unloaded");
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
    this.refreshAllNodes();
  }

  refreshAllNodes() {
    // 2D graph
    for (const leaf of this.app.workspace.getLeavesOfType("graph")) {
      const renderer = (leaf.view as any)?.renderer;
      if (renderer?.nodes) {
        for (const node of renderer.nodes) {
          node.rendered && node.render?.();
        }
      }
    }
    // 3D graph — reapply offset to existing sprites
    for (const leaf of this.app.workspace.getLeavesOfType("3d-graph-view")) {
      this.apply3DOffset(leaf.view, this.settings.offsetMultiplier / 100);
    }
  }

  tryPatchAll() {
    for (const leaf of this.app.workspace.getLeavesOfType("graph")) {
      this.tryPatch2DLeaf(leaf);
    }
    for (const leaf of this.app.workspace.getLeavesOfType("3d-graph-view")) {
      this.tryPatch3DLeaf(leaf);
    }
  }

  // ── 2D graph (Pixi.js) ────────────────────────────────────────────────────

  private tryPatch2DLeaf(leaf: WorkspaceLeaf) {
    try {
      const renderer = (leaf.view as any)?.renderer;
      if (!renderer) return;

      const nodes: any[] = renderer.nodes;
      if (!nodes || !Array.isArray(nodes) || nodes.length === 0) return;

      const proto = Object.getPrototypeOf(nodes[0]);
      if (!proto?.render || typeof proto.render !== "function") return;

      if (!proto.__origGraphRender) {
        proto.__origGraphRender = proto.render;
      }

      const plugin = this;
      const origRender = proto.__origGraphRender;

      proto.render = function (this: any, ...args: any[]) {
        origRender.apply(this, args);

        const text = this.text;
        if (!text || !text.visible) return;
        const r = this.renderer;
        if (!r) return;

        const c: number = this.getSize?.() ?? 10;
        const f: number = r.nodeScale ?? 1;
        const l: number = this.moveText ?? 0;
        const mult = plugin.settings.offsetMultiplier / 100;

        text.anchor.y = 1;
        text.y = this.y - (c + 5) * f * mult - l / (r.scale ?? 1);

        if (plugin.settings.useCustomColor) {
          text.style.fill = plugin.settings.customColor;
        } else {
          const themeRgb = r.colors?.text?.rgb;
          if (themeRgb !== undefined) {
            text.style.fill = "#" + themeRgb.toString(16).padStart(6, "0");
          }
        }
      };

      this.patchedProto2D = proto;
      console.log("[graph-label-above] patched 2D graph renderer");

      for (const node of nodes) {
        node.rendered && node.render?.();
      }
    } catch (e) {
      console.warn("[graph-label-above] 2D patch failed:", e);
    }
  }

  // ── 3D graph (Three.js sprites) ───────────────────────────────────────────

  private tryPatch3DLeaf(leaf: WorkspaceLeaf) {
    try {
      const view = leaf.view as any;
      if (!view?.graph?.scene) return;

      const proto = Object.getPrototypeOf(view);
      if (!proto?.createNodeObject || typeof proto.createNodeObject !== "function") return;

      // Store true original once
      if (!proto.__origCreateNodeObject) {
        proto.__origCreateNodeObject = proto.createNodeObject;
      }

      const plugin = this;
      const origCreate = proto.__origCreateNodeObject;

      // Patch createNodeObject so future nodes get the right offset at birth
      proto.createNodeObject = function (this: any, ...args: any[]) {
        const group = origCreate.apply(this, args);
        for (const child of (group?.children ?? [])) {
          if (child.type === "Sprite" && child.position) {
            child.__naturalY = child.position.y;
            child.position.y = child.__naturalY * (plugin.settings.offsetMultiplier / 100);
          }
        }
        return group;
      };

      this.patchedProto3D = proto;
      console.log("[graph-label-above] patched 3D graph renderer");

      // Fix sprites that already exist in the scene
      this.apply3DOffset(view, this.settings.offsetMultiplier / 100);
    } catch (e) {
      console.warn("[graph-label-above] 3D patch failed:", e);
    }
  }

  // Walk the Three.js scene and apply mult to every sprite's natural y
  private apply3DOffset(view: any, mult: number) {
    try {
      const scene = view?.graph?.scene?.();
      if (!scene) return;
      for (const top of scene.children) {
        if (top.type !== "Group") continue;
        for (const node of top.children) {
          if (node.type !== "Group") continue;
          for (const obj of node.children) {
            if (obj.type === "Sprite" && obj.position) {
              // Store natural y on first encounter
              if (obj.__naturalY === undefined) obj.__naturalY = obj.position.y;
              obj.position.y = obj.__naturalY * mult;
            }
          }
        }
      }
    } catch (e) { /* swallow */ }
  }
}

// ── Settings tab ─────────────────────────────────────────────────────────────

class GraphLabelSettingTab extends PluginSettingTab {
  plugin: GraphLabelAbovePlugin;

  constructor(app: App, plugin: GraphLabelAbovePlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "Graph Label Above" });
    containerEl.createEl("p", {
      text: "Moves graph node labels above nodes so an enlarged mouse pointer does not obscure them. Works with both the built-in graph and 3D graph views.",
      cls: "setting-item-description",
    });

    let sliderDisplay: HTMLSpanElement;

    new Setting(containerEl)
      .setName("Label distance")
      .setDesc("How far the label sits above the node. 100 = default. Lower = closer; higher = further away.")
      .addSlider((slider) => {
        slider
          .setLimits(0, 200, 5)
          .setValue(this.plugin.settings.offsetMultiplier)
          .onChange(async (value) => {
            this.plugin.settings.offsetMultiplier = value;
            sliderDisplay.setText(value + "%");
            await this.plugin.saveSettings();
          });
        sliderDisplay = slider.sliderEl.insertAdjacentElement(
          "afterend",
          createSpan({ text: this.plugin.settings.offsetMultiplier + "%" })
        ) as HTMLSpanElement;
        sliderDisplay.style.cssText = "margin-left:10px; min-width:3em; display:inline-block;";
      });

    new Setting(containerEl)
      .setName("Custom label colour")
      .setDesc("Override the theme text colour for graph labels. Applies to the 2D graph only.")
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.useCustomColor)
          .onChange(async (value) => {
            this.plugin.settings.useCustomColor = value;
            await this.plugin.saveSettings();
            this.display();
          });
      });

    if (this.plugin.settings.useCustomColor) {
      new Setting(containerEl)
        .setName("Label colour")
        .setDesc("Colour for 2D graph node labels.")
        .addColorPicker((picker) => {
          picker
            .setValue(this.plugin.settings.customColor)
            .onChange(async (value) => {
              this.plugin.settings.customColor = value;
              await this.plugin.saveSettings();
            });
        });
    }
  }
}
