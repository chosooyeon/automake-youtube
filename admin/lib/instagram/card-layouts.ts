import type { CategoryDef } from "./categories";
import { CARD_COLORS } from "./categories";

export type LayoutType = "cover" | "body" | "comparison" | "stat" | "cta";

export const CARD_SIZE = 1080;
export const CARD_PADDING = 80;
export const SAFE = CARD_SIZE - CARD_PADDING * 2;

export interface DrawTextCmd {
  kind: "text";
  text: string;
  x: number;
  y: number;
  maxWidth: number;
  fontSize: number;
  weight: "Bold" | "SemiBold" | "Regular";
  color: string;
  align?: "left" | "center" | "right";
  lineHeight?: number;
  maxLines?: number;
}

export interface DrawRectCmd {
  kind: "rect";
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  radius?: number;
}

export interface DrawBulletCmd {
  kind: "bullet";
  x: number;
  y: number;
  text: string;
  maxWidth: number;
  fontSize: number;
  color: string;
  dotColor: string;
}

export type DrawCmd = DrawTextCmd | DrawRectCmd | DrawBulletCmd;

export interface CardFields {
  /** cover */
  kicker?: string;
  headline?: string;
  subhead?: string;
  /** body */
  bullets?: string[];
  /** comparison */
  left_title?: string;
  left_items?: string[];
  right_title?: string;
  right_items?: string[];
  /** stat */
  number?: string;
  unit?: string;
  caption?: string;
  /** cta */
  body?: string;
  account_handle?: string;
}

export interface CardSpec {
  layout: LayoutType;
  fields: CardFields;
  sources?: string[];
  footer_source_label?: string;
}

const FOOTER_Y = CARD_SIZE - 60;

function footer(label: string | undefined): DrawCmd[] {
  if (!label) return [];
  return [
    {
      kind: "text",
      text: label,
      x: CARD_PADDING,
      y: FOOTER_Y,
      maxWidth: SAFE,
      fontSize: 22,
      weight: "Regular",
      color: CARD_COLORS.subtext,
      align: "left",
      maxLines: 1,
    },
  ];
}

function buildCover(fields: CardFields, cat: CategoryDef): DrawCmd[] {
  const cmds: DrawCmd[] = [];
  // 상단 액센트 바
  cmds.push({
    kind: "rect",
    x: CARD_PADDING,
    y: 160,
    width: 80,
    height: 6,
    color: cat.accent,
    radius: 3,
  });
  if (fields.kicker) {
    cmds.push({
      kind: "text",
      text: fields.kicker,
      x: CARD_PADDING,
      y: 200,
      maxWidth: SAFE,
      fontSize: 28,
      weight: "SemiBold",
      color: cat.accent,
      align: "left",
      maxLines: 1,
    });
  }
  if (fields.headline) {
    cmds.push({
      kind: "text",
      text: fields.headline,
      x: CARD_PADDING,
      y: 280,
      maxWidth: SAFE,
      fontSize: 88,
      weight: "Bold",
      color: CARD_COLORS.headline,
      align: "left",
      lineHeight: 1.15,
      maxLines: 3,
    });
  }
  if (fields.subhead) {
    cmds.push({
      kind: "text",
      text: fields.subhead,
      x: CARD_PADDING,
      y: 720,
      maxWidth: SAFE,
      fontSize: 36,
      weight: "Regular",
      color: CARD_COLORS.body,
      align: "left",
      lineHeight: 1.4,
      maxLines: 2,
    });
  }
  return cmds;
}

function buildBody(fields: CardFields, cat: CategoryDef, footerLabel?: string): DrawCmd[] {
  const cmds: DrawCmd[] = [];
  cmds.push({
    kind: "rect",
    x: CARD_PADDING,
    y: 160,
    width: 60,
    height: 6,
    color: cat.accent,
    radius: 3,
  });
  if (fields.headline) {
    cmds.push({
      kind: "text",
      text: fields.headline,
      x: CARD_PADDING,
      y: 200,
      maxWidth: SAFE,
      fontSize: 56,
      weight: "Bold",
      color: CARD_COLORS.headline,
      align: "left",
      lineHeight: 1.2,
      maxLines: 2,
    });
  }
  const bullets = fields.bullets ?? [];
  let y = 380;
  for (const b of bullets.slice(0, 5)) {
    cmds.push({
      kind: "bullet",
      x: CARD_PADDING,
      y,
      text: b,
      maxWidth: SAFE - 40,
      fontSize: 30,
      color: CARD_COLORS.body,
      dotColor: cat.accent,
    });
    y += 90;
    if (y > FOOTER_Y - 80) break;
  }
  cmds.push(...footer(footerLabel));
  return cmds;
}

function buildComparison(fields: CardFields, cat: CategoryDef, footerLabel?: string): DrawCmd[] {
  const cmds: DrawCmd[] = [];
  if (fields.headline) {
    cmds.push({
      kind: "text",
      text: fields.headline,
      x: CARD_PADDING,
      y: 180,
      maxWidth: SAFE,
      fontSize: 48,
      weight: "Bold",
      color: CARD_COLORS.headline,
      align: "left",
      lineHeight: 1.2,
      maxLines: 2,
    });
  }
  const colW = (SAFE - 40) / 2;
  const leftX = CARD_PADDING;
  const rightX = CARD_PADDING + colW + 40;
  const colY = 360;
  // 좌측 제목 박스
  cmds.push({
    kind: "rect",
    x: leftX,
    y: colY,
    width: colW,
    height: 60,
    color: cat.accentSoft,
    radius: 12,
  });
  cmds.push({
    kind: "text",
    text: fields.left_title ?? "",
    x: leftX + 16,
    y: colY + 14,
    maxWidth: colW - 32,
    fontSize: 28,
    weight: "SemiBold",
    color: cat.accent,
    align: "left",
    maxLines: 1,
  });
  // 우측 제목 박스
  cmds.push({
    kind: "rect",
    x: rightX,
    y: colY,
    width: colW,
    height: 60,
    color: cat.accentSoft,
    radius: 12,
  });
  cmds.push({
    kind: "text",
    text: fields.right_title ?? "",
    x: rightX + 16,
    y: colY + 14,
    maxWidth: colW - 32,
    fontSize: 28,
    weight: "SemiBold",
    color: cat.accent,
    align: "left",
    maxLines: 1,
  });
  // 아이템들
  let ly = colY + 100;
  let ry = colY + 100;
  for (const it of (fields.left_items ?? []).slice(0, 5)) {
    cmds.push({
      kind: "bullet",
      x: leftX,
      y: ly,
      text: it,
      maxWidth: colW,
      fontSize: 24,
      color: CARD_COLORS.body,
      dotColor: cat.accent,
    });
    ly += 78;
  }
  for (const it of (fields.right_items ?? []).slice(0, 5)) {
    cmds.push({
      kind: "bullet",
      x: rightX,
      y: ry,
      text: it,
      maxWidth: colW,
      fontSize: 24,
      color: CARD_COLORS.body,
      dotColor: cat.accent,
    });
    ry += 78;
  }
  cmds.push(...footer(footerLabel));
  return cmds;
}

function buildStat(fields: CardFields, cat: CategoryDef, footerLabel?: string): DrawCmd[] {
  const cmds: DrawCmd[] = [];
  if (fields.kicker) {
    cmds.push({
      kind: "text",
      text: fields.kicker,
      x: CARD_PADDING,
      y: 240,
      maxWidth: SAFE,
      fontSize: 32,
      weight: "SemiBold",
      color: cat.accent,
      align: "center",
      maxLines: 1,
    });
  }
  // 큰 숫자
  cmds.push({
    kind: "text",
    text: fields.number ?? "",
    x: CARD_PADDING,
    y: 360,
    maxWidth: SAFE,
    fontSize: 200,
    weight: "Bold",
    color: CARD_COLORS.headline,
    align: "center",
    lineHeight: 1.0,
    maxLines: 1,
  });
  if (fields.unit) {
    cmds.push({
      kind: "text",
      text: fields.unit,
      x: CARD_PADDING,
      y: 620,
      maxWidth: SAFE,
      fontSize: 42,
      weight: "SemiBold",
      color: CARD_COLORS.body,
      align: "center",
      maxLines: 1,
    });
  }
  if (fields.caption) {
    cmds.push({
      kind: "text",
      text: fields.caption,
      x: CARD_PADDING,
      y: 740,
      maxWidth: SAFE,
      fontSize: 30,
      weight: "Regular",
      color: CARD_COLORS.body,
      align: "center",
      lineHeight: 1.4,
      maxLines: 3,
    });
  }
  cmds.push(...footer(footerLabel));
  return cmds;
}

function buildCta(fields: CardFields, cat: CategoryDef, footerLabel?: string): DrawCmd[] {
  const cmds: DrawCmd[] = [];
  cmds.push({
    kind: "rect",
    x: CARD_PADDING,
    y: 160,
    width: 80,
    height: 6,
    color: cat.accent,
    radius: 3,
  });
  if (fields.headline) {
    cmds.push({
      kind: "text",
      text: fields.headline,
      x: CARD_PADDING,
      y: 220,
      maxWidth: SAFE,
      fontSize: 60,
      weight: "Bold",
      color: cat.accent,
      align: "left",
      lineHeight: 1.2,
      maxLines: 3,
    });
  }
  if (fields.body) {
    cmds.push({
      kind: "text",
      text: fields.body,
      x: CARD_PADDING,
      y: 500,
      maxWidth: SAFE,
      fontSize: 32,
      weight: "Regular",
      color: CARD_COLORS.body,
      align: "left",
      lineHeight: 1.5,
      maxLines: 5,
    });
  }
  if (fields.account_handle) {
    cmds.push({
      kind: "text",
      text: fields.account_handle,
      x: CARD_PADDING,
      y: 880,
      maxWidth: SAFE,
      fontSize: 30,
      weight: "SemiBold",
      color: CARD_COLORS.headline,
      align: "left",
      maxLines: 1,
    });
  }
  cmds.push(...footer(footerLabel));
  return cmds;
}

export function layoutToCommands(card: CardSpec, cat: CategoryDef): DrawCmd[] {
  const f = card.fields;
  const label = card.footer_source_label;
  switch (card.layout) {
    case "cover":
      return buildCover(f, cat);
    case "body":
      return buildBody(f, cat, label);
    case "comparison":
      return buildComparison(f, cat, label);
    case "stat":
      return buildStat(f, cat, label);
    case "cta":
      return buildCta(f, cat, label);
  }
}
