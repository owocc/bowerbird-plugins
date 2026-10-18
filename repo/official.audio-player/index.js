import { useCallback, useEffect, useRef, useState } from "react";
import { jsx, jsxs } from "react/jsx-runtime";
//#region packages/plugin-sdk/src/helper.ts
/**
* Type-safe helper to define a Bowerbird preview or metadata plugin.
*/
function definePlugin(plugin) {
	return plugin;
}
//#endregion
//#region plugins/audio-player/src/index.tsx
function formatTime(seconds) {
	if (isNaN(seconds) || seconds < 0) return "0:00";
	const mins = Math.floor(seconds / 60);
	const secs = Math.floor(seconds % 60);
	const hours = Math.floor(mins / 60);
	const remainingMins = mins % 60;
	if (hours > 0) return `${hours}:${remainingMins < 10 ? "0" : ""}${remainingMins}:${secs < 10 ? "0" : ""}${secs}`;
	return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
}
function formatSize(bytes) {
	if (bytes === 0) return "0 B";
	const k = 1024;
	const sizes = [
		"B",
		"KB",
		"MB",
		"GB"
	];
	const i = Math.floor(Math.log(bytes) / Math.log(k));
	return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}
function AudioViewport({ item, api }) {
	const audioRef = useRef(null);
	const [isPlaying, setIsPlaying] = useState(false);
	const [currentTime, setCurrentTime] = useState(0);
	const [duration, setDuration] = useState(0);
	const [volume, setVolume] = useState(.8);
	const [isMuted, setIsMuted] = useState(false);
	const [playbackRate, setPlaybackRate] = useState(1);
	const [isLooping, setIsLooping] = useState(false);
	const [isScrubbing, setIsScrubbing] = useState(false);
	const [hoverTime, setHoverTime] = useState(null);
	const progressBarRef = useRef(null);
	const audioUrl = api.getOriginalFile().url;
	useEffect(() => {
		const audio = audioRef.current;
		if (!audio) return;
		const onPlay = () => setIsPlaying(true);
		const onPause = () => setIsPlaying(false);
		const onTimeUpdate = () => {
			if (!isScrubbing) setCurrentTime(audio.currentTime);
		};
		const onLoadedMetadata = () => {
			setDuration(audio.duration || 0);
		};
		const onEnded = () => {
			if (!isLooping) setIsPlaying(false);
		};
		audio.addEventListener("play", onPlay);
		audio.addEventListener("pause", onPause);
		audio.addEventListener("timeupdate", onTimeUpdate);
		audio.addEventListener("loadedmetadata", onLoadedMetadata);
		audio.addEventListener("ended", onEnded);
		return () => {
			audio.removeEventListener("play", onPlay);
			audio.removeEventListener("pause", onPause);
			audio.removeEventListener("timeupdate", onTimeUpdate);
			audio.removeEventListener("loadedmetadata", onLoadedMetadata);
			audio.removeEventListener("ended", onEnded);
		};
	}, [isScrubbing, isLooping]);
	useEffect(() => {
		const handleKeyDown = (e) => {
			if (e.code === "Space" && e.target === document.body) {
				e.preventDefault();
				togglePlay();
			}
		};
		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, []);
	const togglePlay = useCallback(() => {
		const audio = audioRef.current;
		if (!audio) return;
		if (audio.paused) audio.play().catch(() => {});
		else audio.pause();
	}, []);
	const handleSeek = (newTime) => {
		const audio = audioRef.current;
		if (!audio) return;
		audio.currentTime = newTime;
		setCurrentTime(newTime);
	};
	const handleProgressMouseDown = (e) => {
		const rect = progressBarRef.current?.getBoundingClientRect();
		if (!rect || duration === 0) return;
		setIsScrubbing(true);
		const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
		handleSeek(pos * duration);
		const onMouseMove = (moveEvent) => {
			const movePos = Math.max(0, Math.min(1, (moveEvent.clientX - rect.left) / rect.width));
			handleSeek(movePos * duration);
		};
		const onMouseUp = () => {
			setIsScrubbing(false);
			window.removeEventListener("mousemove", onMouseMove);
			window.removeEventListener("mouseup", onMouseUp);
		};
		window.addEventListener("mousemove", onMouseMove);
		window.addEventListener("mouseup", onMouseUp);
	};
	const handleProgressMouseMove = (e) => {
		const rect = progressBarRef.current?.getBoundingClientRect();
		if (!rect || duration === 0) return;
		const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
		setHoverTime(pos * duration);
	};
	const handleVolumeChange = (newVol) => {
		const audio = audioRef.current;
		if (!audio) return;
		audio.volume = newVol;
		setVolume(newVol);
		if (newVol > 0 && isMuted) {
			audio.muted = false;
			setIsMuted(false);
		}
	};
	const toggleMute = () => {
		const audio = audioRef.current;
		if (!audio) return;
		audio.muted = !isMuted;
		setIsMuted(!isMuted);
	};
	const cyclePlaybackRate = () => {
		const rates = [
			.5,
			.75,
			1,
			1.25,
			1.5,
			2
		];
		const nextRate = rates[(rates.indexOf(playbackRate) + 1) % rates.length];
		if (audioRef.current) audioRef.current.playbackRate = nextRate;
		setPlaybackRate(nextRate);
	};
	const toggleLoop = () => {
		if (audioRef.current) audioRef.current.loop = !isLooping;
		setIsLooping(!isLooping);
	};
	const skipSeconds = (seconds) => {
		const audio = audioRef.current;
		if (!audio) return;
		audio.currentTime = Math.max(0, Math.min(duration, audio.currentTime + seconds));
	};
	const progressPercent = duration > 0 ? currentTime / duration * 100 : 0;
	return /* @__PURE__ */ jsxs("div", {
		style: {
			display: "flex",
			flexDirection: "column",
			height: "100%",
			width: "100%",
			background: "radial-gradient(ellipse at 50% 30%, #171b26 0%, #0b0c10 100%)",
			color: "#f1f5f9",
			alignItems: "center",
			justifyContent: "center",
			position: "relative",
			userSelect: "none",
			padding: "2rem"
		},
		children: [/* @__PURE__ */ jsx("audio", {
			ref: audioRef,
			src: audioUrl,
			preload: "metadata"
		}), /* @__PURE__ */ jsxs("div", {
			style: {
				display: "flex",
				flexDirection: "column",
				alignItems: "center",
				maxWidth: "540px",
				width: "100%",
				gap: "2rem"
			},
			children: [
				/* @__PURE__ */ jsx("div", {
					style: {
						position: "relative",
						width: "220px",
						height: "220px",
						borderRadius: "50%",
						background: "radial-gradient(circle, rgba(99, 102, 241, 0.15) 0%, rgba(20, 24, 38, 0.8) 70%)",
						border: "1px solid rgba(99, 102, 241, 0.3)",
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						boxShadow: isPlaying ? "0 0 50px rgba(99, 102, 241, 0.3), inset 0 0 30px rgba(99, 102, 241, 0.2)" : "0 0 20px rgba(0, 0, 0, 0.5)",
						transition: "all 0.5s ease"
					},
					children: /* @__PURE__ */ jsx("div", {
						style: {
							display: "flex",
							alignItems: "center",
							gap: "4px",
							height: "70px"
						},
						children: [
							18,
							35,
							52,
							28,
							45,
							60,
							38,
							22,
							48,
							32,
							58,
							26,
							40,
							15
						].map((baseHeight, idx) => {
							const activeHeight = isPlaying ? `${Math.max(12, baseHeight * (.4 + idx % 5 * .15))}px` : "8px";
							return /* @__PURE__ */ jsx("div", { style: {
								width: "4px",
								height: activeHeight,
								background: "linear-gradient(to top, #6366f1, #a855f7)",
								borderRadius: "3px",
								transition: "height 0.15s ease",
								opacity: isPlaying ? .9 : .4
							} }, idx);
						})
					})
				}),
				/* @__PURE__ */ jsxs("div", {
					style: { textAlign: "center" },
					children: [/* @__PURE__ */ jsx("h2", {
						style: {
							fontSize: "1.25rem",
							fontWeight: 600,
							margin: 0,
							color: "#f8fafc",
							letterSpacing: "-0.01em",
							maxWidth: "460px",
							overflow: "hidden",
							textOverflow: "ellipsis",
							whiteSpace: "nowrap"
						},
						children: item.name
					}), /* @__PURE__ */ jsxs("div", {
						style: {
							display: "flex",
							alignItems: "center",
							justifyContent: "center",
							gap: "0.5rem",
							marginTop: "0.5rem",
							fontSize: "0.75rem",
							color: "#94a3b8"
						},
						children: [
							/* @__PURE__ */ jsx("span", {
								style: {
									textTransform: "uppercase",
									background: "rgba(255, 255, 255, 0.08)",
									padding: "2px 6px",
									borderRadius: "4px",
									fontFamily: "monospace",
									color: "#cbd5e1"
								},
								children: item.extension
							}),
							/* @__PURE__ */ jsx("span", { children: "•" }),
							/* @__PURE__ */ jsx("span", { children: formatSize(item.size) }),
							/* @__PURE__ */ jsx("span", { children: "•" }),
							/* @__PURE__ */ jsx("span", { children: formatTime(duration) })
						]
					})]
				}),
				/* @__PURE__ */ jsxs("div", {
					style: { width: "100%" },
					children: [/* @__PURE__ */ jsxs("div", {
						ref: progressBarRef,
						onMouseDown: handleProgressMouseDown,
						onMouseMove: handleProgressMouseMove,
						onMouseLeave: () => setHoverTime(null),
						style: {
							position: "relative",
							width: "100%",
							height: "12px",
							cursor: "pointer",
							display: "flex",
							alignItems: "center"
						},
						children: [
							/* @__PURE__ */ jsx("div", {
								style: {
									width: "100%",
									height: "4px",
									background: "rgba(255, 255, 255, 0.15)",
									borderRadius: "2px",
									overflow: "hidden",
									position: "relative"
								},
								children: /* @__PURE__ */ jsx("div", { style: {
									width: `${progressPercent}%`,
									height: "100%",
									background: "linear-gradient(90deg, #6366f1, #a855f7)"
								} })
							}),
							/* @__PURE__ */ jsx("div", { style: {
								position: "absolute",
								left: `${progressPercent}%`,
								width: "12px",
								height: "12px",
								borderRadius: "50%",
								background: "#ffffff",
								boxShadow: "0 0 8px rgba(99, 102, 241, 0.8)",
								transform: "translateX(-50%)",
								pointerEvents: "none"
							} }),
							hoverTime !== null && /* @__PURE__ */ jsx("div", {
								style: {
									position: "absolute",
									left: `${hoverTime / duration * 100}%`,
									bottom: "20px",
									transform: "translateX(-50%)",
									background: "rgba(0, 0, 0, 0.8)",
									padding: "2px 6px",
									borderRadius: "4px",
									fontSize: "0.7rem",
									color: "#cbd5e1",
									pointerEvents: "none"
								},
								children: formatTime(hoverTime)
							})
						]
					}), /* @__PURE__ */ jsxs("div", {
						style: {
							display: "flex",
							justifyContent: "space-between",
							fontSize: "0.75rem",
							color: "#94a3b8",
							marginTop: "4px",
							fontFamily: "monospace"
						},
						children: [/* @__PURE__ */ jsx("span", { children: formatTime(currentTime) }), /* @__PURE__ */ jsx("span", { children: formatTime(duration) })]
					})]
				}),
				/* @__PURE__ */ jsxs("div", {
					style: {
						display: "flex",
						alignItems: "center",
						justifyContent: "space-between",
						width: "100%",
						gap: "1rem"
					},
					children: [
						/* @__PURE__ */ jsxs("div", {
							style: {
								display: "flex",
								alignItems: "center",
								gap: "0.5rem"
							},
							children: [/* @__PURE__ */ jsxs("button", {
								onClick: cyclePlaybackRate,
								style: {
									background: playbackRate !== 1 ? "rgba(99, 102, 241, 0.2)" : "rgba(255, 255, 255, 0.06)",
									border: "1px solid rgba(255, 255, 255, 0.1)",
									color: playbackRate !== 1 ? "#a5b4fc" : "#cbd5e1",
									padding: "4px 8px",
									borderRadius: "6px",
									cursor: "pointer",
									fontSize: "0.75rem",
									fontFamily: "monospace"
								},
								title: "Playback Speed",
								children: [playbackRate, "x"]
							}), /* @__PURE__ */ jsx("button", {
								onClick: toggleLoop,
								style: {
									background: isLooping ? "rgba(99, 102, 241, 0.2)" : "rgba(255, 255, 255, 0.06)",
									border: "1px solid rgba(255, 255, 255, 0.1)",
									color: isLooping ? "#a5b4fc" : "#cbd5e1",
									padding: "4px 8px",
									borderRadius: "6px",
									cursor: "pointer",
									fontSize: "0.75rem"
								},
								title: "Toggle Loop",
								children: "Loop"
							})]
						}),
						/* @__PURE__ */ jsxs("div", {
							style: {
								display: "flex",
								alignItems: "center",
								gap: "1rem"
							},
							children: [
								/* @__PURE__ */ jsx("button", {
									onClick: () => skipSeconds(-10),
									style: {
										background: "transparent",
										border: "none",
										color: "#94a3b8",
										cursor: "pointer",
										fontSize: "0.85rem"
									},
									title: "Skip back 10s",
									children: "-10s"
								}),
								/* @__PURE__ */ jsx("button", {
									onClick: togglePlay,
									style: {
										width: "48px",
										height: "48px",
										borderRadius: "50%",
										background: "#6366f1",
										color: "#ffffff",
										border: "none",
										cursor: "pointer",
										display: "flex",
										alignItems: "center",
										justifyContent: "center",
										fontSize: "1.2rem",
										boxShadow: "0 4px 14px rgba(99, 102, 241, 0.4)"
									},
									title: isPlaying ? "Pause (Space)" : "Play (Space)",
									children: isPlaying ? "❚❚" : "▶"
								}),
								/* @__PURE__ */ jsx("button", {
									onClick: () => skipSeconds(10),
									style: {
										background: "transparent",
										border: "none",
										color: "#94a3b8",
										cursor: "pointer",
										fontSize: "0.85rem"
									},
									title: "Skip forward 10s",
									children: "+10s"
								})
							]
						}),
						/* @__PURE__ */ jsxs("div", {
							style: {
								display: "flex",
								alignItems: "center",
								gap: "0.4rem"
							},
							children: [/* @__PURE__ */ jsx("button", {
								onClick: toggleMute,
								style: {
									background: "transparent",
									border: "none",
									color: isMuted ? "#f87171" : "#cbd5e1",
									cursor: "pointer",
									fontSize: "0.85rem"
								},
								title: isMuted ? "Unmute" : "Mute",
								children: isMuted || volume === 0 ? "🔇" : "🔊"
							}), /* @__PURE__ */ jsx("input", {
								type: "range",
								min: "0",
								max: "1",
								step: "0.05",
								value: isMuted ? 0 : volume,
								onChange: (e) => handleVolumeChange(parseFloat(e.target.value)),
								style: {
									width: "60px",
									height: "4px",
									accentColor: "#6366f1",
									cursor: "pointer"
								}
							})]
						})
					]
				}),
				/* @__PURE__ */ jsxs("div", {
					style: {
						display: "flex",
						gap: "0.5rem",
						marginTop: "0.5rem"
					},
					children: [/* @__PURE__ */ jsx("button", {
						onClick: () => api.openWithDefaultApp(),
						style: {
							background: "rgba(255, 255, 255, 0.06)",
							border: "1px solid rgba(255, 255, 255, 0.1)",
							color: "#cbd5e1",
							padding: "4px 10px",
							borderRadius: "6px",
							cursor: "pointer",
							fontSize: "0.75rem"
						},
						children: "Open in Player"
					}), /* @__PURE__ */ jsx("button", {
						onClick: () => api.revealInFinder(),
						style: {
							background: "rgba(255, 255, 255, 0.06)",
							border: "1px solid rgba(255, 255, 255, 0.1)",
							color: "#cbd5e1",
							padding: "4px 10px",
							borderRadius: "6px",
							cursor: "pointer",
							fontSize: "0.75rem"
						},
						children: "Reveal"
					})]
				})
			]
		})]
	});
}
function AudioInspectorPreview({ item, api }) {
	const audioRef = useRef(null);
	const [isPlaying, setIsPlaying] = useState(false);
	const [currentTime, setCurrentTime] = useState(0);
	const [duration, setDuration] = useState(0);
	const fileHandle = api.getOriginalFile();
	useEffect(() => {
		const audio = audioRef.current;
		if (!audio) return;
		const onPlay = () => setIsPlaying(true);
		const onPause = () => setIsPlaying(false);
		const onTimeUpdate = () => setCurrentTime(audio.currentTime);
		const onLoadedMetadata = () => setDuration(audio.duration || 0);
		audio.addEventListener("play", onPlay);
		audio.addEventListener("pause", onPause);
		audio.addEventListener("timeupdate", onTimeUpdate);
		audio.addEventListener("loadedmetadata", onLoadedMetadata);
		return () => {
			audio.removeEventListener("play", onPlay);
			audio.removeEventListener("pause", onPause);
			audio.removeEventListener("timeupdate", onTimeUpdate);
			audio.removeEventListener("loadedmetadata", onLoadedMetadata);
		};
	}, []);
	const togglePlay = () => {
		const audio = audioRef.current;
		if (!audio) return;
		if (audio.paused) audio.play().catch(() => {});
		else audio.pause();
	};
	const progressPercent = duration > 0 ? currentTime / duration * 100 : 0;
	return /* @__PURE__ */ jsxs("div", {
		style: {
			padding: "0.85rem",
			background: "rgba(255, 255, 255, 0.02)",
			borderRadius: "8px",
			border: "1px solid rgba(255, 255, 255, 0.08)",
			fontSize: "0.8rem"
		},
		children: [
			/* @__PURE__ */ jsx("audio", {
				ref: audioRef,
				src: fileHandle.url,
				preload: "metadata"
			}),
			/* @__PURE__ */ jsxs("div", {
				style: {
					display: "flex",
					alignItems: "center",
					justifyContent: "space-between",
					marginBottom: "0.6rem"
				},
				children: [/* @__PURE__ */ jsx("span", {
					style: {
						fontWeight: 600,
						textTransform: "uppercase",
						fontSize: "0.7rem",
						color: "#a855f7",
						letterSpacing: "0.05em"
					},
					children: "Audio Track"
				}), /* @__PURE__ */ jsx("span", {
					style: {
						textTransform: "uppercase",
						fontSize: "0.7rem",
						color: "#94a3b8",
						background: "rgba(255, 255, 255, 0.06)",
						padding: "1px 5px",
						borderRadius: "3px",
						fontFamily: "monospace"
					},
					children: item.extension
				})]
			}),
			/* @__PURE__ */ jsxs("div", {
				style: {
					display: "flex",
					alignItems: "center",
					gap: "0.75rem",
					padding: "0.5rem 0"
				},
				children: [/* @__PURE__ */ jsx("button", {
					onClick: togglePlay,
					style: {
						width: "36px",
						height: "36px",
						borderRadius: "50%",
						background: "#6366f1",
						color: "#ffffff",
						border: "none",
						cursor: "pointer",
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						fontSize: "0.9rem",
						flexShrink: 0
					},
					children: isPlaying ? "❚❚" : "▶"
				}), /* @__PURE__ */ jsxs("div", {
					style: {
						flex: 1,
						minWidth: 0
					},
					children: [/* @__PURE__ */ jsx("div", {
						style: {
							fontWeight: 500,
							color: "#f8fafc",
							fontSize: "0.85rem",
							whiteSpace: "nowrap",
							overflow: "hidden",
							textOverflow: "ellipsis"
						},
						children: item.name
					}), /* @__PURE__ */ jsxs("div", {
						style: {
							fontSize: "0.7rem",
							color: "#94a3b8",
							fontFamily: "monospace",
							marginTop: "2px"
						},
						children: [
							formatTime(currentTime),
							" / ",
							formatTime(duration)
						]
					})]
				})]
			}),
			/* @__PURE__ */ jsx("div", {
				style: {
					width: "100%",
					height: "4px",
					background: "rgba(255, 255, 255, 0.1)",
					borderRadius: "2px",
					overflow: "hidden",
					marginTop: "0.4rem"
				},
				children: /* @__PURE__ */ jsx("div", { style: {
					width: `${progressPercent}%`,
					height: "100%",
					background: "#6366f1"
				} })
			}),
			/* @__PURE__ */ jsxs("div", {
				style: {
					display: "flex",
					gap: "0.5rem",
					marginTop: "0.75rem"
				},
				children: [/* @__PURE__ */ jsx("button", {
					onClick: () => api.openWithDefaultApp(),
					style: {
						flex: 1,
						padding: "0.35rem 0.5rem",
						background: "rgba(255, 255, 255, 0.06)",
						border: "1px solid rgba(255, 255, 255, 0.1)",
						borderRadius: "5px",
						color: "#e2e8f0",
						fontSize: "0.75rem",
						cursor: "pointer"
					},
					children: "Open"
				}), /* @__PURE__ */ jsx("button", {
					onClick: () => api.revealInFinder(),
					style: {
						flex: 1,
						padding: "0.35rem 0.5rem",
						background: "rgba(255, 255, 255, 0.06)",
						border: "1px solid rgba(255, 255, 255, 0.1)",
						borderRadius: "5px",
						color: "#e2e8f0",
						fontSize: "0.75rem",
						cursor: "pointer"
					},
					children: "Reveal"
				})]
			})
		]
	});
}
var audioPlayerPlugin = definePlugin({
	id: "official.audio-player",
	name: "Audio Player",
	version: "1.0.0",
	description: "Audio player with waveform/progress scrubber, volume control, loop, and playback rate",
	author: "Bowerbird Team",
	kind: "preview",
	priority: 60,
	extensions: [
		"mp3",
		"wav",
		"ogg",
		"flac",
		"m4a",
		"aac",
		"webm"
	],
	mimePrefixes: ["audio/"],
	supportsZoom: false,
	Viewport: AudioViewport,
	InspectorPreview: AudioInspectorPreview
});
//#endregion
export { audioPlayerPlugin as default, audioPlayerPlugin as plugin };
