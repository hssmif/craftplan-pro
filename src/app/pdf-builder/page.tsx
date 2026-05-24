"use client";

import { useState, useRef, useEffect } from "react";
import {
  type MockupImage,
  MOCKUP_SCENE_CONFIGS,
  AI_MOCKUP_SCENES,
  PDF_PAGE_SELECTIONS,
  renderPdfPages,
  compositeMockup,
  runWithConcurrency,
} from "@/lib/pdf-mockup-utils";
import { DESIGN_STYLE_OPTIONS } from "@/lib/pdf-design-styles";

const PLANNER_TYPES = [
  { id: "daily", name: "Daily Planner", icon: "📅", desc: "30-day daily planner with hourly schedule, priorities, notes & habit tracker", pages: "31 pages", badge: "Best Seller" },
  { id: "weekly", name: "Weekly Planner", icon: "📆", desc: "12-week planner with goals, meal plan & budget sections", pages: "14 pages", badge: null },
  { id: "monthly", name: "Monthly Planner", icon: "🗓️", desc: "12-month calendar grid with goals & habit tracking", pages: "14 pages", badge: null },
  { id: "budget", name: "Budget Planner", icon: "💰", desc: "Monthly income/expenses tracker with savings goals & annual summary", pages: "16 pages", badge: "Popular" },
  { id: "fitness", name: "Fitness Planner", icon: "💪", desc: "Workout logs, body measurements & personal records", pages: "18 pages", badge: null },
  { id: "self_care", name: "Self-Care Planner", icon: "🧘", desc: "Mood tracker, gratitude, affirmations & self-care activities", pages: "16 pages", badge: null },
  { id: "business", name: "Business Planner", icon: "📊", desc: "Revenue goals, client tracker & monthly P&L", pages: "16 pages", badge: null },
  { id: "student", name: "Student Planner", icon: "🎓", desc: "Class schedule, assignments, exam prep & GPA calculator", pages: "16 pages", badge: null },
];

const COLOR_SCHEMES = [
  { id: "sage-green", name: "Sage Green", colors: ["#7C9A7E", "#B5C9B7", "#E8F0E8"], desc: "Nature-inspired calm" },
  { id: "dusty-rose", name: "Dusty Rose", colors: ["#C4847A", "#E8B4AE", "#F5E6E4"], desc: "Soft & feminine" },
  { id: "navy-gold", name: "Navy & Gold", colors: ["#1B3A5C", "#4A6FA5", "#C9A84C"], desc: "Professional & elegant" },
  { id: "minimal-black", name: "Minimal Black", colors: ["#1A1A1A", "#555555", "#F5F5F5"], desc: "Clean & modern" },
  { id: "lavender", name: "Lavender", colors: ["#7B68B0", "#B0A3D4", "#EDE9F6"], desc: "Calming purple tones" },
];

const MUSIC_TRACKS = [
  { id: "none", name: "No Music", icon: "🔇", desc: "Silent video" },
  { id: "ambient-soft", name: "Ambient Soft", icon: "🎵", desc: "Soft ambient pad", url: "/audio/ambient-soft.mp3" },
  { id: "lofi-calm", name: "Lo-Fi Calm", icon: "🎶", desc: "Lo-fi chill beat", url: "/audio/lofi-calm.mp3" },
  { id: "piano-gentle", name: "Piano Gentle", icon: "🎹", desc: "Gentle piano melody", url: "/audio/piano-gentle.mp3" },
  { id: "nature-calm", name: "Nature Calm", icon: "🌿", desc: "Nature + soft music", url: "/audio/nature-calm.mp3" },
  { id: "corporate-light", name: "Corporate", icon: "💼", desc: "Light corporate bg", url: "/audio/corporate-light.mp3" },
];

export default function PDFBuilderPage() {
  const [selectedType, setSelectedType] = useState("");
  const [selectedScheme, setSelectedScheme] = useState("sage-green");
  const [selectedStyle, setSelectedStyle] = useState("modern-minimal");
  const [generating, setGenerating] = useState(false);
  const [downloadReady, setDownloadReady] = useState(false);
  const [error, setError] = useState("");
  const [etsyListing, setEtsyListing] = useState<{ title: string; tags: string[]; description: string; price: { recommended: number } } | null>(null);
  const [etsyLoading, setEtsyLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"download" | "etsy" | "mockups" | "video">("download");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // Mockup state
  const [mockupImages, setMockupImages] = useState<MockupImage[]>([]);
  const [mockupGenerating, setMockupGenerating] = useState(false);
  const [mockupMode, setMockupMode] = useState<"ai" | "device">("ai");

  // Video state
  const [videoGenerating, setVideoGenerating] = useState(false);
  const [videoProgress, setVideoProgress] = useState(0);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [selectedMusic, setSelectedMusic] = useState("ambient-soft");

  // Etsy publish state
  const [etsyConnected, setEtsyConnected] = useState(false);
  const [etsyPublishing, setEtsyPublishing] = useState(false);
  const [etsyPublishStatus, setEtsyPublishStatus] = useState("");
  const [etsyPublishResult, setEtsyPublishResult] = useState<{ listingId: number; url: string; status: string } | null>(null);

  // Keep PDF blob for mockup rendering
  const pdfBlobRef = useRef<Blob | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Check Etsy connection on mount
  useEffect(() => {
    fetch("/api/etsy/status")
      .then((r) => r.json())
      .then((data) => setEtsyConnected(!!data.connected))
      .catch(() => setEtsyConnected(false));
  }, []);

  async function handleGenerate() {
    if (!selectedType) return;
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
    setGenerating(true);
    setError("");
    setDownloadReady(false);
    setEtsyListing(null);
    setMockupImages([]);
    setVideoUrl(null);
    pdfBlobRef.current = null;

    try {
      const res = await fetch("/api/pdf/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plannerType: selectedType, colorScheme: selectedScheme, designStyle: selectedStyle }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to generate PDF");
      }

      const blob = await res.blob();
      pdfBlobRef.current = blob;

      // Create preview URL
      const url = URL.createObjectURL(blob);
      setPreviewUrl(url);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${selectedType}-planner-${selectedScheme}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setDownloadReady(true);

      // Auto-generate Etsy listing + mockups (AI by default)
      generateEtsyListing();
      if (mockupMode === "ai") {
        generateAIMockups();
      } else {
        generateMockups(blob);
      }
    } catch (err: unknown) {
      setError(String(err));
    } finally {
      setGenerating(false);
    }
  }

  async function generateEtsyListing() {
    setEtsyLoading(true);
    try {
      const plannerMeta = PLANNER_TYPES.find((p) => p.id === selectedType);
      const schemeMeta = COLOR_SCHEMES.find((s) => s.id === selectedScheme);
      const res = await fetch("/api/etsy/generate-listing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateType: selectedType + "_planner",
          features: [plannerMeta?.desc || "", `${plannerMeta?.pages} PDF`, "Print-ready A4", "Instant download"],
          targetAudience: "Women 25-45 who want to organize their life",
          aesthetic: schemeMeta?.name || "Sage Green",
          complexity: "medium",
          niche: "PDF planner, printable planner, digital download",
          productFormat: "PDF Planner — instant download, printable, A4/Letter size",
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setEtsyListing(data);
        setActiveTab("etsy");
      }
    } catch {
      // Etsy listing is optional, don't block
    } finally {
      setEtsyLoading(false);
    }
  }

  async function generateMockups(blob?: Blob) {
    const pdfBlob = blob || pdfBlobRef.current;
    if (!pdfBlob || !selectedType) return;

    setMockupGenerating(true);

    // Initialize mockup slots
    const initialMockups: MockupImage[] = MOCKUP_SCENE_CONFIGS.map((cfg) => ({
      id: cfg.id,
      label: cfg.label,
      badge: cfg.badge,
      badgeColor: cfg.badgeColor,
      imageData: null,
      status: "pending",
    }));
    setMockupImages(initialMockups);

    try {
      // Get page selection for this planner type
      const sel = PDF_PAGE_SELECTIONS[selectedType] || PDF_PAGE_SELECTIONS.daily;
      const pageNumbers = sel.pages;

      // Render PDF pages to images
      const pageImages = await renderPdfPages(pdfBlob, pageNumbers, 2);

      // Composite each scene
      const tasks = MOCKUP_SCENE_CONFIGS.map((cfg, idx) => () => {
        // Mark as generating
        setMockupImages((prev) =>
          prev.map((m, i) => (i === idx ? { ...m, status: "generating" as const } : m))
        );

        const pageImg = pageImages[cfg.pageIndex] || pageImages[0];
        if (!pageImg) {
          return Promise.resolve({ idx, imageData: null, error: "No page image" });
        }
        return compositeMockup(pageImg, cfg.device)
          .then((imageData) => ({ idx, imageData, error: null }))
          .catch((err) => ({ idx, imageData: null, error: String(err) }));
      });

      await runWithConcurrency(tasks, 2, (index, result) => {
        setMockupImages((prev) =>
          prev.map((m, i) =>
            i === index
              ? {
                  ...m,
                  imageData: result.imageData,
                  status: result.error ? "error" : "loaded",
                  errorMsg: result.error || undefined,
                }
              : m
          )
        );
      });

      setActiveTab("mockups");
    } catch (err) {
      console.error("Mockup generation error:", err);
    } finally {
      setMockupGenerating(false);
    }
  }

  async function generateAIMockups() {
    if (!selectedType) return;

    // Cancel any in-flight requests
    if (abortControllerRef.current) abortControllerRef.current.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setMockupGenerating(true);
    const plannerMeta = PLANNER_TYPES.find((p) => p.id === selectedType);
    const schemeMeta = COLOR_SCHEMES.find((s) => s.id === selectedScheme);
    const styleMeta = DESIGN_STYLE_OPTIONS.find((s) => s.id === selectedStyle);
    const plannerName = plannerMeta?.name || "PDF Planner";
    const colorName = schemeMeta?.name || "Sage Green";
    const styleName = styleMeta?.name || "Modern Minimal";

    const initialMockups: MockupImage[] = AI_MOCKUP_SCENES.map((scene) => ({
      id: scene.id,
      label: scene.label,
      badge: scene.badge,
      badgeColor: scene.badgeColor,
      imageData: null,
      status: "pending",
    }));
    setMockupImages(initialMockups);

    const tasks = AI_MOCKUP_SCENES.map((scene, i) => async () => {
      setMockupImages((prev) =>
        prev.map((m, idx) => (idx === i ? { ...m, status: "generating" as const } : m))
      );

      const prompt = scene.prompt(plannerName, colorName, styleName);
      try {
        const resp = await fetch("/api/ai/image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt,
            provider: "pollinations",
            width: 1920,
            height: 1080,
            model: "flux",
            seed: Math.floor(Math.random() * 2147483647),
            enhance: true,
          }),
          signal: controller.signal,
        });

        if (!resp.ok) {
          const errData = await resp.json().catch(() => ({ error: "Unknown error" }));
          return { imageData: null as string | null, error: errData.error || `HTTP ${resp.status}` };
        }

        const data = await resp.json();
        if (data.image) {
          const mimeType = data.mimeType || "image/jpeg";
          const dataUrl = `data:${mimeType};base64,${data.image}`;
          return { imageData: dataUrl as string | null, error: undefined as string | undefined };
        }
        return { imageData: null as string | null, error: "No image in response" };
      } catch (err: unknown) {
        if (err instanceof Error && err.name === "AbortError") {
          return { imageData: null as string | null, error: "Cancelled" };
        }
        return { imageData: null as string | null, error: String(err) };
      }
    });

    await runWithConcurrency(tasks, 2, (index, result) => {
      setMockupImages((prev) =>
        prev.map((m, idx) =>
          idx === index
            ? {
                ...m,
                imageData: result.imageData,
                status: result.imageData ? ("loaded" as const) : ("error" as const),
                errorMsg: result.error || undefined,
              }
            : m
        )
      );
    });

    setMockupGenerating(false);
    setActiveTab("mockups");
  }

  async function retryAIMockup(index: number) {
    const scene = AI_MOCKUP_SCENES[index];
    if (!scene) return;
    const plannerMeta = PLANNER_TYPES.find((p) => p.id === selectedType);
    const schemeMeta = COLOR_SCHEMES.find((s) => s.id === selectedScheme);
    const styleMeta = DESIGN_STYLE_OPTIONS.find((s) => s.id === selectedStyle);

    setMockupImages((prev) =>
      prev.map((m, i) =>
        i === index ? { ...m, status: "generating" as const, imageData: null, errorMsg: undefined } : m
      )
    );

    const prompt = scene.prompt(
      plannerMeta?.name || "PDF Planner",
      schemeMeta?.name || "Sage Green",
      styleMeta?.name || "Modern Minimal"
    );

    try {
      const resp = await fetch("/api/ai/image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          provider: "pollinations",
          width: 1920,
          height: 1080,
          model: "flux",
          seed: Math.floor(Math.random() * 2147483647),
          enhance: true,
        }),
      });

      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({ error: "Unknown error" }));
        setMockupImages((prev) =>
          prev.map((m, i) =>
            i === index ? { ...m, status: "error" as const, errorMsg: errData.error } : m
          )
        );
        return;
      }

      const data = await resp.json();
      if (data.image) {
        const mimeType = data.mimeType || "image/jpeg";
        const dataUrl = `data:${mimeType};base64,${data.image}`;
        setMockupImages((prev) =>
          prev.map((m, i) =>
            i === index ? { ...m, imageData: dataUrl, status: "loaded" as const } : m
          )
        );
      } else {
        setMockupImages((prev) =>
          prev.map((m, i) =>
            i === index ? { ...m, status: "error" as const, errorMsg: "No image in response" } : m
          )
        );
      }
    } catch (err) {
      setMockupImages((prev) =>
        prev.map((m, i) =>
          i === index ? { ...m, status: "error" as const, errorMsg: String(err) } : m
        )
      );
    }
  }

  async function generateVideo() {
    const loadedImgs = mockupImages.filter((img) => img.status === "loaded" && img.imageData);
    if (loadedImgs.length < 2) return;

    setVideoGenerating(true);
    setVideoProgress(0);
    setVideoUrl(null);

    try {
      const canvas = document.createElement("canvas");
      canvas.width = 1920;
      canvas.height = 1080;
      const ctx = canvas.getContext("2d")!;

      // Load all HTMLImageElements in parallel
      const images = await Promise.all(
        loadedImgs.map(
          (img) =>
            new Promise<HTMLImageElement>((resolve, reject) => {
              const el = new Image();
              el.onload = () => resolve(el);
              el.onerror = reject;
              el.src = img.imageData!;
            })
        )
      );

      // Setup audio if music is selected
      let audioCtx: AudioContext | null = null;
      let audioSource: AudioBufferSourceNode | null = null;
      let gainNode: GainNode | null = null;
      let audioDest: MediaStreamAudioDestinationNode | null = null;

      const musicTrack = MUSIC_TRACKS.find((t) => t.id === selectedMusic);
      if (musicTrack && musicTrack.url) {
        try {
          audioCtx = new AudioContext();
          const audioResp = await fetch(musicTrack.url);
          const audioArrayBuffer = await audioResp.arrayBuffer();
          const audioBuffer = await audioCtx.decodeAudioData(audioArrayBuffer);
          audioDest = audioCtx.createMediaStreamDestination();
          gainNode = audioCtx.createGain();
          gainNode.gain.setValueAtTime(0.5, audioCtx.currentTime);
          audioSource = audioCtx.createBufferSource();
          audioSource.buffer = audioBuffer;
          audioSource.loop = true;
          audioSource.connect(gainNode);
          gainNode.connect(audioDest);
          audioSource.start();
        } catch (err) {
          console.warn("Audio setup failed, continuing without music:", err);
          audioCtx = null;
        }
      }

      // Setup MediaRecorder with combined streams
      const videoStream = canvas.captureStream(30);
      let combinedStream: MediaStream;
      if (audioDest) {
        combinedStream = new MediaStream([
          ...videoStream.getVideoTracks(),
          ...audioDest.stream.getAudioTracks(),
        ]);
      } else {
        combinedStream = videoStream;
      }

      const codecStr = audioDest
        ? "video/webm;codecs=vp9,opus"
        : "video/webm;codecs=vp9";
      const mimeType =
        typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(codecStr)
          ? codecStr
          : "video/webm";
      const recorder = new MediaRecorder(combinedStream, { mimeType, videoBitsPerSecond: 8_000_000 });
      const chunks: BlobPart[] = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      const videoReady = new Promise<string>((resolve) => {
        recorder.onstop = () => {
          const blob = new Blob(chunks, { type: "video/webm" });
          resolve(URL.createObjectURL(blob));
        };
      });

      recorder.start(100);

      const FPS = 30;
      const HOLD_FRAMES = FPS * 3;
      const FADE_FRAMES = Math.round(FPS * 0.8);
      const totalFrames = images.length * (HOLD_FRAMES + FADE_FRAMES);
      let frameCount = 0;

      // Transition types
      const TRANSITIONS = ["crossfade", "slide-left", "zoom-in"];
      const plannerMeta = PLANNER_TYPES.find((p) => p.id === selectedType);

      // Helper: draw image with Ken Burns slow zoom
      function drawKenBurns(img: HTMLImageElement, progress: number) {
        const zoomScale = 1.0 + 0.05 * progress;
        const scaleX = (canvas.width / img.naturalWidth) * zoomScale;
        const scaleY = (canvas.height / img.naturalHeight) * zoomScale;
        const scale = Math.min(scaleX, scaleY);
        const dw = img.naturalWidth * scale;
        const dh = img.naturalHeight * scale;
        const dx = (canvas.width - dw) / 2;
        const dy = (canvas.height - dh) / 2;
        ctx.drawImage(img, dx, dy, dw, dh);
      }

      // Helper: draw text overlay on first slide
      function drawTextOverlay(imgIdx: number, fadeIn: number) {
        if (imgIdx !== 0) return;
        const alpha = Math.min(fadeIn, 1);
        if (alpha <= 0) return;

        // Title pill at bottom
        ctx.save();
        ctx.globalAlpha = alpha * 0.92;
        const pillW = 700;
        const pillH = 70;
        const pillX = (canvas.width - pillW) / 2;
        const pillY = canvas.height - 110;

        // Blurred dark pill
        ctx.fillStyle = "rgba(0,0,0,0.65)";
        ctx.beginPath();
        ctx.roundRect(pillX, pillY, pillW, pillH, 16);
        ctx.fill();

        ctx.globalAlpha = alpha;
        ctx.fillStyle = "#ffffff";
        ctx.textAlign = "center";
        ctx.font = "bold 22px Inter, system-ui, sans-serif";
        ctx.fillText(plannerMeta?.name || "PDF Planner", canvas.width / 2, pillY + 30);

        ctx.font = "14px Inter, system-ui, sans-serif";
        ctx.fillStyle = "rgba(255,255,255,0.7)";
        ctx.fillText("Digital PDF Planner · Instant Download · Print Ready", canvas.width / 2, pillY + 52);
        ctx.restore();
      }

      for (let imgIdx = 0; imgIdx < images.length; imgIdx++) {
        const nextIdx = (imgIdx + 1) % images.length;
        const transitionType = TRANSITIONS[imgIdx % TRANSITIONS.length];

        // Hold phase with Ken Burns
        for (let f = 0; f < HOLD_FRAMES; f++) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.fillStyle = "#0a0a0f";
          ctx.fillRect(0, 0, canvas.width, canvas.height);

          const progress = f / HOLD_FRAMES;
          drawKenBurns(images[imgIdx], progress);

          // Text overlay fade-in on first slide (first 30 frames)
          if (imgIdx === 0) {
            drawTextOverlay(0, Math.min(f / 20, 1));
          }

          // Slide counter pill
          ctx.fillStyle = "rgba(0,0,0,0.45)";
          ctx.beginPath();
          ctx.roundRect(canvas.width - 130, canvas.height - 52, 110, 34, 17);
          ctx.fill();
          ctx.fillStyle = "rgba(255,255,255,0.92)";
          ctx.font = "bold 15px Inter, sans-serif";
          ctx.textAlign = "center";
          ctx.fillText(`${imgIdx + 1} / ${images.length}`, canvas.width - 75, canvas.height - 29);

          frameCount++;
          if (frameCount % 10 === 0) {
            setVideoProgress(Math.round((frameCount / totalFrames) * 100));
          }
          await new Promise((r) => setTimeout(r, 1000 / FPS));
        }

        // Transition phase
        for (let f = 0; f < FADE_FRAMES; f++) {
          const t = f / FADE_FRAMES;
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.fillStyle = "#0a0a0f";
          ctx.fillRect(0, 0, canvas.width, canvas.height);

          if (transitionType === "slide-left") {
            // Slide left: current slides out left, next slides in from right
            const offsetCurrent = -canvas.width * t;
            const offsetNext = canvas.width * (1 - t);

            ctx.save();
            ctx.translate(offsetCurrent, 0);
            drawKenBurns(images[imgIdx], 1);
            ctx.restore();

            ctx.save();
            ctx.translate(offsetNext, 0);
            drawKenBurns(images[nextIdx], 0);
            ctx.restore();
          } else if (transitionType === "zoom-in") {
            // Zoom in: current zooms into center, next fades in
            const zoomProgress = 1 + t * 0.3;
            ctx.globalAlpha = 1 - t;
            ctx.save();
            ctx.translate(canvas.width / 2, canvas.height / 2);
            ctx.scale(zoomProgress, zoomProgress);
            ctx.translate(-canvas.width / 2, -canvas.height / 2);
            drawKenBurns(images[imgIdx], 1);
            ctx.restore();

            ctx.globalAlpha = t;
            drawKenBurns(images[nextIdx], 0);
            ctx.globalAlpha = 1;
          } else {
            // Crossfade (default)
            ctx.globalAlpha = 1 - t;
            drawKenBurns(images[imgIdx], 1);
            ctx.globalAlpha = t;
            drawKenBurns(images[nextIdx], 0);
            ctx.globalAlpha = 1;
          }

          frameCount++;
          if (frameCount % 5 === 0) {
            setVideoProgress(Math.round((frameCount / totalFrames) * 100));
          }
          await new Promise((r) => setTimeout(r, 1000 / FPS));
        }
      }

      // Fade out audio in the last second
      if (gainNode && audioCtx) {
        gainNode.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.8);
        await new Promise((r) => setTimeout(r, 800));
      }

      recorder.stop();

      // Cleanup audio
      if (audioSource) try { audioSource.stop(); } catch { /* ok */ }
      if (audioCtx) try { audioCtx.close(); } catch { /* ok */ }

      const url = await videoReady;
      setVideoUrl(url);
      setActiveTab("video");
    } catch (err) {
      console.error("Video generation error:", err);
    } finally {
      setVideoGenerating(false);
      setVideoProgress(100);
    }
  }

  async function publishToEtsy(asDraft: boolean) {
    if (!etsyListing || !pdfBlobRef.current) return;

    setEtsyPublishing(true);
    setEtsyPublishResult(null);

    try {
      setEtsyPublishStatus("Creating listing...");

      const formData = new FormData();
      formData.append("title", etsyListing.title);
      formData.append("description", etsyListing.description);
      formData.append("price", String(etsyListing.price?.recommended || 8.99));
      formData.append("tags", JSON.stringify(etsyListing.tags || []));
      formData.append("activate", String(!asDraft));
      formData.append("pdfFilename", `${selectedType}-planner-${selectedScheme}.pdf`);

      // Attach PDF
      setEtsyPublishStatus("Uploading PDF...");
      formData.append("pdf", pdfBlobRef.current, `${selectedType}-planner.pdf`);

      // Attach loaded mockup images
      const loadedMockups = mockupImages.filter((m) => m.status === "loaded" && m.imageData);
      for (let i = 0; i < Math.min(loadedMockups.length, 10); i++) {
        setEtsyPublishStatus(`Uploading image ${i + 1}/${Math.min(loadedMockups.length, 10)}...`);
        const dataUrl = loadedMockups[i].imageData!;
        const resp = await fetch(dataUrl);
        const blob = await resp.blob();
        formData.append(`mockup_${i}`, blob, `mockup-${i + 1}.png`);
      }

      setEtsyPublishStatus("Publishing to Etsy...");
      const res = await fetch("/api/etsy/publish-pdf", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to publish");
      }

      const result = await res.json();
      setEtsyPublishResult(result);
      setEtsyPublishStatus(asDraft ? "Saved as draft!" : "Published live!");
    } catch (err) {
      setEtsyPublishStatus(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setEtsyPublishing(false);
    }
  }

  function downloadMockup(img: MockupImage) {
    if (!img.imageData) return;
    const a = document.createElement("a");
    a.href = img.imageData;
    a.download = `${selectedType}-${img.id}-mockup.jpg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  function downloadAllMockups() {
    mockupImages
      .filter((m) => m.status === "loaded" && m.imageData)
      .forEach((img, i) => {
        setTimeout(() => downloadMockup(img), i * 300);
      });
  }

  function downloadVideo() {
    if (!videoUrl) return;
    const a = document.createElement("a");
    a.href = videoUrl;
    a.download = `${selectedType}-planner-showcase.webm`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  const loadedMockupCount = mockupImages.filter((m) => m.status === "loaded").length;

  return (
    <div className="p-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-rose-500 to-orange-500 flex items-center justify-center text-xl shadow-lg shadow-rose-500/20">
            📄
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">PDF Planner Generator</h1>
            <p className="text-[var(--text-secondary)] text-sm">Generate print-ready, premium PDF planners — instant Etsy products</p>
          </div>
        </div>
      </div>

      {/* Step 1: Choose Planner Type */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-4">
          <span className="w-6 h-6 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center text-xs font-bold border border-indigo-500/30">1</span>
          <h2 className="text-lg font-semibold text-white">Choose Planner Type</h2>
        </div>
        <div className="grid grid-cols-4 gap-3">
          {PLANNER_TYPES.map((type) => (
            <button
              key={type.id}
              onClick={() => setSelectedType(type.id)}
              className={`relative text-left p-4 rounded-xl border transition-all duration-200 group ${
                selectedType === type.id
                  ? "border-indigo-500/60 bg-indigo-950/30 shadow-lg shadow-indigo-500/10"
                  : "border-white/[0.08] bg-gradient-to-br from-[#0f0f1a]/80 to-[#161624] hover:border-white/[0.15] hover:bg-[var(--bg-hover)]"
              }`}
            >
              {type.badge && (
                <span className="absolute top-2 right-2 px-1.5 py-0.5 text-[9px] font-bold rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30">
                  {type.badge}
                </span>
              )}
              <span className="text-2xl block mb-2">{type.icon}</span>
              <p className="text-sm font-semibold text-white mb-1">{type.name}</p>
              <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">{type.desc}</p>
              <p className="text-[10px] text-[var(--text-muted)] mt-2 font-medium">{type.pages}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Step 2: Choose Color Scheme */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-4">
          <span className="w-6 h-6 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center text-xs font-bold border border-indigo-500/30">2</span>
          <h2 className="text-lg font-semibold text-white">Choose Color Scheme</h2>
        </div>
        <div className="grid grid-cols-5 gap-3">
          {COLOR_SCHEMES.map((scheme) => (
            <button
              key={scheme.id}
              onClick={() => setSelectedScheme(scheme.id)}
              className={`text-left p-4 rounded-xl border transition-all duration-200 ${
                selectedScheme === scheme.id
                  ? "border-indigo-500/60 bg-indigo-950/30"
                  : "border-white/[0.08] bg-[var(--bg-elevated)] hover:border-white/[0.15]"
              }`}
            >
              <div className="flex gap-1 mb-2">
                {scheme.colors.map((c, i) => (
                  <div key={i} className="w-6 h-6 rounded-full border border-white/10" style={{ backgroundColor: c }} />
                ))}
              </div>
              <p className="text-xs font-semibold text-white">{scheme.name}</p>
              <p className="text-[10px] text-[var(--text-muted)]">{scheme.desc}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Step 3: Choose Design Style */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-4">
          <span className="w-6 h-6 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center text-xs font-bold border border-indigo-500/30">3</span>
          <h2 className="text-lg font-semibold text-white">Choose Design Style</h2>
        </div>
        <div className="grid grid-cols-5 gap-3">
          {DESIGN_STYLE_OPTIONS.map((style) => (
            <button
              key={style.id}
              onClick={() => setSelectedStyle(style.id)}
              className={`relative text-left p-3 rounded-xl border transition-all duration-200 ${
                selectedStyle === style.id
                  ? "border-indigo-500/60 bg-indigo-950/30 shadow-lg shadow-indigo-500/10"
                  : "border-white/[0.08] bg-[var(--bg-elevated)] hover:border-white/[0.15]"
              }`}
            >
              {style.badge && (
                <span className="absolute top-1.5 right-1.5 px-1.5 py-0.5 text-[8px] font-bold rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30">
                  {style.badge}
                </span>
              )}
              <span className="text-lg block mb-1">{style.icon}</span>
              <p className="text-[11px] font-semibold text-white mb-0.5 leading-tight">{style.name}</p>
              <p className="text-[9px] text-[var(--text-muted)] leading-tight">{style.desc}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Generate Button */}
      <div className="mb-8">
        <button
          onClick={handleGenerate}
          disabled={!selectedType || generating}
          className={`relative w-full py-4 rounded-xl text-white font-bold text-base transition-all duration-300 ${
            !selectedType || generating
              ? "bg-white/[0.06] text-[var(--text-muted)] cursor-not-allowed"
              : "bg-gradient-to-r from-rose-600 to-orange-600 hover:from-rose-500 hover:to-orange-500 shadow-lg shadow-rose-500/20"
          }`}
        >
          {generating ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
              Generating PDF...
            </span>
          ) : (
            <>📄 Generate & Download PDF Planner</>
          )}
          {!generating && selectedType && (
            <div className="absolute inset-0 rounded-xl overflow-hidden">
              <div className="shimmer-hover absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent" />
            </div>
          )}
        </button>
        {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
      </div>

      {/* PDF Preview */}
      {previewUrl && (
        <div className="mb-8 bg-[var(--bg-elevated)] rounded-xl border border-white/[0.08] overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
            <div className="flex items-center gap-2">
              <span className="text-sm">👁️</span>
              <span className="text-xs font-semibold text-white">PDF Preview</span>
            </div>
            <button
              onClick={() => setPreviewUrl(null)}
              className="text-[var(--text-muted)] hover:text-white text-xs transition-colors"
            >
              Close
            </button>
          </div>
          <iframe
            src={previewUrl}
            className="w-full h-[600px] bg-white"
            title="PDF Preview"
          />
        </div>
      )}

      {/* Result Section */}
      {downloadReady && (
        <div className="bg-[var(--bg-elevated)] rounded-xl border border-white/[0.08] overflow-hidden">
          {/* Tabs */}
          <div className="flex border-b border-white/[0.06]">
            {([
              { key: "download" as const, label: "✅ Download" },
              { key: "etsy" as const, label: etsyLoading ? "⏳ Listing..." : "🏷️ Etsy Listing" },
              { key: "mockups" as const, label: mockupGenerating ? `⏳ Mockups...` : `🖼️ Mockups${loadedMockupCount ? ` (${loadedMockupCount})` : ""}` },
              { key: "video" as const, label: videoGenerating ? "⏳ Video..." : "🎬 Video" },
            ]).map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex-1 py-3 text-sm font-medium transition-colors ${
                  activeTab === tab.key ? "text-white border-b-2 border-indigo-500" : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="p-6">
            {/* Download Tab */}
            {activeTab === "download" && (
              <div className="text-center py-6">
                <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center text-3xl">
                  ✅
                </div>
                <h3 className="text-lg font-bold text-white mb-2">PDF Generated Successfully!</h3>
                <p className="text-sm text-[var(--text-secondary)] mb-4">
                  Your {PLANNER_TYPES.find((t) => t.id === selectedType)?.name} has been downloaded.
                </p>
                <div className="flex justify-center gap-3">
                  <button
                    onClick={handleGenerate}
                    className="px-4 py-2 bg-white/[0.06] border border-white/[0.08] rounded-lg text-sm text-[var(--text-secondary)] hover:bg-white/[0.1] transition-colors"
                  >
                    🔄 Regenerate
                  </button>
                  <button
                    onClick={() => !etsyListing && generateEtsyListing()}
                    className="px-4 py-2 bg-indigo-500/15 border border-indigo-500/25 rounded-lg text-sm text-indigo-400 hover:bg-indigo-500/25 transition-colors"
                  >
                    🏷️ Get Etsy Listing
                  </button>
                </div>
              </div>
            )}

            {/* Etsy Tab */}
            {activeTab === "etsy" && (
              <div>
                {etsyLoading ? (
                  <div className="text-center py-8">
                    <svg className="animate-spin h-8 w-8 mx-auto text-indigo-400 mb-3" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                    <p className="text-sm text-[var(--text-muted)]">Generating Etsy listing with AI...</p>
                  </div>
                ) : etsyListing ? (
                  <div className="space-y-4">
                    <div>
                      <label className="text-[10px] text-[var(--text-muted)] font-semibold uppercase tracking-wider">Title</label>
                      <p className="text-white font-medium mt-1">{etsyListing.title}</p>
                    </div>
                    <div>
                      <label className="text-[10px] text-[var(--text-muted)] font-semibold uppercase tracking-wider">Tags ({etsyListing.tags?.length || 0})</label>
                      <div className="flex flex-wrap gap-1.5 mt-1">
                        {etsyListing.tags?.map((tag, i) => (
                          <span key={i} className="px-2 py-0.5 text-[11px] rounded-full bg-white/[0.06] text-[var(--text-secondary)] border border-white/[0.06]">
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="text-[10px] text-[var(--text-muted)] font-semibold uppercase tracking-wider">Description</label>
                      <pre className="mt-1 text-sm text-[var(--text-secondary)] whitespace-pre-wrap font-sans leading-relaxed bg-[var(--bg-surface)] rounded-lg p-4 border border-white/[0.06] max-h-60 overflow-y-auto">
                        {etsyListing.description}
                      </pre>
                    </div>
                    <div>
                      <label className="text-[10px] text-[var(--text-muted)] font-semibold uppercase tracking-wider">Recommended Price</label>
                      <p className="text-2xl font-bold text-emerald-400 mt-1">${etsyListing.price?.recommended || "8.99"}</p>
                    </div>
                    <div className="flex gap-3">
                      <button
                        onClick={() => {
                          const text = `Title: ${etsyListing.title}\n\nTags: ${etsyListing.tags?.join(", ")}\n\nDescription:\n${etsyListing.description}\n\nPrice: $${etsyListing.price?.recommended}`;
                          navigator.clipboard.writeText(text);
                        }}
                        className="flex-1 py-2 bg-indigo-500/15 border border-indigo-500/25 rounded-lg text-sm text-indigo-400 hover:bg-indigo-500/25 transition-colors font-medium"
                      >
                        📋 Copy Listing
                      </button>
                    </div>

                    {/* Etsy Publish Section */}
                    <div className="mt-6 pt-6 border-t border-white/[0.06]">
                      <div className="flex items-center gap-2 mb-4">
                        <span className="text-base">🏪</span>
                        <h4 className="text-sm font-semibold text-white">Publish to Etsy</h4>
                        <span className={`px-2 py-0.5 text-[9px] font-bold rounded-full ${
                          etsyConnected
                            ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                            : "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                        }`}>
                          {etsyConnected ? "Connected" : "Not Connected"}
                        </span>
                      </div>

                      {!etsyConnected ? (
                        <div className="text-center py-4 bg-white/[0.02] rounded-lg border border-white/[0.06]">
                          <p className="text-sm text-[var(--text-muted)] mb-3">Connect your Etsy shop to publish directly</p>
                          <button
                            onClick={() => window.open("/api/etsy/auth", "_blank")}
                            className="px-4 py-2 bg-orange-500/15 border border-orange-500/25 rounded-lg text-sm text-orange-400 hover:bg-orange-500/25 transition-colors font-medium"
                          >
                            🔗 Connect Etsy Shop
                          </button>
                        </div>
                      ) : etsyPublishResult ? (
                        <div className="text-center py-4 bg-emerald-950/30 rounded-lg border border-emerald-500/20">
                          <span className="text-3xl block mb-2">✅</span>
                          <p className="text-sm font-semibold text-emerald-400 mb-1">
                            {etsyPublishResult.status === "active" ? "Published Live!" : "Saved as Draft!"}
                          </p>
                          <a
                            href={etsyPublishResult.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-indigo-400 hover:text-indigo-300 underline"
                          >
                            View on Etsy →
                          </a>
                        </div>
                      ) : etsyPublishing ? (
                        <div className="text-center py-4 bg-white/[0.02] rounded-lg border border-white/[0.06]">
                          <svg className="animate-spin h-6 w-6 mx-auto text-orange-400 mb-2" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                          <p className="text-xs text-[var(--text-muted)]">{etsyPublishStatus}</p>
                        </div>
                      ) : (
                        <div className="flex gap-3">
                          <button
                            onClick={() => publishToEtsy(true)}
                            disabled={!pdfBlobRef.current}
                            className="flex-1 py-2.5 bg-white/[0.06] border border-white/[0.08] rounded-lg text-sm text-[var(--text-secondary)] hover:bg-white/[0.1] transition-colors font-medium disabled:opacity-40"
                          >
                            📝 Save as Draft
                          </button>
                          <button
                            onClick={() => publishToEtsy(false)}
                            disabled={!pdfBlobRef.current}
                            className="flex-1 py-2.5 bg-orange-500/15 border border-orange-500/25 rounded-lg text-sm text-orange-400 hover:bg-orange-500/25 transition-colors font-medium disabled:opacity-40"
                          >
                            🚀 Publish Live
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-6">
                    <p className="text-[var(--text-muted)] text-sm">Generate a PDF first to get an Etsy listing</p>
                  </div>
                )}
              </div>
            )}

            {/* Mockups Tab */}
            {activeTab === "mockups" && (
              <div>
                {/* Mode Toggle */}
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-1 p-1 rounded-lg bg-white/[0.04] border border-white/[0.06]">
                    <button
                      onClick={() => setMockupMode("ai")}
                      className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                        mockupMode === "ai"
                          ? "bg-indigo-500/20 text-indigo-400 border border-indigo-500/30"
                          : "text-[var(--text-muted)] hover:text-white border border-transparent"
                      }`}
                    >
                      ✨ AI Lifestyle
                    </button>
                    <button
                      onClick={() => setMockupMode("device")}
                      className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                        mockupMode === "device"
                          ? "bg-indigo-500/20 text-indigo-400 border border-indigo-500/30"
                          : "text-[var(--text-muted)] hover:text-white border border-transparent"
                      }`}
                    >
                      📱 Device Frames
                    </button>
                  </div>
                  {mockupImages.length === 0 && (
                    <button
                      onClick={() => mockupMode === "ai" ? generateAIMockups() : generateMockups()}
                      disabled={mockupMode === "ai" ? !selectedType : !pdfBlobRef.current}
                      className="px-4 py-1.5 bg-indigo-500/15 border border-indigo-500/25 rounded-lg text-xs text-indigo-400 hover:bg-indigo-500/25 transition-colors font-medium disabled:opacity-40"
                    >
                      🖼️ Generate {mockupMode === "ai" ? "AI" : "Device"} Mockups
                    </button>
                  )}
                </div>

                {mockupImages.length === 0 ? (
                  <div className="text-center py-8">
                    <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-indigo-500/15 border border-indigo-500/25 flex items-center justify-center text-3xl">
                      {mockupMode === "ai" ? "✨" : "📱"}
                    </div>
                    <h3 className="text-base font-bold text-white mb-2">
                      {mockupMode === "ai" ? "AI Lifestyle Mockups" : "Device Frame Mockups"}
                    </h3>
                    <p className="text-sm text-[var(--text-muted)] mb-1">
                      {mockupMode === "ai"
                        ? "Generate 12 premium AI lifestyle mockup scenes"
                        : "Render PDF pages in realistic device frames"}
                    </p>
                    <p className="text-xs text-[var(--text-muted)]">
                      {mockupMode === "ai"
                        ? "Powered by Pollinations Flux — photorealistic product photography"
                        : "iPad, MacBook, iPhone frames with your actual PDF pages"}
                    </p>
                  </div>
                ) : (
                  <>
                    {/* Mockup Grid */}
                    <div className={`grid ${mockupMode === "ai" ? "grid-cols-3" : "grid-cols-2"} gap-4 mb-4`}>
                      {mockupImages.map((img, idx) => (
                        <div
                          key={img.id}
                          className="rounded-xl border border-white/[0.08] bg-[var(--bg-surface)] overflow-hidden group"
                        >
                          {/* Image area */}
                          <div className={`${mockupMode === "ai" ? "aspect-video" : "aspect-[4/3]"} relative bg-black/20`}>
                            {img.status === "pending" || img.status === "generating" ? (
                              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                                <svg className="animate-spin h-8 w-8 text-indigo-400" viewBox="0 0 24 24">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                </svg>
                                <span className="text-xs text-[var(--text-muted)]">
                                  {img.status === "generating" ? (mockupMode === "ai" ? "Generating AI image..." : "Compositing...") : "Queued..."}
                                </span>
                              </div>
                            ) : img.status === "error" ? (
                              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-red-400">
                                <span className="text-2xl">⚠️</span>
                                <span className="text-[10px] px-2 text-center">{img.errorMsg || "Failed"}</span>
                                {mockupMode === "ai" && (
                                  <button
                                    onClick={() => retryAIMockup(idx)}
                                    className="mt-1 px-3 py-1 text-[10px] bg-white/[0.06] rounded-md text-white hover:bg-white/[0.1] transition-colors"
                                  >
                                    Retry
                                  </button>
                                )}
                              </div>
                            ) : img.imageData ? (
                              <img
                                src={img.imageData}
                                alt={img.label}
                                className="w-full h-full object-cover bg-[#0a0a0f]"
                              />
                            ) : null}
                          </div>

                          {/* Label + actions */}
                          <div className="px-3 py-2 flex items-center justify-between">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className={`px-1.5 py-0.5 text-[8px] font-bold rounded-full border ${img.badgeColor}`}>
                                {img.badge}
                              </span>
                              <span className="text-[10px] text-[var(--text-secondary)] truncate">{img.label}</span>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              {mockupMode === "ai" && img.status === "error" && (
                                <button
                                  onClick={() => retryAIMockup(idx)}
                                  className="text-[10px] text-amber-400 hover:text-amber-300 font-medium transition-colors"
                                >
                                  Retry
                                </button>
                              )}
                              {img.status === "loaded" && (
                                <button
                                  onClick={() => downloadMockup(img)}
                                  className="text-[10px] text-indigo-400 hover:text-indigo-300 font-medium transition-colors"
                                >
                                  Download
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Actions bar */}
                    <div className="flex gap-3">
                      {loadedMockupCount > 0 && (
                        <button
                          onClick={downloadAllMockups}
                          className="flex-1 py-2.5 bg-indigo-500/15 border border-indigo-500/25 rounded-lg text-sm text-indigo-400 hover:bg-indigo-500/25 transition-colors font-medium"
                        >
                          📦 Download All Mockups ({loadedMockupCount})
                        </button>
                      )}
                      <button
                        onClick={() => mockupMode === "ai" ? generateAIMockups() : generateMockups()}
                        disabled={mockupGenerating}
                        className="px-4 py-2.5 bg-white/[0.06] border border-white/[0.08] rounded-lg text-sm text-[var(--text-secondary)] hover:bg-white/[0.1] transition-colors disabled:opacity-40"
                      >
                        🔄 Regenerate
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Video Tab */}
            {activeTab === "video" && (
              <div>
                {!videoUrl && !videoGenerating ? (
                  <div className="py-6">
                    <div className="text-center mb-6">
                      <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-violet-500/15 border border-violet-500/25 flex items-center justify-center text-3xl">
                        🎬
                      </div>
                      <h3 className="text-lg font-bold text-white mb-2">Create Etsy Listing Video</h3>
                      <p className="text-sm text-[var(--text-muted)]">
                        Generate a professional slideshow video with music, Ken Burns effect & varied transitions
                      </p>
                    </div>

                    {/* Music Picker */}
                    <div className="mb-6">
                      <label className="text-[10px] text-[var(--text-muted)] font-semibold uppercase tracking-wider mb-2 block">Background Music</label>
                      <div className="grid grid-cols-3 gap-2">
                        {MUSIC_TRACKS.map((track) => (
                          <button
                            key={track.id}
                            onClick={() => setSelectedMusic(track.id)}
                            className={`text-left p-3 rounded-lg border transition-all ${
                              selectedMusic === track.id
                                ? "border-violet-500/50 bg-violet-950/30"
                                : "border-white/[0.06] bg-white/[0.02] hover:border-white/[0.12]"
                            }`}
                          >
                            <span className="text-lg block mb-1">{track.icon}</span>
                            <p className="text-[11px] font-semibold text-white">{track.name}</p>
                            <p className="text-[9px] text-[var(--text-muted)]">{track.desc}</p>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="flex justify-center gap-3 mb-4">
                      <button
                        onClick={generateVideo}
                        disabled={loadedMockupCount < 2}
                        className={`px-6 py-2.5 rounded-lg text-sm font-medium transition-all ${
                          loadedMockupCount >= 2
                            ? "bg-gradient-to-r from-violet-600 to-purple-600 text-white hover:from-violet-500 hover:to-purple-500 shadow-lg shadow-violet-500/20"
                            : "bg-white/[0.06] text-[var(--text-muted)] cursor-not-allowed"
                        }`}
                      >
                        🎬 Generate Video {selectedMusic !== "none" ? "with Music" : ""}
                      </button>
                    </div>
                    {loadedMockupCount < 2 && (
                      <p className="text-xs text-amber-400/70 text-center">
                        Need at least 2 mockups to create a video. Go to the Mockups tab first.
                      </p>
                    )}
                    <div className="mt-4 flex justify-center gap-6 text-[11px] text-[var(--text-muted)]">
                      <span>1920 x 1080 HD</span>
                      <span>3s per slide</span>
                      <span>WebM format</span>
                      <span>Ken Burns + varied transitions</span>
                      {selectedMusic !== "none" && <span>🔊 {MUSIC_TRACKS.find((t) => t.id === selectedMusic)?.name}</span>}
                    </div>
                  </div>
                ) : videoGenerating ? (
                  <div className="text-center py-8">
                    <svg className="animate-spin h-10 w-10 mx-auto text-violet-400 mb-4" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    <h3 className="text-base font-bold text-white mb-3">Rendering Video...</h3>
                    <div className="max-w-xs mx-auto">
                      <div className="h-2 bg-white/[0.06] rounded-full overflow-hidden mb-2">
                        <div
                          className="h-full bg-gradient-to-r from-violet-500 to-purple-500 rounded-full transition-all duration-300"
                          style={{ width: `${videoProgress}%` }}
                        />
                      </div>
                      <p className="text-xs text-[var(--text-muted)]">{videoProgress}% complete</p>
                    </div>
                  </div>
                ) : videoUrl ? (
                  <div className="space-y-4">
                    <div className="rounded-xl overflow-hidden border border-white/[0.08] bg-black">
                      <video
                        src={videoUrl}
                        controls
                        autoPlay
                        loop
                        className="w-full"
                        style={{ maxHeight: 480 }}
                      />
                    </div>
                    <div className="flex gap-3">
                      <button
                        onClick={downloadVideo}
                        className="flex-1 py-2.5 bg-violet-500/15 border border-violet-500/25 rounded-lg text-sm text-violet-400 hover:bg-violet-500/25 transition-colors font-medium"
                      >
                        📥 Download Video
                      </button>
                      <button
                        onClick={generateVideo}
                        className="px-4 py-2.5 bg-white/[0.06] border border-white/[0.08] rounded-lg text-sm text-[var(--text-secondary)] hover:bg-white/[0.1] transition-colors"
                      >
                        🔄 Regenerate
                      </button>
                    </div>
                    <div className="flex gap-6 text-[11px] text-[var(--text-muted)] justify-center">
                      <span>{loadedMockupCount} slides</span>
                      <span>1920 x 1080</span>
                      <span>WebM/VP9</span>
                      <span>~{loadedMockupCount * 3.6}s duration</span>
                    </div>
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Info Cards */}
      {!downloadReady && (
        <div className="grid grid-cols-3 gap-4">
          <div className="p-4 rounded-xl bg-emerald-950/30 border border-emerald-500/20">
            <p className="text-emerald-400 font-semibold text-sm mb-1">💰 Avg Revenue</p>
            <p className="text-2xl font-bold text-emerald-400">$800-2K<span className="text-sm font-normal text-emerald-400/50">/mo</span></p>
            <p className="text-[11px] text-[var(--text-muted)] mt-1">PDF planners are #1 sellers on Etsy</p>
          </div>
          <div className="p-4 rounded-xl bg-blue-950/30 border border-blue-500/20">
            <p className="text-blue-400 font-semibold text-sm mb-1">📄 Output</p>
            <p className="text-white font-bold text-lg">Print-Ready PDF</p>
            <p className="text-[11px] text-[var(--text-muted)] mt-1">A4 size, instant download, ready to sell</p>
          </div>
          <div className="p-4 rounded-xl bg-violet-950/30 border border-violet-500/20">
            <p className="text-violet-400 font-semibold text-sm mb-1">🏷️ Includes</p>
            <p className="text-white font-bold text-lg">Etsy Listing</p>
            <p className="text-[11px] text-[var(--text-muted)] mt-1">Auto-generated title, tags & description</p>
          </div>
        </div>
      )}
    </div>
  );
}
