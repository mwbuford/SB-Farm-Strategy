#!/usr/bin/env python3
"""Build Farm Visit Lessons Learned PowerPoint deck."""

import datetime
from pathlib import Path
from pptx import Presentation
from pptx.util import Inches, Pt, Emu
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.enum.shapes import MSO_SHAPE
from pptx.oxml.ns import nsmap
from pptx.oxml import parse_xml
from copy import deepcopy
from lxml import etree

# Colors
DARK_GREEN = RGBColor(0x1B, 0x43, 0x32)
CREAM = RGBColor(0xF7, 0xF4, 0xEF)
OLIVE = RGBColor(0x52, 0x79, 0x6F)
CHARCOAL = RGBColor(0x2D, 0x2A, 0x26)
WHITE = RGBColor(0xFF, 0xFF, 0xFF)
SOFT_OLIVE = RGBColor(0x84, 0xA9, 0x8A)
LIGHT_OLIVE_BG = RGBColor(0xE8, 0xED, 0xE6)

SLIDE_W = Inches(13.333)
SLIDE_H = Inches(7.5)

BASE = Path(__file__).resolve().parent
IMG = BASE / "images"
OUT = BASE / "Farm_Visit_Lessons_Learned.pptx"
MISSING = []


def set_run_font(run, name, size, bold=False, color=CHARCOAL):
    run.font.name = name
    run.font.size = size
    run.font.bold = bold
    run.font.color.rgb = color


def fill_solid(shape, rgb):
    shape.fill.solid()
    shape.fill.fore_color.rgb = rgb
    shape.line.fill.background()


def add_rect(slide, left, top, width, height, rgb):
    shape = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, left, top, width, height)
    fill_solid(shape, rgb)
    return shape


def blank_slide(prs):
    blank = prs.slide_layouts[6]  # blank
    return prs.slides.add_slide(blank)


def cream_bg(slide):
    add_rect(slide, 0, 0, SLIDE_W, SLIDE_H, CREAM)


def dark_bg(slide):
    add_rect(slide, 0, 0, SLIDE_W, SLIDE_H, DARK_GREEN)


def add_textbox(slide, left, top, width, height, text, font="Calibri", size=Pt(18),
                bold=False, color=CHARCOAL, align=PP_ALIGN.LEFT, font_title=False):
    box = slide.shapes.add_textbox(left, top, width, height)
    tf = box.text_frame
    tf.word_wrap = True
    p = tf.paragraphs[0]
    p.alignment = align
    run = p.add_run()
    run.text = text
    name = "Georgia" if font_title else font
    set_run_font(run, name, size, bold=bold, color=color)
    return box


def add_bullets(slide, left, top, width, height, items, size=Pt(20), color=CHARCOAL, spacing=Pt(10)):
    box = slide.shapes.add_textbox(left, top, width, height)
    tf = box.text_frame
    tf.word_wrap = True
    for i, item in enumerate(items):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.alignment = PP_ALIGN.LEFT
        p.space_after = spacing
        p.level = 0
        run = p.add_run()
        run.text = "•  " + item
        set_run_font(run, "Calibri", size, bold=False, color=color)
    return box


def resolve_img(*parts):
    path = IMG.joinpath(*parts)
    if path.exists():
        return str(path)
    MISSING.append(str(path))
    return None


def add_picture_fit(slide, path, left, top, width, height):
    """Add picture cropped/fitted into a box (contain within box)."""
    if not path:
        return None
    from PIL import Image
    with Image.open(path) as im:
        iw, ih = im.size
    box_aspect = width / height
    img_aspect = iw / ih
    if img_aspect > box_aspect:
        # wider — fit width
        w = width
        h = int(width / img_aspect)
        t = top + (height - h) // 2
        l = left
    else:
        h = height
        w = int(height * img_aspect)
        l = left + (width - w) // 2
        t = top
    return slide.shapes.add_picture(path, l, t, width=w, height=h)


def add_picture_cover(slide, path, left, top, width, height):
    """Add picture covering the box (may crop visually by centering larger)."""
    if not path:
        return None
    from PIL import Image
    with Image.open(path) as im:
        iw, ih = im.size
    box_aspect = float(width) / float(height)
    img_aspect = iw / ih
    if img_aspect > box_aspect:
        # image wider — match height, overflow width
        h = height
        w = int(height * img_aspect)
        l = left - (w - width) // 2
        t = top
    else:
        w = width
        h = int(width / img_aspect)
        l = left
        t = top - (h - height) // 2
    pic = slide.shapes.add_picture(path, l, t, width=w, height=h)
    return pic


def photo_slide_left(prs, img_path, caption, title=None):
    """Image ~60% left, caption bar; cream right strip optional."""
    slide = blank_slide(prs)
    cream_bg(slide)
    left_w = Inches(8.0)
    # photo area
    if img_path:
        # dark underlay
        add_rect(slide, 0, 0, left_w, SLIDE_H, DARK_GREEN)
        add_picture_cover(slide, img_path, 0, 0, left_w, SLIDE_H)
    else:
        add_rect(slide, 0, 0, left_w, SLIDE_H, OLIVE)
        add_textbox(slide, Inches(0.5), Inches(3), Inches(7), Inches(1),
                    "[Image unavailable]", size=Pt(22), color=WHITE, align=PP_ALIGN.CENTER)
    # caption panel right
    add_rect(slide, left_w, 0, SLIDE_W - left_w, SLIDE_H, CREAM)
    # olive accent bar
    add_rect(slide, left_w, 0, Inches(0.08), SLIDE_H, OLIVE)
    if title:
        add_textbox(slide, left_w + Inches(0.4), Inches(2.2), Inches(4.5), Inches(1),
                    title, size=Pt(16), bold=True, color=OLIVE, font_title=False)
    add_textbox(slide, left_w + Inches(0.4), Inches(2.8), Inches(4.5), Inches(2.5),
                caption, size=Pt(26), bold=True, color=DARK_GREEN, font_title=True)
    return slide


def photo_slide_full_caption(prs, img_path, caption):
    """Full-bleed-ish photo with dark text box at bottom."""
    slide = blank_slide(prs)
    cream_bg(slide)
    if img_path:
        add_picture_cover(slide, img_path, 0, 0, SLIDE_W, SLIDE_H)
    else:
        add_rect(slide, 0, 0, SLIDE_W, SLIDE_H, OLIVE)
    # bottom caption bar
    bar_h = Inches(1.15)
    add_rect(slide, 0, SLIDE_H - bar_h, SLIDE_W, bar_h, DARK_GREEN)
    add_textbox(slide, Inches(0.5), SLIDE_H - bar_h + Inches(0.28), Inches(12.3), Inches(0.7),
                caption, size=Pt(24), bold=True, color=WHITE, font_title=True)
    return slide


def two_up_photos(prs, paths_captions, main_caption=None):
    """Two photos side by side with bottom caption."""
    slide = blank_slide(prs)
    cream_bg(slide)
    gap = Inches(0.2)
    margin = Inches(0.35)
    top = Inches(0.35)
    usable_w = SLIDE_W - 2 * margin - gap
    col_w = usable_w // 2
    img_h = Inches(5.5) if main_caption else Inches(6.2)
    for i, (path, cap) in enumerate(paths_captions):
        left = margin + i * (col_w + gap)
        add_rect(slide, left, top, col_w, img_h, DARK_GREEN)
        if path:
            add_picture_cover(slide, path, left, top, col_w, img_h)
        # small label under each if no main
        if not main_caption and cap:
            add_textbox(slide, left, top + img_h + Inches(0.15), col_w, Inches(0.6),
                        cap, size=Pt(16), bold=True, color=DARK_GREEN, align=PP_ALIGN.CENTER)
    if main_caption:
        add_textbox(slide, margin, top + img_h + Inches(0.25), SLIDE_W - 2 * margin, Inches(0.9),
                    main_caption, size=Pt(22), bold=True, color=DARK_GREEN,
                    align=PP_ALIGN.CENTER, font_title=True)
    return slide


def section_divider(prs, title, subtitle=None):
    slide = blank_slide(prs)
    dark_bg(slide)
    # subtle accent line
    add_rect(slide, Inches(0.8), Inches(3.35), Inches(2.5), Inches(0.06), SOFT_OLIVE)
    add_textbox(slide, Inches(0.8), Inches(2.4), Inches(11.5), Inches(1.2),
                title, size=Pt(40), bold=True, color=WHITE, font_title=True)
    if subtitle:
        add_textbox(slide, Inches(0.8), Inches(3.6), Inches(11.5), Inches(1.2),
                    subtitle, size=Pt(20), color=SOFT_OLIVE)
    return slide


def title_slide(prs):
    slide = blank_slide(prs)
    cream_bg(slide)
    # left accent panel
    add_rect(slide, 0, 0, Inches(0.35), SLIDE_H, DARK_GREEN)
    add_rect(slide, Inches(0.35), 0, Inches(0.12), SLIDE_H, OLIVE)
    add_textbox(slide, Inches(1.0), Inches(2.0), Inches(11), Inches(1.2),
                "Farm Visit Lessons Learned", size=Pt(44), bold=True,
                color=DARK_GREEN, font_title=True)
    add_textbox(slide, Inches(1.0), Inches(3.3), Inches(11), Inches(1.0),
                "Rincon · Apricot Lane · Wanderment — implications for Summerland Farm",
                size=Pt(20), color=OLIVE)
    add_textbox(slide, Inches(1.0), Inches(5.5), Inches(11), Inches(0.6),
                "Max Buford · July 2026", size=Pt(18), color=CHARCOAL)
    return slide


def agenda_slide(prs):
    slide = blank_slide(prs)
    cream_bg(slide)
    add_textbox(slide, Inches(0.8), Inches(0.5), Inches(11), Inches(0.8),
                "Agenda", size=Pt(36), bold=True, color=DARK_GREEN, font_title=True)
    add_rect(slide, Inches(0.8), Inches(1.25), Inches(1.5), Inches(0.06), OLIVE)
    items = [
        "Three farms (closest peer first): Rincon → Apricot Lane → Wanderment",
        "Market pricing: Index Fresh vs Rincon Hass + passionfruit grades",
        "Home ranch contrast — Summerland / Ortega Ridge erosion & opportunity",
        "California evidence: soils, organic, pests, crop replacement",
        "Decide: Tier A/B priorities → fund (grants) → staff (Armando + area lead)",
    ]
    add_bullets(slide, Inches(0.8), Inches(2.0), Inches(11), Inches(4.5), items, size=Pt(22), spacing=Pt(16))
    return slide


def why_visited(prs):
    slide = blank_slide(prs)
    cream_bg(slide)
    add_textbox(slide, Inches(0.8), Inches(0.5), Inches(11), Inches(0.8),
                "Why we visited", size=Pt(36), bold=True, color=DARK_GREEN, font_title=True)
    add_rect(slide, Inches(0.8), Inches(1.25), Inches(1.5), Inches(0.06), OLIVE)
    items = [
        "Find regenerative practices that fit ~80-acre avocado hills",
        "Packing / market channel ideas for specialty fruit",
        "Soil health & erosion solutions for coastal slopes",
    ]
    add_bullets(slide, Inches(0.8), Inches(2.0), Inches(11), Inches(4), items, size=Pt(22), spacing=Pt(16))
    return slide


def comparison_slide(prs):
    slide = blank_slide(prs)
    cream_bg(slide)
    add_textbox(slide, Inches(0.6), Inches(0.4), Inches(12), Inches(0.7),
                "Three farms at a glance", size=Pt(32), bold=True, color=DARK_GREEN, font_title=True)
    add_rect(slide, Inches(0.6), Inches(1.05), Inches(1.5), Inches(0.05), OLIVE)

    cols = [
        ("Rincon", "Packing + avocado peer",
         ["On-site packing house", "Avocados & exotics", "Wholesale + local sales", "Hillside orchard peer"]),
        ("Apricot Lane", "Full regenerative system",
         ["Organic & biodynamic", "~234 acres, diverse crops", "Animals as managers", "Fertility center & tea"]),
        ("Wanderment", "Small regen + agritourism",
         ["Cardboard + mulch", "Olives / garden / avocados", "Animals + visitor revenue", "Friday produce boxes"]),
    ]
    margin = Inches(0.5)
    gap = Inches(0.3)
    usable = SLIDE_W - 2 * margin - 2 * gap
    col_w = usable // 3
    top = Inches(1.5)
    for i, (name, tagline, bullets) in enumerate(cols):
        left = margin + i * (col_w + gap)
        # header band
        add_rect(slide, left, top, col_w, Inches(1.35), DARK_GREEN)
        add_textbox(slide, left + Inches(0.2), top + Inches(0.25), col_w - Inches(0.4), Inches(0.5),
                    name, size=Pt(22), bold=True, color=WHITE, font_title=True, align=PP_ALIGN.CENTER)
        add_textbox(slide, left + Inches(0.15), top + Inches(0.75), col_w - Inches(0.3), Inches(0.5),
                    tagline, size=Pt(14), color=SOFT_OLIVE, align=PP_ALIGN.CENTER)
        # body
        add_rect(slide, left, top + Inches(1.35), col_w, Inches(4.0), LIGHT_OLIVE_BG)
        add_bullets(slide, left + Inches(0.25), top + Inches(1.6), col_w - Inches(0.4), Inches(3.5),
                    bullets, size=Pt(16), spacing=Pt(8))
    return slide


def ops_bullets_slide(prs, title, items):
    slide = blank_slide(prs)
    cream_bg(slide)
    add_textbox(slide, Inches(0.8), Inches(0.5), Inches(11.5), Inches(0.9),
                title, size=Pt(30), bold=True, color=DARK_GREEN, font_title=True)
    add_rect(slide, Inches(0.8), Inches(1.35), Inches(1.5), Inches(0.05), OLIVE)
    add_bullets(slide, Inches(0.8), Inches(1.8), Inches(11.5), Inches(5), items, size=Pt(20), spacing=Pt(14))
    return slide


def wanderment_cards(prs):
    slide = blank_slide(prs)
    cream_bg(slide)
    add_textbox(slide, Inches(0.6), Inches(0.35), Inches(12), Inches(0.6),
                "Wanderment — practices to note", size=Pt(28), bold=True,
                color=DARK_GREEN, font_title=True)
    add_textbox(slide, Inches(0.6), Inches(0.95), Inches(12), Inches(0.45),
                "Practices summarized from visit + wandermentfarms.com  ·  no dedicated photo set",
                size=Pt(14), color=OLIVE)

    cards = [
        ("Weed suppression", "Cardboard + deep mulch to kill weeds without herbicides"),
        ("Crop mix", "Olives, market garden, and avocados at a smaller regenerative scale"),
        ("Animals + visits", "Livestock + agritourism as profit centers alongside produce"),
        ("Direct sales", "Friday produce boxes — “small Apricot Lane” model"),
    ]
    margin = Inches(0.55)
    gap = Inches(0.25)
    usable = SLIDE_W - 2 * margin - gap
    card_w = usable // 2
    card_h = Inches(2.35)
    tops = [Inches(1.6), Inches(1.6 + 2.35 + 0.25)]
    for i, (h, body) in enumerate(cards):
        row, col = divmod(i, 2)
        left = margin + col * (card_w + gap)
        top = tops[row]
        add_rect(slide, left, top, card_w, card_h, LIGHT_OLIVE_BG)
        add_rect(slide, left, top, Inches(0.1), card_h, OLIVE)
        add_textbox(slide, left + Inches(0.35), top + Inches(0.35), card_w - Inches(0.55), Inches(0.5),
                    h, size=Pt(18), bold=True, color=DARK_GREEN, font_title=True)
        add_textbox(slide, left + Inches(0.35), top + Inches(1.0), card_w - Inches(0.55), Inches(1.1),
                    body, size=Pt(16), color=CHARCOAL)
    return slide


def priorities_slide(prs, title, items, tier_note=None):
    slide = blank_slide(prs)
    cream_bg(slide)
    add_textbox(slide, Inches(0.8), Inches(0.45), Inches(11.5), Inches(0.7),
                title, size=Pt(30), bold=True, color=DARK_GREEN, font_title=True)
    add_rect(slide, Inches(0.8), Inches(1.15), Inches(1.5), Inches(0.05), OLIVE)
    if tier_note:
        add_textbox(slide, Inches(0.8), Inches(1.35), Inches(11.5), Inches(0.4),
                    tier_note, size=Pt(16), color=OLIVE)
        y = Inches(1.85)
    else:
        y = Inches(1.6)
    # numbered list
    box = slide.shapes.add_textbox(Inches(0.8), y, Inches(11.5), Inches(5))
    tf = box.text_frame
    tf.word_wrap = True
    for i, item in enumerate(items):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.space_after = Pt(14)
        run = p.add_run()
        run.text = f"{i + 1}.  {item}"
        set_run_font(run, "Calibri", Pt(20), bold=False, color=CHARCOAL)
    return slide


def research_two_col(prs, title, left_title, left_items, right_title, right_items, footnote=""):
    slide = blank_slide(prs)
    cream_bg(slide)
    add_textbox(slide, Inches(0.6), Inches(0.35), Inches(12), Inches(0.65),
                title, size=Pt(28), bold=True, color=DARK_GREEN, font_title=True)
    add_rect(slide, Inches(0.6), Inches(0.95), Inches(1.5), Inches(0.05), OLIVE)
    # left card
    add_rect(slide, Inches(0.5), Inches(1.3), Inches(5.9), Inches(5.2), LIGHT_OLIVE_BG)
    add_textbox(slide, Inches(0.75), Inches(1.45), Inches(5.4), Inches(0.45),
                left_title, size=Pt(18), bold=True, color=DARK_GREEN)
    add_bullets(slide, Inches(0.75), Inches(2.0), Inches(5.4), Inches(4.2),
                left_items, size=Pt(15), spacing=Pt(6))
    # right card
    add_rect(slide, Inches(6.7), Inches(1.3), Inches(5.9), Inches(5.2), LIGHT_OLIVE_BG)
    add_textbox(slide, Inches(6.95), Inches(1.45), Inches(5.4), Inches(0.45),
                right_title, size=Pt(18), bold=True, color=DARK_GREEN)
    add_bullets(slide, Inches(6.95), Inches(2.0), Inches(5.4), Inches(4.2),
                right_items, size=Pt(15), spacing=Pt(6))
    if footnote:
        add_textbox(slide, Inches(0.6), Inches(6.7), Inches(12), Inches(0.5),
                    footnote, size=Pt(12), color=OLIVE)
    return slide


def set_cell(cell, text, *, bold=False, fill=None, color=CHARCOAL, size=Pt(13), align=PP_ALIGN.CENTER):
    cell.text = str(text)
    for p in cell.text_frame.paragraphs:
        p.alignment = align
        for run in p.runs:
            set_run_font(run, "Calibri", size, bold=bold, color=color)
    if fill is not None:
        cell.fill.solid()
        cell.fill.fore_color.rgb = fill


def hass_price_comparison_slide(prs):
    """Index Fresh Fresh Facts (7/21) vs Rincon Farms field prices (7/29–30)."""
    slide = blank_slide(prs)
    cream_bg(slide)
    add_textbox(
        slide, Inches(0.55), Inches(0.28), Inches(12.2), Inches(0.55),
        "Hass $/lb — Index Fresh vs Rincon Farms",
        size=Pt(30), bold=True, color=DARK_GREEN, font_title=True,
    )
    add_rect(slide, Inches(0.55), Inches(0.85), Inches(1.5), Inches(0.05), OLIVE)
    add_textbox(
        slide, Inches(0.55), Inches(0.95), Inches(12.2), Inches(0.4),
        "Index Fresh = Fresh Facts mid (7/21/26)  ·  Rincon = field price sheet (7/29–30/26)  ·  Δ = Rincon − Index mid",
        size=Pt(13), color=OLIVE,
    )

    # Size | Index Hass mid | Rincon Hass | Δ | Index Org mid | Rincon Org | Δ
    # Index mid from Market CSV 2026-07-21; Rincon from PDF
    rows = [
        ["Size", "Index Hass", "Rincon Hass", "Δ Hass", "Index Organic", "Rincon Organic", "Δ Org"],
        ["32", "$1.14", "$1.30", "+$0.16", "$1.38", "$1.50", "+$0.12"],
        ["36", "$1.14", "$1.30", "+$0.16", "$1.38", "$1.50", "+$0.12"],
        ["40", "$1.14", "$1.30", "+$0.16", "$1.46", "$1.55", "+$0.09"],
        ["48", "$1.18", "$1.32", "+$0.14", "$1.60", "$1.64", "+$0.04"],
        ["60", "$0.90", "$0.90", "$0.00", "$1.46", "$1.50", "+$0.04"],
        ["70", "$0.70", "$0.70", "$0.00", "$1.26", "$1.30", "+$0.04"],
        ["84", "$0.54", "$0.60", "+$0.06", "$0.98", "$0.60", "−$0.38"],
    ]

    table_shape = slide.shapes.add_table(
        len(rows), len(rows[0]), Inches(0.55), Inches(1.45), Inches(12.2), Inches(4.55)
    )
    table = table_shape.table
    col_widths = [1.1, 1.7, 1.8, 1.4, 2.0, 2.1, 1.5]
    for i, w in enumerate(col_widths):
        table.columns[i].width = Inches(w)

    for r, row in enumerate(rows):
        for c, val in enumerate(row):
            cell = table.cell(r, c)
            if r == 0:
                set_cell(cell, val, bold=True, fill=DARK_GREEN, color=WHITE, size=Pt(12))
            else:
                fill = LIGHT_OLIVE_BG if r % 2 == 0 else CREAM
                bold = c in (3, 6)
                color = DARK_GREEN if bold else CHARCOAL
                set_cell(cell, val, bold=bold, fill=fill, color=color, size=Pt(14))

    add_textbox(
        slide, Inches(0.55), Inches(6.2), Inches(12.2), Inches(0.9),
        "Takeaway: Rincon quotes a premium on large Hass (32–48). Mid/small (60–70) match Index. "
        "Organic 84s are the outlier — Index still much higher than Rincon’s posted $0.60.",
        size=Pt(15), color=CHARCOAL,
    )
    return slide


def passionfruit_and_market_notes_slide(prs):
    """Passionfruit grade prices + short market context from Rincon sheet."""
    slide = blank_slide(prs)
    cream_bg(slide)
    add_textbox(
        slide, Inches(0.55), Inches(0.28), Inches(12.2), Inches(0.55),
        "Passionfruit grades + market notes",
        size=Pt(30), bold=True, color=DARK_GREEN, font_title=True,
    )
    add_rect(slide, Inches(0.55), Inches(0.85), Inches(1.5), Inches(0.05), OLIVE)

    # Left: passionfruit cards
    add_textbox(
        slide, Inches(0.55), Inches(1.15), Inches(6.0), Inches(0.4),
        "Passionfruit — $/lb by grade",
        size=Pt(18), bold=True, color=DARK_GREEN,
    )

    grades = [
        ("#1  ·  $6.00 / lb", "No wrinkles — smooth fruit"),
        ("#2  ·  $2.00 / lb", "Wrinkled, scratched, ripe & edible"),
        ("#3  ·  $0.50 / lb", "Very rough shape, sunburned, overripe"),
    ]
    y = Inches(1.7)
    for title, detail in grades:
        add_rect(slide, Inches(0.55), y, Inches(6.0), Inches(1.15), LIGHT_OLIVE_BG)
        add_rect(slide, Inches(0.55), y, Inches(0.12), Inches(1.15), OLIVE)
        add_textbox(slide, Inches(0.9), y + Inches(0.22), Inches(5.4), Inches(0.4),
                    title, size=Pt(20), bold=True, color=DARK_GREEN)
        add_textbox(slide, Inches(0.9), y + Inches(0.6), Inches(5.4), Inches(0.4),
                    detail, size=Pt(15), color=CHARCOAL)
        y += Inches(1.3)

    # Right: Rincon avocado market notes
    add_rect(slide, Inches(6.9), Inches(1.15), Inches(5.9), Inches(5.5), LIGHT_OLIVE_BG)
    add_textbox(
        slide, Inches(7.15), Inches(1.35), Inches(5.4), Inches(0.4),
        "Rincon sheet — market notes (7/29–30)",
        size=Pt(16), bold=True, color=DARK_GREEN,
    )
    add_bullets(
        slide, Inches(7.15), Inches(1.95), Inches(5.4), Inches(4.4),
        [
            "Mexican fruit trending smaller → build-up of 60s and smaller",
            "Strong demand for California fruit; market steady",
            "Large sizes strong",
            "Flor Loca peaking on 60s and smaller (low oil)",
            "Peru sending ~11M lbs — above CA inventory",
            "Use with Index Fresh trends on the dashboard for packer vs peer quotes",
        ],
        size=Pt(15),
        spacing=Pt(10),
    )
    return slide


def bibliography_slide(prs, title, entries):
    """entries: list of short citation strings"""
    slide = blank_slide(prs)
    cream_bg(slide)
    add_textbox(slide, Inches(0.55), Inches(0.3), Inches(12), Inches(0.55),
                title, size=Pt(26), bold=True, color=DARK_GREEN, font_title=True)
    add_rect(slide, Inches(0.55), Inches(0.85), Inches(1.5), Inches(0.05), OLIVE)
    box = slide.shapes.add_textbox(Inches(0.55), Inches(1.1), Inches(12.2), Inches(6.0))
    tf = box.text_frame
    tf.word_wrap = True
    for i, entry in enumerate(entries):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.space_after = Pt(6)
        run = p.add_run()
        run.text = entry
        set_run_font(run, "Calibri", Pt(13), bold=False, color=CHARCOAL)
    return slide


def closing_slide(prs):
    slide = blank_slide(prs)
    cream_bg(slide)
    add_textbox(slide, Inches(0.8), Inches(0.5), Inches(11), Inches(0.8),
                "Next steps", size=Pt(36), bold=True, color=DARK_GREEN, font_title=True)
    add_rect(slide, Inches(0.8), Inches(1.25), Inches(1.5), Inches(0.06), OLIVE)
    items = [
        "1) Green-light Tier A pilots (hedgerows, cover crop, mulch, pollinator edge)",
        "2) Name an area lead path for Armando (hire / student+consultant / hybrid)",
        "3) Start grant pipeline (Compost Connector + EQIP now; Restore Fall 2026)",
        "4) Soft-start crop replacement: map weak lemon blocks; buyer calls for cherimoya",
        "5) Full citations: BIBLIOGRAPHY.md · ops memo: Farm_Visit_Operations_Summary.md",
    ]
    add_bullets(slide, Inches(0.8), Inches(2.0), Inches(11.5), Inches(4.5), items, size=Pt(20), spacing=Pt(14))
    return slide


def research_section(prs):
    """California outside research block — ordered to answer the home-ranch story."""
    section_divider(prs, "CALIFORNIA EVIDENCE",
                    "Outside research that backs what the visits showed")

    # 1) Soil / erosion first (answers Ortega Ridge problem just shown)
    research_two_col(
        prs,
        "Cover crops in CA avocado orchards — proven benefits",
        "UCCE (Faber / Rowe-Fish)",
        [
            "Better soil structure & less compaction",
            "Less erosion from wind and rain",
            "More organic matter & nutrient cycling",
            "Weed suppression + habitat for beneficials",
            "Better infiltration & soil moisture storage",
            "Rain capture → salt leaching & drought resilience",
        ],
        "What Ventura growers report",
        [
            "Dramatic runoff reduction after adopting covers",
            "Soil OM can climb from very low baselines over years",
            "Mixes beat single species (e.g. triticale + faba + daikon)",
            "Hillside CA literature: runoff −23–77%; erosion −50–75% vs bare",
        ],
        footnote="Sources: UCCE Topics in Subtropics; CAC Cover Crop Panel; UC Cover Crops Resources",
    )

    ops_bullets_slide(prs, "Cover crops — what’s working in coastal SoCal", [
        "Seed after first rains (not hot/dry Oct–Nov) — watch the weather window",
        "Prefer winter covers on rainfall; terminate before they fight summer irrigation",
        "Frost risk: avoid tall early covers; seed later (often Jan) if frost-prone",
        "Skip clover-heavy mixes if gophers are already severe in young blocks",
        "Leave residue as mulch when possible; grazing OK if food-safety windows allow",
        "CDFA Healthy Soils funds cover crops, hedgerows, mulch, compost in orchards",
    ])

    # 2) Organic path (revenue → economics → pest → phased strategy)
    research_two_col(
        prs,
        "Going organic — revenue side (CA avocados)",
        "Market signals",
        [
            "~10% of CA avocado crop estimated organic (2025)",
            "~15% organic FOB premium vs conventional (often higher when conventional prices soften)",
            "U.S. organic avocado volume sales +19% vs 2023",
            "CA crop ~375M lbs projected (2025) — organics a retail growth driver",
            "Santa Barbara among top-5 avocado counties (~6,844 mapped acres, 2025)",
        ],
        "What it means for Summerland",
        [
            "Premium is real but not automatic — needs certification + channel",
            "Index Fresh / specialty retail / DTC each price organic differently",
            "Pair organic path with soil practices that cut water/erosion risk",
            "Transition years: budget for higher weed/labor costs before premium sticks",
        ],
        footnote="Sources: Organic Produce Network 2025; CAC Statewide Mapping 2025; CDFA Organics Report 2023–24",
    )

    research_two_col(
        prs,
        "Organic vs non-organic — revenue mechanics (what changes P&L)",
        "Potential upside",
        [
            "Market premium: CA organic avocado often carries a meaningful FOB premium (~15% recent signal)",
            "Brand/channel upside: organic + local story can widen access to specialty retail and DTC",
            "Input substitution upside: over time, better soil function can lower some purchased-input intensity",
            "Grant leverage: CDFA Healthy Soils can offset transition-practice costs (cover, hedgerow, mulch, compost)",
        ],
        "Transition pressure points",
        [
            "Certification + recordkeeping overhead (management time and audits)",
            "Weed pressure/labor often rises first before system benefits compound",
            "Water and labor costs remain the main coastal constraints even in organic systems",
            "Premium capture depends on channel fit — commodity-only routes dilute upside",
        ],
        footnote="Sources: CDFA Organics Report; UC organic challenges report; Klonsky UC Davis; CDFA HSP",
    )

    research_two_col(
        prs,
        "Going organic — soil health & economics",
        "Soil / system benefits",
        [
            "Organic systems rely on compost, cover crops, and biology instead of synthetics",
            "Builds organic matter and living soil — same direction as regenerative visits",
            "Supports California brand premium strategy (CAC business plan)",
            "Aligns with Apricot Lane / Wanderment / Rincon organic packing examples",
        ],
        "Hard truths (UC / CDFA)",
        [
            "Weed management is the #1 organic production challenge statewide",
            "Labor & water pressure hit coastal/urban-edge farms hardest",
            "UC cost studies: organic profits usually need the premium to match conventional",
            "Cover-crop establishment often ~$40–120/acre (Klonsky / UC modeling)",
        ],
        footnote="Sources: UC Challenges in Organic Ag 2024; Klonsky organic vs conventional cost comparison",
    )

    research_two_col(
        prs,
        "How local organic farms handle pest control",
        "What works in SB / Ventura orchards",
        [
            "UCCE: CA avocados are usually under strong biological control — protect beneficials first",
            "Habitat: hedgerows, cover crops, pollinator edges (Rincon / Apricot Lane / Wanderment)",
            "Cultural: reduce dust on roads (dust kills predators/parasites); prune for air flow; monitor before spray",
            "Animals as managers: ducks for snails; chickens for fly larvae (Apricot Lane model)",
            "Allowed materials when needed: Bt for caterpillars; spinosad (e.g. Entrust) + NR415 oil for thrips/mites",
        ],
        "Implications for Summerland",
        [
            "Don’t start with sprays — start with habitat + monitoring (PCA / UCCE Ventura)",
            "Tier A hedgerows & cover crops are also pest-control infrastructure, not just erosion tools",
            "Budget organic spray only for economic thresholds (thrips/persea mite are the usual drivers)",
            "Confirm every material with your organic certifier before use",
        ],
        footnote="Sources: UCCE Ventura avocado pest mgmt; UC IPM Avocado PMG; UC organic avocado cost study (VSBSLO); Apricot Lane regenerative practices.",
    )

    ops_bullets_slide(prs, "Organic revenue strategy for Summerland (phased)", [
        "Phase 1 (0-12 mo): adopt regenerative practices that improve margins either way (cover crop, mulch, hedgerows, irrigation discipline)",
        "Phase 2 (12-24 mo): run a block-level organic trial where weed pressure and harvest logistics are manageable",
        "Phase 3 (24+ mo): certify only if premium channels are secured (packing/retail/DTC agreements, not assumptions)",
        "Finance gate: track $/acre before/after by block so expansion is data-driven, not ideology-driven",
    ])

    # 3) Peer crops & operating models
    research_two_col(
        prs,
        "Similar-size SoCal farms — crops that are working",
        "Core + diversify",
        [
            "Avocado remains the coastal SoCal cash core (55k+ statewide acres)",
            "Organic avocado + specialty (blueberry, citrus) — Fairfield Farms model",
            "Variety stacking (e.g. Levi’s Somis: ~240 ac, 17 avocado varieties, DTC)",
            "Mediterranean / lower-water add-ons: olives, figs, persimmons, dragonfruit, agave",
            "Subtropicals UCCE tracks: cherimoya, passionfruit, dragonfruit",
        ],
        "Portfolio lesson (from visits + research)",
        [
            "Don’t plant everything — Apricot Lane’s ~17 commercial lines signal focus",
            "Match crops to water (Montecito rates) and slope harvest labor",
            "Exotics need a packing/channel story (Rincon pack house / Tropics)",
            "Direct / specialty channels capture organic premium better than commodity alone",
        ],
        footnote="Sources: CAC Mapping 2025; Levi’s Organic; Fairfield/CA Grown; UCCE Faber; farm visits",
    )

    research_two_col(
        prs,
        "Similar-size SoCal farms — operating models that work",
        "Four working patterns",
        [
            "Packing hub: pack own + neighbors (Rincon) — food safety + volume",
            "Certified organic DTC: pick → pack → ship (Levi’s) — keep margin",
            "Regen lifestyle + agritourism/CSA (Wanderment / Apricot Lane)",
            "Dual crop organic (avocado + blueberry) with sensors & drip (Fairfield)",
        ],
        "Fit for ~80-acre Ortega Ridge",
        [
            "Nearest peer ops: Rincon (hills + packing) & Wanderment (local regen)",
            "Staffing: mid-size organic avocado ranches still need a skilled crew + manager",
            "Sensors / moisture monitoring are now table stakes for water cost control",
            "Conservation grants can fund the same practices seen on visits (hedgerow, cover, mulch)",
        ],
        footnote="Sources: Earl’s Organic Rincon tour; farm websites; CDFA HSP eligible practices",
    )

    # 4) Crop replacement package (soil-fit → candidates → cherimoya → dragon fruit → plan)
    research_two_col(
        prs,
        "Soil-fit logic (370 Ortega Ridge) → crop replacement",
        "Site constraints from L1/L2",
        [
            "Clay to clay-loam soils; low-moderate permeability; rapid runoff risk on steeper units",
            "Active erosion + compaction are primary production constraints",
            "Salt accumulation reported; water-holding profile degraded in many areas",
            "Road-drainage patterning is currently a major hydrologic driver",
        ],
        "What this favors",
        [
            "Perennial systems with year-round cover and minimal disturbance",
            "Crops that can perform with tight irrigation control and mulch-mediated evaporation reduction",
            "Species with proven coastal SB/Ventura production pathways (avocado, cherimoya, selected subtropicals)",
            "Block-by-block replacement rather than wholesale conversion",
        ],
        footnote="Sources: 7th Generation Design L1/L2 soil & hydrology findings; UCCE subtropicals guidance",
    )

    research_two_col(
        prs,
        "Replacing low-margin lemon blocks — candidate crops",
        "Best-fit candidates (given 370ORR soils + climate)",
        [
            "1) Hass/GEM avocado expansion in strongest blocks (existing operational competency)",
            "2) Cherimoya in protected coastal pockets (high-value niche; SB/Ventura precedent)",
            "3) Dragon fruit pilots on lower-water trial acreage (water-efficient specialty option)",
            "4) Olive (oil) only on clearly mechanizable zones and with buyer/processor path secured",
        ],
        "De-prioritize / caution",
        [
            "Scale lemon replant without margin proof (L2 notes lemons often break-even at best)",
            "Broad passionfruit expansion before disease/rootstock and channel plan are solved",
            "Any crop requiring frequent heavy tillage on fragile clay slopes",
            "High-labor specialty expansion without manager bandwidth and workforce plan",
        ],
        footnote="Sources: 370ORR L2 report; UCCE Ventura subtropicals; UC dragon fruit publication; lemon/avocado cost studies",
    )

    research_two_col(
        prs,
        "Cherimoya market deep dive (California)",
        "Demand and channel reality",
        [
            "UCCE: California is the only U.S. commercial producer; demand often exceeds supply in specialty channels",
            "Production concentrated in Santa Barbara / Ventura / San Diego coastal zones",
            "Most volume does not move through transparent daily spot markets; private grower/packer channels dominate",
            "Best channels: gourmet retail, farmers markets, premium direct programs, niche wholesale accounts",
        ],
        "Price signals (use as directional, not guaranteed)",
        [
            "USDA LA Terminal recently listed CA cherimoya around $79–80 per 40-lb carton (~$1.98–2.00/lb)",
            "UCCE historical local/specialty examples show higher direct prices when quality and ripeness control are strong",
            "Current online specialty retailers market cherimoya as premium fruit with substantial retail markups",
            "Conclusion: economics improve most when you control quality, grading, and direct channel relationships",
        ],
        footnote="Sources: UCCE Cherimoya pages; USDA AMS HC_FV010 LA Terminal; CCA handbook/marketing notes",
    )

    research_two_col(
        prs,
        "Why cherimoya can fit 370 Ortega Ridge",
        "Biophysical fit",
        [
            "Coastal SB climate is one of California’s best cherimoya zones (marine influence, mild winters)",
            "L2 already recommends trial planting zones and diversification beyond low-margin lemon blocks",
            "Tree-crop system aligns with low-disturbance, perennial ground-cover strategy on fragile clay slopes",
            "Can be placed in protected pockets while avoiding frost-prone or high wind-exposure microsites",
        ],
        "Execution risks and controls",
        [
            "Labor intensity (pollination/pruning/harvest) can erode margins if scaled too fast",
            "Fruit quality and postharvest handling are make-or-break for repeat buyers",
            "Start small (2–5 acres), then scale only with signed channel demand and block-level KPI performance",
            "Use mixed portfolio: avocado core + cherimoya premium niche + optional dragon fruit trial",
        ],
        footnote="Sources: 370ORR L2 design report; UCCE cherimoya guidance; California cherimoya handbook",
    )

    research_two_col(
        prs,
        "Cherimoya unit economics (directional)",
        "Cost + yield baseline (UC Davis cost study)",
        [
            "Yield range modeled: 4,500–7,500 lb/acre",
            "Cash-cost breakeven: ~$1.08/lb (4,500) → ~$0.70/lb (7,500)",
            "Total-cost breakeven: ~$1.80/lb → ~$1.13/lb",
        ],
        "Realized price scenarios (planning)",
        [
            "Low / wholesale: ~$2.00/lb → cash margin ~$0.92–$1.30/lb",
            "Base / direct specialty: ~$4.50/lb → cash margin ~$3.42–$3.80/lb",
            "High / premium: ~$5.00/lb → cash margin ~$3.92–$4.30/lb",
            "Key lever: raise yield + realized $/lb via QC grading & channel relationships",
        ],
        footnote="UC Davis cost-study breakevens (Table 3). Wholesale price aligns with USDA LA Terminal (~$1.98–2.00/lb). Farmers market direct often cited at ~$4–$5/lb (validate for today’s channel/quality).",
    )

    research_two_col(
        prs,
        "Cherimoya buyers / packers to approach (SB/Ventura outreach)",
        "Local nodes (grow + sell / seasonal availability)",
        [
            "Rincon Tropics (Carpinteria, CA) — DTC cherimoyas; specialization + QC-driven hand pollination",
            "MVP Farms (Fillmore, CA) — cherimoya + passion fruit producer (supports regional specialty demand)",
            "Cherimoya.com (Southern CA) — sells to wholesalers & larger retailers (first-grade + seconds)",
        ],
        "Wholesale / food service distributors (LA, chef accounts)",
        [
            "LuckyTaro (Vernon, CA) — wholesale produce; cherimoya listed on product pages",
            "Melissa’s Produce (LA) — specialty distribution incl. food service line",
            "Outreach angle: offer small pilot volume + clear grading/ripeness protocols",
        ],
        footnote="Sources: Rincon Tropics; MVP Farms; Cherimoya.com; LuckyTaro; Melissa’s Produce.",
    )

    ops_bullets_slide(prs, "Cherimoya pilot recommendation (12–24 months)", [
        "Pilot size: 2–5 acres in the most protected, operationally accessible replacement lemon blocks",
        "Commercial design: pre-secure 2–3 buyers (specialty retail / chefs / direct box channel) before planting expansion",
        "Operating KPIs: net $/acre, labor hours/acre, packout %, reject %, average realized $/lb",
        "Go/No-Go gate: expand only if pilot beats lemon net returns and does not degrade erosion-control progress",
    ])

    research_two_col(
        prs,
        "Dragon fruit (pitahaya) — water-efficient specialty alternative",
        "Why it fits Ortega Ridge constraints",
        [
            "UC ANR calls pitahaya/dragon fruit a promising water-efficient crop option for Southern CA",
            "Survives on minimal water, but commercial fruit set needs consistent drip irrigation",
            "Avoid excessive watering in poorly drained soils (root-zone pathogens)",
            "Trellised blocks can reduce ground disturbance and preserve mulch/cover strategy",
        ],
        "Market + rollout plan",
        [
            "Current demand often exceeds supply; retail prices cited around $3–$8/lb (channel-dependent)",
            "Start small (1–3 acres) near infrastructure; validate variety + trellis system and packout stability",
            "Set targets for fruit size/brix + disease pressure; scale only with a signed direct/specialty account",
        ],
        footnote="Sources: UC ANR pitahaya/water-efficient resources; UC ANR marketing notes with retail price range.",
    )

    ops_bullets_slide(prs, "Recommended replacement plan (next 24 months)", [
        "Keep lemons only where returns and tree health are clearly positive; sunset weak blocks first",
        "Convert first replacement tranche to avocado + soil-building understory where slope/access allow",
        "Run 2-3 acre specialty trials (cherimoya and/or dragon fruit) near infrastructure for close management",
        "Treat olives as optional Tier C: pursue only with harvest/processing economics validated upfront",
        "Gate each expansion by block-level KPIs: net $/acre, labor hours/acre, irrigation gallons/acre, erosion score",
    ])

    # 5) Bridge into decisions
    ops_bullets_slide(prs, "Research → Summerland implications", [
        "Organic premium (~15%) supports a phased certification path — but only with channel + weed plan",
        "Cover crops & hedgerows are the highest evidence-backed fixes for Ortega Ridge erosion",
        "CDFA Healthy Soils / Restore-type grants can underwrite Tier A practice costs",
        "Crop diversification should stay short-list & water-smart — not 200 varieties on day one",
        "Peer ops prove: packing access + DTC/specialty channels beat wholesale-only for organic",
    ])



def grants_section(prs):
    """Grant opportunities that can underwrite Tier A / soil practices."""
    section_divider(prs, "GRANT OPPORTUNITIES",
                    "Funding that matches what we saw — and what Ortega Ridge needs")

    research_two_col(
        prs,
        "Grant stack at a glance (Summerland-relevant)",
        "Near-term / rolling",
        [
            "Zero Foodprint Compost Connector — compost purchase rebates (CA; up to ~$20k/yr)",
            "NRCS EQIP — conservation cost-share (cover, hedgerow, mulch, irrigation); apply via local USDA office",
            "UCCE / RCD technical assistance — free help to package applications",
        ],
        "Next windows to watch",
        [
            "Zero Foodprint Restore Grant — up to $25k; reopen Fall 2026",
            "CDFA Healthy Soils (HSP) — producer apps via regional Block Grant Recipients (~2027)",
            "CDFA SWEEP — irrigation efficiency upgrades via Block Grant Recipients (~2027; up to ~$200k)",
        ],
        footnote="Windows move — confirm current deadlines before applying. Stack carefully (don’t double-count same compost purchase).",
    )

    research_two_col(
        prs,
        "Zero Foodprint — Restore Grant",
        "What it funds (up to $25k)",
        [
            "Cover crops, mulching, compost application, hedgerow planting, range planting",
            "Scored on cost per ton CO₂ sequestered (COMET Planner required)",
            "Technical Assistance Provider required; ZFP pays TA cost in addition to award",
            "Lifetime cap ~$75k across awards; additionality attestation (wouldn’t do it without grant)",
        ],
        "Fit for Ortega Ridge",
        [
            "Maps directly to Tier A: hedgerows, cover crops, mulch on bare patches",
            "California avocado growers already pointed to this program (CAGA resource center)",
            "Prep now: pick 1–4 practices + acreage; draft COMET; ID UCCE/RCD TA partner",
            "Applications closed now → reopen Fall 2026 — get on ZFP newsletter",
        ],
        footnote="Sources: zerofoodprint.org/apply; CAGA Restore Grant announcement (eligible practices list).",
    )

    research_two_col(
        prs,
        "Zero Foodprint — Compost Connector",
        "How it works",
        [
            "CA-only rebate for compost purchased from ZFP-approved CalRecycle facilities",
            "Up to ~$20,000 per year; fixed $/ton rebate (varies by jurisdiction funding)",
            "Sign agreement first — only purchases after award are eligible",
            "Can often stack with non–SB1383 sources (e.g. HSP/EQIP) if rules allow — ask ZFP first",
        ],
        "Why apply for Summerland",
        [
            "Compost is already a fertility-path item (Apricot Lane model; L2 soil rebuild)",
            "Lower barrier than Restore: rolling / queue-based awards while funding lasts",
            "Useful bridge while waiting for Fall 2026 Restore + HSP block-grant reopen",
            "Action: submit Compost Connector intake; identify approved local compost vendor",
        ],
        footnote="Sources: zerofoodprint.org/compost; Compost Connector vendor / claim rules (SB1383 jurisdiction dollars).",
    )

    research_two_col(
        prs,
        "CDFA Healthy Soils + SWEEP (block-grant era)",
        "Healthy Soils Program (HSP)",
        [
            "Practices: cover crop, compost, mulch, hedgerows, reduced till — orchard-eligible",
            "Farmer apps currently closed; regional Block Grant Recipients launch ~2027",
            "On-farm awards historically up to ~$150k (cap ~$75k/practice) via Climate Bond model",
            "Watch CDFA HSP page for SB/Ventura BGR contacts once posted",
        ],
        "SWEEP (water + energy)",
        [
            "Irrigation scheduling, soil moisture sensors, drip upgrades, pump/VFD, fuel conversion",
            "Same block-grant timeline; on-farm projects historically up to ~$200k",
            "High relevance given Montecito-area water cost + slope irrigation control",
            "Do not fund the same equipment twice with EQIP + SWEEP on same parcel",
        ],
        footnote="Sources: CDFA OARS HSP & SWEEP block-grant pages; How to Participate PDFs (2026–27 timeline).",
    )

    research_two_col(
        prs,
        "NRCS EQIP + recommended grant action plan",
        "EQIP (always-on federal path)",
        [
            "Cost-share for conservation plan practices: cover, hedgerow, mulch, irrigation, compost",
            "Applications accepted year-round; ranked against state cutoff dates",
            "Work with Santa Barbara / Ventura USDA Service Center for plan + ranking",
            "Can complement ZFP/HSP if practices/purchases don’t double-count",
        ],
        "90-day actions for Summerland",
        [
            "1) Apply Compost Connector (if compost purchase is near-term)",
            "2) Meet UCCE Ventura/SB + local RCD for TA + COMET dry-run",
            "3) Start EQIP conservation-plan conversation for Tier A acreage",
            "4) Calendar Fall 2026 Restore + watch HSP/SWEEP BGR announcements",
        ],
        footnote="Sources: NRCS California EQIP; UC ANR EQIP organic/transition notes; ZFP + CDFA program pages.",
    )


def staffing_section(prs):
    """Farm manager / student lead / university partnership ideas."""
    section_divider(prs, "PEOPLE & PARTNERS",
                    "Who directs the work — and how UCSB / UC can help transform the farm")

    research_two_col(
        prs,
        "Farm leadership model — Armando + area lead",
        "Keep Armando as the ops engine",
        [
            "Armando already owns daily execution (crew, harvest, logging) — don’t replace that",
            "Gap: someone who knows SB/Ventura avocado systems, regenerative practices, and grant/TA networks",
            "Role of an area lead: set weekly priorities, block trials, buyer/PCA calls — then brief Armando",
            "Success looks like: clear SOPs + KPIs, not two people giving conflicting field orders",
        ],
        "Who could fill the lead seat",
        [
            "A) Hire a part-time / fractional farm manager with coastal avocado experience (best for scale)",
            "B) UCSB/Bren or ES student coordinator (paid) under owner + UCCE advisor oversight",
            "C) Hybrid: experienced consultant 1 day/week + student executes monitoring / grant paperwork",
            "Must speak Spanish with crew OR have a bilingual handoff plan with Armando",
        ],
        footnote="Ops context: Armando is daily logging/crew lead in the Summerland data pipeline; manager role is direction + systems, not replacement.",
    )

    research_two_col(
        prs,
        "UCSB student pathways (practical, not theoretical)",
        "How to plug students in",
        [
            "Env. Studies Internship (ENV S 192) — credit internship hosted on Ortega Ridge",
            "Bren Environmental Leadership (BEL) — paid summer team (Bren grad mentor + undergrad) with external partners",
            "CCBER / Edible Campus alumni — students already trained in restoration, soils, and field work",
            "Scope for a student lead: cover-crop monitoring, COMET/grant packets, photo plots, buyer research — not sole orchard manager",
        ],
        "Guardrails so it works with Armando",
        [
            "Student reports to owner; Armando remains field authority for crew tasks",
            "Written weekly plan (1 page) shared with Armando before Monday start",
            "Pay the role (stipend) — unpaid “intern manager” fails on hills and harvest weeks",
            "Pair with Ben Faber / UCCE Small Farms for technical backup on avocados & practices",
        ],
        footnote="Sources: UCSB ES Internship Program; Bren BEL partner model (e.g. White Buffalo / Jalama projects); UCCE SB contacts.",
    )

    research_two_col(
        prs,
        "Working with the university to transform the farm",
        "Partnership models (light → deep)",
        [
            "Light: UCCE advisory relationship — Faber (avos/soils/water) + Small Farms TA for trials & grants",
            "Medium: multi-year living-lab MOU — UCSB classes/research plots on erosion, cover crops, water, biodiversity",
            "Deep: formal research/education partnership (instrumented blocks, student cohorts, published outcomes)",
            "Regional peer: White Buffalo Land Trust (Summerland-rooted) runs living-lab regen education — explore knowledge exchange, not a takeover",
        ],
        "Suggested 12-month ask list",
        [
            "1) Intro call: UCCE Faber + Small Farms — site walk on Tier A blocks",
            "2) Post 1 paid student coordinator role (ENV S 192 / Handshake / BEL partner ask)",
            "3) Draft living-lab one-pager: research questions, access rules, insurance, IP/data",
            "4) Decide hire track: fractional avocado manager vs. student+consultant hybrid by Q2",
        ],
        footnote="Sources: UCCE Santa Barbara; UC Small Farms SLO/SB; Bren BEL; White Buffalo Land Trust living-lab model (Jalama / Summerland flagship narrative).",
    )


def bibliography_slides(prs):
    bibliography_slide(prs, "Bibliography (1/3) — Organic markets & economics", [
        "1. Organic Produce Network (2025). California’s 2025 organic avocado harvest could reach record-high volume.",
        "2. CDFA State Organic Program (2024). California Agricultural Organics Report 2023–2024.",
        "3. California Avocado Commission / Land IQ (2025). 2025 Statewide Avocado Mapping Report.",
        "4. California Avocado Commission (2024). 2024–25 Business Plan.",
        "5. Klonsky, K. Comparison of Production Costs… Organic and Conventional (UC Davis / NRCS).",
        "6. UC ANR (2024). Challenges in Organic Agriculture in California.",
        "Full URLs & notes: farm_visit_deck/BIBLIOGRAPHY.md",
    ])
    bibliography_slide(prs, "Bibliography (2/3) — Cover crops, soils & funding", [
        "7. Rowe-Fish, A. & Faber, B. (UCCE). Avocados and Cover Crops. Topics in Subtropics.",
        "8–10. CAC cover-crop panel; UCCE Ventura cover crops; UC ANR cover-crop benefits.",
        "11. California Avocado Growers Assoc. Resource Center (organic path + Restore Grant).",
        "12–13. CDFA Healthy Soils Program + Incentive Grants RGA (eligible practices).",
        "28. Zero Foodprint. Restore Grants (up to $25k; reopen Fall 2026) + Compost Connector.",
        "29–30. CDFA SWEEP block-grant pages; NRCS California EQIP (cost-share conservation).",
        "Full URLs & notes: farm_visit_deck/BIBLIOGRAPHY.md",
    ])
    bibliography_slide(prs, "Bibliography (3/3) — SoCal peer farms & visits", [
        "14. Earl’s Organic (2022). Farm Tour 2022: Rincon Avocados.",
        "15. Permanent.ag. Rincon Farms profile.",
        "16. Levi’s Organic Avocados. The Ranch (Somis) — ~240 ac, 17 varieties, DTC.",
        "17. California Grown. Fairfield Farms — organic avocado + blueberry (Pauma Valley).",
        "18–19. Apricot Lane Farms & Wanderment Farms websites; SB Independent Wanderment feature (2024).",
        "20–21. UCCE Ben Faber (Ventura/SB subtropicals); UCCE Small Farms Network SLO & SB.",
        "22. UCCE crop references: Cherimoya, Passionfruit, Dragon Fruit (water-efficient alternative).",
        "23. UCANR lemon cost study (Ventura, 2020) + avocado cost study (Ventura/SB/SLO baseline).",
        "24. USDA AMS / Citrus Mutual lemon price trend references (market context).",
        "25–27. 370ORR L1/L2 soil & hydrology reports + site visits + photo archive (July 2026).",
        "31–33. UCSB ES Internship / Bren BEL; White Buffalo Land Trust living-lab model (SB County).",
    ])


def build():
    prs = Presentation()
    prs.slide_width = SLIDE_W
    prs.slide_height = SLIDE_H

    # 1 Title
    title_slide(prs)
    # 2 Agenda
    agenda_slide(prs)
    # 3 Why
    why_visited(prs)
    # 4 Comparison
    comparison_slide(prs)
    # Rincon section (closest peer first)
    section_divider(prs, "RINCON FARMS",
                    "Carpinteria · avocado orchard + packing house")
    # Rincon ops
    ops_bullets_slide(prs, "Rincon — operations takeaways", [
        "Hedgerows along roads for erosion control and buffers",
        "Cover crops (and wildflowers) in avocado understory",
        "On-site packing for avocados & exotic fruit",
        "Wholesale channels plus local sales",
    ])
    # Rincon photos
    photo_slide_full_caption(
        prs, resolve_img("rincon", "_preview", "IMG_5024.jpg"),
        "Roadside vegetative buffer / hedgerow",
    )
    photo_slide_full_caption(
        prs, resolve_img("rincon", "_preview", "IMG_5033.jpg"),
        "Cover crop & wildflowers under avocados",
    )
    photo_slide_full_caption(
        prs, resolve_img("rincon", "_preview", "IMG_5034.jpg"),
        "Bearing avocado grove",
    )
    photo_slide_full_caption(
        prs, resolve_img("rincon", "_preview", "IMG_5035.jpg"),
        "Hillside orchard with mulch & irrigation",
    )

    # Market pricing (Index Fresh vs Rincon + passionfruit)
    section_divider(prs, "MARKET PRICING",
                    "Index Fresh Fresh Facts · Rincon Farms field sheet · Passionfruit grades")
    hass_price_comparison_slide(prs)
    passionfruit_and_market_notes_slide(prs)

    # Apricot Lane section
    section_divider(prs, "APRICOT LANE FARMS",
                    "Moorpark · Organic & Biodynamic · ~234 acres")
    # Apricot ops
    ops_bullets_slide(prs, "Apricot Lane — operations takeaways", [
        "~17 commercial crops in focus (visit note); 200+ varieties marketed",
        "Animals as landscape managers (not just products)",
        "Compost tea + vermicompost at the Fertility Center",
        "Dedicated pollinator / habitat land woven into the farm",
    ])
    # Apricot photos
    photo_slide_full_caption(
        prs,
        resolve_img("apricot_lane", "_preview", "IMG_4986.jpg"),
        "Fertility Center — vermicompost",
    )
    photo_slide_full_caption(
        prs,
        resolve_img("apricot_lane", "_preview", "IMG_4987.jpg"),
        "Compost tea brew system (Growing Solutions)",
    )
    photo_slide_full_caption(
        prs,
        resolve_img("apricot_lane", "_preview", "IMG_4992.jpg"),
        "New plantings with living ground cover",
    )
    # two-up citrus crates
    p4984 = resolve_img("apricot_lane", "_preview", "IMG_4984.jpg")
    p4995 = resolve_img("apricot_lane", "_preview", "IMG_4995.jpg")
    if p4984 and p4995:
        two_up_photos(prs, [
            (p4984, "Harvest crates"),
            (p4995, "Organic Lisbon lemons"),
        ], main_caption="Packing / organic Lisbon lemons")
    elif p4995:
        photo_slide_full_caption(prs, p4995, "Packing / organic Lisbon lemons")
    elif p4984:
        photo_slide_full_caption(prs, p4984, "Packing / organic Lisbon lemons")
    else:
        photo_slide_full_caption(prs, None, "Packing / organic Lisbon lemons")

    # Wanderment section
    section_divider(prs, "WANDERMENT FARMS",
                    "Toro Canyon / Carpinteria · smaller regenerative model")
    # Wanderment ops
    ops_bullets_slide(prs, "Wanderment — operations takeaways", [
        "Cardboard + mulch for weed kill on bare ground",
        "Olives, garden, and avocados at compact scale",
        "Animals + agritourism as meaningful profit centers",
        "Friday produce boxes — a “small Apricot Lane” feel",
    ])
    # Wanderment cards
    wanderment_cards(prs)

    # Compost tea deep-dive (practice seen at Apricot Lane; transferable later)
    section_divider(prs, "COMPOST TEA",
                    "What we saw at Apricot Lane — and how Summerland could pilot it")
    research_two_col(
        prs,
        "Compost tea — what it is (and isn’t)",
        "Definition",
        [
            "Liquid extract / brew of finished compost applied as a soil drench or foliar spray",
            "Goal: move beneficial biology + soluble nutrients onto the orchard floor or canopy",
            "Not the same as raw compost leachate dripping from a pile (don’t spray that on food crops)",
            "Apricot Lane: Growing Solutions-style aerated brew system next to the Fertility Center",
        ],
        "Why farms use it",
        [
            "Supports living soil after compost / vermicompost programs are in place",
            "Potential plant vigor and disease-suppression benefits when brew quality is consistent",
            "Fits organic / biodynamic fertility loops without synthetic foliar feeds",
            "Works best as part of a system (compost + cover + mulch) — not a standalone fix",
        ],
        footnote="Sources: Apricot Lane visit (Growing Solutions brew); UVM / MOFGA compost-tea primers.",
    )
    research_two_col(
        prs,
        "Compost tea — benefits, limits, and food safety",
        "Promising outcomes",
        [
            "Research reviews: can improve growth, yield/quality, and suppress some diseases when well formulated",
            "Best results usually come with good compost feedstock + consistent brew protocol",
            "Pairs with vermicompost / compost programs (Apricot Lane Fertility Center model)",
            "Useful learning tool for crew: makes soil biology visible and operational",
        ],
        "Hard constraints",
        [
            "Results are variable — efficacy is still a research “black box” without standardized protocols",
            "Food safety: sugar additives (e.g. molasses) can grow E. coli / Salmonella in the brew",
            "NOP guidance: potable water; properly heated compost; avoid untested additives on food crops",
            "Labor + equipment: tanks, aeration, filtration, spray logistics — not free",
        ],
        footnote="Sources: Environmental Technology & Innovation CT fruit-tree review (2026); USDA ARS pathogen studies; NOP / UVM food-safety notes.",
    )
    ops_bullets_slide(prs, "Compost tea for Summerland — pilot recommendation", [
        "Sequence: lock Tier A ground cover / mulch / compost first — tea is Tier B, not day-one",
        "Start small: one aerated brewer on a trial avocado block; soil drench preference over foliar until protocol is proven",
        "Safety rules: finished hot compost only, potable water, no molasses/sugar additives unless lab-tested batches",
        "KPIs before scaling: tree vigor scores, disease notes, labor hours/brew, cost per acre vs. solid compost alone",
        "People: area lead + Armando own the SOP; don’t hand an untrained intern the brew alone",
    ])

    # Bridge: what the visits mean before showing home ranch
    ops_bullets_slide(prs, "What the three farms taught us", [
        "Rincon: hedgerows + cover crops + packing access work on the same coastal hills we farm",
        "Apricot Lane: fertility, animals, and habitat are a system — copy pieces, not the whole capital stack",
        "Wanderment: cardboard+mulch and direct sales scale down to a smaller regenerative op",
        "Common thread: ground cover, living edges, and a clear market channel beat bare soil + wholesale-only",
    ])

    # Home ranch contrast
    section_divider(prs, "HOME RANCH",
                    "Summerland / Ortega Ridge  ·  photos from SB Farms set")
    # 21 Problem two-up
    two_up_photos(prs, [
        (resolve_img("sb_farms", "_preview", "IMG_5007.jpg"), "Erosion gully"),
        (resolve_img("sb_farms", "_preview", "IMG_5019.jpg"), "Root-exposed ditch"),
    ], main_caption="Erosion problem — bare soil and runoff channels")
    # 22 Context
    photo_slide_full_caption(
        prs, resolve_img("sb_farms", "_preview", "IMG_5023.jpg"),
        "Same coastal hills, different management choices",
    )
    # 23 Positive
    photo_slide_full_caption(
        prs, resolve_img("sb_farms", "_preview", "IMG_5022.jpg"),
        "Mulch already in use — expand this",
    )

    # California outside research (soils → organic → peers → crop replacement)
    research_section(prs)

    # Decisions first — what to steal
    section_divider(prs, "DECISIONS FOR SUMMERLAND",
                    "Priorities first — then how we fund and staff them")
    priorities_slide(prs, "Steal first — Tier A", [
        "Hedgerows on roads and drainage lines (Rincon + CDFA HSP practice)",
        "Cover-crop trial in avocados (UCCE-backed; winter rainfall model)",
        "Cardboard + mulch on bare patches (Wanderment; HSP mulching)",
        "Pollinator edge plantings (Apricot Lane / Wanderment)",
    ], tier_note="Highest leverage · start within 90 days · strongest CA research support")
    priorities_slide(prs, "Tier B / C — later layers", [
        "Phased organic certification if channel + weed plan can capture ~15% premium",
        "Compost tea pilot (after fertility basics are in place)",
        "Packing / channel for cherimoya / specialty fruit (after buyers secured)",
        "Livestock later — only with a farm manager; agritourism after zoning/insurance",
    ], tier_note="Do not let these distract from Tier A ground cover & erosion work")

    # Enabling: money then people
    grants_section(prs)
    staffing_section(prs)

    # Closing + bibliography
    closing_slide(prs)
    bibliography_slides(prs)

    prs.save(str(OUT))
    ts = datetime.datetime.now().strftime("%Y-%m-%d_%H%M")
    versioned_out = BASE / f"Farm_Visit_Lessons_Learned_v{ts}.pptx"
    prs.save(str(versioned_out))
    return len(prs.slides)


SPEAKER = """# Farm Visit Lessons Learned — Speaker Notes

Deck: `Farm_Visit_Lessons_Learned.pptx` · Max Buford · July 2026

Story arc: Visits (closest peer first) → Home ranch problem → Evidence → Decisions → Grants → People → Next steps.

---

## Opening
- Title / Agenda / Why: this is decision support for Ortega Ridge, not a travelogue.
- Comparison slide is the map: Rincon (peer) · Apricot Lane (full system) · Wanderment (small transferable).

## Farm visits (Rincon → Apricot → Wanderment)
- Rincon first: same hills, hedgerows, cover crops, packing — what to steal for erosion + channel.
- Market pricing slides: Index Fresh mid vs Rincon field sheet (Hass + organic); passionfruit #1/#2/#3.
- Apricot Lane second: fertility/animals/habitat as a system; copy pieces, not the capital stack.
- Wanderment: cardboard+mulch + DTC at a smaller scale.
- Bridge slide “What the three farms taught us”: lock the common thread before showing home photos.

## Home ranch
- Erosion gullies / bare soil = the problem Tier A attacks.
- Mulch already in use = expand, don’t invent from zero.

## California evidence (order matters)
1. Cover crops first — answers the erosion photos.
2. Organic path — revenue, P&L, soil/economics, pest control, then phased strategy.
3. Peer crops & operating models.
4. Crop replacement — soil-fit → candidates → cherimoya package → dragon fruit → 24-mo plan.
5. Research → implications bridge into decisions.

## Decisions → Grants → People
- Tier A / B before funding & staffing so the board decides *what* first.
- Grants underwrite Tier A (ZFP, HSP, SWEEP, EQIP).
- People: Armando stays ops engine; area lead / UCSB path directs him.
- Next steps are numbered: pilots → people → grants → crop replacement soft-start.

## Bibliography
- Only if asked; full URLs in BIBLIOGRAPHY.md.
"""



def write_notes():
    notes_path = BASE / "SPEAKER_NOTES.md"
    notes_path.write_text(SPEAKER, encoding="utf-8")
    return notes_path


if __name__ == "__main__":
    n = build()
    notes = write_notes()
    print(f"SLIDES: {n}")
    print(f"DECK: {OUT}")
    print(f"NOTES: {notes}")
    if MISSING:
        print("MISSING_IMAGES:")
        for m in MISSING:
            print(f"  - {m}")
    else:
        print("MISSING_IMAGES: none")
