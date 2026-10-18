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
//#region plugins/markdown-preview/src/index.tsx
function parseFrontmatterAndBody(raw) {
	const trimmed = raw.trimStart();
	if (!trimmed.startsWith("---")) return {
		frontmatter: null,
		body: raw
	};
	const endIdx = trimmed.indexOf("\n---", 3);
	if (endIdx === -1) return {
		frontmatter: null,
		body: raw
	};
	const yamlBlock = trimmed.slice(3, endIdx).trim();
	const body = trimmed.slice(endIdx + 4).trimStart();
	const frontmatter = {};
	for (const line of yamlBlock.split("\n")) {
		const colon = line.indexOf(":");
		if (colon > 0) {
			const key = line.slice(0, colon).trim();
			let val = line.slice(colon + 1).trim();
			if (val.startsWith("\"") && val.endsWith("\"") || val.startsWith("'") && val.endsWith("'")) val = val.slice(1, -1);
			if (val.startsWith("[") && val.endsWith("]")) frontmatter[key] = val.slice(1, -1).split(",").map((s) => s.trim().replace(/^['"]|['"]$/g, "")).filter(Boolean);
			else frontmatter[key] = val;
		}
	}
	return {
		frontmatter,
		body
	};
}
function extractOutline(text) {
	const lines = text.split("\n");
	const outline = [];
	let inCode = false;
	for (const line of lines) {
		if (line.trim().startsWith("```")) {
			inCode = !inCode;
			continue;
		}
		if (inCode) continue;
		const match = line.match(/^(#{1,6})\s+(.*)$/);
		if (match) {
			const level = match[1].length;
			const text = match[2].trim().replace(/[#*`_~]/g, "");
			const id = text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
			outline.push({
				level,
				text,
				id
			});
		}
	}
	return outline;
}
function renderInlineMarkdown(text, onLinkClick, isDark = true) {
	const nodes = [];
	let remaining = text;
	let keyIdx = 0;
	while (remaining.length > 0) {
		const codeMatch = remaining.match(/^`([^`]+)`/);
		if (codeMatch) {
			nodes.push(/* @__PURE__ */ jsx("code", {
				style: {
					fontFamily: "monospace",
					fontSize: "0.875em",
					padding: "0.15em 0.35em",
					borderRadius: "4px",
					background: isDark ? "rgba(120, 120, 140, 0.15)" : "#f1f5f9",
					border: isDark ? "none" : "1px solid #e2e8f0",
					color: isDark ? "#e06c75" : "#b91c1c"
				},
				children: codeMatch[1]
			}, `code-${keyIdx++}`));
			remaining = remaining.slice(codeMatch[0].length);
			continue;
		}
		const boldMatch = remaining.match(/^\*\*([^*]+)\*\*/);
		if (boldMatch) {
			nodes.push(/* @__PURE__ */ jsx("strong", {
				style: { color: isDark ? "#f8fafc" : "#000000" },
				children: boldMatch[1]
			}, `bold-${keyIdx++}`));
			remaining = remaining.slice(boldMatch[0].length);
			continue;
		}
		const italicMatch = remaining.match(/^\*([^*]+)\*/);
		if (italicMatch) {
			nodes.push(/* @__PURE__ */ jsx("em", { children: italicMatch[1] }, `italic-${keyIdx++}`));
			remaining = remaining.slice(italicMatch[0].length);
			continue;
		}
		const strikeMatch = remaining.match(/^~~([^~]+)~~/);
		if (strikeMatch) {
			nodes.push(/* @__PURE__ */ jsx("del", { children: strikeMatch[1] }, `del-${keyIdx++}`));
			remaining = remaining.slice(strikeMatch[0].length);
			continue;
		}
		const linkMatch = remaining.match(/^\[([^\]]+)\]\(([^)]+)\)/);
		if (linkMatch) {
			const url = linkMatch[2];
			nodes.push(/* @__PURE__ */ jsx("a", {
				href: url,
				onClick: (e) => {
					e.preventDefault();
					onLinkClick?.(url);
				},
				style: {
					color: isDark ? "#60a5fa" : "#2563eb",
					textDecoration: "underline",
					textUnderlineOffset: "3px",
					cursor: "pointer"
				},
				children: linkMatch[1]
			}, `a-${keyIdx++}`));
			remaining = remaining.slice(linkMatch[0].length);
			continue;
		}
		const nextSpecial = remaining.search(/[`*_~\[]/);
		if (nextSpecial === -1) {
			nodes.push(remaining);
			break;
		} else if (nextSpecial === 0) {
			nodes.push(remaining[0]);
			remaining = remaining.slice(1);
		} else {
			nodes.push(remaining.slice(0, nextSpecial));
			remaining = remaining.slice(nextSpecial);
		}
	}
	return nodes;
}
function MarkdownRenderer({ body, onLinkClick, isDark = true, compact = false }) {
	const [copiedIndex, setCopiedIndex] = useState(null);
	const lines = useMemo(() => body.split("\n"), [body]);
	const elements = [];
	let i = 0;
	let blockKey = 0;
	while (i < lines.length) {
		const line = lines[i];
		const trimmed = line.trim();
		if (!trimmed) {
			i++;
			continue;
		}
		if (trimmed.startsWith("```")) {
			const lang = trimmed.slice(3).trim() || "plaintext";
			const codeLines = [];
			i++;
			while (i < lines.length && !lines[i].trim().startsWith("```")) {
				codeLines.push(lines[i]);
				i++;
			}
			if (i < lines.length) i++;
			const fullCode = codeLines.join("\n");
			const currentIdx = blockKey++;
			elements.push(/* @__PURE__ */ jsxs("div", {
				style: {
					margin: compact ? "0.4rem 0" : "1rem 0",
					borderRadius: "6px",
					overflow: "hidden",
					border: isDark ? "1px solid rgba(255, 255, 255, 0.1)" : "1px solid #e2e8f0",
					background: isDark ? "rgba(18, 18, 22, 0.8)" : "#f8fafc"
				},
				children: [!compact && /* @__PURE__ */ jsxs("div", {
					style: {
						display: "flex",
						alignItems: "center",
						justifyContent: "space-between",
						padding: "0.4rem 0.8rem",
						background: isDark ? "rgba(255, 255, 255, 0.04)" : "#f1f5f9",
						borderBottom: isDark ? "1px solid rgba(255, 255, 255, 0.08)" : "1px solid #e2e8f0",
						fontSize: "0.75rem",
						color: isDark ? "#94a3b8" : "#4b5563",
						fontFamily: "monospace"
					},
					children: [/* @__PURE__ */ jsx("span", { children: lang }), /* @__PURE__ */ jsx("button", {
						onClick: () => {
							navigator.clipboard.writeText(fullCode);
							setCopiedIndex(currentIdx);
							setTimeout(() => setCopiedIndex(null), 1500);
						},
						style: {
							background: "transparent",
							border: "none",
							color: copiedIndex === currentIdx ? "#10b981" : "#94a3b8",
							cursor: "pointer",
							fontSize: "0.75rem",
							padding: "2px 6px",
							borderRadius: "4px"
						},
						children: copiedIndex === currentIdx ? "Copied!" : "Copy"
					})]
				}), /* @__PURE__ */ jsx("pre", {
					style: {
						padding: compact ? "0.4rem 0.6rem" : "0.8rem 1rem",
						margin: 0,
						overflowX: "auto",
						fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
						fontSize: compact ? "0.75rem" : "0.85rem",
						lineHeight: 1.45,
						color: isDark ? "#e2e8f0" : "#000000"
					},
					children: /* @__PURE__ */ jsx("code", { children: fullCode })
				})]
			}, `code-block-${currentIdx}`));
			continue;
		}
		const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
		if (headingMatch) {
			const level = headingMatch[1].length;
			const text = headingMatch[2].trim();
			const id = text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
			const Tag = `h${level}`;
			const fontSizes = compact ? [
				"1.05rem",
				"0.95rem",
				"0.85rem",
				"0.8rem",
				"0.75rem",
				"0.75rem"
			] : [
				"1.875rem",
				"1.5rem",
				"1.25rem",
				"1.1rem",
				"1rem",
				"0.9rem"
			];
			elements.push(/* @__PURE__ */ jsx(Tag, {
				id,
				style: {
					fontSize: fontSizes[level - 1],
					fontWeight: 700,
					marginTop: compact ? blockKey === 1 ? "0" : "0.55rem" : level === 1 ? "1.5rem" : "1.25rem",
					marginBottom: compact ? "0.25rem" : "0.5rem",
					paddingBottom: !compact && level <= 2 ? "0.3rem" : void 0,
					borderBottom: !compact && level <= 2 ? isDark ? "1px solid rgba(255, 255, 255, 0.1)" : "1px solid #e2e8f0" : void 0,
					color: isDark ? "#f8fafc" : "#000000",
					scrollMarginTop: "2rem",
					lineHeight: 1.35
				},
				children: renderInlineMarkdown(text, onLinkClick, isDark)
			}, `heading-${blockKey++}`));
			i++;
			continue;
		}
		if (/^(\*{3,}|-{3,}|_{3,})$/.test(trimmed)) {
			elements.push(/* @__PURE__ */ jsx("hr", { style: {
				border: "none",
				borderTop: isDark ? "1px solid rgba(255, 255, 255, 0.12)" : "1px solid #e2e8f0"
			} }, `hr-${blockKey++}`));
			i++;
			continue;
		}
		if (trimmed.startsWith(">")) {
			const quoteLines = [];
			while (i < lines.length && lines[i].trim().startsWith(">")) {
				quoteLines.push(lines[i].trim().slice(1).trim());
				i++;
			}
			elements.push(/* @__PURE__ */ jsx("blockquote", {
				style: {
					margin: "0.75rem 0",
					padding: "0.5rem 1rem",
					borderLeft: `4px solid ${isDark ? "#6366f1" : "#4f46e5"}`,
					background: isDark ? "rgba(99, 102, 241, 0.08)" : "#f8fafc",
					borderRadius: "0 6px 6px 0",
					color: isDark ? "#cbd5e1" : "#000000",
					fontStyle: "italic"
				},
				children: quoteLines.map((ql, qIdx) => /* @__PURE__ */ jsx("p", {
					style: {
						margin: "0.25rem 0",
						color: isDark ? "#cbd5e1" : "#000000"
					},
					children: renderInlineMarkdown(ql, onLinkClick, isDark)
				}, qIdx))
			}, `quote-${blockKey++}`));
			continue;
		}
		if (trimmed.includes("|") && trimmed.startsWith("|")) {
			const tableLines = [];
			while (i < lines.length && lines[i].trim().includes("|") && lines[i].trim().startsWith("|")) {
				tableLines.push(lines[i].trim());
				i++;
			}
			if (tableLines.length >= 2) {
				const headerRow = tableLines[0].slice(1, -1).split("|").map((c) => c.trim());
				const bodyRows = tableLines.slice(2).map((r) => r.slice(1, -1).split("|").map((c) => c.trim()));
				elements.push(/* @__PURE__ */ jsx("div", {
					style: {
						margin: "1rem 0",
						overflowX: "auto",
						borderRadius: "6px",
						border: isDark ? "1px solid rgba(255, 255, 255, 0.1)" : "1px solid #e2e8f0"
					},
					children: /* @__PURE__ */ jsxs("table", {
						style: {
							width: "100%",
							borderCollapse: "collapse",
							fontSize: "0.875rem",
							textAlign: "left"
						},
						children: [/* @__PURE__ */ jsx("thead", { children: /* @__PURE__ */ jsx("tr", {
							style: { background: isDark ? "rgba(255, 255, 255, 0.05)" : "#f8fafc" },
							children: headerRow.map((h, hIdx) => /* @__PURE__ */ jsx("th", {
								style: {
									padding: "0.6rem 0.8rem",
									borderBottom: isDark ? "1px solid rgba(255, 255, 255, 0.1)" : "1px solid #e2e8f0",
									fontWeight: 600,
									color: isDark ? "#f1f5f9" : "#000000"
								},
								children: renderInlineMarkdown(h, onLinkClick, isDark)
							}, hIdx))
						}) }), /* @__PURE__ */ jsx("tbody", { children: bodyRows.map((row, rIdx) => /* @__PURE__ */ jsx("tr", {
							style: {
								borderBottom: isDark ? "1px solid rgba(255, 255, 255, 0.05)" : "1px solid #f1f5f9",
								background: rIdx % 2 === 1 ? isDark ? "rgba(255, 255, 255, 0.02)" : "#f8fafc" : "transparent"
							},
							children: row.map((cell, cIdx) => /* @__PURE__ */ jsx("td", {
								style: {
									padding: "0.5rem 0.8rem",
									color: isDark ? "#cbd5e1" : "#000000"
								},
								children: renderInlineMarkdown(cell, onLinkClick, isDark)
							}, cIdx))
						}, rIdx)) })]
					})
				}, `table-${blockKey++}`));
				continue;
			}
		}
		if (/^(\*|-|\+|\d+\.)\s+/.test(trimmed)) {
			const listItems = [];
			const isOrdered = /^\d+\./.test(trimmed);
			while (i < lines.length && /^(\*|-|\+|\d+\.)\s+/.test(lines[i].trim())) {
				const content = lines[i].trim().replace(/^(\*|-|\+|\d+\.)\s+/, "");
				const taskMatch = content.match(/^\[([ xX])\]\s+(.*)$/);
				if (taskMatch) listItems.push({
					isTask: true,
					checked: taskMatch[1].toLowerCase() === "x",
					text: taskMatch[2]
				});
				else listItems.push({ text: content });
				i++;
			}
			const ListTag = isOrdered ? "ol" : "ul";
			elements.push(/* @__PURE__ */ jsx(ListTag, {
				style: {
					margin: compact ? "0.25rem 0" : "0.5rem 0",
					paddingLeft: compact ? "1.2rem" : "1.5rem",
					color: isDark ? "#e2e8f0" : "#000000",
					lineHeight: compact ? 1.45 : 1.6
				},
				children: listItems.map((li, liIdx) => /* @__PURE__ */ jsxs("li", {
					style: {
						listStyleType: li.isTask ? "none" : void 0,
						marginLeft: li.isTask ? "-1.2rem" : void 0,
						display: li.isTask ? "flex" : void 0,
						alignItems: li.isTask ? "center" : void 0,
						gap: li.isTask ? "0.5rem" : void 0,
						color: isDark ? "#e2e8f0" : "#000000"
					},
					children: [li.isTask && /* @__PURE__ */ jsx("input", {
						type: "checkbox",
						checked: li.checked,
						readOnly: true,
						style: {
							accentColor: "#6366f1",
							cursor: "default"
						}
					}), /* @__PURE__ */ jsx("span", { children: renderInlineMarkdown(li.text, onLinkClick, isDark) })]
				}, liIdx))
			}, `list-${blockKey++}`));
			continue;
		}
		const paraLines = [];
		while (i < lines.length && lines[i].trim() && !lines[i].trim().startsWith("```") && !lines[i].trim().startsWith("#") && !lines[i].trim().startsWith(">") && !/^(\*|-|\+|\d+\.)\s+/.test(lines[i].trim()) && !lines[i].trim().startsWith("|")) {
			paraLines.push(lines[i].trim());
			i++;
		}
		if (paraLines.length > 0) elements.push(/* @__PURE__ */ jsx("p", {
			style: {
				margin: compact ? "0.3rem 0" : "0.6rem 0",
				lineHeight: compact ? 1.45 : 1.7,
				color: isDark ? "#e2e8f0" : "#000000",
				fontSize: compact ? "0.825rem" : "0.95rem"
			},
			children: renderInlineMarkdown(paraLines.join(" "), onLinkClick, isDark)
		}, `p-${blockKey++}`));
	}
	return /* @__PURE__ */ jsx("div", { children: elements });
}
function MarkdownViewport({ item, scale, controllerRef, api, theme: propTheme }) {
	const isDark = usePluginTheme(propTheme, api) === "dark";
	const [text, setText] = useState("");
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState(null);
	const containerRef = useRef(null);
	useEffect(() => {
		controllerRef.current = {
			scale,
			setScale: () => {},
			actualSize: () => {},
			zoomToFit: () => {}
		};
		return () => {
			controllerRef.current = null;
		};
	}, [controllerRef, scale]);
	useEffect(() => {
		let canceled = false;
		setLoading(true);
		setError(null);
		const loadContent = async () => {
			try {
				const fileHandle = api.getOriginalFile();
				let content = "";
				if (fileHandle.fetchText) content = await fileHandle.fetchText();
				else content = await (await fileHandle.fetchBlob()).text();
				if (!canceled) {
					setText(content);
					setLoading(false);
				}
			} catch (err) {
				if (!canceled) {
					setError(err instanceof Error ? err.message : "Failed to load Markdown file");
					setLoading(false);
				}
			}
		};
		loadContent();
		return () => {
			canceled = true;
		};
	}, [item.id, api]);
	const { frontmatter, body } = useMemo(() => parseFrontmatterAndBody(text), [text]);
	const handleLinkClick = useCallback((url) => {
		if (url.startsWith("#")) document.getElementById(url.slice(1))?.scrollIntoView({ behavior: "smooth" });
		else api.openExternalURL(url);
	}, [api]);
	return /* @__PURE__ */ jsx("div", {
		ref: containerRef,
		style: {
			display: "flex",
			flexDirection: "column",
			height: "100%",
			width: "100%",
			background: isDark ? "#0c0d11" : "#ffffff",
			color: isDark ? "#f1f5f9" : "#000000",
			overflow: "hidden",
			position: "relative"
		},
		children: /* @__PURE__ */ jsx("div", {
			style: {
				flex: 1,
				overflowY: "auto",
				padding: "2.5rem 2rem",
				display: "flex",
				justifyContent: "center"
			},
			children: /* @__PURE__ */ jsx("div", {
				style: {
					width: "100%",
					maxWidth: "800px",
					transform: scale !== 1 ? `scale(${scale})` : void 0,
					transformOrigin: "top center",
					transition: "transform 0.1s ease-out"
				},
				children: loading ? /* @__PURE__ */ jsx("div", {
					style: {
						textAlign: "center",
						padding: "4rem 0",
						color: isDark ? "#94a3b8" : "#64748b"
					},
					children: "Loading Markdown..."
				}) : error ? /* @__PURE__ */ jsx("div", {
					style: {
						padding: "1.5rem",
						borderRadius: "8px",
						background: "rgba(239, 68, 68, 0.1)",
						border: "1px solid rgba(239, 68, 68, 0.3)",
						color: "#f87171"
					},
					children: error
				}) : /* @__PURE__ */ jsxs(Fragment, { children: [frontmatter && Object.keys(frontmatter).length > 0 && /* @__PURE__ */ jsxs("div", {
					style: {
						marginBottom: "1.5rem",
						padding: "1rem",
						borderRadius: "8px",
						background: isDark ? "rgba(255, 255, 255, 0.03)" : "#f8fafc",
						border: isDark ? "1px solid rgba(255, 255, 255, 0.08)" : "1px solid #e2e8f0",
						fontSize: "0.85rem"
					},
					children: [
						frontmatter.title && /* @__PURE__ */ jsx("h1", {
							style: {
								margin: "0 0 0.5rem 0",
								fontSize: "1.5rem",
								color: isDark ? "#f8fafc" : "#000000"
							},
							children: String(frontmatter.title)
						}),
						frontmatter.description && /* @__PURE__ */ jsx("p", {
							style: {
								margin: "0 0 0.5rem 0",
								color: isDark ? "#94a3b8" : "#334155"
							},
							children: String(frontmatter.description)
						}),
						/* @__PURE__ */ jsxs("div", {
							style: {
								display: "flex",
								flexWrap: "wrap",
								gap: "0.5rem",
								marginTop: "0.5rem"
							},
							children: [
								frontmatter.author && /* @__PURE__ */ jsxs("span", {
									style: { color: isDark ? "#64748b" : "#4b5563" },
									children: ["By ", String(frontmatter.author)]
								}),
								frontmatter.date && /* @__PURE__ */ jsxs("span", {
									style: { color: isDark ? "#64748b" : "#4b5563" },
									children: ["• ", String(frontmatter.date)]
								}),
								Array.isArray(frontmatter.tags) && frontmatter.tags.map((t, idx) => /* @__PURE__ */ jsxs("span", {
									style: {
										background: isDark ? "rgba(99, 102, 241, 0.15)" : "#e0e7ff",
										color: isDark ? "#818cf8" : "#4338ca",
										borderRadius: "4px",
										padding: "1px 6px",
										fontSize: "0.75rem"
									},
									children: ["#", t]
								}, idx))
							]
						})
					]
				}), /* @__PURE__ */ jsx(MarkdownRenderer, {
					body,
					onLinkClick: handleLinkClick,
					isDark
				})] })
			})
		})
	});
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
function stripMarkdown(raw) {
	return raw.replace(/^---[\s\S]*?---\s*/m, "").replace(/^#+\s+/gm, "").replace(/```[\s\S]*?```/g, "").replace(/`([^`]+)`/g, "$1").replace(/\*\*([^*]+)\*\*/g, "$1").replace(/\*([^*]+)\*/g, "$1").replace(/~~([^~]+)~~/g, "$1").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/!\[([^\]]*)\]\([^)]+\)/g, "").replace(/^>\s*/gm, "").replace(/^[-*+]\s+/gm, "").replace(/^\d+\.\s+/gm, "").replace(/<[^>]+>/g, "").replace(/\r\n/g, "\n").replace(/\n{2,}/g, " ").replace(/\s+/g, " ").trim();
}
function MarkdownInspectorPreview({ item, api, theme: propTheme, onOpenPreview, onDragStart }) {
	const isDark = usePluginTheme(propTheme, api) === "dark";
	const [content, setContent] = useState("");
	const [loading, setLoading] = useState(true);
	useEffect(() => {
		let active = true;
		const fetchContent = async () => {
			try {
				setLoading(true);
				const fileHandle = api.getOriginalFile();
				const text = fileHandle.fetchText ? await fileHandle.fetchText() : await (await fileHandle.fetchBlob()).text();
				if (active) {
					const { frontmatter, body } = parseFrontmatterAndBody(text);
					let displayBody = body.trim();
					if (frontmatter?.title && typeof frontmatter.title === "string" && !displayBody.startsWith("#")) displayBody = `# ${frontmatter.title}\n\n${displayBody}`;
					setContent(displayBody);
					setLoading(false);
				}
			} catch {
				if (active) setLoading(false);
			}
		};
		fetchContent();
		return () => {
			active = false;
		};
	}, [item.id, api]);
	const handleDragStart = (e) => {
		e.dataTransfer.setData("application/x-bowerbird-internal-drag", "true");
		e.dataTransfer.setData("application/x-bowerbird-item-id", item.id);
		const rawPath = item.filePath || "";
		let fileUrl = item.fileUrl || "";
		if (!fileUrl && rawPath) fileUrl = encodeURI(`file://${rawPath.startsWith("/") ? "" : "/"}${rawPath}`);
		else if (fileUrl && fileUrl.includes(" ")) fileUrl = encodeURI(fileUrl);
		const mime = item.mimeType || "text/markdown";
		if (rawPath) {
			e.dataTransfer.setData("text/plain", rawPath);
			e.dataTransfer.setData("application/x-bowerbird-path", rawPath);
			e.dataTransfer.setData("application/x-bowerbird-paths", JSON.stringify([rawPath]));
		}
		if (fileUrl) {
			e.dataTransfer.setData("text/uri-list", fileUrl);
			e.dataTransfer.setData("DownloadURL", `${mime}:${item.filename}:${fileUrl}`);
		}
		e.dataTransfer.effectAllowed = "copyMove";
		onDragStart?.(e);
	};
	return /* @__PURE__ */ jsx("div", {
		draggable: true,
		onDragStart: handleDragStart,
		onDoubleClick: onOpenPreview,
		className: "draggable-asset-card wails-no-drag select-none cursor-grab active:cursor-grabbing",
		style: {
			width: "100%",
			height: "210px",
			maxHeight: "210px",
			borderRadius: "14px",
			background: isDark ? "#18181b" : "#ffffff",
			border: isDark ? "1px solid rgba(255, 255, 255, 0.08)" : "1px solid rgba(0, 0, 0, 0.08)",
			boxShadow: isDark ? "0 2px 10px rgba(0, 0, 0, 0.35)" : "0 1px 4px rgba(0, 0, 0, 0.06)",
			padding: "1rem 1.15rem",
			overflow: "hidden",
			position: "relative",
			boxSizing: "border-box",
			maskImage: "linear-gradient(to bottom, black 75%, transparent 100%)",
			WebkitMaskImage: "linear-gradient(to bottom, black 75%, transparent 100%)"
		},
		children: loading ? /* @__PURE__ */ jsx("div", {
			style: {
				color: isDark ? "#71717a" : "#a1a1aa",
				fontSize: "0.8rem",
				paddingTop: "0.5rem"
			},
			children: "Loading..."
		}) : content ? /* @__PURE__ */ jsx("div", {
			style: {
				pointerEvents: "none",
				userSelect: "none"
			},
			children: /* @__PURE__ */ jsx(MarkdownRenderer, {
				body: content,
				onLinkClick: () => {},
				isDark,
				compact: true
			})
		}) : /* @__PURE__ */ jsx("div", {
			style: {
				color: isDark ? "#71717a" : "#a1a1aa",
				fontSize: "0.8rem",
				paddingTop: "0.5rem",
				fontStyle: "italic"
			},
			children: "(Empty Markdown file)"
		})
	});
}
var markdownPreviewPlugin = definePlugin({
	id: "official.markdown-preview",
	name: "Markdown Preview",
	version: "1.0.0",
	description: "Rich Markdown preview with syntax highlighting, task lists, and metadata inspection",
	author: "Bowerbird Team",
	kind: "preview",
	priority: 50,
	extensions: [
		"md",
		"markdown",
		"mdown",
		"mkd",
		"mdwn",
		"mdt"
	],
	mimePrefixes: ["text/markdown", "text/x-markdown"],
	supportsZoom: false,
	Viewport: MarkdownViewport,
	InspectorPreview: MarkdownInspectorPreview,
	contextMenus: [
		{
			id: "markdown-copy-text",
			label: "Copy as Plain Text",
			target: "file",
			extensions: [
				"md",
				"markdown",
				"txt"
			],
			onClick: async (ctx) => {
				if (!ctx.items?.[0]) return;
				try {
					const fileHandle = ctx.api.getOriginalFile();
					const clean = stripMarkdown(fileHandle.fetchText ? await fileHandle.fetchText() : await (await fileHandle.fetchBlob()).text());
					await navigator.clipboard.writeText(clean);
				} catch (err) {
					console.error("[MarkdownPlugin] Copy plain text failed:", err);
				}
			}
		},
		{
			id: "markdown-copy-outline",
			label: "Copy Document Outline",
			target: "file",
			extensions: ["md", "markdown"],
			onClick: async (ctx) => {
				if (!ctx.items?.[0]) return;
				try {
					const fileHandle = ctx.api.getOriginalFile();
					const formatted = extractOutline(fileHandle.fetchText ? await fileHandle.fetchText() : await (await fileHandle.fetchBlob()).text()).map((o) => `${"  ".repeat(o.level - 1)}- ${o.text}`).join("\n");
					await navigator.clipboard.writeText(formatted);
				} catch (err) {
					console.error("[MarkdownPlugin] Copy outline failed:", err);
				}
			}
		},
		{
			id: "markdown-folder-summary",
			label: "Scan Markdown in Folder",
			target: "folder",
			onClick: async (ctx) => {
				console.log("[MarkdownPlugin] Folder scan requested for:", ctx.folder?.name);
			}
		}
	]
});
//#endregion
export { markdownPreviewPlugin as default, markdownPreviewPlugin as plugin };
