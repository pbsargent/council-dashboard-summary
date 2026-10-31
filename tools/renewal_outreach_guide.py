"""Reader-guide supplement shared by the maintained guide generator and updates."""
from docx.shared import Pt, RGBColor

PARAGRAPHS = (('Movo outreach population', 'Open District Performance > Renewal Outreach by Movo for renewal progress within the Movo outreach extract. These counts and rates do not represent every Capitol Area Council member due to renew. Movo clarified that its performance dashboard covers members it has messaged; the extract also explicitly retains Not yet messaged records. Inclusion alone does not establish contact. Household-wide outreach can include members due in later months before their dedicated campaign starts. A month appearing in the extract does not establish campaign activation.'), ('Filters and comparisons', 'Cohort and District apply to renewal cards, district comparisons, adult/youth progress, reasons, daily history and CSV. The export carries an explicit Movo population scope. Outreach coverage and timing combine both cohorts and follow District only. There is no program-type breakdown. Historical changes may reflect changing outreach coverage or cohort membership as well as renewals; missing days are not interpolated.'), ('Renewal and follow-up measures', 'Renewal rate (Movo) = renewed in the extract divided by members due in that extract. Outstanding (Movo) = extract members due minus extract members renewed, including said no. No council-wide denominator is supplied. The denominator retains all source-reported members, including Not yet messaged records; the total is not a contacted-member count. Missing optional age/reason data and zero-denominator rates are unavailable. Not reached differs from Not yet messaged. Reply rate = replies divided by members messaged. Message timing does not establish causal impact. These measures are not annual retention.'), ('Freshness and daily history', 'Source updated is the Sheet modification time in America/Chicago; a separate Movo observation timestamp is unavailable. Prior-day data is visibly stale. Daily refresh validates complete, unchanged same-day captures and reconciled source totals before replacement, retaining the prior publication on failure. History keeps the latest validated update per source day, up to 90 days, beginning at first capture. The October 31, 2026 clarification about December outreach is dated context, not current campaign status.'), ('Public data', 'Only source-reported council/district aggregates are public. No member rows, names, IDs, contacts, private paths or credentials are published. Person-level deduplication and concurrent registrations cannot be independently verified from this summary. Use the Dashboard Guide for current controls and source behavior.'))


def append_renewal_outreach(doc):
    doc.add_page_break()
    heading = doc.add_paragraph()
    heading.paragraph_format.space_after = Pt(12)
    heading.paragraph_format.keep_with_next = True
    run = heading.add_run('Renewal Outreach by Movo')
    run.font.name = 'Arial'
    run.font.size = Pt(20)
    run.font.bold = True
    run.font.color.rgb = RGBColor.from_string('051F4C')
    for title, text in PARAGRAPHS:
        paragraph = doc.add_paragraph()
        paragraph.paragraph_format.space_after = Pt(9)
        paragraph.paragraph_format.line_spacing = 1.08
        for value, bold in ((title + '\n', True), (text, False)):
            run = paragraph.add_run(value)
            run.font.name = 'Arial'
            run.font.size = Pt(10)
            run.font.bold = bold
            run.font.color.rgb = RGBColor.from_string('051F4C')
