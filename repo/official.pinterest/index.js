import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { jsx, jsxs } from "react/jsx-runtime";
//#region packages/plugin-sdk/src/helper.ts
/**
* Type-safe helper to define a Bowerbird preview or metadata plugin.
*/
function definePlugin(plugin) {
	return plugin;
}
//#endregion
//#region plugins/pinterest/src/pinterest.ts
var PINTEREST_HOST_RE = /(^|\.)pinterest\.[a-z.]+$/i;
var PINIMG_HOST_RE = /^i(?:-[a-z0-9]+)?\.pinimg\.com$/i;
var PIN_PATH_RE = /\/pin\/(\d+)/i;
var PINIMG_URL_RE = /(?:https?:)?\/\/i(?:-[a-z0-9]+)?\.pinimg\.com\/[^\s"'<>\\]+?\.(?:jpe?g|png|gif|webp)(?:\?[^\s"'<>\\]*)?/gi;
var META_TAG_RE = /<meta\b[^>]*>/gi;
function normalizeInput(raw) {
	const trimmed = raw.trim();
	if (trimmed.startsWith("//")) return `https:${trimmed}`;
	if (!trimmed.includes("://") && trimmed.includes(".")) return `https://${trimmed}`;
	return trimmed;
}
/** Parses a Pinterest pin URL (regional domains and pin.it short links included). */
function parsePinterestPinUrl(raw) {
	const normalized = normalizeInput(raw);
	if (!normalized) return null;
	let parsed;
	try {
		parsed = new URL(normalized);
	} catch {
		return null;
	}
	const host = parsed.hostname.toLowerCase();
	if (!host) return null;
	if (host === "pin.it" || host.endsWith(".pin.it")) return {
		id: "",
		host,
		sourceUrl: normalized,
		canonicalUrl: normalized,
		shortLink: true
	};
	if (!PINTEREST_HOST_RE.test(host)) return null;
	const match = parsed.pathname.match(PIN_PATH_RE);
	if (!match) return null;
	return {
		id: match[1],
		host,
		sourceUrl: normalized,
		canonicalUrl: `https://${host}/pin/${match[1]}/`,
		shortLink: false
	};
}
function isPinimgHost(host) {
	return PINIMG_HOST_RE.test(host);
}
/** True when the URL points directly at a Pinterest image CDN asset. */
function isPinterestImageUrl(raw) {
	try {
		return isPinimgHost(new URL(normalizeInput(raw)).hostname);
	} catch {
		return false;
	}
}
/** Accepts either a pin page URL or a direct i.pinimg.com image URL. */
function parsePinterestInput(raw) {
	const pin = parsePinterestPinUrl(raw);
	if (pin) return {
		kind: "pin",
		pin,
		url: pin.sourceUrl
	};
	const normalized = normalizeInput(raw);
	if (isPinterestImageUrl(normalized)) return {
		kind: "image",
		url: normalized
	};
	return null;
}
function decodeHtmlEntities(value) {
	return value.replace(/&amp;/gi, "&").replace(/&quot;/gi, "\"").replace(/&#0*39;/gi, "'").replace(/&apos;/gi, "'").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&#x2f;/gi, "/").replace(/&#47;/gi, "/");
}
function normalizeImageCandidate(raw) {
	let candidate = raw.trim();
	candidate = candidate.replace(/\\\//g, "/");
	candidate = candidate.replace(/\\u002f/gi, "/");
	candidate = decodeHtmlEntities(candidate);
	candidate = candidate.replace(/^[\s"'()\[\]{}<>,;]+|[\s"'()\[\]{}<>,;]+$/g, "");
	if (candidate.startsWith("//")) candidate = `https:${candidate}`;
	if (!/^https?:\/\//i.test(candidate)) return "";
	try {
		return new URL(candidate).toString();
	} catch {
		return "";
	}
}
function getHtmlAttribute(tag, name) {
	const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, "i"));
	return match ? decodeHtmlEntities(match[1]) : "";
}
function imageHash(raw) {
	try {
		const parsed = new URL(raw);
		if (!isPinimgHost(parsed.hostname)) return "";
		const base = parsed.pathname.split("/").pop() || "";
		const dot = base.indexOf(".");
		const hash = dot > 0 ? base.slice(0, dot) : base;
		return hash.length >= 8 ? hash.toLowerCase() : "";
	} catch {
		return "";
	}
}
function imageScore(candidate) {
	const lower = candidate.toLowerCase();
	let score = 0;
	try {
		if (isPinimgHost(new URL(candidate).hostname)) score += 20;
	} catch {}
	if (lower.includes("/originals/")) score += 130;
	else if (lower.includes("/1200x/")) score += 100;
	else if (lower.includes("/736x/")) score += 80;
	else if (lower.includes("/564x/")) score += 70;
	else if (lower.includes("/474x/")) score += 60;
	else score += 50;
	return score;
}
function bestImageCandidate(candidates) {
	let best = "";
	let bestScore = -1;
	const seen = /* @__PURE__ */ new Set();
	for (const candidate of candidates) {
		if (seen.has(candidate)) continue;
		seen.add(candidate);
		const score = imageScore(candidate);
		if (score > bestScore) {
			best = candidate;
			bestScore = score;
		}
	}
	return best;
}
/**
* Extracts the pin's image from page HTML. og:image anchors the current pin's
* content hash so related-pin originals elsewhere in the page are ignored.
*/
function extractPinterestImageFromHtml(html) {
	if (!html.trim()) return "";
	const unescaped = decodeHtmlEntities(html.replace(/\\\//g, "/").replace(/\\u002f/gi, "/"));
	const metaCandidates = [];
	for (const tag of unescaped.match(META_TAG_RE) || []) {
		const lower = tag.toLowerCase();
		if (!lower.includes("og:image") && !lower.includes("twitter:image")) continue;
		const candidate = normalizeImageCandidate(getHtmlAttribute(tag, "content"));
		if (candidate) metaCandidates.push(candidate);
	}
	const candidates = [...metaCandidates];
	for (const rawCandidate of unescaped.match(PINIMG_URL_RE) || []) {
		const candidate = normalizeImageCandidate(rawCandidate);
		if (candidate) candidates.push(candidate);
	}
	for (const metaCandidate of metaCandidates) {
		const anchorHash = imageHash(metaCandidate);
		if (!anchorHash) continue;
		const anchored = candidates.filter((candidate) => imageHash(candidate) === anchorHash);
		if (anchored.length > 0) return bestImageCandidate(anchored);
	}
	return bestImageCandidate(candidates);
}
function splitPathExtension(pathValue) {
	const dot = pathValue.lastIndexOf(".");
	if (dot < 0) return {
		stem: pathValue,
		ext: ""
	};
	return {
		stem: pathValue.slice(0, dot),
		ext: pathValue.slice(dot + 1).toLowerCase()
	};
}
function uniqueExtensions(ext) {
	const result = [];
	for (const candidate of [
		ext,
		"jpg",
		"png",
		"webp",
		"gif"
	]) if (candidate && !result.includes(candidate)) result.push(candidate);
	return result;
}
function buildPinimgUrl(parsed, pathValue) {
	const copy = new URL(parsed.toString());
	copy.protocol = "https:";
	copy.pathname = pathValue;
	return copy.toString();
}
/**
* Builds download candidates, best quality first. Pinterest keeps the content
* hash stable across renditions, so from any resized URL we can try
* /originals/<hash>.<ext> and only then fall back to 1200x / the original URL.
*/
function pinterestImageCandidates(raw) {
	const normalized = normalizeImageCandidate(raw);
	if (!normalized) return [];
	let parsed;
	try {
		parsed = new URL(normalized);
	} catch {
		return [normalized];
	}
	if (!isPinimgHost(parsed.hostname)) return [normalized];
	let pathValue = parsed.pathname.replace(/^\/+/, "");
	if (!pathValue) return [normalized];
	if (pathValue.toLowerCase().startsWith("webp/")) pathValue = pathValue.slice(5);
	const parts = pathValue.split("/");
	if (parts.length < 2) return [normalized];
	const isOriginal = parts[0].toLowerCase() === "originals";
	const rest = parts.slice(1).join("/");
	const { stem, ext } = splitPathExtension(rest);
	const candidates = [];
	if (isOriginal) candidates.push(normalized);
	else for (const candidateExt of uniqueExtensions(ext)) candidates.push(buildPinimgUrl(parsed, `/originals/${stem}.${candidateExt}`));
	candidates.push(buildPinimgUrl(parsed, `/1200x/${rest}`));
	if (!isOriginal) candidates.push(normalized);
	return Array.from(new Set(candidates.filter(Boolean)));
}
/** Fetches a URL as text through the desktop's generic HTTP bridge. */
async function fetchTextViaBackend(apiBaseUrl, url, options) {
	const response = await fetch(`${apiBaseUrl}/api/url/fetch`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			url,
			headers: options?.headers,
			maxBytes: options?.maxBytes,
			timeoutMs: options?.timeoutMs
		})
	});
	let payload = null;
	try {
		payload = await response.json();
	} catch {}
	if (!response.ok || payload?.status !== "success" || !payload.data) throw new Error(payload?.message || `URL fetch failed: HTTP ${response.status}`);
	return payload.data;
}
async function fetchPinPage(context, url, headers, timeoutMs = 15e3) {
	try {
		const result = await context.fetchText(url, {
			headers,
			timeoutMs,
			maxBytes: 8388608
		});
		if (result.statusCode < 200 || result.statusCode >= 300) return null;
		const imageUrl = extractPinterestImageFromHtml(result.body);
		if (!imageUrl) return null;
		return {
			pageUrl: result.url || url,
			imageUrl
		};
	} catch {
		return null;
	}
}
/**
* Plugin URL resolver entrypoint. Returns direct media candidates + the source
* page URL; the host then imports the first candidate that downloads.
*/
async function resolvePinterestResolution(raw, context) {
	const input = parsePinterestInput(raw);
	if (!input) return null;
	if (input.kind === "image") return {
		url: input.url,
		candidates: pinterestImageCandidates(input.url),
		sourceUrl: input.url,
		tags: ["pinterest"]
	};
	const pin = input.pin;
	const pageUrls = [pin.sourceUrl];
	if (pin.canonicalUrl && pin.canonicalUrl !== pin.sourceUrl) pageUrls.push(pin.canonicalUrl);
	for (const pageUrl of pageUrls) {
		const resolved = await fetchPinPage(context, pageUrl, void 0, 8e3);
		if (resolved) return {
			url: resolved.imageUrl,
			candidates: pinterestImageCandidates(resolved.imageUrl),
			sourceUrl: pin.sourceUrl,
			tags: ["pinterest"]
		};
	}
	if (pin.id) for (const frontHost of ["pinterest.ru", "pinterest.co.kr"]) {
		const resolved = await fetchPinPage(context, `https://${frontHost}/pin/${pin.id}/`, { Host: "www.pinterest.com" }, 15e3);
		if (resolved) return {
			url: resolved.imageUrl,
			candidates: pinterestImageCandidates(resolved.imageUrl),
			sourceUrl: pin.sourceUrl,
			tags: ["pinterest"]
		};
	}
	return null;
}
/** Resolves the Bowerbird local HTTP API origin, falling back to the default port. */
function resolveApiBase(item) {
	for (const candidate of [
		item?.originalUrl,
		item?.thumbnailUrl,
		item?.downloadUrl
	]) {
		if (!candidate) continue;
		try {
			const parsed = new URL(candidate);
			if (parsed.protocol === "http:" || parsed.protocol === "https:") return parsed.origin;
		} catch {}
	}
	return "http://127.0.0.1:41595";
}
//#endregion
//#region plugins/pinterest/src/index.tsx
async function resolveInputCandidates(input, item) {
	if (input.kind === "image") return {
		candidates: pinterestImageCandidates(input.url),
		sourceUrl: input.url
	};
	const apiBaseUrl = resolveApiBase(item);
	const resolution = await resolvePinterestResolution(input.pin.sourceUrl, { fetchText: (url, options) => fetchTextViaBackend(apiBaseUrl, url, options) });
	if (!resolution) throw new Error("Could not resolve this Pinterest pin. Try the direct image URL instead.");
	const candidates = resolution.candidates && resolution.candidates.length > 0 ? resolution.candidates : resolution.url ? [resolution.url] : [];
	if (candidates.length === 0) throw new Error("Pinterest returned no download candidates");
	return {
		candidates,
		sourceUrl: resolution.sourceUrl || input.pin.sourceUrl
	};
}
async function savePinterestInput(input, item) {
	const apiBaseUrl = resolveApiBase(item);
	const { candidates, sourceUrl } = await resolveInputCandidates(input, item);
	let lastError = null;
	for (const candidate of candidates) try {
		const response = await fetch(`${apiBaseUrl}/api/item/addFromURL`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				url: candidate,
				website: sourceUrl,
				tags: ["pinterest"]
			})
		});
		let payload = null;
		try {
			payload = await response.json();
		} catch {}
		if (response.ok && payload?.status === "success" && payload.data) return payload.data;
		lastError = new Error(payload?.message || `Bowerbird returned HTTP ${response.status}`);
	} catch (err) {
		lastError = err;
	}
	throw lastError instanceof Error ? lastError : new Error(String(lastError || "Could not save image"));
}
function palette(isDark) {
	return {
		text: "var(--foreground, #0f172a)",
		muted: "var(--muted-foreground, #64748b)",
		faint: "var(--muted-foreground, #94a3b8)",
		border: "var(--border, rgba(15, 23, 42, 0.14))",
		surface: "var(--muted, rgba(15, 23, 42, 0.05))",
		surfaceHover: isDark ? "rgba(255,255,255,0.08)" : "rgba(15,23,42,0.06)",
		input: "var(--background, #ffffff)",
		panel: "var(--popover, #ffffff)",
		shadow: isDark ? "0 24px 64px -18px rgba(0,0,0,0.8)" : "0 24px 64px -18px rgba(15,23,42,0.32)",
		accent: "rgba(230, 0, 35, 0.12)",
		accentText: isDark ? "#ff8fa1" : "#c0001d",
		danger: "#ef4444",
		success: "#10b981",
		backdrop: isDark ? "rgba(0,0,0,0.64)" : "rgba(15,23,42,0.38)"
	};
}
function useTheme(api) {
	const get = () => {
		if (api?.getTheme) return api.getTheme() === "dark";
		if (typeof document !== "undefined") return document.documentElement.classList.contains("dark");
		return false;
	};
	const [isDark, setIsDark] = useState(get);
	useEffect(() => {
		setIsDark(get());
		if (!api?.subscribeTheme) return;
		return api.subscribeTheme((theme) => setIsDark(theme === "dark"));
	}, [api]);
	return isDark;
}
function ActionButton({ children, onClick, disabled = false, variant = "outline", colors, title }) {
	const [hovered, setHovered] = useState(false);
	const isPrimary = variant === "primary";
	return /* @__PURE__ */ jsx("button", {
		type: "button",
		title,
		disabled,
		onClick,
		onMouseEnter: () => setHovered(true),
		onMouseLeave: () => setHovered(false),
		style: {
			display: "inline-flex",
			alignItems: "center",
			justifyContent: "center",
			gap: 6,
			border: `1px solid ${isPrimary ? "transparent" : colors.border}`,
			borderRadius: 7,
			padding: "6px 11px",
			fontSize: 12,
			fontWeight: isPrimary ? 600 : 500,
			lineHeight: 1.2,
			cursor: disabled ? "default" : "pointer",
			opacity: disabled ? .55 : 1,
			color: isPrimary ? "#ffffff" : colors.text,
			background: isPrimary ? hovered && !disabled ? "#d00020" : "#e60023" : hovered && !disabled ? colors.surfaceHover : "transparent",
			transition: "background 0.15s ease, border-color 0.15s ease, opacity 0.15s ease",
			fontFamily: "inherit",
			whiteSpace: "nowrap"
		},
		children
	});
}
function SaveDialog({ initialUrl, item, onClose }) {
	const [url, setUrl] = useState(initialUrl);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState(null);
	const [saved, setSaved] = useState(null);
	const inputRef = useRef(null);
	const isDark = useTheme();
	const colors = useMemo(() => palette(isDark), [isDark]);
	const input = useMemo(() => parsePinterestInput(url), [url]);
	useEffect(() => {
		const timer = window.setTimeout(() => {
			inputRef.current?.focus();
			inputRef.current?.select();
		}, 30);
		const onKeyDown = (event) => {
			if (event.key === "Escape" && !busy) {
				event.preventDefault();
				onClose();
			}
		};
		window.addEventListener("keydown", onKeyDown, true);
		return () => {
			window.clearTimeout(timer);
			window.removeEventListener("keydown", onKeyDown, true);
		};
	}, [busy, onClose]);
	useEffect(() => {
		if (initialUrl || typeof navigator === "undefined" || !navigator.clipboard?.readText) return;
		let canceled = false;
		navigator.clipboard.readText().then((text) => {
			if (!canceled && text.trim() && parsePinterestInput(text)) setUrl(text.trim());
		}).catch(() => {});
		return () => {
			canceled = true;
		};
	}, [initialUrl]);
	const submit = useCallback(async () => {
		if (!input || busy) {
			if (!input) setError("Paste a Pinterest pin URL (for example https://jp.pinterest.com/pin/…)");
			return;
		}
		setBusy(true);
		setError(null);
		try {
			const result = await savePinterestInput(input, item);
			setSaved(result);
			window.setTimeout(onClose, 1100);
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		} finally {
			setBusy(false);
		}
	}, [
		busy,
		input,
		item,
		onClose
	]);
	const hint = input ? input.kind === "pin" ? input.pin.id ? `Pin ${input.pin.id} · ${input.pin.host}` : `Short link · ${input.pin.host}` : `Direct image · ${input.url.replace(/^https?:\/\//, "").slice(0, 64)}…` : "Pin pages are resolved to their 1200x image automatically.";
	return /* @__PURE__ */ jsx("div", {
		style: {
			position: "fixed",
			inset: 0,
			display: "flex",
			alignItems: "center",
			justifyContent: "center",
			padding: 20,
			background: colors.backdrop,
			backdropFilter: "blur(3px)",
			WebkitBackdropFilter: "blur(3px)",
			fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
		},
		onMouseDown: (event) => {
			if (event.target === event.currentTarget && !busy) onClose();
		},
		children: /* @__PURE__ */ jsxs("div", {
			role: "dialog",
			"aria-modal": "true",
			"aria-label": "Save Pinterest pin",
			style: {
				width: "min(470px, calc(100vw - 40px))",
				borderRadius: 16,
				border: `1px solid ${colors.border}`,
				background: colors.panel,
				color: colors.text,
				boxShadow: colors.shadow,
				overflow: "hidden"
			},
			onMouseDown: (event) => event.stopPropagation(),
			children: [/* @__PURE__ */ jsxs("div", {
				style: { padding: "18px 18px 0" },
				children: [
					/* @__PURE__ */ jsxs("div", {
						style: {
							display: "flex",
							alignItems: "center",
							gap: 10
						},
						children: [/* @__PURE__ */ jsx("div", {
							style: {
								display: "flex",
								alignItems: "center",
								justifyContent: "center",
								width: 32,
								height: 32,
								borderRadius: 16,
								background: colors.accent,
								color: colors.accentText,
								fontWeight: 800,
								fontSize: 17,
								lineHeight: 1
							},
							children: "P"
						}), /* @__PURE__ */ jsxs("div", {
							style: { minWidth: 0 },
							children: [/* @__PURE__ */ jsx("div", {
								style: {
									fontSize: 14,
									fontWeight: 650,
									letterSpacing: -.1
								},
								children: "Save Pinterest pin"
							}), /* @__PURE__ */ jsx("div", {
								style: {
									marginTop: 2,
									fontSize: 11,
									color: colors.muted
								},
								children: "The original image is saved into your active Bowerbird library."
							})]
						})]
					}),
					/* @__PURE__ */ jsx("label", {
						htmlFor: "bowerbird-pinterest-url",
						style: {
							display: "block",
							marginTop: 18,
							marginBottom: 6,
							fontSize: 11,
							fontWeight: 600,
							color: colors.muted
						},
						children: "Pin URL"
					}),
					/* @__PURE__ */ jsx("input", {
						id: "bowerbird-pinterest-url",
						ref: inputRef,
						value: url,
						disabled: busy,
						spellCheck: false,
						autoComplete: "off",
						placeholder: "https://jp.pinterest.com/pin/973692381956656879/",
						onChange: (event) => {
							setUrl(event.target.value);
							setError(null);
							setSaved(null);
						},
						onKeyDown: (event) => {
							if (event.key === "Enter") {
								event.preventDefault();
								submit();
							}
						},
						style: {
							width: "100%",
							boxSizing: "border-box",
							height: 36,
							padding: "0 11px",
							borderRadius: 8,
							border: `1px solid ${error ? colors.danger : colors.border}`,
							background: colors.input,
							color: colors.text,
							fontSize: 12,
							outline: "none",
							fontFamily: "inherit"
						}
					}),
					/* @__PURE__ */ jsx("div", {
						style: {
							marginTop: 6,
							minHeight: 15,
							fontSize: 10.5,
							lineHeight: 1.4,
							color: input ? colors.faint : colors.muted,
							wordBreak: "break-all"
						},
						children: hint
					}),
					error ? /* @__PURE__ */ jsx("div", {
						style: {
							marginTop: 10,
							padding: "7px 9px",
							borderRadius: 7,
							background: "rgba(239,68,68,0.10)",
							color: colors.danger,
							fontSize: 11,
							lineHeight: 1.45,
							wordBreak: "break-word"
						},
						children: error
					}) : null,
					saved ? /* @__PURE__ */ jsxs("div", {
						style: {
							marginTop: 10,
							padding: "7px 9px",
							borderRadius: 7,
							background: "rgba(16,185,129,0.12)",
							color: colors.success,
							fontSize: 11,
							lineHeight: 1.45
						},
						children: [
							"Saved",
							saved.name ? ` “${saved.name}”` : " image",
							" to your library."
						]
					}) : null
				]
			}), /* @__PURE__ */ jsxs("div", {
				style: {
					display: "flex",
					alignItems: "center",
					justifyContent: "flex-end",
					gap: 8,
					marginTop: 16,
					padding: "12px 18px",
					borderTop: `1px solid ${colors.border}`,
					background: colors.surface
				},
				children: [/* @__PURE__ */ jsx(ActionButton, {
					colors,
					onClick: onClose,
					disabled: busy,
					children: "Cancel"
				}), /* @__PURE__ */ jsx(ActionButton, {
					colors,
					variant: "primary",
					disabled: !input || busy || Boolean(saved),
					onClick: () => void submit(),
					children: busy ? "Saving…" : saved ? "Saved" : "Save image"
				})]
			})]
		})
	});
}
/** Opens the self-contained save dialog in a body-level shadow root. */
function openSaveDialog(options) {
	if (typeof document === "undefined") return;
	const reactDOM = window.ReactDOM;
	if (!reactDOM?.createRoot) {
		console.warn("[PinterestPlugin] Host ReactDOM bridge is unavailable");
		return;
	}
	const host = document.createElement("div");
	host.style.cssText = "position:fixed;inset:0;z-index:2147483000;pointer-events:auto;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;";
	document.body.appendChild(host);
	const shadow = host.attachShadow({ mode: "open" });
	const style = document.createElement("style");
	style.textContent = ":host{all:initial}*,*::before,*::after{box-sizing:border-box}";
	shadow.appendChild(style);
	const mount = document.createElement("div");
	shadow.appendChild(mount);
	const root = reactDOM.createRoot(mount);
	let closed = false;
	const close = () => {
		if (closed) return;
		closed = true;
		try {
			root.unmount();
		} finally {
			host.remove();
		}
	};
	root.render(/* @__PURE__ */ jsx(SaveDialog, {
		initialUrl: options.initialUrl || "",
		item: options.item,
		onClose: close
	}));
}
function PinterestInspectorExtension({ item, isTrashView, api }) {
	const isDark = useTheme(api);
	const colors = useMemo(() => palette(isDark), [isDark]);
	const pin = useMemo(() => parsePinterestPinUrl(item.url || ""), [item.url]);
	const [busy, setBusy] = useState(false);
	const [message, setMessage] = useState(null);
	useEffect(() => {
		setMessage(null);
	}, [item.id]);
	if (!pin) return null;
	const handleSave = async () => {
		const input = parsePinterestInput(item.url || "");
		if (!input) return;
		setBusy(true);
		setMessage(null);
		try {
			const saved = await savePinterestInput(input, item);
			setMessage({ text: saved.name ? `Saved “${saved.name}”` : "Image saved" });
		} catch (err) {
			setMessage({
				text: err instanceof Error ? err.message : String(err),
				error: true
			});
		} finally {
			setBusy(false);
		}
	};
	return /* @__PURE__ */ jsxs("div", {
		style: { padding: "0.25rem 0" },
		children: [/* @__PURE__ */ jsxs("div", {
			style: {
				display: "flex",
				alignItems: "center",
				justifyContent: "space-between",
				gap: 10,
				padding: "0.375rem 0"
			},
			children: [/* @__PURE__ */ jsxs("div", {
				style: {
					display: "flex",
					alignItems: "center",
					gap: 7,
					minWidth: 0
				},
				children: [/* @__PURE__ */ jsx("span", {
					style: {
						display: "inline-flex",
						alignItems: "center",
						justifyContent: "center",
						width: 18,
						height: 18,
						borderRadius: 9,
						background: colors.accent,
						color: colors.accentText,
						fontSize: 10,
						fontWeight: 800
					},
					children: "P"
				}), /* @__PURE__ */ jsx("span", {
					style: {
						fontSize: "0.625rem",
						fontWeight: 600,
						letterSpacing: "0.05em",
						textTransform: "uppercase",
						color: colors.muted
					},
					children: "Pinterest"
				})]
			}), /* @__PURE__ */ jsx("span", {
				style: {
					fontSize: 10,
					color: colors.faint
				},
				children: pin.id ? `#${pin.id}` : "short link"
			})]
		}), /* @__PURE__ */ jsxs("div", {
			style: {
				display: "flex",
				flexDirection: "column",
				gap: 8,
				paddingBottom: 10
			},
			children: [
				/* @__PURE__ */ jsxs("div", {
					style: {
						display: "flex",
						gap: 6
					},
					children: [/* @__PURE__ */ jsx(ActionButton, {
						colors,
						disabled: busy || Boolean(isTrashView),
						onClick: () => void handleSave(),
						title: "Download the Pinterest image into this library",
						children: busy ? "Saving…" : "Save image"
					}), /* @__PURE__ */ jsx(ActionButton, {
						colors,
						variant: "ghost",
						onClick: () => void api.openExternalURL(item.url),
						title: "Open this pin in your browser",
						children: "Open pin"
					})]
				}),
				isTrashView ? /* @__PURE__ */ jsx("div", {
					style: {
						fontSize: 10.5,
						color: colors.faint
					},
					children: "Restore this item to save its pin image."
				}) : null,
				message ? /* @__PURE__ */ jsx("div", {
					style: {
						fontSize: 10.5,
						lineHeight: 1.45,
						color: message.error ? colors.danger : colors.success,
						wordBreak: "break-word"
					},
					children: message.text
				}) : null
			]
		})]
	});
}
function firstPinterestItem(ctx) {
	return (ctx.items || []).find((entry) => parsePinterestPinUrl(entry.url || ""));
}
var pinterestPlugin = definePlugin({
	id: "official.pinterest",
	name: "Pinterest",
	version: "1.0.0",
	description: "Parse Pinterest pin URLs and save the original image into your Bowerbird library.",
	author: "Bowerbird Team",
	kind: "metadata",
	priority: 55,
	extensions: [],
	InspectorExtension: PinterestInspectorExtension,
	resolveUrl: (url, context) => resolvePinterestResolution(url, context),
	contextMenus: [{
		id: "pinterest-save-url",
		label: "Save Pinterest Pin…",
		target: "general",
		icon: "pin",
		onClick: () => {
			openSaveDialog({});
		}
	}, {
		id: "pinterest-save-from-item",
		label: "Save Pinterest Pin Image",
		target: "file",
		icon: "pin",
		hidden: (ctx) => !firstPinterestItem(ctx),
		onClick: (ctx) => {
			const item = firstPinterestItem(ctx);
			if (!item) return;
			openSaveDialog({
				initialUrl: item.url || "",
				item
			});
		}
	}]
});
//#endregion
export { pinterestPlugin as default, pinterestPlugin as plugin };
