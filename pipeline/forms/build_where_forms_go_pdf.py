#!/usr/bin/env python3
"""One-page (plus short how-to page) field cheat sheet: where each input goes."""

from pathlib import Path

from reportlab.lib.colors import HexColor, white
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas

OUT = Path(__file__).resolve().parents[1] / "docs" / "Where_Forms_Go.pdf"

DARK = HexColor("#1B4332")
OLIVE = HexColor("#52796F")
CREAM = HexColor("#F7F4EF")
CHAR = HexColor("#2D2A26")
SOFT = HexColor("#84A98A")
CARD = HexColor("#E8EDE6")

W, H = letter  # 612 x 792


def wrap(c, text, x, y, max_w, font, size, leading, color=CHAR):
    c.setFillColor(color)
    c.setFont(font, size)
    words = text.split()
    lines = []
    cur = ""
    for w in words:
        trial = (cur + " " + w).strip()
        if c.stringWidth(trial, font, size) <= max_w:
            cur = trial
        else:
            if cur:
                lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    for i, line in enumerate(lines):
        c.drawString(x, y - i * leading, line)
    return len(lines)


def rounded_rect(c, x, y, w, h, fill, radius=8):
    c.setFillColor(fill)
    c.setStrokeColor(fill)
    c.roundRect(x, y, w, h, radius, fill=1, stroke=0)


def numbered_steps(c, x, y, steps, max_w):
    """Draw 1. 2. 3. steps. Returns y after last line."""
    for i, step in enumerate(steps):
        c.setFillColor(DARK)
        c.circle(x + 8, y + 3, 8, fill=1, stroke=0)
        c.setFillColor(white)
        c.setFont("Helvetica-Bold", 8)
        c.drawCentredString(x + 8, y, str(i + 1))
        n = wrap(c, step, x + 22, y, max_w - 22, "Helvetica", 9.5, 12, CHAR)
        y -= 12 * n + 8
    return y


def card(c, x, y, w, h, kicker, title, who, steps, lands):
    rounded_rect(c, x, y, w, h, CARD, 10)
    c.setFillColor(OLIVE)
    c.rect(x, y, 6, h, fill=1, stroke=0)
    c.setFillColor(OLIVE)
    c.setFont("Helvetica-Bold", 8)
    c.drawString(x + 16, y + h - 18, kicker.upper())
    c.setFillColor(DARK)
    c.setFont("Helvetica-Bold", 13)
    c.drawString(x + 16, y + h - 36, title)
    c.setFillColor(OLIVE)
    c.setFont("Helvetica", 8.5)
    c.drawString(x + 16, y + h - 50, who)
    numbered_steps(c, x + 16, y + h - 72, steps, w - 36)
    c.setFillColor(DARK)
    c.setFont("Helvetica-Bold", 8)
    c.drawString(x + 16, y + 22, "Lands in")
    c.setFillColor(CHAR)
    c.setFont("Helvetica", 8.5)
    wrap(c, lands, x + 16, y + 10, w - 32, "Helvetica", 8.5, 11, CHAR)


def build():
    c = canvas.Canvas(str(OUT), pagesize=letter)
    # PAGE 1 — map
    c.setFillColor(CREAM)
    c.rect(0, 0, W, H, fill=1, stroke=0)
    c.setFillColor(DARK)
    c.rect(0, 0, 18, H, fill=1, stroke=0)
    c.setFillColor(OLIVE)
    c.rect(18, 0, 6, H, fill=1, stroke=0)

    c.setFillColor(DARK)
    c.setFont("Helvetica-Bold", 22)
    c.drawString(42, H - 48, "Where things go")
    c.setFillColor(OLIVE)
    c.setFont("Helvetica", 11)
    c.drawString(42, H - 68, "Summerland Farm  ·  four inputs, four destinations")

    wrap(
        c,
        "Use this sheet when you are holding a statement, a pickup receipt, meeting notes, or a day’s labor. Do only the matching row. Live links are on the INDEX tab of Summerland Farm Operations.",
        42,
        H - 92,
        W - 70,
        "Helvetica",
        10,
        13,
        CHAR,
    )

    # Decision table
    rows = [
        ("You have…", "Do this", "Who"),
        ("Index Fresh grower statement (PDF)", "Drop the PDF in Grower Statement Inbox", "Sarah / office"),
        ("Index Fresh bin receipt (paper)", "Photo it in the Bin Receipt form", "Armando"),
        ("Consultant / agronomist notes", "Type or photo in Owner Notes", "Sarah"),
        ("Crew hours for the day or week", "Fill the Worker Hours form", "Armando"),
    ]
    table_top = H - 155
    col_w = [210, 230, 90]
    x0 = 42
    row_h = 22
    for r, row in enumerate(rows):
        y = table_top - r * row_h
        bg = DARK if r == 0 else (CARD if r % 2 == 0 else CREAM)
        c.setFillColor(bg)
        c.rect(x0, y - 6, sum(col_w), row_h, fill=1, stroke=0)
        c.setFillColor(white if r == 0 else CHAR)
        font = "Helvetica-Bold" if r == 0 else "Helvetica"
        c.setFont(font, 8.5 if r else 9)
        xx = x0 + 8
        for i, cell in enumerate(row):
            c.drawString(xx, y + 2, cell)
            xx += col_w[i]

    c.setFillColor(OLIVE)
    c.setFont("Helvetica", 8)
    c.drawString(42, table_top - 5 * row_h - 8, "Do not email PDFs or text photos. They will not enter the sheet.")

    # Four destination cards — 2x2
    cards = [
        (
            "1  ·  Grower statements",
            "Drop in the Inbox folder",
            "Sarah  ·  when the Index Fresh PDF arrives",
            [
                "Open Google Drive → Summerland Farm Operations.",
                "Open the folder named Grower Statement Inbox.",
                "Drop the PDF in (nothing else to click).",
                "Wait about 5 minutes. Processed = done. Needs Review = open it and pick the ranch block. Failed = try a clearer PDF.",
            ],
            "grower_statements tab  ·  file moves to Processed",
        ),
        (
            "2  ·  Bin receipts",
            "Photo upload form",
            "Armando  ·  when Index Fresh picks up bins",
            [
                "Open Bin Receipt Photo Upload (INDEX tab → Form 5). Bookmark on the phone.",
                "Photograph the paper receipt (JPG, not HEIC if you can).",
                "Check date, block, bins, bin numbers. Fix anything OCR missed.",
                "Save. One pickup = one row.",
            ],
            "bin_receipts  +  bin_numbers tabs  ·  photo stored in Drive",
        ),
        (
            "3  ·  Owner notes",
            "Owner Notes form",
            "Sarah  ·  after a consultant / agronomist / advisor meeting",
            [
                "Open Owner Notes (INDEX tab → Form 7). Add to home screen.",
                "Enter date, title, who you met, category.",
                "Type notes, or photo the paper notes, or both.",
                "Save. Open the Google Doc anytime to search the full history.",
            ],
            "Owner Notes Google Doc  +  owner_notes tab",
        ),
        (
            "4  ·  Worker hours",
            "Worker Hours Log form",
            "Armando  ·  end of day or end of week",
            [
                "Open Worker Hours Log (INDEX tab → Form 2).",
                "Date (Fecha), total hours, how many workers.",
                "What they did, which block.",
                "Submit. Optional notes if something unusual happened.",
            ],
            "labor_log tab (the form’s response sheet)",
        ),
    ]

    # These four cards are too tall for page 1 if I already have the table.
    # Page 1 = map only; page 2 = four how-tos. Keep page 1 with a simpler 4-box preview.

    boxes = [
        ("1", "Grower statement PDF", "Inbox folder", "Auto-reads into the sheet"),
        ("2", "Bin receipt paper", "Photo form", "Pickup + bin numbers"),
        ("3", "Meeting / paper notes", "Owner Notes form", "Doc + searchable list"),
        ("4", "Crew hours", "Worker Hours form", "Weekly labor log"),
    ]
    bw = (W - 42 - 36 - 18) / 2
    bh = 78
    start_y = table_top - 5 * row_h - 36
    for i, (n, a, b, d) in enumerate(boxes):
        col = i % 2
        row = i // 2
        x = 42 + col * (bw + 12)
        y = start_y - row * (bh + 10) - bh
        rounded_rect(c, x, y, bw, bh, CARD, 8)
        c.setFillColor(DARK)
        c.circle(x + 18, y + bh - 22, 11, fill=1, stroke=0)
        c.setFillColor(white)
        c.setFont("Helvetica-Bold", 11)
        c.drawCentredString(x + 18, y + bh - 26, n)
        c.setFillColor(DARK)
        c.setFont("Helvetica-Bold", 11)
        c.drawString(x + 36, y + bh - 26, a)
        c.setFillColor(OLIVE)
        c.setFont("Helvetica", 9)
        c.drawString(x + 36, y + bh - 44, "→  " + b)
        c.setFillColor(CHAR)
        c.setFont("Helvetica", 8.5)
        c.drawString(x + 36, y + 16, d)

    c.setFillColor(DARK)
    c.setFont("Helvetica-Bold", 9)
    c.drawString(42, 56, "Links")
    c.setFillColor(CHAR)
    c.setFont("Helvetica", 8.5)
    wrap(
        c,
        "Copy the four URLs from the INDEX tab of the Summerland Farm Operations spreadsheet onto page 3 (or bookmark them on the phone). Inbox folder name: Grower Statement Inbox.",
        42,
        42,
        W - 70,
        "Helvetica",
        8.5,
        11,
        CHAR,
    )

    c.showPage()

    # PAGE 2 — steps
    c.setFillColor(CREAM)
    c.rect(0, 0, W, H, fill=1, stroke=0)
    c.setFillColor(DARK)
    c.rect(0, 0, 18, H, fill=1, stroke=0)
    c.setFillColor(OLIVE)
    c.rect(18, 0, 6, H, fill=1, stroke=0)

    c.setFillColor(DARK)
    c.setFont("Helvetica-Bold", 18)
    c.drawString(42, H - 42, "The four how-tos")
    c.setFillColor(OLIVE)
    c.setFont("Helvetica", 10)
    c.drawString(42, H - 58, "Do the matching one. Stop when it lands.")

    # 2x2 cards
    cw = (W - 42 - 36 - 12) / 2
    ch = 300
    positions = [
        (42, H - 80 - ch),
        (42 + cw + 12, H - 80 - ch),
        (42, H - 80 - ch - 12 - ch),
        (42 + cw + 12, H - 80 - ch - 12 - ch),
    ]
    # Recalc so they fit: available height from H-80 to 50
    avail = H - 80 - 50
    ch = (avail - 12) / 2
    positions = [
        (42, 50 + ch + 12),
        (42 + cw + 12, 50 + ch + 12),
        (42, 50),
        (42 + cw + 12, 50),
    ]

    for pos, spec in zip(positions, cards):
        card(c, pos[0], pos[1], cw, ch, *spec)

    c.showPage()

    # PAGE 3 — write-in links (so the printed copy is actually usable)
    c.setFillColor(CREAM)
    c.rect(0, 0, W, H, fill=1, stroke=0)
    c.setFillColor(DARK)
    c.rect(0, 0, 18, H, fill=1, stroke=0)
    c.setFillColor(OLIVE)
    c.rect(18, 0, 6, H, fill=1, stroke=0)

    c.setFillColor(DARK)
    c.setFont("Helvetica-Bold", 18)
    c.drawString(42, H - 48, "Write the live links here")
    wrap(
        c,
        "Paste from INDEX (column B). Then bookmark each on the phone that will use it.",
        42,
        H - 72,
        W - 70,
        "Helvetica",
        10,
        13,
        OLIVE,
    )

    fields = [
        ("Grower Statement Inbox  (Google Drive folder)", "Sarah  ·  drop PDFs here"),
        ("Bin Receipt Photo Upload  (Form 5)", "Armando  ·  home screen"),
        ("Owner Notes  (Form 7)", "Sarah  ·  home screen"),
        ("Worker Hours Log  (Form 2)", "Armando  ·  home screen"),
    ]
    y = H - 110
    for title, who in fields:
        rounded_rect(c, 42, y - 88, W - 78, 96, CARD, 8)
        c.setFillColor(DARK)
        c.setFont("Helvetica-Bold", 12)
        c.drawString(58, y - 8, title)
        c.setFillColor(OLIVE)
        c.setFont("Helvetica", 9)
        c.drawString(58, y - 24, who)
        c.setStrokeColor(SOFT)
        c.setLineWidth(0.6)
        c.line(58, y - 58, W - 52, y - 58)
        c.setFillColor(OLIVE)
        c.setFont("Helvetica", 8)
        c.drawString(58, y - 72, "URL or folder")
        y -= 118

    c.setFillColor(CHAR)
    c.setFont("Helvetica", 8.5)
    wrap(
        c,
        "If a grower statement sits in Needs Review: the PDF was read but no ranch block name was found. Open it, pick the block, save. Do not re-drop the same file into Inbox.",
        42,
        48,
        W - 70,
        "Helvetica",
        8.5,
        11,
        CHAR,
    )

    c.save()
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    build()
