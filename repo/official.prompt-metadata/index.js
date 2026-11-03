import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
//#region packages/plugin-sdk/src/helper.ts
/**
* Type-safe helper to define a Bowerbird preview or metadata plugin.
*/
function definePlugin(plugin) {
	return plugin;
}
//#endregion
//#region plugins/prompt-metadata/src/index.tsx
/** Maximum height (px) of the prompt read-out inside the inspector. */
var PREVIEW_MAX_HEIGHT = 120;
/** Maximum height (px) of the inline editor inside the inspector. */
var EDITOR_MAX_HEIGHT = 168;
/** Maximum height of the textarea rendered by the expanded dialog. */
var DIALOG_EDITOR_MAX_HEIGHT = "52vh";
/** The dialog is portaled to <body> and must sit above every host surface. */
var DIALOG_Z_INDEX = 2147483e3;
/** How long the "Copied" confirmation stays visible. */
var COPIED_RESET_MS = 1600;
var LABELS = {
	en: {
		title: "AI Prompt",
		copy: "Copy",
		copied: "Copied",
		edit: "Edit",
		done: "Done",
		cancel: "Cancel",
		expand: "Expand",
		collapse: "Collapse",
		add: "Add AI prompt",
		empty: "No prompt",
		placeholder: "Paste or type the AI generation prompt (Midjourney, Stable Diffusion, DALL-E, ...)",
		saveHint: "⌘/Ctrl + Enter to save · Esc to cancel",
		readonly: "Read-only",
		dialogTitle: "AI Prompt",
		close: "Close"
	},
	zh: {
		title: "AI 提示词",
		copy: "复制",
		copied: "已复制",
		edit: "编辑",
		done: "完成",
		cancel: "取消",
		expand: "展开",
		collapse: "收起",
		add: "添加提示词",
		empty: "暂无提示词",
		placeholder: "粘贴或输入 AI 生图提示词（Midjourney、Stable Diffusion、DALL-E…）",
		saveHint: "⌘/Ctrl + Enter 保存 · Esc 取消",
		readonly: "只读",
		dialogTitle: "AI 提示词",
		close: "关闭"
	}
};
function detectLocale() {
	if (typeof navigator === "undefined") return "en";
	return ((navigator.languages && navigator.languages.length > 0 ? navigator.languages : [navigator.language])[0] || "").toLowerCase().startsWith("zh") ? "zh" : "en";
}
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
function createPalette(isDark) {
	const fallbackBorder = isDark ? "rgba(255, 255, 255, 0.10)" : "#e2e8f0";
	const fallbackText = isDark ? "#e8eaf0" : "#0f172a";
	const fallbackMuted = isDark ? "#9aa3b2" : "#64748b";
	const fallbackFaint = isDark ? "#6b7280" : "#94a3b8";
	const fallbackSurface = isDark ? "rgba(255, 255, 255, 0.04)" : "#f8fafc";
	const fallbackInputBg = isDark ? "rgba(0, 0, 0, 0.28)" : "#ffffff";
	const fallbackPanel = isDark ? "#14161a" : "#ffffff";
	return {
		divider: `var(--border, ${fallbackBorder})`,
		text: `var(--foreground, ${fallbackText})`,
		textMuted: `var(--muted-foreground, ${fallbackMuted})`,
		textFaint: `var(--muted-foreground, ${fallbackFaint})`,
		accentSoft: isDark ? "rgba(129, 140, 248, 0.16)" : "rgba(79, 70, 229, 0.10)",
		accentText: isDark ? "#c7d2fe" : "#4338ca",
		surface: `var(--muted, ${fallbackSurface})`,
		surfaceHover: isDark ? "rgba(255, 255, 255, 0.08)" : "rgba(15, 23, 42, 0.06)",
		inputBackground: `var(--background, ${fallbackInputBg})`,
		inputBorder: `var(--border, ${fallbackBorder})`,
		panel: `var(--popover, ${fallbackPanel})`,
		panelBorder: `var(--border, ${fallbackBorder})`,
		shadow: isDark ? "0 24px 60px -12px rgba(0, 0, 0, 0.75)" : "0 24px 60px -16px rgba(15, 23, 42, 0.30)",
		success: "#10b981",
		backdrop: isDark ? "rgba(0, 0, 0, 0.62)" : "rgba(15, 23, 42, 0.42)"
	};
}
async function copyText(value) {
	if (!value) return false;
	try {
		if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
			await navigator.clipboard.writeText(value);
			return true;
		}
	} catch {}
	try {
		if (typeof document === "undefined") return false;
		const helper = document.createElement("textarea");
		helper.value = value;
		helper.setAttribute("readonly", "");
		helper.style.position = "fixed";
		helper.style.top = "-1000px";
		helper.style.opacity = "0";
		document.body.appendChild(helper);
		helper.select();
		const ok = document.execCommand("copy");
		document.body.removeChild(helper);
		return ok;
	} catch {
		return false;
	}
}
/**
* Renders into <body> so the dialog escapes the inspector's scroll container.
* The host exposes ReactDOM on `window` for remote plugins; when that bridge is
* unavailable we fall back to inline rendering (position: fixed still works).
*/
function renderPortal(node) {
	if (typeof window === "undefined" || typeof document === "undefined") return node;
	const bridge = window.ReactDOM;
	if (bridge?.createPortal && document.body) try {
		return bridge.createPortal(node, document.body);
	} catch {}
	return node;
}
function CopyIcon({ size = 12, color = "currentColor" }) {
	return /* @__PURE__ */ jsxs("svg", {
		width: size,
		height: size,
		viewBox: "0 0 24 24",
		fill: "none",
		stroke: color,
		strokeWidth: "2",
		strokeLinecap: "round",
		strokeLinejoin: "round",
		"aria-hidden": "true",
		children: [/* @__PURE__ */ jsx("rect", {
			x: "9",
			y: "9",
			width: "13",
			height: "13",
			rx: "2",
			ry: "2"
		}), /* @__PURE__ */ jsx("path", { d: "M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" })]
	});
}
function CheckIcon({ size = 12, color = "currentColor" }) {
	return /* @__PURE__ */ jsx("svg", {
		width: size,
		height: size,
		viewBox: "0 0 24 24",
		fill: "none",
		stroke: color,
		strokeWidth: "2.4",
		strokeLinecap: "round",
		strokeLinejoin: "round",
		"aria-hidden": "true",
		children: /* @__PURE__ */ jsx("polyline", { points: "20 6 9 17 4 12" })
	});
}
function ChevronIcon({ size = 14, color = "currentColor", collapsed = false }) {
	return /* @__PURE__ */ jsx("svg", {
		width: size,
		height: size,
		viewBox: "0 0 24 24",
		fill: "none",
		stroke: color,
		strokeWidth: "2",
		strokeLinecap: "round",
		strokeLinejoin: "round",
		"aria-hidden": "true",
		style: {
			transform: collapsed ? "rotate(0deg)" : "rotate(180deg)",
			transition: "transform 0.18s ease"
		},
		children: /* @__PURE__ */ jsx("polyline", { points: "6 9 12 15 18 9" })
	});
}
function ExpandIcon({ size = 12, color = "currentColor" }) {
	return /* @__PURE__ */ jsxs("svg", {
		width: size,
		height: size,
		viewBox: "0 0 24 24",
		fill: "none",
		stroke: color,
		strokeWidth: "2",
		strokeLinecap: "round",
		strokeLinejoin: "round",
		"aria-hidden": "true",
		children: [
			/* @__PURE__ */ jsx("polyline", { points: "15 3 21 3 21 9" }),
			/* @__PURE__ */ jsx("polyline", { points: "9 21 3 21 3 15" }),
			/* @__PURE__ */ jsx("line", {
				x1: "21",
				y1: "3",
				x2: "14",
				y2: "10"
			}),
			/* @__PURE__ */ jsx("line", {
				x1: "3",
				y1: "21",
				x2: "10",
				y2: "14"
			})
		]
	});
}
function EditIcon({ size = 12, color = "currentColor" }) {
	return /* @__PURE__ */ jsxs("svg", {
		width: size,
		height: size,
		viewBox: "0 0 24 24",
		fill: "none",
		stroke: color,
		strokeWidth: "2",
		strokeLinecap: "round",
		strokeLinejoin: "round",
		"aria-hidden": "true",
		children: [/* @__PURE__ */ jsx("path", { d: "M12 20h9" }), /* @__PURE__ */ jsx("path", { d: "M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" })]
	});
}
function CloseIcon({ size = 14, color = "currentColor" }) {
	return /* @__PURE__ */ jsxs("svg", {
		width: size,
		height: size,
		viewBox: "0 0 24 24",
		fill: "none",
		stroke: color,
		strokeWidth: "2",
		strokeLinecap: "round",
		strokeLinejoin: "round",
		"aria-hidden": "true",
		children: [/* @__PURE__ */ jsx("line", {
			x1: "18",
			y1: "6",
			x2: "6",
			y2: "18"
		}), /* @__PURE__ */ jsx("line", {
			x1: "6",
			y1: "6",
			x2: "18",
			y2: "18"
		})]
	});
}
function ActionButton({ palette, children, onClick, onMouseDown, disabled = false, title, ariaLabel, color, variant = "ghost" }) {
	const [hovered, setHovered] = useState(false);
	const base = {
		display: "inline-flex",
		alignItems: "center",
		justifyContent: "center",
		gap: "4px",
		borderRadius: "5px",
		fontSize: "0.68rem",
		lineHeight: 1.15,
		fontFamily: "inherit",
		whiteSpace: "nowrap",
		transition: "background 0.15s ease, color 0.15s ease, border-color 0.15s ease",
		cursor: disabled ? "default" : "pointer",
		opacity: disabled ? .5 : 1,
		padding: variant === "primary" ? "4px 10px" : "3px 6px",
		border: variant === "ghost" ? "1px solid transparent" : `1px solid ${palette.inputBorder}`,
		fontWeight: variant === "primary" ? 600 : 400
	};
	const variantStyle = variant === "primary" ? {
		background: palette.accentSoft,
		color: palette.accentText
	} : {
		background: hovered && !disabled ? palette.surfaceHover : "transparent",
		color: color || (hovered && !disabled ? palette.text : palette.textMuted)
	};
	return /* @__PURE__ */ jsx("button", {
		type: "button",
		onClick,
		onMouseDown,
		disabled,
		title,
		"aria-label": ariaLabel || title,
		onMouseEnter: () => setHovered(true),
		onMouseLeave: () => setHovered(false),
		style: {
			...base,
			...variantStyle
		},
		children
	});
}
function PromptDialog({ open, labels, palette, value, readOnly, copied, onChange, onCopy, onClose }) {
	const textareaRef = useRef(null);
	const closeRef = useRef(onClose);
	useEffect(() => {
		closeRef.current = onClose;
	}, [onClose]);
	useEffect(() => {
		if (!open) return;
		const handleKeyDown = (event) => {
			if (event.key === "Escape") {
				event.preventDefault();
				event.stopPropagation();
				closeRef.current();
			}
		};
		document.addEventListener("keydown", handleKeyDown, true);
		const previousOverflow = document.body.style.overflow;
		document.body.style.overflow = "hidden";
		const focusTimer = window.setTimeout(() => {
			const element = textareaRef.current;
			if (!element) return;
			element.focus();
			if (readOnly) return;
			element.setSelectionRange(element.value.length, element.value.length);
		}, 30);
		return () => {
			document.removeEventListener("keydown", handleKeyDown, true);
			document.body.style.overflow = previousOverflow;
			window.clearTimeout(focusTimer);
		};
	}, [open, readOnly]);
	if (!open) return null;
	const backdropStyle = {
		position: "fixed",
		inset: 0,
		zIndex: DIALOG_Z_INDEX,
		display: "flex",
		alignItems: "center",
		justifyContent: "center",
		padding: "24px",
		background: palette.backdrop,
		backdropFilter: "blur(3px)",
		WebkitBackdropFilter: "blur(3px)"
	};
	const panelStyle = {
		display: "flex",
		flexDirection: "column",
		width: "min(760px, 94vw)",
		maxHeight: "82vh",
		borderRadius: "12px",
		border: `1px solid ${palette.panelBorder}`,
		background: palette.panel,
		boxShadow: palette.shadow,
		overflow: "hidden"
	};
	return /* @__PURE__ */ jsx(Fragment, { children: renderPortal(/* @__PURE__ */ jsx("div", {
		style: backdropStyle,
		onMouseDown: (event) => {
			if (event.target === event.currentTarget) onClose();
		},
		children: /* @__PURE__ */ jsxs("div", {
			role: "dialog",
			"aria-modal": "true",
			"aria-label": labels.dialogTitle,
			style: panelStyle,
			onMouseDown: (event) => event.stopPropagation(),
			children: [
				/* @__PURE__ */ jsxs("div", {
					style: {
						display: "flex",
						alignItems: "center",
						justifyContent: "space-between",
						gap: "0.75rem",
						padding: "0.7rem 0.9rem",
						borderBottom: `1px solid ${palette.divider}`
					},
					children: [/* @__PURE__ */ jsxs("div", {
						style: {
							display: "flex",
							alignItems: "center",
							gap: "0.5rem",
							minWidth: 0
						},
						children: [/* @__PURE__ */ jsx("span", {
							style: {
								fontSize: "0.82rem",
								fontWeight: 650,
								color: palette.text
							},
							children: labels.dialogTitle
						}), readOnly && /* @__PURE__ */ jsx("span", {
							style: {
								fontSize: "0.65rem",
								color: palette.textFaint
							},
							children: labels.readonly
						})]
					}), /* @__PURE__ */ jsxs("div", {
						style: {
							display: "flex",
							alignItems: "center",
							gap: "0.3rem"
						},
						children: [/* @__PURE__ */ jsx(ActionButton, {
							palette,
							variant: "outline",
							onClick: onCopy,
							disabled: !value.trim(),
							title: copied ? labels.copied : labels.copy,
							color: copied ? palette.success : void 0,
							children: copied ? /* @__PURE__ */ jsx(CheckIcon, { color: palette.success }) : /* @__PURE__ */ jsx(CopyIcon, {})
						}), /* @__PURE__ */ jsx(ActionButton, {
							palette,
							onClick: onClose,
							title: labels.close,
							ariaLabel: labels.close,
							children: /* @__PURE__ */ jsx(CloseIcon, {})
						})]
					})]
				}),
				/* @__PURE__ */ jsx("div", {
					style: {
						padding: "0.7rem 0.9rem",
						overflow: "hidden",
						display: "flex",
						flex: 1,
						minHeight: 0
					},
					children: /* @__PURE__ */ jsx("textarea", {
						ref: textareaRef,
						value,
						readOnly,
						onChange: (event) => onChange(event.target.value),
						onKeyDown: (event) => {
							if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
								event.preventDefault();
								onClose();
							}
						},
						placeholder: labels.placeholder,
						spellCheck: false,
						style: {
							flex: 1,
							width: "100%",
							boxSizing: "border-box",
							minHeight: "220px",
							maxHeight: DIALOG_EDITOR_MAX_HEIGHT,
							borderRadius: "8px",
							border: `1px solid ${palette.inputBorder}`,
							background: palette.surface,
							color: palette.text,
							padding: "0.65rem 0.75rem",
							fontSize: "0.76rem",
							lineHeight: 1.55,
							resize: "none",
							outline: "none",
							overflowY: "auto",
							fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace"
						}
					})
				}),
				/* @__PURE__ */ jsxs("div", {
					style: {
						display: "flex",
						alignItems: "center",
						justifyContent: "space-between",
						gap: "0.75rem",
						padding: "0.55rem 0.9rem",
						borderTop: `1px solid ${palette.divider}`,
						background: palette.surface
					},
					children: [/* @__PURE__ */ jsx("span", {
						style: {
							fontSize: "0.65rem",
							color: palette.textFaint
						},
						children: readOnly ? labels.readonly : labels.saveHint
					}), /* @__PURE__ */ jsx(ActionButton, {
						palette,
						variant: "primary",
						onClick: onClose,
						children: labels.done
					})]
				})
			]
		})
	})) });
}
function PromptInspectorExtension({ item, isTrashView, api, theme: propTheme }) {
	const theme = usePluginTheme(propTheme, api);
	const palette = useMemo(() => createPalette(theme === "dark"), [theme]);
	const labels = useMemo(() => LABELS[detectLocale()], []);
	const readOnly = Boolean(isTrashView);
	const [promptValue, setPromptValue] = useState(item.prompt || "");
	const [expanded, setExpanded] = useState(true);
	const [editing, setEditing] = useState(false);
	const [dialogOpen, setDialogOpen] = useState(false);
	const [copied, setCopied] = useState(false);
	const [overflowing, setOverflowing] = useState(false);
	const [headerHovered, setHeaderHovered] = useState(false);
	const previewRef = useRef(null);
	const editorRef = useRef(null);
	const copiedTimerRef = useRef(null);
	useEffect(() => {
		setPromptValue(item.prompt || "");
	}, [item.id, item.prompt]);
	useEffect(() => {
		setEditing(false);
		setDialogOpen(false);
	}, [item.id]);
	useEffect(() => {
		return () => {
			if (copiedTimerRef.current !== null) window.clearTimeout(copiedTimerRef.current);
		};
	}, []);
	const commitPrompt = useCallback(async (next) => {
		const value = next ?? promptValue;
		if (readOnly) return;
		if (value === (item.prompt || "")) return;
		try {
			await api.updateItemDetails({ prompt: value });
		} catch (err) {
			console.error("[PromptPlugin] Failed to save prompt:", err);
		}
	}, [
		api,
		item.prompt,
		promptValue,
		readOnly
	]);
	const pendingRef = useRef({
		itemId: item.id,
		value: promptValue,
		saved: item.prompt || ""
	});
	pendingRef.current = {
		itemId: item.id,
		value: promptValue,
		saved: item.prompt || ""
	};
	const updateDetailsRef = useRef(api.updateItemDetails);
	updateDetailsRef.current = api.updateItemDetails;
	useEffect(() => {
		const mountedItemId = item.id;
		return () => {
			const pending = pendingRef.current;
			if (pending.itemId !== mountedItemId) return;
			if (pending.value === pending.saved) return;
			updateDetailsRef.current({ prompt: pending.value });
		};
	}, [item.id]);
	const handleCopy = useCallback(async () => {
		if (!promptValue.trim()) return;
		if (!await copyText(promptValue)) {
			console.warn("[PromptPlugin] Failed to copy prompt to clipboard");
			return;
		}
		setCopied(true);
		if (copiedTimerRef.current !== null) window.clearTimeout(copiedTimerRef.current);
		copiedTimerRef.current = window.setTimeout(() => {
			setCopied(false);
			copiedTimerRef.current = null;
		}, COPIED_RESET_MS);
	}, [promptValue]);
	useEffect(() => {
		if (!expanded || editing) {
			setOverflowing(false);
			return;
		}
		const element = previewRef.current;
		if (!element) return;
		const measure = () => setOverflowing(element.scrollHeight - element.clientHeight > 2);
		measure();
		if (typeof ResizeObserver !== "undefined") {
			const observer = new ResizeObserver(measure);
			observer.observe(element);
			return () => observer.disconnect();
		}
	}, [
		expanded,
		editing,
		promptValue
	]);
	const startEditing = useCallback(() => {
		if (readOnly) return;
		setEditing(true);
		window.setTimeout(() => {
			const element = editorRef.current;
			if (!element) return;
			element.focus();
			element.setSelectionRange(element.value.length, element.value.length);
		}, 20);
	}, [readOnly]);
	const stopEditing = useCallback(() => {
		setEditing(false);
		commitPrompt();
	}, [commitPrompt]);
	const cancelEditing = useCallback(() => {
		setPromptValue(item.prompt || "");
		setEditing(false);
	}, [item.prompt]);
	const openDialog = useCallback(() => setDialogOpen(true), []);
	const closeDialog = useCallback(() => {
		setDialogOpen(false);
		commitPrompt();
	}, [commitPrompt]);
	const hasPrompt = promptValue.trim().length > 0;
	const footerStyle = {
		display: "flex",
		alignItems: "center",
		justifyContent: "flex-end",
		gap: "0.3rem",
		minHeight: "22px"
	};
	const editorStyle = {
		width: "100%",
		boxSizing: "border-box",
		minHeight: "72px",
		maxHeight: `${EDITOR_MAX_HEIGHT}px`,
		borderRadius: "6px",
		border: `1px solid ${palette.inputBorder}`,
		background: palette.inputBackground,
		color: palette.text,
		padding: "0.45rem 0.55rem",
		fontSize: "0.72rem",
		lineHeight: 1.5,
		resize: "none",
		outline: "none",
		overflowY: "auto",
		fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace"
	};
	return /* @__PURE__ */ jsxs("div", {
		style: { padding: "0.25rem 0" },
		children: [
			/* @__PURE__ */ jsxs("div", {
				style: {
					display: "flex",
					alignItems: "center",
					justifyContent: "space-between",
					gap: "0.5rem",
					padding: "0.375rem 0",
					cursor: "pointer",
					userSelect: "none"
				},
				onClick: () => setExpanded((prev) => !prev),
				onMouseEnter: () => setHeaderHovered(true),
				onMouseLeave: () => setHeaderHovered(false),
				role: "button",
				tabIndex: 0,
				"aria-expanded": expanded,
				onKeyDown: (event) => {
					if (event.key === "Enter" || event.key === " ") {
						event.preventDefault();
						setExpanded((prev) => !prev);
					}
				},
				children: [/* @__PURE__ */ jsx("div", {
					style: {
						display: "flex",
						alignItems: "center",
						gap: "0.4rem",
						minWidth: 0
					},
					children: /* @__PURE__ */ jsx("span", {
						style: {
							fontSize: "0.625rem",
							fontWeight: 600,
							letterSpacing: "0.05em",
							textTransform: "uppercase",
							color: headerHovered ? palette.text : palette.textMuted,
							whiteSpace: "nowrap",
							transition: "color 0.15s ease"
						},
						children: labels.title
					})
				}), /* @__PURE__ */ jsxs("div", {
					style: {
						display: "flex",
						alignItems: "center",
						gap: "0.15rem"
					},
					children: [
						/* @__PURE__ */ jsx(ActionButton, {
							palette,
							onClick: (event) => {
								event.stopPropagation();
								handleCopy();
							},
							disabled: !hasPrompt,
							title: copied ? labels.copied : labels.copy,
							color: copied ? palette.success : void 0,
							children: copied ? /* @__PURE__ */ jsx(CheckIcon, { color: palette.success }) : /* @__PURE__ */ jsx(CopyIcon, {})
						}),
						hasPrompt && expanded && /* @__PURE__ */ jsx(ActionButton, {
							palette,
							onClick: (event) => {
								event.stopPropagation();
								openDialog();
							},
							title: labels.expand,
							children: /* @__PURE__ */ jsx(ExpandIcon, {})
						}),
						/* @__PURE__ */ jsx(ActionButton, {
							palette,
							onClick: (event) => {
								event.stopPropagation();
								setExpanded((prev) => !prev);
							},
							title: expanded ? labels.collapse : labels.expand,
							children: /* @__PURE__ */ jsx(ChevronIcon, {
								collapsed: !expanded,
								color: palette.textFaint
							})
						})
					]
				})]
			}),
			expanded && /* @__PURE__ */ jsx("div", {
				style: {
					padding: "0 0 0.625rem 0",
					display: "flex",
					flexDirection: "column",
					gap: "0.45rem"
				},
				children: editing ? /* @__PURE__ */ jsxs(Fragment, { children: [/* @__PURE__ */ jsx("textarea", {
					ref: editorRef,
					value: promptValue,
					onChange: (event) => setPromptValue(event.target.value),
					onBlur: stopEditing,
					onKeyDown: (event) => {
						if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
							event.preventDefault();
							stopEditing();
						} else if (event.key === "Escape") {
							event.preventDefault();
							cancelEditing();
						}
					},
					placeholder: labels.placeholder,
					spellCheck: false,
					style: editorStyle
				}), /* @__PURE__ */ jsxs("div", {
					style: footerStyle,
					children: [/* @__PURE__ */ jsx(ActionButton, {
						palette,
						onClick: (event) => {
							event.preventDefault();
							cancelEditing();
						},
						onMouseDown: (event) => {
							event.preventDefault();
							cancelEditing();
						},
						children: labels.cancel
					}), /* @__PURE__ */ jsx(ActionButton, {
						palette,
						variant: "primary",
						onClick: (event) => {
							event.preventDefault();
							stopEditing();
						},
						onMouseDown: (event) => {
							event.preventDefault();
							stopEditing();
						},
						children: labels.done
					})]
				})] }) : hasPrompt ? /* @__PURE__ */ jsxs(Fragment, { children: [/* @__PURE__ */ jsx("div", {
					ref: previewRef,
					onDoubleClick: openDialog,
					style: {
						maxHeight: `${PREVIEW_MAX_HEIGHT}px`,
						overflowY: "auto",
						overscrollBehavior: "contain",
						borderRadius: "6px",
						border: `1px solid ${palette.inputBorder}`,
						background: palette.surface,
						padding: "0.45rem 0.55rem",
						fontSize: "0.72rem",
						lineHeight: 1.5,
						color: palette.text,
						whiteSpace: "pre-wrap",
						wordBreak: "break-word",
						fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace"
					},
					children: promptValue
				}), (overflowing || !readOnly) && /* @__PURE__ */ jsxs("div", {
					style: footerStyle,
					children: [overflowing && /* @__PURE__ */ jsxs(ActionButton, {
						palette,
						onClick: openDialog,
						children: [/* @__PURE__ */ jsx(ExpandIcon, {}), /* @__PURE__ */ jsx("span", { children: labels.expand })]
					}), !readOnly && /* @__PURE__ */ jsxs(ActionButton, {
						palette,
						onClick: startEditing,
						children: [/* @__PURE__ */ jsx(EditIcon, {}), /* @__PURE__ */ jsx("span", { children: labels.edit })]
					})]
				})] }) : /* @__PURE__ */ jsx("button", {
					type: "button",
					onClick: readOnly ? void 0 : startEditing,
					disabled: readOnly,
					style: {
						width: "100%",
						boxSizing: "border-box",
						padding: "0.6rem 0.55rem",
						borderRadius: "6px",
						border: `1px dashed ${palette.inputBorder}`,
						background: "transparent",
						color: palette.textFaint,
						fontSize: "0.72rem",
						textAlign: "left",
						cursor: readOnly ? "default" : "pointer",
						fontFamily: "inherit"
					},
					children: readOnly ? labels.empty : labels.add
				})
			}),
			/* @__PURE__ */ jsx(PromptDialog, {
				open: dialogOpen,
				labels,
				palette,
				value: promptValue,
				readOnly,
				copied,
				onChange: setPromptValue,
				onCopy: () => void handleCopy(),
				onClose: closeDialog
			})
		]
	});
}
var PLUGIN_VERSION = "1.0.1";
var promptMetadataPlugin = definePlugin({
	id: "official.prompt-metadata",
	name: "AI Prompt Metadata",
	version: PLUGIN_VERSION,
	description: "Extends asset metadata with a dedicated Prompt field for recording and searching AI generation prompts.",
	author: "Bowerbird Team",
	kind: "metadata",
	priority: 50,
	InspectorExtension: PromptInspectorExtension
});
//#endregion
export { PLUGIN_VERSION, promptMetadataPlugin as default, promptMetadataPlugin as plugin };
