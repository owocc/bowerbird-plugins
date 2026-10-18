import { useEffect, useState } from "react";
import { jsx, jsxs } from "react/jsx-runtime";
//#region packages/plugin-sdk/src/helper.ts
/**
* Type-safe helper to define a Bowerbird preview or metadata plugin.
*/
function definePlugin(plugin) {
	return plugin;
}
//#endregion
//#region plugins/prompt-metadata/src/index.tsx
function usePluginTheme(propTheme, api) {
	const getResolved = () => {
		if (propTheme) return propTheme;
		if (api?.getTheme) return api.getTheme();
		if (typeof document !== "undefined") return document.documentElement.classList.contains("dark") ? "dark" : "light";
		return "light";
	};
	const [theme, setTheme] = useState(getResolved);
	useEffect(() => {
		setTheme(getResolved());
	}, [propTheme]);
	useEffect(() => {
		if (propTheme) return;
		if (api?.subscribeTheme) return api.subscribeTheme((t) => setTheme(t));
		if (typeof window !== "undefined" && typeof MutationObserver !== "undefined") {
			const observer = new MutationObserver(() => {
				const isDark = document.documentElement.classList.contains("dark");
				setTheme(isDark ? "dark" : "light");
			});
			observer.observe(document.documentElement, {
				attributes: true,
				attributeFilter: ["class"]
			});
			return () => observer.disconnect();
		}
	}, [propTheme, api]);
	return theme;
}
function PromptInspectorExtension({ item, isTrashView, api, theme: propTheme }) {
	const isDark = usePluginTheme(propTheme, api) === "dark";
	const [promptValue, setPromptValue] = useState(item.prompt || "");
	const [copied, setCopied] = useState(false);
	const [expanded, setExpanded] = useState(true);
	useEffect(() => {
		setPromptValue(item.prompt || "");
	}, [item.id, item.prompt]);
	const commitPrompt = async () => {
		if (promptValue === (item.prompt || "")) return;
		try {
			await api.updateItemDetails({ prompt: promptValue });
		} catch (err) {
			console.error("[PromptPlugin] Failed to save prompt:", err);
		}
	};
	const handleCopy = async (e) => {
		e.stopPropagation();
		if (!promptValue.trim()) return;
		try {
			await navigator.clipboard.writeText(promptValue);
			setCopied(true);
			setTimeout(() => setCopied(false), 1500);
		} catch {}
	};
	return /* @__PURE__ */ jsxs("div", {
		style: {
			borderBottom: isDark ? "1px solid rgba(255, 255, 255, 0.08)" : "1px solid #e2e8f0",
			padding: "0.25rem 0"
		},
		children: [/* @__PURE__ */ jsxs("div", {
			onClick: () => setExpanded(!expanded),
			style: {
				display: "flex",
				alignItems: "center",
				justifyContent: "space-between",
				padding: "0.6rem 0.2rem",
				cursor: "pointer",
				userSelect: "none"
			},
			children: [/* @__PURE__ */ jsxs("div", {
				style: {
					display: "flex",
					alignItems: "center",
					gap: "0.45rem"
				},
				children: [
					/* @__PURE__ */ jsx("div", {
						style: {
							width: "18px",
							height: "18px",
							borderRadius: "4px",
							background: isDark ? "rgba(99, 102, 241, 0.15)" : "#e0e7ff",
							color: isDark ? "#818cf8" : "#4338ca",
							display: "flex",
							alignItems: "center",
							justifyContent: "center"
						},
						children: /* @__PURE__ */ jsxs("svg", {
							width: "11",
							height: "11",
							viewBox: "0 0 24 24",
							fill: "none",
							stroke: "currentColor",
							strokeWidth: "2.2",
							strokeLinecap: "round",
							strokeLinejoin: "round",
							children: [
								/* @__PURE__ */ jsx("path", { d: "m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" }),
								/* @__PURE__ */ jsx("path", { d: "M5 3v4" }),
								/* @__PURE__ */ jsx("path", { d: "M19 17v4" }),
								/* @__PURE__ */ jsx("path", { d: "M3 5h4" }),
								/* @__PURE__ */ jsx("path", { d: "M17 19h4" })
							]
						})
					}),
					/* @__PURE__ */ jsx("span", {
						style: {
							fontWeight: 600,
							fontSize: "0.78rem",
							color: isDark ? "#f8fafc" : "#000000"
						},
						children: "AI Prompt"
					}),
					promptValue.trim() && /* @__PURE__ */ jsxs("span", {
						style: {
							fontSize: "0.65rem",
							padding: "1px 5px",
							borderRadius: "3px",
							background: isDark ? "rgba(99, 102, 241, 0.2)" : "#e0e7ff",
							color: isDark ? "#a5b4fc" : "#4338ca",
							fontFamily: "ui-monospace, monospace"
						},
						children: [promptValue.trim().length, " chars"]
					})
				]
			}), /* @__PURE__ */ jsxs("div", {
				style: {
					display: "flex",
					alignItems: "center",
					gap: "0.4rem"
				},
				children: [promptValue.trim() && /* @__PURE__ */ jsx("button", {
					type: "button",
					onClick: handleCopy,
					title: "Copy prompt",
					style: {
						background: "transparent",
						border: "none",
						cursor: "pointer",
						padding: "2px 5px",
						borderRadius: "4px",
						fontSize: "0.7rem",
						color: copied ? "#10b981" : isDark ? "#94a3b8" : "#4b5563",
						display: "flex",
						alignItems: "center",
						gap: "2px"
					},
					children: copied ? "Copied" : "Copy"
				}), /* @__PURE__ */ jsx("svg", {
					width: "14",
					height: "14",
					viewBox: "0 0 24 24",
					fill: "none",
					stroke: "currentColor",
					strokeWidth: "2",
					strokeLinecap: "round",
					strokeLinejoin: "round",
					style: {
						transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
						transition: "transform 0.2s ease",
						color: isDark ? "#64748b" : "#94a3b8"
					},
					children: /* @__PURE__ */ jsx("polyline", { points: "6 9 12 15 18 9" })
				})]
			})]
		}), expanded && /* @__PURE__ */ jsx("div", {
			style: { padding: "0.2rem 0.2rem 0.6rem 0.2rem" },
			children: /* @__PURE__ */ jsx("textarea", {
				value: promptValue,
				onChange: (e) => setPromptValue(e.target.value),
				onBlur: commitPrompt,
				disabled: isTrashView,
				placeholder: "Enter AI generation prompt (Midjourney, Stable Diffusion, DALL-E, etc.)...",
				rows: 4,
				style: {
					width: "100%",
					boxSizing: "border-box",
					borderRadius: "6px",
					border: isDark ? "1px solid rgba(255, 255, 255, 0.1)" : "1px solid #cbd5e1",
					background: isDark ? "rgba(0, 0, 0, 0.25)" : "#f8fafc",
					color: isDark ? "#f1f5f9" : "#000000",
					padding: "0.5rem 0.6rem",
					fontSize: "0.72rem",
					lineHeight: 1.45,
					resize: "vertical",
					outline: "none",
					fontFamily: "inherit"
				}
			})
		})]
	});
}
var promptMetadataPlugin = definePlugin({
	id: "official.prompt-metadata",
	name: "AI Prompt Metadata",
	version: "1.0.0",
	description: "Extends asset metadata with a dedicated Prompt field for recording and searching AI generation prompts.",
	author: "Bowerbird Team",
	kind: "metadata",
	priority: 50,
	InspectorExtension: PromptInspectorExtension
});
//#endregion
export { promptMetadataPlugin as default, promptMetadataPlugin as plugin };
