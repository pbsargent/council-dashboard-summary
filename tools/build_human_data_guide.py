#!/usr/bin/env python3
from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path

from docx import Document
from docx.enum.table import WD_CELL_VERTICAL_ALIGNMENT, WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Pt, RGBColor


ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "docs"
OUT_FILE = OUT_DIR / "Council-Dashboard-Summary-Source-and-Calculation-Guide.docx"
LATEST_JSON = ROOT / "data" / "latest.json"
MONDAY_JSON = ROOT / "data" / "monday-latest.json"
LOGO = ROOT / "assets" / "cac-logo.png"

BLUE = RGBColor(46, 116, 181)
DARK_BLUE = RGBColor(31, 77, 120)
INK = RGBColor(18, 32, 51)
MUTED = RGBColor(83, 97, 116)
LIGHT_BLUE = "E8EEF5"
LIGHT_GRAY = "F4F6F9"
LINE = "CAD6E2"


def load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def fmt_num(value) -> str:
    if value is None:
        return "n/a"
    try:
        return f"{float(value):,.0f}"
    except (TypeError, ValueError):
        return str(value)


def fmt_pct(value) -> str:
    if value is None:
        return "n/a"
    try:
        return f"{float(value) * 100:.1f}%"
    except (TypeError, ValueError):
        return str(value)


def short_date(value: str | None) -> str:
    if not value:
        return "n/a"
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).strftime("%b %-d, %Y")
    except ValueError:
        return value


def set_run_font(run, name="Calibri", size=None, color=None, bold=None, italic=None):
    run.font.name = name
    run._element.rPr.rFonts.set(qn("w:ascii"), name)
    run._element.rPr.rFonts.set(qn("w:hAnsi"), name)
    if size is not None:
        run.font.size = Pt(size)
    if color is not None:
        run.font.color.rgb = color
    if bold is not None:
        run.bold = bold
    if italic is not None:
        run.italic = italic


def set_cell_shading(cell, fill: str):
    tc_pr = cell._tc.get_or_add_tcPr()
    shd = tc_pr.find(qn("w:shd"))
    if shd is None:
        shd = OxmlElement("w:shd")
        tc_pr.append(shd)
    shd.set(qn("w:fill"), fill)


def set_cell_margins(cell, top=80, start=120, bottom=80, end=120):
    tc = cell._tc
    tc_pr = tc.get_or_add_tcPr()
    tc_mar = tc_pr.first_child_found_in("w:tcMar")
    if tc_mar is None:
        tc_mar = OxmlElement("w:tcMar")
        tc_pr.append(tc_mar)
    for margin, value in {"top": top, "start": start, "bottom": bottom, "end": end}.items():
        node = tc_mar.find(qn(f"w:{margin}"))
        if node is None:
            node = OxmlElement(f"w:{margin}")
            tc_mar.append(node)
        node.set(qn("w:w"), str(value))
        node.set(qn("w:type"), "dxa")


def set_cell_width(cell, width_dxa: int):
    tc_pr = cell._tc.get_or_add_tcPr()
    tc_w = tc_pr.find(qn("w:tcW"))
    if tc_w is None:
        tc_w = OxmlElement("w:tcW")
        tc_pr.append(tc_w)
    tc_w.set(qn("w:w"), str(width_dxa))
    tc_w.set(qn("w:type"), "dxa")


def set_table_borders(table, color=LINE, size="6"):
    tbl_pr = table._tbl.tblPr
    borders = tbl_pr.first_child_found_in("w:tblBorders")
    if borders is None:
        borders = OxmlElement("w:tblBorders")
        tbl_pr.append(borders)
    for edge in ["top", "left", "bottom", "right", "insideH", "insideV"]:
        tag = f"w:{edge}"
        element = borders.find(qn(tag))
        if element is None:
            element = OxmlElement(tag)
            borders.append(element)
        element.set(qn("w:val"), "single")
        element.set(qn("w:sz"), size)
        element.set(qn("w:space"), "0")
        element.set(qn("w:color"), color)


def set_table_width(table, col_widths_dxa: list[int], indent_dxa=120):
    table.alignment = WD_TABLE_ALIGNMENT.LEFT
    tbl = table._tbl
    tbl_pr = tbl.tblPr
    tbl_w = tbl_pr.first_child_found_in("w:tblW")
    if tbl_w is None:
        tbl_w = OxmlElement("w:tblW")
        tbl_pr.append(tbl_w)
    tbl_w.set(qn("w:w"), str(sum(col_widths_dxa)))
    tbl_w.set(qn("w:type"), "dxa")
    tbl_ind = tbl_pr.first_child_found_in("w:tblInd")
    if tbl_ind is None:
        tbl_ind = OxmlElement("w:tblInd")
        tbl_pr.append(tbl_ind)
    tbl_ind.set(qn("w:w"), str(indent_dxa))
    tbl_ind.set(qn("w:type"), "dxa")

    grid = tbl.tblGrid
    if grid is None:
        grid = OxmlElement("w:tblGrid")
        tbl.insert(0, grid)
    for child in list(grid):
        grid.remove(child)
    for width in col_widths_dxa:
        col = OxmlElement("w:gridCol")
        col.set(qn("w:w"), str(width))
        grid.append(col)

    for row in table.rows:
        for index, cell in enumerate(row.cells):
            set_cell_width(cell, col_widths_dxa[index])
            set_cell_margins(cell)
            cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER


def paragraph_border_bottom(paragraph, color="2E74B5", size="12", space="8"):
    p_pr = paragraph._p.get_or_add_pPr()
    p_bdr = p_pr.find(qn("w:pBdr"))
    if p_bdr is None:
        p_bdr = OxmlElement("w:pBdr")
        p_pr.append(p_bdr)
    bottom = p_bdr.find(qn("w:bottom"))
    if bottom is None:
        bottom = OxmlElement("w:bottom")
        p_bdr.append(bottom)
    bottom.set(qn("w:val"), "single")
    bottom.set(qn("w:sz"), size)
    bottom.set(qn("w:space"), space)
    bottom.set(qn("w:color"), color)


def add_heading(doc: Document, text: str, level: int = 1):
    paragraph = doc.add_paragraph(style=f"Heading {level}")
    run = paragraph.add_run(text)
    return paragraph


def add_body(doc: Document, text: str):
    paragraph = doc.add_paragraph(style="Body Text")
    paragraph.add_run(text)
    return paragraph


def add_bullet(doc: Document, text: str):
    paragraph = doc.add_paragraph(style="List Bullet")
    paragraph.add_run(text)
    return paragraph


def add_step(doc: Document, text: str):
    paragraph = doc.add_paragraph(style="List Number")
    paragraph.add_run(text)
    return paragraph


def add_callout(doc: Document, title: str, body: str):
    table = doc.add_table(rows=1, cols=1)
    set_table_width(table, [9360], indent_dxa=120)
    set_table_borders(table, color="D8E0EA", size="4")
    cell = table.cell(0, 0)
    set_cell_shading(cell, LIGHT_GRAY)
    p = cell.paragraphs[0]
    p.paragraph_format.space_after = Pt(3)
    title_run = p.add_run(title)
    set_run_font(title_run, size=10.5, color=DARK_BLUE, bold=True)
    body_p = cell.add_paragraph()
    body_p.paragraph_format.space_after = Pt(0)
    body_run = body_p.add_run(body)
    set_run_font(body_run, size=10.5, color=INK)
    doc.add_paragraph().paragraph_format.space_after = Pt(2)


def add_table(doc: Document, headers: list[str], rows: list[list[str]], widths: list[int]):
    table = doc.add_table(rows=1, cols=len(headers))
    set_table_width(table, widths, indent_dxa=120)
    set_table_borders(table)
    header_cells = table.rows[0].cells
    for idx, header in enumerate(headers):
        set_cell_shading(header_cells[idx], LIGHT_BLUE)
        paragraph = header_cells[idx].paragraphs[0]
        paragraph.paragraph_format.space_after = Pt(0)
        run = paragraph.add_run(header)
        set_run_font(run, size=9.5, color=INK, bold=True)
    for row in rows:
        cells = table.add_row().cells
        for idx, value in enumerate(row):
            paragraph = cells[idx].paragraphs[0]
            paragraph.paragraph_format.space_after = Pt(0)
            run = paragraph.add_run(str(value))
            set_run_font(run, size=9.5, color=INK)
    doc.add_paragraph().paragraph_format.space_after = Pt(4)
    return table


def setup_document(doc: Document):
    section = doc.sections[0]
    section.top_margin = Inches(1)
    section.right_margin = Inches(1)
    section.bottom_margin = Inches(1)
    section.left_margin = Inches(1)
    section.header_distance = Inches(0.492)
    section.footer_distance = Inches(0.492)

    styles = doc.styles
    normal = styles["Normal"]
    normal.font.name = "Calibri"
    normal._element.rPr.rFonts.set(qn("w:ascii"), "Calibri")
    normal._element.rPr.rFonts.set(qn("w:hAnsi"), "Calibri")
    normal.font.size = Pt(11)
    normal.font.color.rgb = INK
    normal.paragraph_format.space_after = Pt(6)
    normal.paragraph_format.line_spacing = 1.25

    body = styles["Body Text"]
    body.base_style = normal
    body.paragraph_format.space_after = Pt(6)
    body.paragraph_format.line_spacing = 1.25

    for name, size, color, before, after in [
        ("Heading 1", 16, BLUE, 18, 10),
        ("Heading 2", 13, BLUE, 14, 7),
        ("Heading 3", 12, DARK_BLUE, 10, 5),
    ]:
        style = styles[name]
        style.font.name = "Calibri"
        style._element.rPr.rFonts.set(qn("w:ascii"), "Calibri")
        style._element.rPr.rFonts.set(qn("w:hAnsi"), "Calibri")
        style.font.size = Pt(size)
        style.font.color.rgb = color
        style.font.bold = True
        style.paragraph_format.space_before = Pt(before)
        style.paragraph_format.space_after = Pt(after)
        style.paragraph_format.keep_with_next = True

    for name in ["List Bullet", "List Number"]:
        style = styles[name]
        style.font.name = "Calibri"
        style._element.rPr.rFonts.set(qn("w:ascii"), "Calibri")
        style._element.rPr.rFonts.set(qn("w:hAnsi"), "Calibri")
        style.font.size = Pt(11)
        style.paragraph_format.space_after = Pt(4)
        style.paragraph_format.line_spacing = 1.25


def add_running_furniture(doc: Document):
    section = doc.sections[0]
    header = section.header
    p = header.paragraphs[0]
    p.text = ""
    left = p.add_run("Council Dashboard Summary")
    set_run_font(left, size=9, color=MUTED, bold=True)
    p.alignment = WD_ALIGN_PARAGRAPH.LEFT
    paragraph_border_bottom(p, color="D8E0EA", size="4", space="4")

    footer = section.footer
    p = footer.paragraphs[0]
    p.text = ""
    run = p.add_run("Source and Calculation Guide")
    set_run_font(run, size=9, color=MUTED)
    p.alignment = WD_ALIGN_PARAGRAPH.RIGHT


def add_cover(doc: Document, latest: dict, monday: dict):
    if LOGO.exists():
        p = doc.add_paragraph()
        p.alignment = WD_ALIGN_PARAGRAPH.LEFT
        p.add_run().add_picture(str(LOGO), width=Inches(2.2))
        p.paragraph_format.space_after = Pt(22)

    kicker = doc.add_paragraph()
    run = kicker.add_run("Council Dashboard Summary")
    set_run_font(run, size=10, color=BLUE, bold=True)
    kicker.paragraph_format.space_after = Pt(5)

    title = doc.add_paragraph()
    title_run = title.add_run("Source and Calculation Guide")
    set_run_font(title_run, size=25, color=INK, bold=True)
    title.paragraph_format.space_after = Pt(4)

    subtitle = doc.add_paragraph()
    subtitle_run = subtitle.add_run("A plain-English guide to where dashboard values come from, how they are refreshed, how major metrics are calculated, and how the in-dashboard help works.")
    set_run_font(subtitle_run, size=12.5, color=MUTED)
    subtitle.paragraph_format.space_after = Pt(18)
    paragraph_border_bottom(subtitle, color="2E74B5", size="10", space="8")

    dashboard = latest["dashboard"]
    cst = latest["cst"]
    add_table(
        doc,
        ["Item", "Current source / value"],
        [
            ["Data current", short_date(latest.get("generated_at"))],
            ["Dashboard workbook", dashboard.get("source_name", "n/a")],
            ["CST workbook", cst.get("source_name", "n/a")],
            ["monday.com workbook", monday.get("source_workbook") or monday.get("generated_from", "n/a")],
            ["Guide reviewed", "Jul 1, 2026"],
            ["Published site", "https://pbsargent.github.io/council-dashboard-summary/"],
        ],
        [2400, 6960],
    )

    add_callout(
        doc,
        "Reader promise",
        "This guide avoids code-level detail unless a formula matters. The dashboard's ? buttons provide brief panel-level help; this document provides the deeper source and calculation context. For exact implementation and edge cases, use the Markdown data dictionary in the repository.",
    )

    doc.add_page_break()


def build_doc():
    latest = load_json(LATEST_JSON)
    monday = load_json(MONDAY_JSON)
    council = latest["dashboard"]["council"]
    boards = monday["boards"]

    doc = Document()
    setup_document(doc)
    add_running_furniture(doc)
    add_cover(doc, latest, monday)

    add_heading(doc, "1. What The Dashboard Is", 1)
    add_body(
        doc,
        "The Council Dashboard Summary is a static web dashboard for Capitol Area Council operating review. It brings together membership, unit health, training, safeguarding, commissioner coverage, Service Area context, CST comparison, and monday.com operating context.",
    )
    add_body(
        doc,
        "The website itself is static. It does not connect directly to Google Drive or monday.com when someone opens it. Instead, a daily local refresh process creates compact JSON data files, commits those files to GitHub, and GitHub Pages publishes the updated dashboard.",
    )
    add_body(
        doc,
        "Most major panels include a circular ? help control. Hovering, focusing, or clicking that control opens a short explanation of the panel's source and meaning. Those panel notes are intentionally brief; this guide remains the fuller reference.",
    )

    add_heading(doc, "At-a-glance data currently published", 2)
    add_table(
        doc,
        ["Area", "Current value"],
        [
            ["Youth membership", fmt_num(council.get("members"))],
            ["Units", fmt_num(council.get("units"))],
            ["At-risk units", f"{fmt_num(council.get('at_risk_units'))} ({fmt_pct(council.get('at_risk_rate'))})"],
            ["Healthy units", f"{fmt_num(council.get('healthy_units'))} ({fmt_pct(council.get('healthy_rate'))})"],
            ["Commissioners", fmt_num(council.get("commissioners"))],
            ["Unit commissioners", fmt_num(council.get("unit_commissioners"))],
            ["Service Areas", fmt_num(len(latest["dashboard"].get("service_areas", [])))],
            ["Training rows", fmt_num(len(latest["dashboard"].get("training_people", [])))],
            ["Hot prospects", fmt_num(boards["prospects"].get("items"))],
            ["Renewal rows", fmt_num(boards["renewals"].get("items"))],
            ["School rows", fmt_num(boards["schools"].get("items"))],
        ],
        [3000, 6360],
    )

    add_heading(doc, "2. Where The Data Comes From", 1)
    add_body(doc, "The dashboard has four main source lanes.")
    add_table(
        doc,
        ["Source lane", "Used for", "Published as"],
        [
            ["Council dashboard workbook", "Membership, unit health, district training rates, commissioner objectives, person-level training, and commissioner roster.", "`data/latest.json`"],
            ["CST comparison workbook", "Service Territory comparison metrics and Capitol Area Council comparison fields.", "`data/latest.json`"],
            ["monday.com daily workbook", "Hot prospects, 2026 renewal status, schools, and Total Available Youth.", "`data/monday-latest.json`"],
            ["Service Area mapping", "District-to-Service-Area assignments and Field Director ownership from Bill Kohl's authoritative Districts and Service Area email.", "`data/latest.json`"],
        ],
        [2200, 5000, 2160],
    )
    add_body(
        doc,
        "The monday.com daily workbook is preferred because it contains richer detail rows. If that workbook is not available, the automation can fall back to the monday.com API, but the API fallback is less detailed than the workbook export.",
    )

    add_heading(doc, "3. How The Daily Refresh Works", 1)
    add_body(
        doc,
        "The scheduled macOS LaunchAgents refresh the source workbooks first, then publish the two dashboard sites from their active working copies. The Council Summary site runs /Users/petersargent/CouncilDashboardSummaryUpdate.zsh and uses /Users/petersargent/CouncilDashboardSummaryRepo as its active GitHub Pages repo. The Commissioner Dashboard is a separate GitHub Pages portal that reads the same canonical Council Summary JSON, so it is updated without replacing or merging into the Council Summary site.",
    )
    for step in [
        "Find the newest Council dashboard workbook in the Council Dashboard Reports shared drive.",
        "Find the newest CST7 workbook in the Council Metric Reports shared drive.",
        "Build `data/latest.json`, including Service Area rollups and a dated archive JSON file.",
        "Find the newest monday.com export workbook in the Council monday.com Reports shared drive.",
        "Build `data/monday-latest.json`, falling back to the monday.com API only if needed.",
        "Copy the refreshed JSON files to the local preview site.",
        "Publish the Council Summary site tree to GitHub Pages using historyless publishing.",
        "Publish the Commissioner Dashboard site tree to its separate GitHub Pages repository using historyless publishing.",
        "Let GitHub Pages publish the updated dashboard.",
    ]:
        add_step(doc, step)
    add_callout(
        doc,
        "What changes daily",
        "The daily automation updates data files. It does not rewrite dashboard code or formulas. A formula or page layout changes only when the website code is edited and committed.",
    )
    add_callout(
        doc,
        "Historyless publishing",
        "Each GitHub Pages repository is replaced with a fresh single root commit for each publish using force-with-lease protection. That keeps the public Pages repositories compact while still publishing the current static site trees.",
    )
    add_callout(
        doc,
        "How freshness times display",
        "The lower-left dashboard timestamp is shown in the viewer's local timezone. Council dashboard timestamps that do not include a timezone are interpreted as America/Chicago source time first; monday.com timestamps that include UTC or another offset are treated as exact instants and then displayed locally for the viewer.",
    )
    doc.add_page_break()
    add_callout(
        doc,
        "Automation paths",
        "The active Council Summary repo is /Users/petersargent/CouncilDashboardSummaryRepo. The Council Summary LaunchAgent is /Users/petersargent/Library/LaunchAgents/com.pbsargent.council-dashboard-summary.daily.plist. The scheduled wrapper script is /Users/petersargent/CouncilDashboardSummaryUpdate.zsh. The active Commissioner Dashboard worktree is /Users/petersargent/CACDashboardAutomation/outputs/council-commissioner-dashboard-github, and its scheduled publisher is /Users/petersargent/CACDashboardAutomation/work/commissioner_site/update_and_publish_github.zsh.",
    )

    add_heading(doc, "4. Build And Data Acquisition Requirements", 1)
    add_body(
        doc,
        "A technical maintainer can rebuild a similar dashboard if they have the source workbooks, a Python environment with the workbook/document libraries, a GitHub Pages repository, and a daily automation path that can read the local Google Drive files and push JSON outputs.",
    )
    add_table(
        doc,
        ["Requirement", "What must be available"],
        [
            ["Runtime", "Python with openpyxl for Excel parsing and python-docx for guide generation."],
            ["Google Drive access", "Shared drives named Council Dashboard Reports, Council Metric Reports, and Council monday.com Reports."],
            ["Workbook patterns", "`*Dashboard - CAC*.xlsx`, `*_CST7.xlsx`, and `*monday-export.xlsx`."],
            ["monday.com access", "Daily export workbook preferred; API token fallback requires read access to the configured boards."],
            ["Publishing", "GitHub Pages repository on main branch with static HTML, CSS, JavaScript, assets, and JSON data."],
            ["Automation", "LaunchAgent or equivalent scheduler that refreshes source workbooks, builds changed JSON, and historylessly publishes the current site trees to GitHub."],
            ["Service Area mapping", "Authoritative district-to-Service-Area mapping source and a maintained mapping table in the builder."],
            ["Panel help", "Shared `panel-help.js` and dashboard CSS provide active hover, focus, and click/tap help popovers for the ? controls."],
        ],
        [2400, 6960],
    )
    add_callout(
        doc,
        "Technical runbook",
        "The repository file IMPLEMENTATION_RUNBOOK.md documents setup paths, source acquisition, manual refresh commands, schedule/log checks, validation steps, common failure modes, and guidance for rebuilding a similar dashboard.",
    )

    add_heading(doc, "5. How The Main Page Metrics Are Calculated", 1)
    add_table(
        doc,
        ["Displayed metric", "Plain-English calculation"],
        [
            ["Youth", "Sum of district youth membership from the Membership tab."],
            ["Units", "Sum of district unit counts from the Membership tab."],
            ["Average Metric", "District average metrics weighted by the number of units in each district."],
            ["Assigned", "Assigned units divided by total units. Assigned units come from the Assigned tab."],
            ["Training", "District all-scouter training rates weighted by units."],
            ["Youth / TAY", "Council youth membership divided by the raw sum of Total Available Youth from monday.com school rows."],
        ],
        [2300, 7060],
    )

    add_heading(doc, "District status", 2)
    add_body(doc, "Each district is labeled Needs Attention, Monitor, or On Track using threshold rules.")
    add_table(
        doc,
        ["Status", "Rule"],
        [
            ["Needs Attention", "YoY membership is below -10%, or SYT is below 80%, or at-risk unit rate is 55% or higher."],
            ["Monitor", "Training is below 65%, or at-risk unit rate is 40% or higher, or SYT is below 85%."],
            ["On Track", "None of the Needs Attention or Monitor rules apply."],
        ],
        [2100, 7260],
    )

    add_heading(doc, "6. What Each Detail Page Adds", 1)
    add_table(
        doc,
        ["Page", "What it answers"],
        [
            ["Training", "Which people are trained, which leaders are direct-contact, and where direct-contact training gaps exist."],
            ["SYT", "Whether direct-contact leaders have current SYT, Hazardous Weather, BALOO, and IOLS-related requirements."],
            ["monday.com", "Where prospect, renewal, and school operating follow-up is concentrated."],
            ["Unit Metrics", "How districts and unit sections compare across unit health, training, outdoor, advancement, and retention metrics."],
            ["Membership Intelligence", "Where membership opportunity, TAY penetration, unit health risk, prospects, and renewals combine into priority signals."],
        ],
        [2100, 7260],
    )
    add_body(
        doc,
        "Detail pages that compare district records also expose Service Area filters. District filters remain available inside the selected Service Area, and official district views exclude operational labels that are not part of the 12-district Council dashboard structure.",
    )

    doc.add_page_break()
    add_heading(doc, "7. Service Area And District Filtering", 1)
    add_body(
        doc,
        "Service Area is not inferred from workbook formulas. It is a maintained mapping based on the authoritative Districts and Service Area email. The builder attaches Service Area and Field Director values to district rows, priority units, training people, commissioner records, Unit Metric Compare rows, and monday.com district contexts where an official district can be identified.",
    )
    add_table(
        doc,
        ["Service Area", "Field Director", "Official districts"],
        [
            ["Northern", "Justin Brundin", "Bee Cave; Chisholm Trail; Hill Country; North Shore"],
            ["Central", "Vicki Rosengarten", "Armadillo; Colorado River; Exploring; San Gabriel; Thunderbird"],
            ["Southern", "Ed Grune", "Live Oak; Sacred Springs; Waterloo"],
        ],
        [1700, 2200, 5460],
    )
    add_callout(
        doc,
        "How monday.com rows are assigned",
        "monday.com rows can contain multiple district labels. A row is attached to a Service Area when any listed official district belongs to that Service Area. Rows with only non-official or blank district labels remain outside official district and Service Area rollups.",
    )

    doc.add_page_break()
    add_heading(doc, "8. TAY And Membership Opportunity", 1)
    add_body(
        doc,
        "TAY means Total Available Youth. It comes from the monday.com Schools export, not from the base Council dashboard workbook.",
    )
    add_bullet(doc, "Council Youth / TAY uses raw school-row TAY once per school row.")
    add_bullet(doc, "District Youth / TAY attributes a school's full TAY to each official Scouting District listed for that school.")
    add_bullet(doc, "This means district TAY context is useful for district comparison, but district TAY values should not be summed and treated as the council total.")
    add_bullet(doc, "Official district views exclude non-official labels such as Unassigned when comparing districts.")

    add_heading(doc, "9. Training And Safeguarding Logic", 1)
    add_table(
        doc,
        ["Question", "How the dashboard answers it"],
        [
            ["Who is direct-contact?", "The source workbook's Direct Contact column is converted from YES/NO to a boolean."],
            ["Who is trained?", "The Training tab's Trained column is converted from YES/NO to a boolean."],
            ["Is SYT current?", "SYT applies to all leaders. Missing or expired SYT is flagged for all leader rows, not only direct-contact rows."],
            ["Is Hazardous Weather current?", "For direct-contact leaders, missing or expired Hazardous Weather is flagged."],
            ["Is BALOO needed?", "Direct-contact Pack leaders require BALOO; missing or expired BALOO is flagged."],
            ["Is IOLS missing?", "Direct-contact Troop leaders are flagged when mandatory code S11 remains present."],
            ["What about all-leader views?", "Existing safety dates are shown for all rows. SYT issues apply to all leaders; Hazardous Weather, BALOO, and IOLS issues are evaluated where role and unit type make them applicable."],
        ],
        [2800, 6560],
    )
    add_body(
        doc,
        "Training code names are looked up from the Training Codes tab so the SYT page can translate course codes into readable course names where possible.",
    )

    doc.add_page_break()
    add_heading(doc, "10. Membership Intelligence Signals", 1)
    add_body(
        doc,
        "Membership Intelligence is a dashboard-created prioritization view. It combines source workbook membership and unit-health metrics with monday.com school, prospect, and renewal context.",
    )
    add_table(
        doc,
        ["Signal input", "How it is counted"],
        [
            ["Schools", "School rows whose Scouting District includes the district."],
            ["TAY", "Sum of TAY for those attributed school rows."],
            ["Schools without unit", "Attributed school rows with a blank Unit Associated field."],
            ["Hot prospects", "Prospect rows whose District includes the district."],
            ["Stuck prospects", "Prospect rows where Step 1 status is Stuck."],
            ["Renewal follow-up", "Renewal rows where Posted is not Completed."],
        ],
        [2600, 6760],
    )
    add_callout(
        doc,
        "Important interpretation",
        "The Membership Intelligence priority score is not an official workbook metric. It is a dashboard sorting aid that highlights districts where low TAY penetration, membership decline, unit health risk, stuck prospects, and renewal follow-up overlap.",
    )

    doc.add_page_break()
    add_heading(doc, "11. Commissioner Coverage", 1)
    add_body(
        doc,
        "Commissioner coverage comes from the Commissioners tab and assignment-related tabs in the Council dashboard workbook.",
    )
    add_table(
        doc,
            ["Coverage value", "Calculation"],
            [
            ["Registered commissioners", "Unique commissioner names from the Commissioners tab after whitespace and case normalization."],
            ["Workbook commissioner records", "Raw rows in the Commissioners tab before deduplication."],
            ["Duplicate commissioner records", "Workbook commissioner records minus unique commissioner names."],
            ["Unit commissioners", "Unique people with at least one Unit Commissioner role, counted once even if the person appears multiple times."],
            ["Commissioners trained", "Unique commissioners marked trained divided by unique commissioners where training status is known."],
            ["With assignments", "Unique commissioners with assigned units divided by unique commissioners."],
            ["Assigned units", "Rows in the Assigned tab where Assigned is yes."],
        ],
        [2600, 6760],
    )

    add_heading(doc, "12. Practical Caveats", 1)
    for text in [
        "The published dashboard is only as current as the most recent successful local refresh and GitHub Pages deployment.",
        "The ? buttons provide quick panel context in the website. They are not a replacement for this guide or the Markdown data dictionary.",
        "Workbook labels and sheet names matter. If a source workbook changes structure, the refresh may need a code update.",
        "The July 1 Council dashboard workbook is broadly usable, but a small number of real Excel error cells exist, concentrated in Renewal Prep and some Objectives - Commissioners fields. Those fields should be treated cautiously until the workbook formulas are repaired.",
        "Expiration checks on the Training and SYT pages use the viewer browser's current date.",
        "Freshness timestamps are displayed in the viewer browser's local timezone, so the same data snapshot can show different clock times to viewers in different timezones.",
        "The SYT detail page flags SYT for all leaders. It flags Hazardous Weather, BALOO, and IOLS only when they are required by the leader's role and unit type.",
        "monday.com district labels can include operational labels that are not official dashboard districts; official district charts filter those out.",
        "Service Area filters are based on the maintained district mapping, not on source workbook columns.",
        "The Markdown data dictionary remains the best place for exact formulas and implementation details.",
    ]:
        add_bullet(doc, text)

    doc.add_page_break()
    add_heading(doc, "Appendix: Quick Formula Reference", 1)
    add_table(
        doc,
        ["Metric", "Formula"],
        [
            ["YoY %", "YoY delta divided by same-month-last-year membership."],
            ["At-risk rate", "Units with Unit Metric 0-2 divided by total units."],
            ["Healthy rate", "Units with Unit Metric 4-5 divided by total units."],
            ["Assigned %", "Assigned units divided by total units."],
            ["Council training %", "District training rates weighted by district units."],
            ["Council SYT %", "District SYT rates weighted by district members."],
            ["Council Youth / TAY", "Council youth divided by raw school-row TAY total."],
            ["District Youth / TAY", "District youth divided by school TAY attributed to that district."],
            ["Registered commissioners", "Unique normalized commissioner names."],
            ["Unit commissioners", "Unique normalized people with at least one Unit Commissioner role."],
            ["Service Area", "Maintained district-to-Service-Area mapping applied after official district normalization."],
        ],
        [2700, 6660],
    )

    add_heading(doc, "Where to look for exact source details", 2)
    add_bullet(doc, "`DASHBOARD_DATA_DICTIONARY.md` documents the full data dictionary and formulas.")
    add_bullet(doc, "`IMPLEMENTATION_RUNBOOK.md` documents technical setup, source acquisition, automation, validation, and rebuild requirements.")
    add_bullet(doc, "`update_daily.zsh` documents the automation order.")
    add_bullet(doc, "`panel-help.js` documents the website's active ? help popover behavior.")
    add_bullet(doc, "`refresh_monday_data.py` documents the monday.com workbook/API extraction.")
    add_bullet(doc, "`work/commissioner_site/build_site.py` documents the source workbook parsing and `latest.json` formulas.")

    OUT_DIR.mkdir(exist_ok=True)
    doc.save(OUT_FILE)
    return OUT_FILE


if __name__ == "__main__":
    print(build_doc())
