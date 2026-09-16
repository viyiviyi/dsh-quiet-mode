/**
 * dsh-quiet-mode —— 在会话的系统提示词里注入一条固定的作业纪律。
 *
 * 扩展点：`@deepseek-ai/dsh-system-prompt` 提供的提示词注册表。dsh-system-prompt
 * 在每个模型步骤之前组装一次系统提示词，`ctx.systemPrompt.section()` 注册的
 * 段落会进入这次组装——所以在会话建立前挂上这一行，就等于"每次会话开始时注入"。
 *
 * 为什么用提示词段落而不是会话事件：段落是静态文本，随 agent 生命周期只注册
 * 一次，前缀在整个会话内稳定，不会破坏 KV 缓存复用；而把它写成 user 角色快照
 * （runtime context / `session.append`）会让这句话出现在每个请求的历史里，
 * 并随轮次增长。
 *
 * 为什么这里不 import @deepseek-ai/schemastery：插件通常以 `link:` 指向克隆出来的
 * 源码目录，Node 会从那个目录往上找 node_modules，而宿主作用域的包只存在于 profile
 * 的 node_modules 里——解析不到就会让 dsh 启动直接失败（ERR_MODULE_NOT_FOUND）。
 * 配置项只有两个，apply() 里兜底即可，不值得为此背一个宿主作用域的运行时依赖。
 *
 * @module dsh-quiet-mode
 */

/** Cordis 插件名。 */
export const name = "quiet-mode";

/**
 * 依赖的提示词注册表服务。Cordis 保证服务就绪后才调用 apply；服务消失时本行
 * 会自动卸载，恢复后重新加载。
 */
export const inject = ["systemPrompt"];

/** 默认注入的句子，逐字保留用户给出的原文（含 Markdown 加粗标记）。 */
export const DEFAULT_TEXT =
  "请**保持静默，专注干活，不胡思乱想，不过度思考，不过度设计，不虚构历史，不清晰就询问，不猜测或假定目标，不创造名词概念，不使用缩写，坚持使用简体中文进行思考和回复**";

/**
 * 段落名。注册表要求段落名唯一——同一层里重复注册会直接抛错，因此这个名字
 * 同时是"本插件已经挂上"的可观察标识。
 */
export const SECTION_NAME = "quiet-mode";

/** 本行没给 config 时使用的默认值。 */
export const DEFAULT_CONFIG = { enabled: true, text: DEFAULT_TEXT };

/**
 * 注册固定段落。
 *
 * 排序落在部署人设（order 0）之后的第一位，因此在最终提示词里紧跟身份/人设，
 * 排在计划策略（500）与所有工具指引（1000 起）之前。
 *
 * @param ctx - 挂载本行的 Cordis 上下文。
 * @param config - 本行的 config；未提供或字段缺失时按默认值兜底。
 */
export function apply(ctx, config) {
  if ((config?.enabled ?? DEFAULT_CONFIG.enabled) === false) return;
  const text = config?.text ?? DEFAULT_CONFIG.text;
  if (text.trim() === "") return;
  const order = ctx.systemPrompt.getSectionOrder("DEPLOYMENT_PERSONA") + 1;
  // 注册返回的就是本行 fiber 的精确 disposer；交给 ctx.effect 后，插件卸载或
  // 热更新时段落会被撤销，不会残留第二次注册。
  ctx.effect(
    () => ctx.systemPrompt.section({ name: SECTION_NAME, order, text }),
    "quiet-mode.section()",
  );
}
