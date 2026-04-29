#!/usr/bin/env node
/**
 * to-capcut.mjs
 * capcut_project.json(레시피) → 실제 CapCut draft_content.json 변환 후
 * ~/Movies/CapCut/User Data/Projects/com.lveditor.draft/{slug}/ 에 배치
 *
 * Usage: node scripts/to-capcut.mjs <slug> [--shorts]
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync } from "node:fs";
import { join, resolve, dirname, basename, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import os from "node:os";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CAPCUT_DRAFTS = join(
  os.homedir(),
  "Movies/CapCut/User Data/Projects/com.lveditor.draft"
);

const slug = process.argv[2];
const isShorts = process.argv.includes("--shorts");

if (!slug) {
  console.error("Usage: node scripts/to-capcut.mjs <slug> [--shorts]");
  process.exit(1);
}

// 레시피 파일 경로
const stageDir = isShorts ? "S3-edit" : "06-edit-upload";
const recipeFile = isShorts ? "capcut_short.json" : "capcut_project.json";
const recipePath = join(REPO_ROOT, "projects", slug, stageDir, recipeFile);
if (!existsSync(recipePath)) {
  console.error(`레시피 파일 없음: ${recipePath}`);
  console.error(`먼저 ${isShorts ? "S3-edit" : "06-edit-upload"} 봇을 실행하세요.`);
  process.exit(1);
}

const recipe = JSON.parse(readFileSync(recipePath, "utf8"));
const projectRoot = join(REPO_ROOT, "projects", slug);
const now = Math.floor(Date.now() / 1000);
const projectId = randomUUID().toUpperCase();
const canvas = recipe.canvas || { width: 1920, height: 1080 };
const fps = recipe.fps || 30;

// ms → CapCut 단위(마이크로초)
const msToUs = (ms) => Math.round(ms * 1000);

// 절대경로 변환 + 실제 존재하는 확장자로 보정
const IMAGE_EXTS = [".jpg", ".jpeg", ".png", ".webp"];
function absPath(relPath) {
  if (!relPath) return relPath;
  // 절대경로면 그대로 사용
  if (relPath.startsWith("/")) {
    if (existsSync(relPath)) return relPath;
  }
  // 상대경로는 repo root 기준으로 해석
  const base = resolve(REPO_ROOT, relPath);
  if (existsSync(base)) return base;
  // 확장자가 다를 수 있으므로 탐색
  const noExt = base.replace(/\.[^.]+$/, "");
  for (const ext of IMAGE_EXTS) {
    const candidate = noExt + ext;
    if (existsSync(candidate)) return candidate;
  }
  return base;
}

// ---- 재료(materials) 구성 ----
const images = [];
const audios = [];
const texts = [];

const videoTrackSegments = [];
const audioVoiceSegments = [];
const audioBgmSegments = [];
const textTrackSegments = [];

// 비디오 클립 → image materials
const videoClips = recipe.tracks?.video?.[0]?.clips || recipe.scenes || [];
for (const clip of videoClips) {
  const matId = randomUUID().toUpperCase();
  const segId = randomUUID().toUpperCase();
  const startUs = msToUs(clip.start_ms ?? 0);
  const durUs = msToUs((clip.end_ms ?? clip.start_ms + 5000) - (clip.start_ms ?? 0));
  const assetAbs = absPath(clip.asset_path || clip.path || "");

  images.push({
    id: matId,
    type: "photo",
    path: assetAbs,
    name: basename(clip.asset_path || clip.id || "scene", extname(clip.asset_path || "")),
    duration: durUs,
    width: canvas.width,
    height: canvas.height,
    stable_id: matId,
    local_material_id: matId,
    source_platform: 0,
    roughcut_good_src_checked: 0,
    category_id: "",
    category_name: "",
    crop: { lower_left_x: 0, lower_left_y: 1, lower_right_x: 1, lower_right_y: 1, upper_left_x: 0, upper_left_y: 0, upper_right_x: 1, upper_right_y: 0 },
    crop_ratio: "free",
    matting: { flag: 0, has_use_quick_brush: false, has_use_quick_eraser: false, interactiveTime: [], path: "", strokes: [] },
  });

  videoTrackSegments.push({
    id: segId,
    material_id: matId,
    source_timerange: { start: 0, duration: durUs },
    target_timerange: { start: startUs, duration: durUs },
    render_timerange: { start: startUs, duration: durUs },
    desc: clip.id || "",
    state: 0,
    speed: 1,
    is_loop: false,
    is_tone_modify: false,
    reverse: false,
    intensifies_audio: false,
    cartoon: false,
    volume: 1,
    last_nonzero_volume: 1,
    clip: { scale: { x: 1, y: 1 }, rotation: 0, transform: { x: 0, y: 0 }, flip: { vertical: false, horizontal: false }, alpha: 1 },
    uniform_scale: { on: true, value: 1 },
    hdr_settings: { intensity: 1, mode: 1, nits: 1000 },
    enable_adjust: false,
    enable_color_curves: false,
    enable_lut: false,
    enable_smart_relight: false,
    extra_material_refs: [],
    group_id: "",
    render_index: 0,
    template_id: "",
    template_scene: "default",
    track_attribute: 0,
    track_render_index: 0,
    visible: true,
  });
}

// 오디오 클립 → audio materials
const audioVoiceClips = recipe.tracks?.audio?.[0]?.clips || [];
for (const clip of audioVoiceClips) {
  const matId = randomUUID().toUpperCase();
  const segId = randomUUID().toUpperCase();
  const startUs = msToUs(clip.start_ms ?? 0);
  const durUs = msToUs((clip.end_ms ?? clip.start_ms + 3000) - (clip.start_ms ?? 0));
  const assetAbs = absPath(clip.asset_path || clip.path || "");

  audios.push({
    id: matId,
    type: "extract_music",
    path: assetAbs,
    name: basename(clip.asset_path || "voice", extname(clip.asset_path || "")),
    duration: durUs,
    sample_rate: 44100,
    channel: 2,
    local_material_id: matId,
    source_platform: 0,
    team_id: "",
    is_ai_generate_content: false,
  });

  audioVoiceSegments.push({
    id: segId,
    material_id: matId,
    source_timerange: { start: 0, duration: durUs },
    target_timerange: { start: startUs, duration: durUs },
    render_timerange: { start: startUs, duration: durUs },
    desc: "",
    state: 0,
    speed: 1,
    volume: clip.volume ?? 1,
    last_nonzero_volume: 1,
    is_loop: false,
    reverse: false,
    intensifies_audio: false,
    clip: { scale: { x: 1, y: 1 }, rotation: 0, transform: { x: 0, y: 0 }, flip: { vertical: false, horizontal: false }, alpha: 1 },
    extra_material_refs: [],
    group_id: "",
    track_attribute: 0,
    track_render_index: 0,
    visible: true,
    render_index: 0,
  });
}

// BGM 클립
const bgmClips = recipe.tracks?.audio?.[1]?.clips || [];
for (const clip of bgmClips) {
  const matId = randomUUID().toUpperCase();
  const segId = randomUUID().toUpperCase();
  const startUs = msToUs(clip.start_ms ?? 0);
  const durUs = msToUs((clip.end_ms ?? clip.start_ms + 3000) - (clip.start_ms ?? 0));
  const assetAbs = absPath(clip.asset_path || clip.path || "");

  audios.push({
    id: matId,
    type: "extract_music",
    path: assetAbs,
    name: basename(clip.asset_path || "bgm", extname(clip.asset_path || "")),
    duration: durUs,
    sample_rate: 44100,
    channel: 2,
    local_material_id: matId,
    source_platform: 0,
    team_id: "",
    is_ai_generate_content: false,
  });

  audioBgmSegments.push({
    id: segId,
    material_id: matId,
    source_timerange: { start: 0, duration: durUs },
    target_timerange: { start: startUs, duration: durUs },
    render_timerange: { start: startUs, duration: durUs },
    desc: "",
    state: 0,
    speed: 1,
    volume: clip.volume ?? 0.2,
    last_nonzero_volume: 1,
    is_loop: false,
    reverse: false,
    intensifies_audio: false,
    clip: { scale: { x: 1, y: 1 }, rotation: 0, transform: { x: 0, y: 0 }, flip: { vertical: false, horizontal: false }, alpha: 1 },
    extra_material_refs: [],
    group_id: "",
    track_attribute: 0,
    track_render_index: 0,
    visible: true,
    render_index: 0,
  });
}

// 자막 클립 → text materials
const textClips = recipe.tracks?.text?.[0]?.clips || [];
for (const clip of textClips) {
  const matId = randomUUID().toUpperCase();
  const segId = randomUUID().toUpperCase();
  const startUs = msToUs(clip.start_ms ?? 0);
  const durUs = msToUs((clip.end_ms ?? clip.start_ms + 2000) - (clip.start_ms ?? 0));

  texts.push({
    id: matId,
    type: "text",
    content: JSON.stringify({
      styles: [{ fill: { alpha: 1, content: { content: [{ fill: { alpha: 1, content: "#FFFFFF" }, text: clip.text || "" }], type: "styledText" } } }],
      text: clip.text || "",
    }),
    name: "subtitle",
    alignment: 1,
    font_category_id: "",
    font_category_name: "",
    font_id: "",
    font_name: "",
    font_path: "",
    font_subtype: "",
    font_title: "",
    font_url: "",
    style: "",
    text_preset_resource_id: "",
    text_size: 48,
    bold: false,
    italic: false,
    underline: false,
    letter_spacing: 0,
    line_spacing: 0.02,
    text_color: "#FFFFFF",
    base_content: clip.text || "",
    has_shadow: false,
    background_alpha: 0,
    background_color: "#000000",
    background_height: 0.14,
    background_horizontal_offset: 0,
    background_round_radius: 0,
    background_style: 0,
    background_vertical_offset: 0,
    background_width: 0.8,
    add_type: 0,
    language: "ko",
    recognize_task_id: "",
    recognize_type: 0,
    source_platform: 0,
    local_material_id: matId,
    team_id: "",
    words: { end_time: [], start_time: [], text: [] },
  });

  textTrackSegments.push({
    id: segId,
    material_id: matId,
    source_timerange: { start: 0, duration: durUs },
    target_timerange: { start: startUs, duration: durUs },
    render_timerange: { start: startUs, duration: durUs },
    desc: clip.text || "",
    state: 0,
    speed: 1,
    volume: 1,
    last_nonzero_volume: 1,
    is_loop: false,
    reverse: false,
    intensifies_audio: false,
    clip: { scale: { x: 1, y: 1 }, rotation: 0, transform: { x: 0, y: 0 }, flip: { vertical: false, horizontal: false }, alpha: 1 },
    extra_material_refs: [],
    group_id: "",
    track_attribute: 0,
    track_render_index: 0,
    visible: true,
    render_index: 0,
    z_index: 0,
  });
}

// 전체 duration
const totalDurMs = recipe.duration_ms ||
  Math.max(...videoClips.map((c) => c.end_ms || 0), 1000);
const totalDurUs = msToUs(totalDurMs);

// ---- tracks 구성 ----
const tracks = [];

if (videoTrackSegments.length > 0) {
  tracks.push({
    id: randomUUID().toUpperCase(),
    type: "video",
    attribute: 0,
    flag: 0,
    segments: videoTrackSegments,
  });
}
if (audioVoiceSegments.length > 0) {
  tracks.push({
    id: randomUUID().toUpperCase(),
    type: "audio",
    attribute: 0,
    flag: 0,
    segments: audioVoiceSegments,
  });
}
if (audioBgmSegments.length > 0) {
  tracks.push({
    id: randomUUID().toUpperCase(),
    type: "audio",
    attribute: 0,
    flag: 0,
    segments: audioBgmSegments,
  });
}
if (textTrackSegments.length > 0) {
  tracks.push({
    id: randomUUID().toUpperCase(),
    type: "text",
    attribute: 0,
    flag: 0,
    segments: textTrackSegments,
  });
}

// ---- draft_content.json 구성 ----
const draftContent = {
  id: projectId,
  version: "5.9.0",
  new_version: 0,
  name: slug,
  duration: totalDurUs,
  create_time: now,
  update_time: now,
  fps,
  is_drop_frame_timecode: false,
  color_space: 0,
  config: {},
  canvas_config: {
    ratio: "original",
    width: canvas.width,
    height: canvas.height,
    background: null,
  },
  tracks,
  group_container: null,
  materials: {
    flowers: [], videos: [], tail_leaders: [],
    audios,
    images,
    texts,
    effects: [], stickers: [], canvases: [], transitions: [],
    audio_effects: [], audio_fades: [], beats: [], material_animations: [],
    placeholders: [], placeholder_infos: [], speeds: [], common_mask: [],
    chromas: [], text_templates: [], realtime_denoises: [], audio_pannings: [],
    audio_pitch_shifts: [], video_trackings: [], hsl: [], drafts: [],
    color_curves: [], hsl_curves: [], primary_color_wheels: [], log_color_wheels: [],
    video_effects: [], audio_balances: [], handwrites: [], manual_deformations: [],
    manual_beautys: [], plugin_effects: [], sound_channel_mappings: [], green_screens: [],
    shapes: [], material_colors: [], digital_humans: [], digital_human_model_dressing: [],
    smart_crops: [], ai_translates: [], audio_track_indexes: [], loudnesses: [],
    vocal_beautifys: [], vocal_separations: [], smart_relights: [], time_marks: [],
    multi_language_refs: [], video_shadows: [], video_strokes: [], video_radius: [],
  },
  keyframes: { adjusts: [], effects: [], filters: [], handwrites: [], stickers: [], texts: [], videos: [] },
  keyframe_graph_list: [],
  platform: { app_id: 3, app_source: "lv", app_version: "5.9.0", device_id: "", os: "mac", os_version: "" },
  last_modified_platform: { app_id: 3, app_source: "lv", app_version: "5.9.0", device_id: "", os: "mac", os_version: "" },
  mutable_config: null,
  cover: "",
  retouch_cover: "",
  extra_info: null,
  relationships: [],
  render_index_track_mode_on: false,
  free_render_index_mode_on: false,
  static_cover_image_path: "",
  source: "default",
  time_marks: { in_ms: 0, out_ms: 0 },
  path: join(CAPCUT_DRAFTS, slug),
};

// ---- 출력 폴더 생성 ----
const outputDir = join(CAPCUT_DRAFTS, slug);
mkdirSync(outputDir, { recursive: true });

const contentPath = join(outputDir, "draft_content.json");
writeFileSync(contentPath, JSON.stringify(draftContent, null, 2), "utf8");

// draft_meta_info.json
const metaInfo = {
  cloud_draft_cover: false,
  cloud_draft_sync: false,
  draft_cover: "",
  draft_deeplink_url: "",
  draft_enterprise_info: { draft_enterprise_extra: "", draft_enterprise_id: "", enterprise_domain: "" },
  draft_fold_path: outputDir,
  draft_id: projectId,
  draft_is_ae_produce: false,
  draft_is_ai_packaging_used: false,
  draft_is_ai_shorts: false,
  draft_is_ai_translate: false,
  draft_is_article_video_draft: false,
  draft_is_cloud_temp_draft: false,
  draft_is_from_deeplink: false,
  draft_is_invisible: false,
  draft_is_web_article_video: false,
  draft_materials: [],
  draft_materials_copied_info: [],
  draft_name: slug,
  draft_need_rename_folder: false,
  draft_new_version: "",
  draft_removable_storage_device: "",
  draft_root_path: CAPCUT_DRAFTS,
  draft_segment_extra_info: [],
  draft_timeline_materials_size_: 0,
  draft_type: "",
  draft_web_article_video_enter_from: "",
  tm_draft_cloud_completed: "",
  tm_draft_cloud_entry_id: "",
  tm_draft_cloud_modified: "",
  tm_draft_cloud_parent_entry_id: "",
  tm_draft_cloud_space_id: "",
  tm_draft_cloud_user_id: "",
  tm_draft_create: now,
  tm_draft_modified: now,
  tm_draft_removed: 0,
  tm_duration: totalDurUs,
};
writeFileSync(join(outputDir, "draft_meta_info.json"), JSON.stringify(metaInfo, null, 2), "utf8");

console.log(`\n✅ CapCut 프로젝트 생성 완료!`);
console.log(`   폴더: ${outputDir}`);
console.log(`   비디오 클립: ${videoTrackSegments.length}개`);
console.log(`   오디오 클립: ${audioVoiceSegments.length + audioBgmSegments.length}개`);
console.log(`   자막 클립:   ${textTrackSegments.length}개`);
console.log(`   총 길이:     ${(totalDurMs / 1000).toFixed(1)}초`);
console.log(`\n👉 CapCut 앱을 열면 "${slug}" 프로젝트가 보입니다.`);
console.log(`   (이미 열려 있다면 CapCut을 재시작하세요)\n`);
