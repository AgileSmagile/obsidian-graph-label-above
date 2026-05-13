import { Plugin, PluginSettingTab, App, Setting, WorkspaceLeaf } from "obsidian";

interface GraphLabelSettings {
  offsetMultiplier: number; // 0-200, default 100
  useCustomColor: boolean;
  customColor: string;
}

const DEFAULT_SETTINGS: GraphLabelSettings = {
  offsetMultiplier: 100,
  useCustomColor: false,
  customColor: "#ffffff",
};

// Internal graph API types (not publicly exported by Obsidian)

interface NodeText {
  visible: boolean;
  anchor: { y: number };
  y: number;
  style: { fill: string };
}

interface NodeRenderer {
  nodes?: GraphNode2D[];
  nodeScale?: number;
  scale?: number;
  colors?: { text?: { rgb?: number } };
}

interface GraphNode2D {
  text?: NodeText;
  renderer?: NodeRenderer;
  getSize?(): number;
  y: number;
  moveText?: number;
  rendered?: boolean;
  render?(): void;
}

interface GraphNode2DProto {
  render(this: GraphNode2D, ...args: unknown[]): void;
  __origGraphRender?: GraphNode2DProto["render"];
}

interface Graph3DView {
  graph?: {
    scene?(): ThreeDScene;
  };
}

interface ThreeDScene {
  children: ThreeDGroup[];
}

interface ThreeDGroup {
  type: string;
  children: ThreeDObject[];
}

interface ThreeDObject {
  type: string;
  children?: ThreeDObject[];
  position?: { y: number };
  __naturalY?: number;
}

interface Graph3DProto {
  createNodeObject(this: Graph3DView, ...args: unknown[]): { children?: ThreeDObject[] } | undefined;
  __origCreateNodeObject?: Graph3DProto["createNodeObject"];
}

export default class GraphLabelAbovePlugin extends Plugin {
  settings: GraphLabelSettings;
  private patchedProto2D: GraphNode2DProto | null = null;
  private patchedProto3D: Graph3DProto | null = null;

  async onload() {
    await this.loadSettings();
    this.addSettingTab(new GraphLabelSettingTab(this.app, this));
    console.debug("[graph-label-above] loaded");

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
    for (const leaf of this.app.workspace.getLeavesOfType("3d-graph-view")) {
      this.apply3DOffset(leaf.view as unknown as Graph3DView, 1.0);
    }
    console.debug("[graph-label-above] unloaded");
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData() as Partial<GraphLabelSettings>);
  }

  async saveSettings() {
    await this.saveData(this.settings);
    this.refreshAllNodes();
  }

  refreshAllNodes() {
    for (const leaf of this.app.workspace.getLeavesOfType("graph")) {
      const renderer = (leaf.view as unknown as { renderer?: NodeRenderer })?.renderer;
      if (renderer?.nodes) {
        for (const node of renderer.nodes) {
          if (node.rendered) node.render?.();
        }
      }
    }
    for (const leaf of this.app.workspace.getLeavesOfType("3d-graph-view")) {
      this.apply3DOffset(leaf.view as unknown as Graph3DView, this.settings.offsetMultiplier / 100);
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

  private tryPatch2DLeaf(leaf: WorkspaceLeaf) {
    try {
      const renderer = (leaf.view as unknown as { renderer?: NodeRenderer })?.renderer;
      if (!renderer) return;

      const nodes = renderer.nodes;
      if (!nodes || !Array.isArray(nodes) || nodes.length === 0) return;

      const proto = Object.getPrototypeOf(nodes[0]) as GraphNode2DProto;
      if (!proto?.render || typeof proto.render !== "function") return;

      if (!proto.__origGraphRender) {
        // eslint-disable-next-line @typescript-eslint/unbound-method
        proto.__origGraphRender = proto.render;
      }

      const getSettings = () => this.settings;
      const origRender = proto.__origGraphRender;

      proto.render = function (this: GraphNode2D, ...args: unknown[]) {
        origRender.apply(this, args);

        const text = this.text;
        if (!text || !text.visible) return;
        const r = this.renderer;
        if (!r) return;

        const c: number = this.getSize?.() ?? 10;
        const f: number = r.nodeScale ?? 1;
        const l: number = this.moveText ?? 0;
        const settings = getSettings();
        const mult = settings.offsetMultiplier / 100;

        text.anchor.y = 1;
        text.y = this.y - (c + 5) * f * mult - l / (r.scale ?? 1);

        if (settings.useCustomColor) {
          text.style.fill = settings.customColor;
        } else {
          const themeRgb = r.colors?.text?.rgb;
          if (themeRgb !== undefined) {
            text.style.fill = "#" + themeRgb.toString(16).padStart(6, "0");
          }
        }
      };

      this.patchedProto2D = proto;
      console.debug("[graph-label-above] patched 2D graph renderer");

      for (const node of nodes) {
        if (node.rendered) node.render?.();
      }
    } catch (e) {
      console.warn("[graph-label-above] 2D patch failed:", e);
    }
  }

  private tryPatch3DLeaf(leaf: WorkspaceLeaf) {
    try {
      const view = leaf.view as unknown as Graph3DView;
      if (!view?.graph?.scene) return;

      const proto = Object.getPrototypeOf(view) as Graph3DProto;
      if (!proto?.createNodeObject || typeof proto.createNodeObject !== "function") return;

      if (!proto.__origCreateNodeObject) {
        // eslint-disable-next-line @typescript-eslint/unbound-method
        proto.__origCreateNodeObject = proto.createNodeObject;
      }

      const getSettings = () => this.settings;
      const origCreate = proto.__origCreateNodeObject;

      proto.createNodeObject = function (this: Graph3DView, ...args: unknown[]) {
        const group = origCreate.apply(this, args);
        for (const child of (group?.children ?? [])) {
          if (child.type === "Sprite" && child.position) {
            child.__naturalY = child.position.y;
            child.position.y = child.__naturalY * (getSettings().offsetMultiplier / 100);
          }
        }
        return group;
      };

      this.patchedProto3D = proto;
      console.debug("[graph-label-above] patched 3D graph renderer");

      this.apply3DOffset(view, this.settings.offsetMultiplier / 100);
    } catch (e) {
      console.warn("[graph-label-above] 3D patch failed:", e);
    }
  }

  private apply3DOffset(view: Graph3DView, mult: number) {
    try {
      const scene = view?.graph?.scene?.();
      if (!scene) return;
      for (const top of scene.children) {
        if (top.type !== "Group") continue;
        for (const node of top.children) {
          if (node.type !== "Group") continue;
          for (const obj of (node.children ?? [])) {
            if (obj.type === "Sprite" && obj.position) {
              if (obj.__naturalY === undefined) obj.__naturalY = obj.position.y;
              obj.position.y = obj.__naturalY * mult;
            }
          }
        }
      }
    } catch { /* swallow */ }
  }
}

// Settings tab

class GraphLabelSettingTab extends PluginSettingTab {
  plugin: GraphLabelAbovePlugin;

  constructor(app: App, plugin: GraphLabelAbovePlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();


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
        sliderDisplay.setCssStyles({ marginLeft: "10px", minWidth: "3em", display: "inline-block" });
      });

    new Setting(containerEl)
      .setName("Custom label colour")
      .setDesc("Override the theme text colour for graph labels; applies to the 2D graph only.")
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
