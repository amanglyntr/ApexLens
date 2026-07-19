import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'npm:pdf-lib@1.17.1'

export type PdfBlock = { kind: 'title' | 'subtitle' | 'heading' | 'text' | 'bullet' | 'spacer'; text?: string }

const PAGE_WIDTH = 595.28
const PAGE_HEIGHT = 841.89
const MARGIN = 48
const CONTENT_WIDTH = PAGE_WIDTH - (MARGIN * 2)

function safeText(value: string): string {
  return value.normalize('NFKD')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/[^\x20-\x7E\n]/g, '?')
}

function wrapText(text: string, font: PDFFont, size: number, width: number): string[] {
  const lines: string[] = []
  for (const paragraph of safeText(text).split('\n')) {
    const words = paragraph.split(/\s+/).filter(Boolean)
    if (!words.length) { lines.push(''); continue }
    let line = words[0]
    for (const word of words.slice(1)) {
      const candidate = `${line} ${word}`
      if (font.widthOfTextAtSize(candidate, size) <= width) line = candidate
      else { lines.push(line); line = word }
    }
    lines.push(line)
  }
  return lines
}

export async function createTextPdf(title: string, blocks: PdfBlock[]): Promise<Uint8Array> {
  const document = await PDFDocument.create()
  const regular = await document.embedFont(StandardFonts.Helvetica)
  const bold = await document.embedFont(StandardFonts.HelveticaBold)
  let page: PDFPage
  let y: number

  const newPage = () => {
    page = document.addPage([PAGE_WIDTH, PAGE_HEIGHT])
    y = PAGE_HEIGHT - MARGIN
  }
  const ensureSpace = (height: number) => { if (y - height < MARGIN) newPage() }
  const drawLines = (lines: string[], font: PDFFont, size: number, lineHeight: number, color = rgb(0.16, 0.2, 0.28), indent = 0) => {
    ensureSpace(lines.length * lineHeight)
    for (const line of lines) {
      page.drawText(line, { x: MARGIN + indent, y, size, font, color })
      y -= lineHeight
    }
  }

  newPage()
  document.setTitle(safeText(title))
  document.setProducer('Salesforce Apex Lens')

  for (const block of blocks) {
    if (block.kind === 'spacer') { y -= 8; continue }
    const text = block.text ?? ''
    if (block.kind === 'title') {
      const lines = wrapText(text, bold, 22, CONTENT_WIDTH)
      drawLines(lines, bold, 22, 28, rgb(0.04, 0.1, 0.2))
      y -= 8
    } else if (block.kind === 'subtitle') {
      drawLines(wrapText(text, regular, 10, CONTENT_WIDTH), regular, 10, 15, rgb(0.4, 0.47, 0.57))
      y -= 8
    } else if (block.kind === 'heading') {
      y -= 10
      ensureSpace(28)
      drawLines(wrapText(text, bold, 15, CONTENT_WIDTH), bold, 15, 20, rgb(0.05, 0.43, 0.38))
      y -= 3
    } else if (block.kind === 'bullet') {
      const lines = wrapText(`- ${text}`, regular, 10, CONTENT_WIDTH - 12)
      drawLines(lines, regular, 10, 15, rgb(0.16, 0.2, 0.28), 12)
      y -= 3
    } else {
      drawLines(wrapText(text, regular, 10, CONTENT_WIDTH), regular, 10, 15)
      y -= 5
    }
  }

  const pages = document.getPages()
  pages.forEach((currentPage, index) => currentPage.drawText(`Salesforce Apex Lens  |  Page ${index + 1} of ${pages.length}`, { x: MARGIN, y: 22, size: 8, font: regular, color: rgb(0.55, 0.6, 0.68) }))
  return document.save()
}
