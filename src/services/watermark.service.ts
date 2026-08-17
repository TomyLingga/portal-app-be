import fs from 'fs'
import path from 'path'
import QRCode from 'qrcode'
import { degrees, PDFDocument, rgb, StandardFonts } from 'pdf-lib'

export interface WatermarkMetadata {
  approverName: string
  approvedAt: string
  downloadedAt?: string
  downloadCount?: number
  requesterName: string
  requesterNrk: string
  reason: string
  categoryName?: string
  categoryCode?: string
  documentTitle?: string
  version?: number
  confidentialityLevel?: number
  isDownload?: boolean
  requestId?: string
  documentId?: string
}

function safePdfText(value: string | null | undefined, fallback: string): string {
  const normalized = String(value || fallback)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7E]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return normalized || fallback
}

function wrapPdfText(text: string, maxWidth: number, font: any, fontSize: number): string[] {
  const words = String(text || '').split(/\s+/)
  const lines: string[] = []
  let currentLine = ''

  for (const word of words) {
    if (!word) continue
    const testLine = currentLine ? `${currentLine} ${word}` : word
    const testWidth = font.widthOfTextAtSize(testLine, fontSize)
    if (testWidth <= maxWidth) {
      currentLine = testLine
    } else {
      if (currentLine) {
        lines.push(currentLine)
      }
      if (font.widthOfTextAtSize(word, fontSize) > maxWidth) {
        let singleWord = ''
        for (const char of word) {
          if (font.widthOfTextAtSize(singleWord + char, fontSize) <= maxWidth) {
            singleWord += char
          } else {
            if (singleWord) lines.push(singleWord)
            singleWord = char
          }
        }
        currentLine = singleWord
      } else {
        currentLine = word
      }
    }
  }
  if (currentLine) {
    lines.push(currentLine)
  }
  return lines.length > 0 ? lines : [text]
}

/**
 * Apply a watermark stamp to a PDF document buffer.
 * Adds a formal diagonal corporate INL Logo watermark in the center and an official bottom-right corner QR stamp badge.
 */
export async function applyPdfWatermark(pdfBuffer: Buffer, metadata: WatermarkMetadata): Promise<Buffer> {
  try {
    let pdfDoc: PDFDocument
    try {
      pdfDoc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true })
      if (pdfDoc.getPages().length === 0) throw new Error('PDF tidak memiliki halaman')
    } catch {
      // Fallback: If file on disk is legacy text/markdown, convert text content to a clean A4 PDF document
      pdfDoc = await PDFDocument.create()
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
      const page = pdfDoc.addPage([595.28, 841.89]) // A4 size
      const textContent = pdfBuffer.toString('utf-8').replace(/[^\x20-\x7E\n\r\t]/g, ' ')
      const lines = textContent.split(/\r?\n/).slice(0, 45)
      let yPos = 800
      for (const line of lines) {
        if (yPos < 70) break
        const safeLine = line.substring(0, 95)
        if (safeLine.trim()) {
          page.drawText(safeLine, { x: 40, y: yPos, size: 9.5, font, color: rgb(0.15, 0.15, 0.15) })
        }
        yPos -= 15
      }
    }

    if (pdfDoc.isEncrypted) {
      return pdfBuffer
    }
    const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
    const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica)

    const pages = pdfDoc.getPages()
    const approverText = safePdfText(metadata.approverName, 'Sistem Otomatis (Auto-Approved)')
    
    const formatStampDate = (value?: string) => {
      const dateObj = value ? new Date(value) : new Date()
      if (isNaN(dateObj.getTime())) return '-'
      return dateObj.toLocaleString('id-ID', {
        timeZone: 'Asia/Jakarta',
        day: '2-digit',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }).replace(/\./g, ':')
    }

    const approvedAtText = formatStampDate(metadata.approvedAt)
    const downloadedAtText = formatStampDate(metadata.downloadedAt)

    const downloadCountNum = metadata.downloadCount || 1

    const verificationId = [
      'INL',
      'SSO',
      metadata.documentId ? metadata.documentId.replace(/-/g, '').slice(0, 8).toUpperCase() : 'DOC',
      metadata.requestId ? metadata.requestId.replace(/-/g, '').slice(0, 8).toUpperCase() : new Date().getTime().toString(36).toUpperCase(),
      downloadCountNum,
    ].join('-')

    const UUID_REGEX = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/

    let rawRequesterName = safePdfText(metadata.requesterName, 'Karyawan')
    let rawRequesterNrk = safePdfText(metadata.requesterNrk, '-')

    if (UUID_REGEX.test(rawRequesterName.trim())) {
      rawRequesterName = 'Karyawan'
    }
    if (UUID_REGEX.test(rawRequesterNrk.trim())) {
      rawRequesterNrk = '-'
    }

    const requesterName = rawRequesterName
    const requesterNrk = rawRequesterNrk
    const requesterText = requesterNrk !== '-' ? `${requesterName} (${requesterNrk})` : requesterName
    const categoryName = safePdfText(metadata.categoryName, 'Dokumen Resmi')
    const categoryCode = safePdfText(metadata.categoryCode, 'DOC')
    const categoryText = `${categoryName} (${categoryCode})`
    const safeReason = safePdfText(metadata.reason, 'Kebutuhan Operasional')
    const docTitle = safePdfText(metadata.documentTitle, 'Dokumen Perusahaan')

    // Load INL Logo image for center diagonal watermark and top header
    let logoImage: any = null
    try {
      const APP_ROOT = path.resolve(__dirname, '..', '..')
      const possibleLogoPaths = [
        path.resolve(APP_ROOT, 'assets/logo.png'),
        path.resolve(APP_ROOT, 'public/img/logo.png'),
        path.resolve(process.cwd(), 'assets/logo.png'),
        path.resolve(process.cwd(), 'public/img/logo.png'),
        path.resolve(APP_ROOT, '../portal-fe/public/img/logo.png'),
        path.resolve(process.cwd(), '../portal-fe/public/img/logo.png'),
      ]
      let logoBuffer: Buffer | null = null
      for (const logoPath of possibleLogoPaths) {
        try {
          if (fs.existsSync(logoPath) && fs.statSync(logoPath).isFile()) {
            logoBuffer = fs.readFileSync(logoPath)
            break
          }
        } catch {}
      }
      if (logoBuffer) {
        logoImage = await pdfDoc.embedPng(logoBuffer)
      }
    } catch (logoErr) {
      console.warn('Failed to embed INL logo for watermark:', logoErr)
    }

    // Generate Verification QR Code PNG Buffer
    const qrPayload = [
      'VERIFIKASI DOKUMEN DIGITAL - INL SSO',
      'PT INDUSTRI NABATI LESTARI',
      `ID VERIFIKASI: ${verificationId}`,
      `JUDUL: ${docTitle}`,
      `KATEGORI: ${categoryText}`,
      `PEMOHON: ${requesterText}`,
      `PENGESAH: ${approverText}`,
      `WAKTU APPROVAL: ${approvedAtText}`,
      `WAKTU UNDUH: ${downloadedAtText}`,
      `FREKUENSI UNDUH: Ke-${downloadCountNum}`,
      `KEPERLUAN: ${safeReason}`,
      'STATUS: DOKUMEN TERKONTROL & RESMI'
    ].join('\n')

    let qrImage: any = null
    try {
      const qrPngBuffer = await QRCode.toBuffer(qrPayload, {
        type: 'png',
        margin: 1,
        width: 180,
        color: {
          dark: '#0f172a',
          light: '#ffffff'
        }
      })
      qrImage = await pdfDoc.embedPng(qrPngBuffer)
    } catch (qrErr) {
      console.warn('Failed to embed QR code in PDF watermark:', qrErr)
    }

    // -----------------------------------------------------------------
    // 1. APPLY DIAGONAL INL LOGO WATERMARK TO ALL DOCUMENT BODY PAGES
    // -----------------------------------------------------------------
    pages.forEach(page => {
      const { width, height } = page.getSize()

      // Center Diagonal INL Logo Watermark (Subtle opacity, rotated 30 deg - perfectly centered)
      if (logoImage) {
        const logoWidth = Math.min(width, height) * 0.46
        const logoScale = logoWidth / logoImage.width
        const logoHeight = logoImage.height * logoScale

        const angleDeg = 30
        const rad = (angleDeg * Math.PI) / 180
        const halfW = logoWidth / 2
        const halfH = logoHeight / 2

        // Offset coordinates so that the rotated image center coincides exactly with (width / 2, height / 2)
        const dx = halfW * Math.cos(rad) - halfH * Math.sin(rad)
        const dy = halfW * Math.sin(rad) + halfH * Math.cos(rad)

        const logoX = width / 2 - dx
        const logoY = height / 2 - dy

        page.drawImage(logoImage, {
          x: logoX,
          y: logoY,
          width: logoWidth,
          height: logoHeight,
          opacity: 0.11,
          rotate: degrees(angleDeg),
        })
      } else {
        const diagonalText = `PT INDUSTRI NABATI LESTARI`
        const fontSizeCenter = Math.min(width, height) / 16
        const textWidthCenter = font.widthOfTextAtSize(diagonalText, fontSizeCenter)

        const angleDeg = 30
        const rad = (angleDeg * Math.PI) / 180
        const halfW = textWidthCenter / 2
        const halfH = fontSizeCenter / 3

        const dx = halfW * Math.cos(rad) - halfH * Math.sin(rad)
        const dy = halfW * Math.sin(rad) + halfH * Math.cos(rad)

        page.drawText(diagonalText, {
          x: width / 2 - dx,
          y: height / 2 - dy,
          size: fontSizeCenter,
          font,
          color: rgb(0.7, 0.35, 0.0),
          opacity: 0.08,
          rotate: degrees(angleDeg),
        })
      }

      // Bottom-Right Corner QR Stamp (ONLY in Preview Mode, omitted in Download Mode)
      if (!metadata.isDownload) {
        const qrSize = 54
        const stampText = 'Ditandatangani secara elektronik'
        const fontSize = 6.5
        const textWidth = fontRegular.widthOfTextAtSize(stampText, fontSize)

        const boxWidth = Math.max(qrSize + 16, textWidth + 14)
        const boxHeight = qrSize + 18

        const boxMarginRight = 16
        const boxMarginBottom = 14
        const boxX = Math.max(10, width - boxWidth - boxMarginRight)
        const boxY = boxMarginBottom

        const qrX = boxX + (boxWidth - qrSize) / 2
        const qrY = boxY + 13

        if (qrImage) {
          page.drawImage(qrImage, {
            x: qrX,
            y: qrY,
            width: qrSize,
            height: qrSize,
          })
        }

        const textX = boxX + (boxWidth - textWidth) / 2
        const textY = boxY + 4.5

        page.drawText(stampText, {
          x: textX,
          y: textY,
          size: fontSize,
          font: fontRegular,
          color: rgb(0.45, 0.48, 0.52),
        })
      }
    })

    // -----------------------------------------------------------------
    // 2. DEDICATED VERIFICATION PAGE FOR DOWNLOADED APPROVED DOCUMENT
    // -----------------------------------------------------------------
    if (metadata.isDownload) {
      const vPage = pdfDoc.addPage([595.28, 841.89]) // A4 Page
      const { width: pWidth, height: pHeight } = vPage.getSize()

      const marginX = 40
      const contentWidth = pWidth - (marginX * 2) // 515.28 pt
      const black = rgb(0, 0, 0)
      const borderBlack = rgb(0, 0, 0)
      const grayBg = rgb(0.91, 0.93, 0.95)
      const labelBg = rgb(0.97, 0.98, 0.99)
      const valueBg = rgb(1, 1, 1)
      const labelColWidth = 145
      const valColWidth = contentWidth - labelColWidth

      // Format date as DD-Mmm-YY (e.g. 17-Agu-26 or 13-Mar-25 matching INL VCF form)
      const monthNamesId = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']
      const dateObj = new Date()
      const tglBerlakuFormatted = `${dateObj.getDate().toString().padStart(2, '0')}-${monthNamesId[dateObj.getMonth()]}-${dateObj.getFullYear().toString().slice(-2)}`

      // ─── 1. OFFICIAL INL BOXED HEADER TABLE (4 Rows x 72pt total) ───
      const tableHeight = 72
      const tableTopY = pHeight - 34
      const tableBottomY = tableTopY - tableHeight
      const col1Width = 84 // Logo Column
      const col2Width = 252 // Center Company & Document Title
      const col3Width = 82 // Meta Label Column
      const col4Width = contentWidth - col1Width - col2Width - col3Width // Meta Value Column (97.28 pt)

      const x1 = marginX + col1Width
      const x2 = x1 + col2Width
      const x3 = x2 + col3Width

      // Outer Boundary Box
      vPage.drawRectangle({
        x: marginX,
        y: tableBottomY,
        width: contentWidth,
        height: tableHeight,
        color: valueBg,
        borderColor: borderBlack,
        borderWidth: 1,
      })

      // Vertical Column Dividers
      vPage.drawLine({
        start: { x: x1, y: tableBottomY },
        end: { x: x1, y: tableTopY },
        thickness: 1,
        color: borderBlack,
      })
      vPage.drawLine({
        start: { x: x2, y: tableBottomY },
        end: { x: x2, y: tableTopY },
        thickness: 1,
        color: borderBlack,
      })
      vPage.drawLine({
        start: { x: x3, y: tableBottomY },
        end: { x: x3, y: tableTopY },
        thickness: 1,
        color: borderBlack,
      })

      // Center Column Divider between row 3 and row 4 (Document Name Bar)
      vPage.drawLine({
        start: { x: x1, y: tableTopY - 54 },
        end: { x: x2, y: tableTopY - 54 },
        thickness: 1,
        color: borderBlack,
      })

      // Right Meta Column Dividers (3 horizontal lines)
      vPage.drawLine({
        start: { x: x2, y: tableTopY - 18 },
        end: { x: marginX + contentWidth, y: tableTopY - 18 },
        thickness: 1,
        color: borderBlack,
      })
      vPage.drawLine({
        start: { x: x2, y: tableTopY - 36 },
        end: { x: marginX + contentWidth, y: tableTopY - 36 },
        thickness: 1,
        color: borderBlack,
      })
      vPage.drawLine({
        start: { x: x2, y: tableTopY - 54 },
        end: { x: marginX + contentWidth, y: tableTopY - 54 },
        thickness: 1,
        color: borderBlack,
      })

      // ─── Column 1: Large Centered INL Logo ───
      if (logoImage) {
        const maxLogoW = 76
        const maxLogoH = 58
        const aspect = logoImage.width / logoImage.height
        let drawLogoW = maxLogoW
        let drawLogoH = maxLogoW / aspect
        if (drawLogoH > maxLogoH) {
          drawLogoH = maxLogoH
          drawLogoW = maxLogoH * aspect
        }

        const logoX = marginX + (col1Width - drawLogoW) / 2
        const logoY = tableBottomY + (tableHeight - drawLogoH) / 2

        vPage.drawImage(logoImage, {
          x: logoX,
          y: logoY,
          width: drawLogoW,
          height: drawLogoH,
        })
      }

      // ─── Column 2: Centered Company Title & Document Name ───
      const centerMidX = x1 + (col2Width / 2)

      // Line 1: PT. INDUSTRI NABATI LESTARI (Bold + Underlined)
      const t1 = 'PT. INDUSTRI NABATI LESTARI'
      const t1Size = 10
      const t1Width = font.widthOfTextAtSize(t1, t1Size)
      const t1X = centerMidX - (t1Width / 2)
      const t1Y = tableTopY - 15
      vPage.drawText(t1, {
        x: t1X,
        y: t1Y,
        size: t1Size,
        font,
        color: black,
      })
      vPage.drawLine({
        start: { x: t1X, y: t1Y - 1.5 },
        end: { x: t1X + t1Width, y: t1Y - 1.5 },
        thickness: 0.8,
        color: black,
      })

      // Line 2: PABRIK MINYAK GORENG (Bold)
      const t2 = 'PABRIK MINYAK GORENG'
      const t2Size = 7.5
      const t2Width = font.widthOfTextAtSize(t2, t2Size)
      vPage.drawText(t2, {
        x: centerMidX - (t2Width / 2),
        y: tableTopY - 26.5,
        size: t2Size,
        font,
        color: black,
      })

      // Line 3: Multi-line Address (Fits perfectly inside cell without overflow)
      const addrLine1 = 'KEK Sei Mangkei, Kav. 2-3, Kec. Bosar Maligas,'
      const addrLine2 = 'Kab. Simalungun, Sumatera Utara, 21183'
      const addrSize = 5.8
      const addrW1 = fontRegular.widthOfTextAtSize(addrLine1, addrSize)
      const addrW2 = fontRegular.widthOfTextAtSize(addrLine2, addrSize)
      vPage.drawText(addrLine1, {
        x: centerMidX - (addrW1 / 2),
        y: tableTopY - 37,
        size: addrSize,
        font: fontRegular,
        color: black,
      })
      vPage.drawText(addrLine2, {
        x: centerMidX - (addrW2 / 2),
        y: tableTopY - 45.5,
        size: addrSize,
        font: fontRegular,
        color: black,
      })

      // Line 4: Form Title in Row 4 (Clean & Proportionate)
      const t4 = 'LEMBAR PENGESAHAN DOKUMEN DIGITAL (IDMS)'
      const t4Size = 7.5
      const t4Width = font.widthOfTextAtSize(t4, t4Size)
      vPage.drawText(t4, {
        x: centerMidX - (t4Width / 2),
        y: tableBottomY + 5.5,
        size: t4Size,
        font,
        color: black,
      })

      // ─── Column 3 & 4: Right Metadata Rows ───
      const col3CenterX = x2 + (col3Width / 2)
      const col4CenterX = x3 + (col4Width / 2)

      const drawMetaRow = (label: string, value: string, rowIdx: number, isValueBold = false) => {
        const rowMidY = tableTopY - (rowIdx * 18) - 12
        const valFont = isValueBold ? font : fontRegular

        const lblW = fontRegular.widthOfTextAtSize(label, 7.5)
        vPage.drawText(label, {
          x: col3CenterX - (lblW / 2),
          y: rowMidY,
          size: 7.5,
          font: fontRegular,
          color: black,
        })

        const valW = valFont.widthOfTextAtSize(value, 7.5)
        vPage.drawText(value, {
          x: col4CenterX - (valW / 2),
          y: rowMidY,
          size: 7.5,
          font: valFont,
          color: black,
        })
      }

      drawMetaRow('No. Dokumen', `FM-IDMS-${categoryCode}`, 0, true)
      drawMetaRow('Tgl berlaku', tglBerlakuFormatted, 1, false)
      drawMetaRow('No. Revisi', `0${metadata.version || 1}`, 2, false)
      drawMetaRow('Halaman', '1 dari 1', 3, false)

      // ─── UNIFIED CONTINUOUS FORM TABLE (SEAMLESSLY ATTACHED) ───
      const drawSectionBanner = (text: string, y: number) => {
        vPage.drawRectangle({
          x: marginX,
          y: y - 18,
          width: contentWidth,
          height: 18,
          color: grayBg,
          borderColor: borderBlack,
          borderWidth: 1,
        })
        vPage.drawText(text, {
          x: marginX + 8,
          y: y - 12.5,
          size: 8,
          font,
          color: black,
        })
        return y - 18
      }

      const drawInfoRow = (label: string, value: string, y: number): number => {
        const valueLines = wrapPdfText(value, valColWidth - 16, fontRegular, 7.5)
        const rowHeight = Math.max(20, valueLines.length * 10 + 10)

        vPage.drawRectangle({
          x: marginX,
          y: y - rowHeight,
          width: labelColWidth,
          height: rowHeight,
          color: labelBg,
          borderColor: borderBlack,
          borderWidth: 0.6,
        })
        vPage.drawRectangle({
          x: marginX + labelColWidth,
          y: y - rowHeight,
          width: valColWidth,
          height: rowHeight,
          color: valueBg,
          borderColor: borderBlack,
          borderWidth: 0.6,
        })

        vPage.drawText(label, {
          x: marginX + 8,
          y: y - 13.5,
          size: 7.5,
          font,
          color: rgb(0.15, 0.18, 0.22),
        })

        valueLines.forEach((line, index) => {
          vPage.drawText(line, {
            x: marginX + labelColWidth + 8,
            y: y - 13.5 - (index * 10),
            size: 7.5,
            font: fontRegular,
            color: black,
          })
        })

        return y - rowHeight
      }

      // ─── 1. INFORMASI DOKUMEN (Seamlessly connected to Header Table) ───
      let currentY = tableBottomY
      currentY = drawSectionBanner('1. INFORMASI DOKUMEN', currentY)
      currentY = drawInfoRow('Judul Dokumen', docTitle, currentY)
      currentY = drawInfoRow('Kategori Dokumen', `${categoryName} (${categoryCode})`, currentY)
      currentY = drawInfoRow('Versi Dokumen', `Versi ${metadata.version || 1}`, currentY)

      // ─── 2. OTORISASI DAN JEJAK AUDIT SISTEM (Seamlessly connected) ───
      currentY = drawSectionBanner('2. OTORISASI DAN JEJAK AUDIT SISTEM', currentY)
      currentY = drawInfoRow('Pemohon (Requester)', requesterText, currentY)
      currentY = drawInfoRow('Pejabat Pengesah (Approver)', approverText, currentY)
      currentY = drawInfoRow('Waktu Persetujuan', approvedAtText, currentY)
      currentY = drawInfoRow('Waktu Unduhan', downloadedAtText, currentY)
      currentY = drawInfoRow('Frekuensi Unduh', `Unduhan ke-${downloadCountNum}`, currentY)
      currentY = drawInfoRow('Keperluan Pengajuan', safeReason, currentY)

      // ─── 3. VERIFIKASI DIGITAL & KEABSAHAN (Seamlessly connected) ───
      currentY = drawSectionBanner('3. VERIFIKASI KODE QR & KEABSAHAN DIGITAL', currentY)

      const qrBoxHeight = 96
      const qrColWidth = 100

      // QR Box Outer Frame
      vPage.drawRectangle({
        x: marginX,
        y: currentY - qrBoxHeight,
        width: contentWidth,
        height: qrBoxHeight,
        color: valueBg,
        borderColor: borderBlack,
        borderWidth: 1,
      })

      // Divider between QR image and verification details
      vPage.drawLine({
        start: { x: marginX + qrColWidth, y: currentY - qrBoxHeight },
        end: { x: marginX + qrColWidth, y: currentY },
        thickness: 0.8,
        color: borderBlack,
      })

      const qrBoxSize = 78
      if (qrImage) {
        vPage.drawImage(qrImage, {
          x: marginX + (qrColWidth - qrBoxSize) / 2,
          y: currentY - qrBoxHeight + (qrBoxHeight - qrBoxSize) / 2,
          width: qrBoxSize,
          height: qrBoxSize,
        })
      }

      const qrTextX = marginX + qrColWidth + 14
      vPage.drawText('PEMINDAIAN TANDA TANGAN ELEKTRONIK & KEABSAHAN', {
        x: qrTextX,
        y: currentY - 20,
        size: 8,
        font,
        color: black,
      })
      vPage.drawText('Pindai kode QR menggunakan perangkat kamera untuk memvalidasi keaslian berkas.', {
        x: qrTextX,
        y: currentY - 33,
        size: 6.8,
        font: fontRegular,
        color: rgb(0.35, 0.4, 0.45),
      })
      vPage.drawText('Status Berkas :', {
        x: qrTextX,
        y: currentY - 50,
        size: 7.5,
        font,
        color: black,
      })
      vPage.drawText('OFFICIAL CONTROLLED COPY (TERVERIFIKASI & SAH)', {
        x: qrTextX + 72,
        y: currentY - 50,
        size: 7.5,
        font,
        color: rgb(0.04, 0.48, 0.24), // Green
      })
      vPage.drawText('ID Verifikasi  :', {
        x: qrTextX,
        y: currentY - 66,
        size: 7.5,
        font,
        color: black,
      })
      vPage.drawText(verificationId, {
        x: qrTextX + 72,
        y: currentY - 66,
        size: 7.5,
        font: fontRegular,
        color: black,
      })
      vPage.drawText('Sistem Validasi:', {
        x: qrTextX,
        y: currentY - 82,
        size: 7.5,
        font,
        color: black,
      })
      vPage.drawText('INL Integrated Document Management System (IDMS)', {
        x: qrTextX + 72,
        y: currentY - 82,
        size: 7.2,
        font,
        color: rgb(0.15, 0.2, 0.28),
      })

      // ─── OFFICIAL SYSTEM GENERATION STAMP & LEGAL DISCLAIMER (BOTTOM) ───
      const stampBoxY = 30
      const stampBoxHeight = 52
      const stampRed = rgb(0.78, 0.12, 0.12)
      const stampRedLight = rgb(0.9, 0.45, 0.45)
      const stampBg = rgb(1, 0.985, 0.985)

      // Outer Red Stamp Frame
      vPage.drawRectangle({
        x: marginX,
        y: stampBoxY,
        width: contentWidth,
        height: stampBoxHeight,
        color: stampBg,
        borderColor: stampRed,
        borderWidth: 1.2,
      })

      // Inner Red Inset Line (Official Stamp Double Border Effect)
      vPage.drawRectangle({
        x: marginX + 2.5,
        y: stampBoxY + 2.5,
        width: contentWidth - 5,
        height: stampBoxHeight - 5,
        borderColor: stampRed,
        borderWidth: 0.5,
      })

      // Left Header: Stempel Pengesahan Elektronik
      vPage.drawText('STEMPEL PENGESAHAN ELEKTRONIK', {
        x: marginX + 12,
        y: stampBoxY + 36,
        size: 7.8,
        font,
        color: stampRed,
      })

      // Right Header: PT Industri Nabati Lestari (Right-Aligned)
      const ptStampText = 'PT. INDUSTRI NABATI LESTARI'
      const ptStampWidth = font.widthOfTextAtSize(ptStampText, 7.8)
      vPage.drawText(ptStampText, {
        x: marginX + contentWidth - 12 - ptStampWidth,
        y: stampBoxY + 36,
        size: 7.8,
        font,
        color: stampRed,
      })

      // Subtle horizontal red line separating header from legal note
      vPage.drawLine({
        start: { x: marginX + 10, y: stampBoxY + 30 },
        end: { x: marginX + contentWidth - 10, y: stampBoxY + 30 },
        thickness: 0.5,
        color: stampRedLight,
      })

      // Stamp Body Text
      vPage.drawText('Dokumen ini digenerate secara otomatis dan sah oleh INL Document Management System (IDMS).', {
        x: marginX + 12,
        y: stampBoxY + 18,
        size: 6.8,
        font: fontRegular,
        color: rgb(0.18, 0.22, 0.26),
      })
      vPage.drawText('Salinan digital ini merupakan dokumen terkontrol resmi dan memiliki kekuatan hukum pembuktian digital di lingkungan PT INL.', {
        x: marginX + 12,
        y: stampBoxY + 8,
        size: 6.2,
        font: fontRegular,
        color: rgb(0.38, 0.42, 0.46),
      })
    }

    const pdfBytes = await pdfDoc.save()
    return Buffer.from(pdfBytes)
  } catch (error) {
    console.error('Failed to apply PDF watermark, returning original file:', error)
    return pdfBuffer
  }
}
