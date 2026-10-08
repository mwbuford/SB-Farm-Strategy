#!/usr/bin/env python3
"""Standalone deck: what we learned from the three farm visits.

Rincon → Apricot Lane → Wanderment. No home-ranch / grants / crop-replacement block.
"""

import datetime
import sys
from pathlib import Path

from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.enum.text import PP_ALIGN

# Reuse visual system from the original combined deck
sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_deck import (  # noqa: E402
    BASE,
    CHARCOAL,
    CREAM,
    DARK_GREEN,
    LIGHT_OLIVE_BG,
    MISSING,
    OLIVE,
    SLIDE_H,
    SLIDE_W,
    SOFT_OLIVE,
    WHITE,
    add_bullets,
    add_rect,
    add_textbox,
    blank_slide,
    comparison_slide,
    cream_bg,
    hass_price_comparison_slide,
    ops_bullets_slide,
    research_two_col,
    resolve_img,
    section_divider,
    set_cell,
    two_up_photos,
)

OUT = BASE / "Farm_Visit_Peer_Lessons.pptx"


def photo_lesson(prs, img_path, kicker, title, bullets):
    """Photo left (~55%), teaching bullets on cream right."""
    slide = blank_slide(prs)
    cream_bg(slide)
    left_w = Inches(7.3)
    if img_path:
        add_rect(slide, 0, 0, left_w, SLIDE_H, DARK_GREEN)
        from build_deck import add_picture_cover
        add_picture_cover(slide, img_path, 0, 0, left_w, SLIDE_H)
    else:
        add_rect(slide, 0, 0, left_w, SLIDE_H, OLIVE)
        add_textbox(
            slide, Inches(0.4), Inches(3.2), Inches(6.4), Inches(1),
            "[Image unavailable]", size=Pt(20), color=WHITE, align=PP_ALIGN.CENTER,
        )
    add_rect(slide, left_w, 0, SLIDE_W - left_w, SLIDE_H, CREAM)
    add_rect(slide, left_w, 0, Inches(0.08), SLIDE_H, OLIVE)
    x = left_w + Inches(0.35)
    w = Inches(5.3)
    add_textbox(slide, x, Inches(0.45), w, Inches(0.4),
                kicker, size=Pt(13), bold=True, color=OLIVE)
    add_textbox(slide, x, Inches(0.9), w, Inches(1.3),
                title, size=Pt(24), bold=True, color=DARK_GREEN, font_title=True)
    add_bullets(slide, x, Inches(2.4), w, Inches(4.5),
                bullets, size=Pt(16), spacing=Pt(10))
    return slide


def identity_slide(prs, title, kicker, facts, body_title, body_items):
    slide = blank_slide(prs)
    cream_bg(slide)
    add_textbox(slide, Inches(0.6), Inches(0.35), Inches(12), Inches(0.55),
                title, size=Pt(30), bold=True, color=DARK_GREEN, font_title=True)
    add_rect(slide, Inches(0.6), Inches(0.95), Inches(1.5), Inches(0.05), OLIVE)
    add_textbox(slide, Inches(0.6), Inches(1.1), Inches(12), Inches(0.4),
                kicker, size=Pt(15), color=OLIVE)

    n = len(facts)
    gap = Inches(0.18)
    margin = Inches(0.55)
    usable = SLIDE_W - 2 * margin - gap * (n - 1)
    card_w = usable // n
    top = Inches(1.6)
    card_h = Inches(1.7)
    for i, (label, value) in enumerate(facts):
        left = margin + i * (card_w + gap)
        add_rect(slide, left, top, card_w, card_h, LIGHT_OLIVE_BG)
        add_rect(slide, left, top, card_w, Inches(0.08), OLIVE)
        add_textbox(slide, left + Inches(0.18), top + Inches(0.25),
                    card_w - Inches(0.36), Inches(0.35),
                    label, size=Pt(12), bold=True, color=OLIVE, align=PP_ALIGN.CENTER)
        add_textbox(slide, left + Inches(0.15), top + Inches(0.65),
                    card_w - Inches(0.3), Inches(0.85),
                    value, size=Pt(16), bold=True, color=DARK_GREEN, align=PP_ALIGN.CENTER)

    add_textbox(slide, Inches(0.6), Inches(3.55), Inches(12), Inches(0.4),
                body_title, size=Pt(18), bold=True, color=DARK_GREEN)
    add_bullets(slide, Inches(0.6), Inches(4.05), Inches(12.1), Inches(3.0),
                body_items, size=Pt(18), spacing=Pt(8))
    return slide


def steal_table_slide(prs, title, subtitle, rows):
    """rows: list of [Practice, Fit, Why / caveat]. First row is header."""
    slide = blank_slide(prs)
    cream_bg(slide)
    add_textbox(slide, Inches(0.5), Inches(0.28), Inches(12.3), Inches(0.5),
                title, size=Pt(28), bold=True, color=DARK_GREEN, font_title=True)
    add_rect(slide, Inches(0.5), Inches(0.82), Inches(1.5), Inches(0.05), OLIVE)
    add_textbox(slide, Inches(0.5), Inches(0.95), Inches(12.3), Inches(0.35),
                subtitle, size=Pt(14), color=OLIVE)

    table_shape = slide.shapes.add_table(
        len(rows), 3, Inches(0.5), Inches(1.4), Inches(12.3), Inches(5.6)
    )
    table = table_shape.table
    table.columns[0].width = Inches(3.3)
    table.columns[1].width = Inches(1.7)
    table.columns[2].width = Inches(7.3)

    for r, row in enumerate(rows):
        for c, val in enumerate(row):
            cell = table.cell(r, c)
            if r == 0:
                set_cell(cell, val, bold=True, fill=DARK_GREEN, color=WHITE, size=Pt(13))
            else:
                fill = LIGHT_OLIVE_BG if r % 2 == 0 else CREAM
                fit_color = DARK_GREEN if c == 1 else CHARCOAL
                bold = c == 1
                align = PP_ALIGN.CENTER if c == 1 else PP_ALIGN.LEFT
                set_cell(
                    cell, val, bold=bold, fill=fill, color=fit_color,
                    size=Pt(13), align=align,
                )
    return slide


def four_cards(prs, title, subtitle, cards):
    """cards: list of 4 (heading, body)."""
    slide = blank_slide(prs)
    cream_bg(slide)
    add_textbox(slide, Inches(0.55), Inches(0.3), Inches(12.2), Inches(0.55),
                title, size=Pt(28), bold=True, color=DARK_GREEN, font_title=True)
    add_rect(slide, Inches(0.55), Inches(0.88), Inches(1.5), Inches(0.05), OLIVE)
    if subtitle:
        add_textbox(slide, Inches(0.55), Inches(1.0), Inches(12.2), Inches(0.4),
                    subtitle, size=Pt(14), color=OLIVE)
        grid_top = Inches(1.5)
    else:
        grid_top = Inches(1.2)

    margin = Inches(0.5)
    gap = Inches(0.22)
    usable = SLIDE_W - 2 * margin - gap
    card_w = usable // 2
    card_h = Inches(2.55)
    for i, (h, body) in enumerate(cards):
        row, col = divmod(i, 2)
        left = margin + col * (card_w + gap)
        top = grid_top + row * (card_h + gap)
        add_rect(slide, left, top, card_w, card_h, LIGHT_OLIVE_BG)
        add_rect(slide, left, top, Inches(0.1), card_h, OLIVE)
        add_textbox(slide, left + Inches(0.35), top + Inches(0.28),
                    card_w - Inches(0.55), Inches(0.5),
                    h, size=Pt(18), bold=True, color=DARK_GREEN, font_title=True)
        add_textbox(slide, left + Inches(0.35), top + Inches(0.9),
                    card_w - Inches(0.55), Inches(1.4),
                    body, size=Pt(16), color=CHARCOAL)
    return slide


def takeaway_slide(prs, farm, line, supporting):
    slide = blank_slide(prs)
    cream_bg(slide)
    add_rect(slide, 0, 0, Inches(0.28), SLIDE_H, DARK_GREEN)
    add_textbox(slide, Inches(0.8), Inches(1.5), Inches(11.5), Inches(0.4),
                f"{farm} — visit takeaway", size=Pt(16), bold=True, color=OLIVE)
    add_textbox(slide, Inches(0.8), Inches(2.05), Inches(11.5), Inches(2.2),
                line, size=Pt(28), bold=True, color=DARK_GREEN, font_title=True)
    add_bullets(slide, Inches(0.8), Inches(4.5), Inches(11.5), Inches(2.4),
                supporting, size=Pt(18), spacing=Pt(10))
    return slide


def title_slide(prs):
    slide = blank_slide(prs)
    cream_bg(slide)
    add_rect(slide, 0, 0, Inches(0.35), SLIDE_H, DARK_GREEN)
    add_rect(slide, Inches(0.35), 0, Inches(0.12), SLIDE_H, OLIVE)
    add_textbox(slide, Inches(1.0), Inches(1.7), Inches(11), Inches(0.45),
                "Peer farm visits  ·  July 2026", size=Pt(16), bold=True, color=OLIVE)
    add_textbox(slide, Inches(1.0), Inches(2.2), Inches(11.5), Inches(1.5),
                "What we learned from three farms",
                size=Pt(40), bold=True, color=DARK_GREEN, font_title=True)
    add_textbox(slide, Inches(1.0), Inches(3.85), Inches(11), Inches(1.0),
                "Rincon Farms  ·  Apricot Lane Farms  ·  Wanderment Farms",
                size=Pt(20), color=OLIVE)
    add_textbox(slide, Inches(1.0), Inches(5.15), Inches(11), Inches(0.8),
                "A working brief for Summerland / Ortega Ridge — what to copy, what to adapt, what to leave.",
                size=Pt(18), color=CHARCOAL)
    add_textbox(slide, Inches(1.0), Inches(6.5), Inches(11), Inches(0.4),
                "Max Buford", size=Pt(16), color=CHARCOAL)
    return slide


def agenda_slide(prs):
    slide = blank_slide(prs)
    cream_bg(slide)
    add_textbox(slide, Inches(0.8), Inches(0.45), Inches(11), Inches(0.7),
                "Agenda", size=Pt(32), bold=True,
                color=DARK_GREEN, font_title=True)
    add_rect(slide, Inches(0.8), Inches(1.2), Inches(1.5), Inches(0.06), OLIVE)
    items = [
        "Three farms at a glance — then what to steal from each",
        "Rincon → Apricot Lane → Wanderment (peer → system → copyable scale)",
        "One steal list for Ortega Ridge",
        "Looking ahead: CDP buildings, organic, agritourism, UCSB",
    ]
    add_bullets(slide, Inches(0.8), Inches(1.8), Inches(11.5), Inches(4.8),
                items, size=Pt(22), spacing=Pt(16))
    return slide


def rincon_section(prs):
    section_divider(prs, "RINCON FARMS",
                    "Closest peer  ·  same hills, same crop, packing house")

    ops_bullets_slide(prs, "Rincon — what matters", [
        "Hedgerows on roads and drainage lines — erosion control first, habitat second",
        "Cover crops / wildflowers under avocados — pilot with a water meter, winter rainfall window",
        "On-site packing for avocados & exotics — learn the channel, do not build a shed year one",
        "Takeaway: steal the orchard floor before you steal the packing house",
    ])

    two_up_photos(prs, [
        (resolve_img("rincon", "_preview", "IMG_5024.jpg"), "Roadside hedgerow / buffer"),
        (resolve_img("rincon", "_preview", "IMG_5033.jpg"), "Cover crop under avocados"),
    ], main_caption="Steal these two first")

    hass_price_comparison_slide(prs)

    steal_table_slide(
        prs,
        "Rincon — steal, adapt, leave",
        "Next 12–24 months at Ortega Ridge",
        [
            ["Practice", "Fit", "Why / caveat"],
            ["Hedgerows on roads & drainage", "High", "Attacks #1 erosion problem; HSP-eligible"],
            ["Cover crops in avocados", "High", "Pilot + water monitoring; winter rainfall"],
            ["Mulch on orchard floor", "High", "Already started at home — expand"],
            ["Packing / specialty channel", "Medium", "Learn grades & QC; no shed CAPEX yet"],
            ["Pack neighbors’ fruit", "Low now", "Needs volume + FSMA first"],
        ],
    )


def apricot_section(prs):
    section_divider(prs, "APRICOT LANE FARMS",
                    "North-star system  ·  copy pieces, not the campus")

    four_cards(
        prs,
        "Apricot Lane — four pieces to remember",
        "~234 acres · organic + biodynamic · ~17 commercial crop lines (visit note)",
        [
            ("Crop discipline",
             "200+ varieties marketed; commercial focus narrowed toward ~17 lines. Diversity is brand; focus is P&L."),
            ("Animals as managers",
             "Livestock are laborers first. Needs fencing + a manager — later for us."),
            ("Fertility Center",
             "Vermicompost + aerated compost tea. Start with compost; tea is Tier B."),
            ("Habitat edges",
             "Pollinator / native margins as pest insurance — phase on ex-citrus edges, not 40 habitat acres day one."),
        ],
    )

    two_up_photos(prs, [
        (resolve_img("apricot_lane", "_preview", "IMG_4986.jpg"), "Vermicompost"),
        (resolve_img("apricot_lane", "_preview", "IMG_4987.jpg"), "Compost tea brew"),
    ], main_caption="Fertility Center — copy the logic, start smaller")

    research_two_col(
        prs,
        "Compost tea — one-slide version",
        "What it is",
        [
            "Aerated brew of finished compost as a soil drench (or foliar)",
            "Stretches good compost biology across acres — not leachate from a pile",
            "Works only as part of compost + cover + mulch",
        ],
        "If we pilot",
        [
            "After ground cover and a compost source exist — not day one",
            "One trial block; soil drench first; no molasses unless lab-tested",
            "KPIs: vigor, disease notes, hours/brew, $/acre vs solid compost",
        ],
        footnote="Apricot Lane Growing Solutions brew  ·  NOP / UVM food-safety notes",
    )

    steal_table_slide(
        prs,
        "Apricot Lane — steal, adapt, leave",
        "The system is the lesson. The campus is not the plan.",
        [
            ["Practice", "Fit", "Why / caveat"],
            ["Narrow commercial crop list", "High", "~17 lines that sell — citrus-transition choices"],
            ["Pollinator / habitat edges", "High", "One margin first"],
            ["Compost tea / vermicompost", "Medium", "After compost exists; food-safety SOP"],
            ["Animals as managers", "Later", "Needs a manager"],
            ["234-ac brand + ~50 FTE", "Do not copy", "Different capital and labor model"],
        ],
    )


def wanderment_section(prs):
    section_divider(prs, "WANDERMENT FARMS",
                    "Copyable scale  ·  ~56 acres  ·  cardboard, boxes, optional tours")

    four_cards(
        prs,
        "Wanderment — the on-ramp playbook",
        "Same regen philosophy as Apricot Lane, thinner crew, closer to our acreage",
        [
            ("Cardboard + mulch",
             "Fastest transferable tactic. Smother weeds without herbicides on bare / eroded patches."),
            ("Ground cover",
             "Same lesson as Rincon — living floor under trees, simpler kit."),
            ("Friday boxes",
             "DTC without a pack house. Useful once grades and packing are real."),
            ("Agritourism",
             "Real P&L for them. For us: zoning, insurance, access — after orchard floor, not instead of it."),
        ],
    )

    steal_table_slide(
        prs,
        "Wanderment — steal, adapt, leave",
        "Most copyable near-term playbook of the three",
        [
            ["Practice", "Fit", "Why / caveat"],
            ["Cardboard + mulch", "High", "Start on bare / eroded patches now"],
            ["Ground cover under trees", "High", "Same as Rincon, simpler"],
            ["Friday box / DTC", "Medium", "Once packing + grades exist"],
            ["Sheep / chicken rotation", "Medium", "Only with fencing + manager"],
            ["Full agritourism program", "Later", "Separate permit path — see Looking ahead"],
        ],
    )


def synthesis_section(prs):
    section_divider(prs, "WHAT TO TAKE HOME",
                    "One through-line  ·  one steal list")

    steal_table_slide(
        prs,
        "Steal list for Ortega Ridge",
        "Ground cover, living edges, and a clear market channel beat bare soil + wholesale-only",
        [
            ["Move", "From", "When"],
            ["Hedgerows on roads & ditches", "Rincon", "Soon"],
            ["Cover-crop trial in avocados", "Rincon", "Soon — winter window"],
            ["Cardboard + mulch on bare ground", "Wanderment", "Soon"],
            ["Pollinator / native edge", "Apricot / Wanderment", "Soon — one margin"],
            ["Compost tea pilot", "Apricot Lane", "After compost + cover"],
            ["Specialty packing / grades", "Rincon", "Design this year"],
            ["Crop shortlist (~17 lines)", "Apricot Lane", "Citrus transition"],
            ["Livestock / agritourism", "Apricot / Wanderment", "Only with a manager + permits"],
        ],
    )

    slide = blank_slide(prs)
    cream_bg(slide)
    add_rect(slide, 0, 0, Inches(0.28), SLIDE_H, DARK_GREEN)
    add_textbox(slide, Inches(0.9), Inches(1.8), Inches(11.5), Inches(0.4),
                "One sentence", size=Pt(16), bold=True, color=OLIVE)
    add_textbox(slide, Inches(0.9), Inches(2.4), Inches(11.5), Inches(2.6),
                "Cover the ground, plant the edges, and know who buys the fruit — then layer fertility, animals, and visitors.",
                size=Pt(28), bold=True, color=DARK_GREEN, font_title=True)
    add_textbox(slide, Inches(0.9), Inches(5.5), Inches(11.5), Inches(0.9),
                "Next: CDP buildings, organic path, agritourism permits, UCSB contacts.",
                size=Pt(18), color=CHARCOAL)


def looking_ahead_section(prs):
    """CDP plan snapshot + organic + agritourism + UCSB — after the visit synthesis."""
    section_divider(
        prs, "LOOKING AHEAD",
        "CDP buildings already in permitting  ·  organic  ·  agritourism  ·  UCSB help",
    )

    identity_slide(
        prs,
        "What the current CDP actually is",
        "370 Ortega Ridge Road — Agricultural Improvement Plans  ·  4th CDP submittal 6/15/26  ·  Becker Studios",
        [
            ("Parcel", "72.88 acres\nAG-I-20"),
            ("APN", "005-080-017"),
            ("Coastal", "Appeals boundary\non the site"),
            ("Fire", "High Fire\nYes"),
        ],
        "Two scope areas — not a tour program",
        [
            "Scope 1: remodel existing 2-car garage to a pool cabana + new pre-engineered metal equipment barn on slab",
            "Scope 2: new operations barn + office on slab, plus two prefab agricultural employee dwellings; relocate water tanks out of setback",
            "Main house and 45' pool are existing / not in farm-ops scope. Tennis court and part of the asphalt drive are demo’d.",
        ],
    )

    steal_table_slide(
        prs,
        "Buildings in the CDP — numbers from the cover sheet",
        "Net sf from A0.00  ·  total new development ~7,075 nsf / 7,470 gsf  ·  grading cut 2,250 cy / fill 1,670 / export 580",
        [
            ["Piece", "Net sf", "Why it matters for the farm"],
            ["Equipment barn", "~3,042", "Shop + crop/equipment storage next to the motor court"],
            ["Operations barn + office", "~2,778", "Working HQ — packing/crew/records, not a tasting room"],
            ["Farm worker unit #1", "640", "On-site agricultural employee housing"],
            ["Farm worker unit #2", "640", "Second unit — crew capacity, not agritourism lodging"],
            ["Pool cabana (garage remodel)", "~635", "Residential amenity — do not treat as farm visitor space"],
            ["Water tanks", "Relocate", "Three 500-gal + two 5,000-gal tanks moved out of setback"],
        ],
    )

    four_cards(
        prs,
        "How the CDP maps onto the visit lessons",
        "Buildings enable the steal list. They do not replace hedgerows, cover crops, or mulch.",
        [
            ("Operations barn",
             "Rincon’s lesson was packing access. This barn is the local version: a place to grade, stage, and keep records — not a neighbor pack house."),
            ("Equipment barn",
             "Orchard-floor work (mulch, cardboard, cover-crop kit) needs a real shop. This is that building."),
            ("Farm worker units",
             "Wanderment and Apricot Lane run with people on site. Two ag-employee dwellings are crew housing, not farmstay rooms."),
            ("What is not in the CDP",
             "No farm stand, no tour route, no event barn, no USDA organic seal. Those are separate permits and programs."),
        ],
    )

    ops_bullets_slide(prs, "Constraints already on the drawings", [
        "Coastal Commission appeals boundary crosses the property — public-facing uses get extra scrutiny",
        "Montecito Water District easements and laterals; 20' / 50' setbacks from Ortega Ridge Road",
        "High Fire Hazard; Type V-B construction; no sprinklers noted on the cover sheet",
        "New gated entries must meet sight-triangle / encroachment-permit rules — visitor traffic is a planning issue, not just a branding issue",
        "Sanitary sewer work (laterals + lift station) is in the civil set — farmworker units depend on that, not on agritourism revenue",
    ])

    section_divider(prs, "ORGANIC",
                    "Certification is a USDA + California process — not a county building permit")

    research_two_col(
        prs,
        "Organic — what “permitting” actually means",
        "Two required layers (CA)",
        [
            "USDA National Organic Program: pick an accredited certifier (CCOF is the usual CA avocado path)",
            "Submit an Organic System Plan (farm map, inputs, records) → inspection → certificate",
            "CDFA State Organic Program: California registration before the first organic sale",
            "If organic sales will exceed $5,000/year, certification is required — not optional",
        ],
        "The 36-month clock",
        [
            "Land must have had no prohibited materials for 36 consecutive months before you can sell as organic",
            "Start tracking inputs on day one of transition — receipts for everything that hits the grove",
            "During transition you cannot label, sell, or use the USDA organic seal",
            "After certification: annual inspection + annual CDFA registration",
        ],
        footnote="Sources: CAC organic grower path; CDFA SOP; UC/CCOF Ten Steps to Organic Certification (2025).",
    )

    research_two_col(
        prs,
        "Organic — why the visits still matter here",
        "What we already saw",
        [
            "Rincon packs organic and conventional — the premium is real on large Hass (see pricing slides)",
            "Apricot Lane is certified organic + biodynamic; they also narrowed commercial lines",
            "Wanderment is certified organic at compact scale with cardboard/mulch instead of herbicides",
            "Weed control is the #1 organic production challenge in California — that is the ops risk, not the paperwork",
        ],
        "A sane sequence for Ortega Ridge",
        [
            "1) Lock orchard-floor practices that organic will require anyway (cover, mulch, hedgerows)",
            "2) Document last prohibited spray/fertilizer date by block — that starts the 36-month math",
            "3) Call a certifier + UCCE before converting the whole ranch; a block trial is allowed",
            "4) Only then spend on OSP + CDFA registration — after Index Fresh (or DTC) will pay the premium",
        ],
        footnote="Do not wait for the operations barn to start the input log. The clock is chemical history, not construction.",
    )

    section_divider(prs, "AGRITOURISM",
                    "Wanderment is the model  ·  AG-I coastal Montecito is not AG-II inland")

    research_two_col(
        prs,
        "Agritourism permitting — start from the zone",
        "What the county actually expanded",
        [
            "Santa Barbara County Agricultural Enterprise Ordinance (adopted Dec 2024) mainly opens uses on AG-II",
            "Tours, farmstays, small events, campgrounds: AG-II playbook, often a CDP in the coastal zone",
            "On AG-I, the ordinance is much narrower (e.g. incidental food at winery tasting rooms — we are not a winery)",
            "370 Ortega Ridge is AG-I-20 in the Montecito / coastal area — do not assume AEO tour rules apply",
        ],
        "What can still be on the table (AG-I coastal)",
        [
            "Agricultural product sales / farm stands: some small operations can be CDP-exempt if they meet size, setback, and view standards (Article II §35-131)",
            "Anything that brings the public on site (tours, events, lodging) generally needs a Coastal Development Permit",
            "The current CDP is barns + farmworker housing + cabana. It does not authorize tours",
            "Montecito Planning Area has extra limits on selling off-site product — boxes of neighbors’ fruit are not automatic",
        ],
        footnote="Sources: SB County AEO / Article II coastal zoning; UCANR California Agritourism. Confirm with County Planning & Development before any public event.",
    )

    four_cards(
        prs,
        "Agritourism — copy Wanderment’s order, not their calendar",
        "Permits follow a working farm. They do not create one.",
        [
            ("Allowed without a tour CDP",
             "Growing, packing for wholesale, employee housing (once this CDP is issued), orchard-floor work."),
            ("Likely needs its own CDP",
             "Guided tours, farm dinners, corporate retreats, a public farm stand that misses the exemption, overnight stays."),
            ("Insurance + access first",
             "Gated entries and sight triangles are already on the drawings. Visitor cars are a fire + neighbor + Coastal issue."),
            ("DTC boxes ≠ agritourism",
             "A Friday box delivered off-site is a sales channel. A Saturday tour is a land-use change. Do not mix the two in a permit ask."),
        ],
    )

    section_divider(prs, "UCSB & UC HELP",
                    "Who to call  ·  what to ask  ·  what not to hand a student")

    steal_table_slide(
        prs,
        "Who to contact — and for what",
        "Students can monitor and paper the work. They should not be the orchard manager.",
        [
            ["Who", "Contact", "Ask them for"],
            ["UCSB ES Internship (ENV S 192)", "es.ucsb.edu/internships", "Paid student coordinator: photo plots, cover-crop logs, grant packets"],
            ["Bren BEL (summer team)", "bren.ucsb.edu / BEL", "Scoped summer project with a Bren grad mentor (erosion, water, habitat)"],
            ["CCBER / Edible Campus", "CCBER UCSB", "Restoration + soils students who already know field work"],
            ["UCCE — Ben Faber / avocados", "UCCE Ventura / SB", "Cover crops, irrigation, organic materials, site walk on Tier A blocks"],
            ["UC Small Farms (SLO–SB)", "UC ANR Small Farms", "Transition TA, recordkeeping, certifier intro"],
            ["White Buffalo Land Trust", "whitebuffalolandtrust.org", "Local living-lab peer — knowledge exchange, not a takeover"],
        ],
    )

    research_two_col(
        prs,
        "A 12-month ask list (so this does not stay a slide)",
        "Do these",
        [
            "1) Intro call: UCCE Faber + Small Farms — walk the blocks we would cover-crop and mulch",
            "2) Post one paid student coordinator (ENV S 192 / Handshake / BEL partner ask)",
            "3) Ask County P&D: what, if anything, of agritourism is even eligible on this AG-I-20 coastal lot",
            "4) Ask a certifier (CCOF) what they need for a block-level organic trial and the 36-month clock",
        ],
        "Guardrails with Armando",
        [
            "Student reports to the owner; Armando remains field authority for crew tasks",
            "One-page weekly plan shared with Armando before Monday",
            "Pay the student — unpaid “intern manager” fails on harvest weeks",
            "Do not put a student on CDP construction administration or Coastal hearings",
        ],
        footnote="Sources: UCSB ES Internship; Bren BEL; UCCE SB/Ventura; White Buffalo living-lab model.",
    )

    ops_bullets_slide(prs, "Order of operations — visits → CDP → later layers", [
        "Now: orchard floor (hedgerows, cover-crop trial, cardboard + mulch) — no new permit required for ordinary farming",
        "This CDP (when issued): equipment barn, operations barn, two farmworker units, cabana, tank relocation",
        "Then: organic transition paperwork if the 36-month clock and a buyer premium justify it",
        "Last: agritourism only after Planning confirms AG-I coastal eligibility — and after the farm looks like a farm, not a construction site",
    ])


SPEAKER = """# Farm Visit Peer Lessons — Speaker Notes

Deck: `Farm_Visit_Peer_Lessons.pptx` · Max Buford · August 2026

Concise visit brief, then looking-ahead (CDP / organic / agritourism / UCSB).

## Opening
- Title → agenda → three-farm comparison. Rincon = peer, Apricot = system, Wanderment = copyable scale.

## Rincon (4 content slides)
- What matters: hedgerows, cover crops, packing channel (not shed CAPEX).
- Two photos: roadside buffer + understory cover.
- Hass price table: large sizes premium vs Index; grades matter.
- Steal table.

## Apricot Lane (4 content slides)
- Four pieces: crop discipline, animals later, fertility, habitat edges.
- Fertility Center two-up; compost tea one slide.
- Steal table — do not copy campus / FTE.

## Wanderment (2 content slides)
- Cardboard + mulch, ground cover, boxes, agritourism later.
- Steal table.

## Synthesis
- One cross-farm steal list + one sentence. Then Looking ahead.

## Looking ahead
- CDP barns + farmworker units (not tours). Organic = USDA + CDFA, 36-month clock. Agritourism: AG-I coastal ≠ AEO AG-II. UCSB/UCCE contacts.
"""


def build():
    prs = Presentation()
    prs.slide_width = SLIDE_W
    prs.slide_height = SLIDE_H

    title_slide(prs)
    agenda_slide(prs)
    comparison_slide(prs)

    rincon_section(prs)
    apricot_section(prs)
    wanderment_section(prs)
    synthesis_section(prs)
    looking_ahead_section(prs)

    out = OUT
    prs.save(str(out))
    ts = datetime.datetime.now().strftime("%Y-%m-%d_%H%M")
    versioned = BASE / f"Farm_Visit_Peer_Lessons_v{ts}.pptx"
    prs.save(str(versioned))
    notes = BASE / "VISIT_LESSONS_SPEAKER_NOTES.md"
    notes.write_text(SPEAKER, encoding="utf-8")
    return len(prs.slides), out, versioned, notes


if __name__ == "__main__":
    n, out, versioned, notes = build()
    print(f"SLIDES: {n}")
    print(f"DECK: {out}")
    print(f"VERSIONED: {versioned}")
    print(f"NOTES: {notes}")
    if MISSING:
        print("MISSING_IMAGES:")
        for m in MISSING:
            print(f"  - {m}")
    else:
        print("MISSING_IMAGES: none")
