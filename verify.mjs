/**
 * 本地验证脚本（不随包发布，见 package.json 的 files 白名单）。
 *
 * 跑法：在插件目录执行 `node verify.mjs`。
 *
 * A 组是契约测试：用伪 ctx 断言 apply() 注册了什么。
 * B 组是端到端测试：用真实的 cordis + dsh-system-prompt 组装一次系统提示词，
 * 断言注入的句子确实出现在最终提示词里，且排在人设段落之后。
 */
import assert from "node:assert/strict";
import { Context } from "@deepseek-ai/cordis";
import SystemPrompt, { renderPrompt } from "@deepseek-ai/dsh-system-prompt";
import * as plugin from "./lib/index.js";

let passed = 0;
const check = (label, fn) => {
  fn();
  passed += 1;
  console.log(`  ok  ${label}`);
};

/** 伪上下文：只记录 apply() 对提示词注册表做了什么。 */
function fakeCtx() {
  const calls = { orders: [], sections: [], effects: [] };
  return {
    calls,
    systemPrompt: {
      getSectionOrder(name) {
        calls.orders.push(name);
        return 0;
      },
      section(section) {
        calls.sections.push(section);
        return () => {};
      },
    },
    effect(fn, label) {
      calls.effects.push(label);
      return fn();
    },
  };
}

console.log("A. 注册契约");

check("默认配置注册唯一段落，order = 人设 + 1，文本逐字", () => {
  const ctx = fakeCtx();
  plugin.apply(ctx, {});
  assert.deepEqual(ctx.calls.orders, ["DEPLOYMENT_PERSONA"]);
  assert.deepEqual(ctx.calls.sections, [
    { name: "quiet-mode", order: 1, text: plugin.DEFAULT_TEXT },
  ]);
  assert.equal(ctx.calls.effects[0], "quiet-mode.section()");
});

check("默认值常量完整", () => {
  assert.equal(plugin.DEFAULT_CONFIG.enabled, true);
  assert.equal(plugin.DEFAULT_CONFIG.text, plugin.DEFAULT_TEXT);
});

check("段落名唯一，且与常量一致", () => {
  assert.equal(plugin.SECTION_NAME, "quiet-mode");
  assert.equal(plugin.inject.length, 1);
  assert.equal(plugin.inject[0], "systemPrompt");
});

check("enabled: false 时什么都不注册", () => {
  const ctx = fakeCtx();
  plugin.apply(ctx, { enabled: false });
  assert.equal(ctx.calls.sections.length, 0);
});

check("text 为空白时什么都不注册", () => {
  const ctx = fakeCtx();
  plugin.apply(ctx, { text: "   \n " });
  assert.equal(ctx.calls.sections.length, 0);
});

check("自定义 text 生效", () => {
  const ctx = fakeCtx();
  plugin.apply(ctx, { text: "自定义纪律" });
  assert.equal(ctx.calls.sections[0].text, "自定义纪律");
});

check("完全没给 config 时按默认值兜底", () => {
  const ctx = fakeCtx();
  plugin.apply(ctx, undefined);
  assert.equal(ctx.calls.sections[0].text, plugin.DEFAULT_TEXT);
});

console.log("B. 端到端：真实 cordis + dsh-system-prompt");

const PERSONA_MARKER = "PERSONA-MARKER-FOR-ORDER-CHECK";
const root = new Context();
const personaRow = root.plugin(SystemPrompt, { persona: PERSONA_MARKER });
await new Promise((resolve) => setTimeout(resolve, 20));
assert.ok(root.systemPrompt, "systemPrompt 服务未就绪");
const quietRow = root.plugin(plugin);
await new Promise((resolve) => setTimeout(resolve, 20));

const assembly = await root.systemPrompt.assemble();
const prompt = renderPrompt(assembly);

check("最终系统提示词包含注入的整句", () => {
  assert.ok(
    prompt.includes(plugin.DEFAULT_TEXT),
    `提示词里没有找到注入文本：\n${prompt}`,
  );
});

check("注入段落排在人设段落之后", () => {
  const personaAt = prompt.indexOf(PERSONA_MARKER);
  const quietAt = prompt.indexOf(plugin.DEFAULT_TEXT);
  assert.ok(personaAt >= 0, "人设段落缺失");
  assert.ok(quietAt > personaAt, "注入文本应排在人设之后");
});

check("段落只注册一次，不重复", () => {
  const occurrences = prompt.split(plugin.DEFAULT_TEXT).length - 1;
  assert.equal(occurrences, 1, `注入文本出现了 ${occurrences} 次`);
});

console.log("C. 生命周期：卸载后段落消失");

await quietRow.dispose();
const afterDispose = renderPrompt(await root.systemPrompt.assemble());
check("卸载 quiet-mode 行后注入文本被撤销", () => {
  assert.ok(!afterDispose.includes(plugin.DEFAULT_TEXT), "卸载后仍然残留");
  assert.ok(afterDispose.includes(PERSONA_MARKER), "不应波及其他段落");
});

await personaRow.dispose();
console.log(`\n全部通过：${passed} 项`);
