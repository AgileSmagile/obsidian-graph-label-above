"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/main.ts
var main_exports = {};
__export(main_exports, {
  default: () => GraphLabelAbovePlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian = require("obsidian");
var DEFAULT_SETTINGS = {
  offsetMultiplier: 100,
  useCustomColor: false,
  customColor: "#ffffff"
};
var GraphLabelAbovePlugin = class extends import_obsidian.Plugin {
  constructor() {
    super(...arguments);
    this.patchedProto2D = null;
    this.patchedProto3D = null;
  }
  async onload() {
    await this.loadSettings();
    this.addSettingTab(new GraphLabelSettingTab(this.app, this));
    console.debug("[graph-label-above] loaded");
    this.app.workspace.onLayoutReady(() => this.tryPatchAll());
    this.registerEvent(this.app.workspace.on("layout-change", () => this.tryPatchAll()));
    this.registerEvent(this.app.workspace.on("active-leaf-change", () => this.tryPatchAll()));
  }
  onunload() {
    var _a, _b;
    if ((_a = this.patchedProto2D) == null ? void 0 : _a.__origGraphRender) {
      this.patchedProto2D.render = this.patchedProto2D.__origGraphRender;
      delete this.patchedProto2D.__origGraphRender;
    }
    if ((_b = this.patchedProto3D) == null ? void 0 : _b.__origCreateNodeObject) {
      this.patchedProto3D.createNodeObject = this.patchedProto3D.__origCreateNodeObject;
      delete this.patchedProto3D.__origCreateNodeObject;
    }
    for (const leaf of this.app.workspace.getLeavesOfType("3d-graph-view")) {
      this.apply3DOffset(leaf.view, 1);
    }
    console.debug("[graph-label-above] unloaded");
  }
  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }
  async saveSettings() {
    await this.saveData(this.settings);
    this.refreshAllNodes();
  }
  refreshAllNodes() {
    var _a, _b;
    for (const leaf of this.app.workspace.getLeavesOfType("graph")) {
      const renderer = (_a = leaf.view) == null ? void 0 : _a.renderer;
      if (renderer == null ? void 0 : renderer.nodes) {
        for (const node of renderer.nodes) {
          if (node.rendered)
            (_b = node.render) == null ? void 0 : _b.call(node);
        }
      }
    }
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
  tryPatch2DLeaf(leaf) {
    var _a, _b;
    try {
      const renderer = (_a = leaf.view) == null ? void 0 : _a.renderer;
      if (!renderer)
        return;
      const nodes = renderer.nodes;
      if (!nodes || !Array.isArray(nodes) || nodes.length === 0)
        return;
      const proto = Object.getPrototypeOf(nodes[0]);
      if (!(proto == null ? void 0 : proto.render) || typeof proto.render !== "function")
        return;
      if (!proto.__origGraphRender) {
        proto.__origGraphRender = proto.render;
      }
      const getSettings = () => this.settings;
      const origRender = proto.__origGraphRender;
      proto.render = function(...args) {
        var _a2, _b2, _c, _d, _e, _f, _g;
        origRender.apply(this, args);
        const text = this.text;
        if (!text || !text.visible)
          return;
        const r = this.renderer;
        if (!r)
          return;
        const c = (_b2 = (_a2 = this.getSize) == null ? void 0 : _a2.call(this)) != null ? _b2 : 10;
        const f = (_c = r.nodeScale) != null ? _c : 1;
        const l = (_d = this.moveText) != null ? _d : 0;
        const settings = getSettings();
        const mult = settings.offsetMultiplier / 100;
        text.anchor.y = 1;
        text.y = this.y - (c + 5) * f * mult - l / ((_e = r.scale) != null ? _e : 1);
        if (settings.useCustomColor) {
          text.style.fill = settings.customColor;
        } else {
          const themeRgb = (_g = (_f = r.colors) == null ? void 0 : _f.text) == null ? void 0 : _g.rgb;
          if (themeRgb !== void 0) {
            text.style.fill = "#" + themeRgb.toString(16).padStart(6, "0");
          }
        }
      };
      this.patchedProto2D = proto;
      console.debug("[graph-label-above] patched 2D graph renderer");
      for (const node of nodes) {
        if (node.rendered)
          (_b = node.render) == null ? void 0 : _b.call(node);
      }
    } catch (e) {
      console.warn("[graph-label-above] 2D patch failed:", e);
    }
  }
  tryPatch3DLeaf(leaf) {
    var _a;
    try {
      const view = leaf.view;
      if (!((_a = view == null ? void 0 : view.graph) == null ? void 0 : _a.scene))
        return;
      const proto = Object.getPrototypeOf(view);
      if (!(proto == null ? void 0 : proto.createNodeObject) || typeof proto.createNodeObject !== "function")
        return;
      if (!proto.__origCreateNodeObject) {
        proto.__origCreateNodeObject = proto.createNodeObject;
      }
      const getSettings = () => this.settings;
      const origCreate = proto.__origCreateNodeObject;
      proto.createNodeObject = function(...args) {
        var _a2;
        const group = origCreate.apply(this, args);
        for (const child of (_a2 = group == null ? void 0 : group.children) != null ? _a2 : []) {
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
  apply3DOffset(view, mult) {
    var _a, _b, _c;
    try {
      const scene = (_b = (_a = view == null ? void 0 : view.graph) == null ? void 0 : _a.scene) == null ? void 0 : _b.call(_a);
      if (!scene)
        return;
      for (const top of scene.children) {
        if (top.type !== "Group")
          continue;
        for (const node of top.children) {
          if (node.type !== "Group")
            continue;
          for (const obj of (_c = node.children) != null ? _c : []) {
            if (obj.type === "Sprite" && obj.position) {
              if (obj.__naturalY === void 0)
                obj.__naturalY = obj.position.y;
              obj.position.y = obj.__naturalY * mult;
            }
          }
        }
      }
    } catch (e) {
    }
  }
};
var GraphLabelSettingTab = class extends import_obsidian.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    new import_obsidian.Setting(containerEl).setName("Graph label above").setHeading();
    let sliderDisplay;
    new import_obsidian.Setting(containerEl).setName("Label distance").setDesc("How far the label sits above the node. 100 = default. Lower = closer; higher = further away.").addSlider((slider) => {
      slider.setLimits(0, 200, 5).setValue(this.plugin.settings.offsetMultiplier).onChange(async (value) => {
        this.plugin.settings.offsetMultiplier = value;
        sliderDisplay.setText(value + "%");
        await this.plugin.saveSettings();
      });
      sliderDisplay = slider.sliderEl.insertAdjacentElement(
        "afterend",
        createSpan({ text: this.plugin.settings.offsetMultiplier + "%" })
      );
      sliderDisplay.setCssStyles({ marginLeft: "10px", minWidth: "3em", display: "inline-block" });
    });
    new import_obsidian.Setting(containerEl).setName("Custom label colour").setDesc("Override the theme text colour for graph labels; applies to the 2D graph only.").addToggle((toggle) => {
      toggle.setValue(this.plugin.settings.useCustomColor).onChange(async (value) => {
        this.plugin.settings.useCustomColor = value;
        await this.plugin.saveSettings();
        this.display();
      });
    });
    if (this.plugin.settings.useCustomColor) {
      new import_obsidian.Setting(containerEl).setName("Label colour").setDesc("Colour for 2D graph node labels.").addColorPicker((picker) => {
        picker.setValue(this.plugin.settings.customColor).onChange(async (value) => {
          this.plugin.settings.customColor = value;
          await this.plugin.saveSettings();
        });
      });
    }
  }
};
