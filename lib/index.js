/**
 * dsh-preset-force — DSH 会话模式强切插件（host half）。
 *
 * 原理：DSH 的「模式」即 agent preset（极简 minimal / 标准 standard / 代码 code /
 * 创造 cordis / 用户自建）。网关（dsh-host-apiproxy 的 agentPresets.select RPC）在
 * 传输层用 sessionBlank() 检查「会话尚未开始」才放行 recompose()，否则返回
 * agent-preset-locked。但 recompose() 服务本身不检查（“由调用方负责该检查”），
 * 因此本插件在宿主平面直接调用 recompose() 并追加与会话同源的
 * agent-preset/selected 日志事件，即可绕过网关锁、且保持「模型可见 ⟺ 已落日志」
 * 不变量（dsh-agent-presets 会把它重发为不带 scope 的 cordis 事件，客户端据此
 * 刷新头部标签）。
 *
 * 三个入口：
 *   · /preset 命令        —— 用户直接在输入框敲 /preset standard
 *   · set_agent_preset 工具 —— 模型按用户要求调用
 *   · /api/dsh-preset-force/* —— 客户端「输入框上方强切条」走的 HTTP 路由
 *
 * 风险提示（设计使然）：切换后模型看到的工具 schema 立即变为新 preset 的集合，
 * 历史中已记录的旧工具调用若新 preset 不具备，重放会失败；建议在轮次之间切换。
 * 本插件不检查会话是否空白——这正是「强制」的语义。
 */
import { defineTool } from "@deepseek-ai/dsh-tools";

export const name = "dsh-preset-force";

export const inject = ["commands", "tools", "agentPresets", "agents", "webServer"];

// ── 核心：强制切换 ──────────────────────────────────────────────────────────
/**
 * 把 agent 的 preset 强制重链到 target，并把切换事件写进会话日志。
 * @returns {Promise<{ok: boolean, from?: string, to?: string, unchanged?: boolean, error?: string}>}
 */
async function switchPreset(ctx, agent, target) {
	const presets = ctx.agentPresets;
	if (!presets) return { ok: false, error: "此部署未装配 agent presets（无可用模式）" };
	let current;
	try {
		current = presets.composedPreset(agent.ctx);
	} catch {
		current = undefined;
	}
	if (current === target) return { ok: true, unchanged: true, from: current, to: target };
	try {
		const preset = await presets.recompose(agent.ctx, target);
		agent.session.append("agent-preset/selected", { agentPreset: preset.id });
		return { ok: true, from: current, to: preset.id };
	} catch (error) {
		return { ok: false, error: String((error && error.message) || error) };
	}
}

/** 会话当前运行的模式 id（scope 链实读），读取失败返回 undefined。 */
function currentPreset(ctx, agent) {
	try {
		return ctx.agentPresets.composedPreset(agent.ctx);
	} catch {
		return undefined;
	}
}

/** 列出 roster（含展示名与损坏标记）。 */
async function listPresets(ctx) {
	const presets = ctx.agentPresets;
	if (!presets) return [];
	const rows = await presets.list();
	return rows.map((preset) => ({
		id: preset.id,
		name: preset.name,
		trust: preset.trust,
		broken: preset.broken
	}));
}

/** 会话展示标题（多候选字段防御式读取）。 */
function agentTitle(agent) {
	const session = agent.session;
	return agent.title ?? session?.title ?? session?.metadata?.title ?? session?.info?.title ?? undefined;
}

/** 顶层在线会话列表（含各自当前模式，供客户端兜底控件展示与选择）。 */
function liveSessions(ctx) {
	try {
		return ctx.agents.roots().map((agent) => ({
			id: agent.id,
			title: agentTitle(agent),
			status: agent.status,
			current: currentPreset(ctx, agent)
		}));
	} catch {
		return [];
	}
}

// ── /preset 命令 ────────────────────────────────────────────────────────────
function registerCommand(ctx) {
	const handler = async (invocation) => {
		const agent = invocation.agent;
		const presets = ctx.agentPresets;
		if (!presets) return { kind: "error", text: "此部署未装配 agent presets（无可用模式）。" };
		const raw = invocation.rawInput.trim();
		if (raw === "" || raw === "list" || raw === "ls" || raw === "?") {
			const current = currentPreset(ctx, agent);
			const rows = (await listPresets(ctx)).map((row) => {
				const badge = row.id === current ? " ← 当前" : "";
				const broken = row.broken ? ` [损坏: ${row.broken}]` : "";
				const name = row.name ? `（${row.name}）` : "";
				return `  ${row.id}${name}${badge}${broken}`;
			});
			return {
				kind: "success",
				text: `当前模式：${current ?? "（未加入 preset）"}\n可用模式：\n${rows.join("\n")}\n\n用法：/preset <模式id> —— 强制切换当前会话的模式（不要求会话为空，工具集立即更换）`
			};
		}
		const id = raw.split(/\s+/)[0];
		const result = await switchPreset(ctx, agent, id);
		if (!result.ok) return { kind: "error", text: `切换失败：${result.error}` };
		if (result.unchanged) return { kind: "success", text: `当前会话已经是模式 ${result.to}。` };
		return {
			kind: "success",
			text: `已强制切换当前会话模式：${result.from ?? "（原未加入）"} → ${result.to}。模型可见的工具与提示词已更换；已产生的历史记录保持原样。`
		};
	};
	ctx.effect(function* () {
		yield ctx.commands.register({
			name: "preset",
			description: "查看 / 强制切换当前会话的模式（agent preset）",
			handler
		});
	}, "dsh-preset-force: /preset command");
}

// ── set_agent_preset 工具 ───────────────────────────────────────────────────
function registerTool(ctx) {
	ctx.tools.register(defineTool({
		name: "set_agent_preset",
		description: "Force-switch the CURRENT session's agent preset (mode) even after the session has started, overriding DSH's built-in blank-only lock (the /preset command or the composer switcher do the same). The model-visible tool schema and prompt sections change immediately: tools from the old preset disappear, tools from the new preset appear, so prefer switching between turns, and note that replaying history that called tools the new preset lacks may fail. Only the top-level session may be switched, not subagents.",
		parameters: {
			preset: {
				type: "string",
				required: true,
				description: "Target preset id, e.g. standard / minimal / code / cordis, or a locally authored id; pass an empty string to list available ids."
			}
		},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					ok: { type: "boolean", required: true },
					from: { type: "string" },
					to: { type: "string" },
					unchanged: { type: "boolean" },
					available: {
						type: "array",
						items: {
							type: "object",
							additionalProperties: false,
							properties: {
								id: { type: "string", required: true },
								name: { type: "string" }
							}
						}
					},
					error: { type: "string" }
				}
			},
			render: (_args, value) => [{ type: "text", text: JSON.stringify(value) }]
		},
		presentCall: (args) => ({
			card: "generic",
			title: "强制切换会话模式",
			kind: "other",
			rawInput: args.preset
		}),
		execute: async (args, exec) => {
			const agent = exec.agent;
			if (agent === void 0) return { ok: false, error: "set_agent_preset 需要调用方是运行中的 agent。" };
			if (ctx.agents.get(agent.id) !== agent || ctx.agents.currentInitiator() !== agent) {
				return { ok: false, error: "set_agent_preset 只能在调用 agent 自己的活跃驱动边界内使用。" };
			}
			if (!ctx.agents.roots().includes(agent)) {
				return { ok: false, error: "set_agent_preset 只能切换顶层会话的模式，子代理不可切换。" };
			}
			if (args.preset === "" || args.preset === "list" || args.preset === "?") {
				const current = currentPreset(ctx, agent);
				const rows = (await listPresets(ctx)).map((row) => ({ id: row.id, name: row.name }));
				return { ok: true, unchanged: true, from: current, to: current, available: rows };
			}
			return switchPreset(ctx, agent, args.preset);
		}
	}));
}

// ── HTTP 路由（客户端强切条）───────────────────────────────────────────────
const json = (res, status, data) => {
	const body = JSON.stringify(data);
	res.writeHead(status, {
		"Content-Type": "application/json; charset=utf-8",
		"Cache-Control": "no-store"
	});
	res.end(body);
};

const readBody = (req) =>
	new Promise((resolve, reject) => {
		let data = "";
		req.on("data", (chunk) => {
			data += chunk;
			if (data.length > 65536) {
				reject(new Error("body too large"));
				req.destroy();
			}
		});
		req.on("end", () => resolve(data));
		req.on("error", reject);
	});

const LOOPBACK_ADDRESSES = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);
const LOOPBACK_HOSTNAMES = /^(127\.0\.0\.1|localhost|\[::1\])$/;

function isLoopbackRequest(req) {
	const remote = String((req.socket && req.socket.remoteAddress) || "");
	return LOOPBACK_ADDRESSES.has(remote) || LOOPBACK_ADDRESSES.has(remote.replace(/^::ffff:/, ""));
}

/** Host 头必须是回环主机名 + 当前端口（DNS rebinding 防护，GET/POST 一视同仁）。 */
function isAllowedHost(req, currentPort) {
	const host = String(req.headers.host || "");
	if (host === "") return true; // 无 Host 头（非浏览器客户端）由回环检查兜底
	try {
		const parsed = new URL("http://" + host);
		return (
			LOOPBACK_HOSTNAMES.test(parsed.hostname) &&
			(parsed.port === "" || parsed.port === String(currentPort))
		);
	} catch {
		return false;
	}
}

function isAllowedOrigin(req, currentPort) {
	const origin = req.headers.origin;
	if (!origin) return true;
	// 桌面App（Electron 壳）以 dsh-app://app 为页面源，其请求由主进程转发到
	// 本机回环并自动附带 Host 会话 cookie，等同同源调用。
	if (origin === "dsh-app://app") return true;
	try {
		const parsed = new URL(origin);
		return (
			LOOPBACK_HOSTNAMES.test(parsed.hostname) &&
			(parsed.port === "" || parsed.port === String(currentPort))
		);
	} catch {
		return false;
	}
}

function applyRoutes(ctx) {
	const webServer = ctx.webServer;
	if (!webServer) return;
	const dispose = webServer.register({
		kind: "prefix",
		path: "/dsh-preset-force",
		handler: async (req, res) => {
			try {
				const url = new URL(req.url, "http://127.0.0.1");
				const route = url.pathname.slice("/dsh-preset-force".length);

				// 隐私边界：只服务本机回环连接；Host 校验封 DNS rebinding。
				if (!isLoopbackRequest(req)) {
					json(res, 403, { ok: false, error: "preset-force API is loopback-only" });
					return;
				}
				if (!isAllowedHost(req, webServer.port)) {
					json(res, 403, { ok: false, error: "invalid host header" });
					return;
				}

				if (req.method === "GET" && (route === "/status" || route === "/")) {
					const sessionId = url.searchParams.get("sessionId") || "";
					const agent = sessionId ? ctx.agents.get(sessionId) : undefined;
					const rows = await listPresets(ctx);
					const sessions = liveSessions(ctx);
					if (!agent) {
						json(res, 200, { ok: true, live: false, sessionId, available: rows, sessions });
						return;
					}
					json(res, 200, {
						ok: true,
						live: true,
						sessionId,
						current: currentPreset(ctx, agent),
						available: rows,
						sessions
					});
					return;
				}

				if (req.method === "POST" && route === "/switch") {
					// 防跨站：浏览器发起的写操作必须同源且为 JSON。
					if (!isAllowedOrigin(req, webServer.port)) {
						json(res, 403, { ok: false, error: "cross-origin request rejected" });
						return;
					}
					const contentType = String(req.headers["content-type"] || "").toLowerCase();
					if (!contentType.startsWith("application/json")) {
						json(res, 415, { ok: false, error: "Content-Type 必须是 application/json" });
						return;
					}
					let body = {};
					try {
						body = JSON.parse((await readBody(req)) || "{}");
					} catch {
						json(res, 400, { ok: false, error: "请求体不是有效 JSON" });
						return;
					}
					let sessionId = String(body.sessionId || "");
					const target = String(body.preset || "");
					let agent = sessionId ? ctx.agents.get(sessionId) : undefined;
					if (!agent && sessionId === "") {
						// 兜底控件可以不带 sessionId：仅当唯一顶层会话在线时自动选中。
						const roots = ctx.agents.roots();
						if (roots.length === 1) {
							agent = roots[0];
							sessionId = agent.id;
						} else if (roots.length > 1) {
							json(res, 400, { ok: false, error: "多个会话正在运行，请指定 sessionId", sessions: liveSessions(ctx) });
							return;
						}
					}
					if (!agent) {
						json(res, 404, { ok: false, error: `会话 ${sessionId} 不在运行中，无法切换` });
						return;
					}
					const result = await switchPreset(ctx, agent, target);
					json(res, 200, { ...result, sessionId });
					return;
				}

				json(res, 404, { ok: false, error: "unknown route: " + route });
			} catch (error) {
				json(res, 500, { ok: false, error: String((error && error.message) || error) });
			}
		}
	});
	ctx.effect(() => dispose, "dsh-preset-force: routes");
}

// ── 入口 ────────────────────────────────────────────────────────────────────
export function apply(ctx) {
	registerCommand(ctx);
	registerTool(ctx);
	applyRoutes(ctx);
}
