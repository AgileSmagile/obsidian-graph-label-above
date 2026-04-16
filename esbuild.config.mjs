import esbuild from "esbuild";
import { resolve } from "path";

const prod = process.argv[2] === "production";

const outDir = resolve(
  "C:/Users/James/Projects/sonnet-agent/Vault101/.obsidian/plugins/graph-label-above"
);

const ctx = await esbuild.context({
  entryPoints: ["src/main.ts"],
  bundle: true,
  external: ["obsidian", "electron", "@codemirror/*", "@lezer/*", "@codemirror/state", "@codemirror/view"],
  format: "cjs",
  target: "es2018",
  logLevel: "info",
  sourcemap: prod ? false : "inline",
  treeShaking: true,
  outfile: `${outDir}/main.js`,
});

if (prod) {
  await ctx.rebuild();
  process.exit(0);
} else {
  await ctx.watch();
}
