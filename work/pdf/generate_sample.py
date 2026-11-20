from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, HRFlowable, KeepTogether
from pathlib import Path

out = Path('examples/introduction-to-human-rights-syllabus.pdf')
styles = getSampleStyleSheet()
styles.add(ParagraphStyle(name='Deck', parent=styles['BodyText'], fontName='Helvetica', fontSize=10, leading=15, textColor=colors.HexColor('#4B5563'), spaceAfter=10))
styles.add(ParagraphStyle(name='Section', parent=styles['Heading2'], fontName='Helvetica-Bold', fontSize=13, leading=17, textColor=colors.HexColor('#142A4A'), spaceBefore=12, spaceAfter=5, keepWithNext=True))
styles.add(ParagraphStyle(name='Small', parent=styles['BodyText'], fontName='Helvetica', fontSize=9.2, leading=13, textColor=colors.HexColor('#27364B'), spaceAfter=5))
doc = SimpleDocTemplate(str(out), pagesize=letter, rightMargin=0.78*inch, leftMargin=0.78*inch, topMargin=0.72*inch, bottomMargin=0.72*inch, title='Introduction to Human Rights — Course Syllabus', author='LearnSphere AI sample')
story = [Paragraph('INTRODUCTION TO HUMAN RIGHTS', styles['Title']), Paragraph('LAW 201 · Sample course syllabus · 12-week undergraduate course', styles['Deck']), HRFlowable(width='100%', thickness=1, color=colors.HexColor('#D9E2EF')), Spacer(1, 9), Paragraph('Course overview', styles['Section']), Paragraph('This course introduces the history, principles, institutions, and practice of international human rights. Students will analyze foundational instruments, evaluate enforcement mechanisms, and apply rights-based reasoning to current case studies.', styles['Small']), Paragraph('Learning outcomes', styles['Section']), Paragraph('By the end of the course, students will be able to explain core human rights principles, interpret major international instruments, compare regional protection systems, and construct an evidence-based legal argument.', styles['Small']), Paragraph('Chapter 1. Foundations and universality', styles['Section']), Paragraph('Origins of the modern human rights movement; dignity, equality, and non-discrimination; universality and cultural relativism; duties to respect, protect, and fulfil.', styles['Small']), Paragraph('Chapter 2. The Universal Declaration of Human Rights', styles['Section']), Paragraph('Historical context and drafting; structure of the UDHR; civil, political, economic, social, and cultural rights; legal status and influence.', styles['Small']), Paragraph('Chapter 3. International human rights law', styles['Section']), Paragraph('Treaty law and customary international law; ratification and reservations; state reporting; treaty bodies; individual communications and follow-up.', styles['Small']), Paragraph('Chapter 4. Civil and political rights', styles['Section']), Paragraph('The right to life; freedom from torture; liberty and fair trial; freedom of expression, religion, and association; permitted limitations and derogations.', styles['Small']), Paragraph('Chapter 5. Economic, social, and cultural rights', styles['Section']), Paragraph('Progressive realization; minimum core obligations; the right to education, health, work, housing, and social security; accountability and remedies.', styles['Small']), Paragraph('Chapter 6. Regional protection systems', styles['Section']), Paragraph('The European, Inter-American, and African systems; commissions and courts; admissibility; judgments, compliance, and comparative lessons.', styles['Small']), Paragraph('Assessment and study guidance', styles['Section']), Paragraph('Weekly reading responses (20%), case brief (20%), midterm quiz (20%), and final research paper (40%). Read the assigned primary sources before each class and bring one question for discussion.', styles['Small'])]
def footer(canvas, doc):
    canvas.saveState()
    canvas.setStrokeColor(colors.HexColor('#D9E2EF'))
    canvas.line(0.78*inch, 0.52*inch, 7.72*inch, 0.52*inch)
    canvas.setFont('Helvetica', 8)
    canvas.setFillColor(colors.HexColor('#65748A'))
    canvas.drawString(0.78*inch, 0.36*inch, 'Sample syllabus for PDF text-extraction testing')
    canvas.drawRightString(7.72*inch, 0.36*inch, f'Page {doc.page}')
    canvas.restoreState()
doc.build(story, onFirstPage=footer, onLaterPages=footer)
print(out.resolve())
