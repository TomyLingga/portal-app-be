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
  confidentialityLevel?: number
  isDownload?: boolean
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
    
    const approvedDateObj = metadata.approvedAt ? new Date(metadata.approvedAt) : new Date()
    const approvedAtText = isNaN(approvedDateObj.getTime())
      ? new Date().toLocaleString('id-ID')
      : approvedDateObj.toLocaleString('id-ID', { dateStyle: 'full', timeStyle: 'medium' })

    const downloadedDateObj = metadata.downloadedAt ? new Date(metadata.downloadedAt) : new Date()
    const downloadedAtText = isNaN(downloadedDateObj.getTime())
      ? new Date().toLocaleString('id-ID')
      : downloadedDateObj.toLocaleString('id-ID', { dateStyle: 'full', timeStyle: 'medium' })

    const downloadCountNum = metadata.downloadCount || 1

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
      const possibleLogoPaths = [
        path.resolve(process.cwd(), '../portal-fe/public/img/logo.png'),
        path.resolve(process.cwd(), './public/img/logo.png'),
        path.resolve(__dirname, '../../../../portal-fe/public/img/logo.png'),
        'd:/SMKAW02PDN/Laporan PKL/Project/SSO/portal-fe/public/img/logo.png',
      ]
      let logoBuffer: Buffer | null = null
      for (const logoPath of possibleLogoPaths) {
        if (fs.existsSync(logoPath)) {
          logoBuffer = fs.readFileSync(logoPath)
          break
        }
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
      `JUDUL: ${docTitle}`,
      `KATEGORI: ${categoryText}`,
      `PEMOHON: ${requesterText}`,
      `PENGESAH: ${approverText}`,
      `WAKTU APPROVAL: ${approvedAtText}`,
      `WAKTU UNDUH: ${downloadedAtText}`,
      `FREKUENSI UNDUH: Ke-${downloadCountNum}`,
      `KEPERLUAN: ${safeReason}`,
      'STATUS: DOKUMEN TERKONTROLI & RESMI'
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
    // MODE 1: DOWNLOADED APPROVED DOCUMENT (CLEAN BODY + 1 DEDICATED VERIFICATION PAGE)
    // -----------------------------------------------------------------
    if (metadata.isDownload) {
      const vPage = pdfDoc.addPage([595.28, 841.89]) // A4 Page
      const { width: pWidth, height: pHeight } = vPage.getSize()

      // Top Amber Corporate Accent Bar
      vPage.drawRectangle({
        x: 0,
        y: pHeight - 8,
        width: pWidth,
        height: 8,
        color: rgb(0.85, 0.55, 0.1),
      })

      // Top Header Section: Logo INL Left + Corporate Title Right
      if (logoImage) {
        const logoW = 120
        const logoH = logoImage.height * (logoW / logoImage.width)
        vPage.drawImage(logoImage, {
          x: 45,
          y: pHeight - 65,
          width: logoW,
          height: logoH,
        })
      } else {
        vPage.drawText('PT INDUSTRI NABATI LESTARI', {
          x: 45,
          y: pHeight - 50,
          size: 14,
          font,
          color: rgb(0.85, 0.55, 0.1),
        })
      }

      // Title Header Right
      vPage.drawText('PT INDUSTRI NABATI LESTARI', {
        x: pWidth - 330,
        y: pHeight - 38,
        size: 10.5,
        font,
        color: rgb(0.06, 0.09, 0.16),
      })
      vPage.drawText('LEMBAR OTENTIKASI & VERIFIKASI DOKUMEN', {
        x: pWidth - 330,
        y: pHeight - 52,
        size: 11.5,
        font,
        color: rgb(0.85, 0.55, 0.1),
      })
      vPage.drawText('Sistem Dokumen Terkontroli SSO · INL Digital Identity', {
        x: pWidth - 330,
        y: pHeight - 66,
        size: 8.5,
        font: fontRegular,
        color: rgb(0.4, 0.45, 0.5),
      })

      // Top Double Divider Line
      vPage.drawLine({
        start: { x: 45, y: pHeight - 78 },
        end: { x: pWidth - 45, y: pHeight - 78 },
        thickness: 1.5,
        color: rgb(0.85, 0.55, 0.1),
      })
      vPage.drawLine({
        start: { x: 45, y: pHeight - 81 },
        end: { x: pWidth - 45, y: pHeight - 81 },
        thickness: 0.5,
        color: rgb(0.7, 0.75, 0.8),
      })

      // Status Box (Emerald / Green Verified Banner)
      vPage.drawRectangle({
        x: 45,
        y: pHeight - 145,
        width: pWidth - 90,
        height: 50,
        color: rgb(0.92, 0.97, 0.94),
        borderColor: rgb(0.6, 0.82, 0.7),
        borderWidth: 1,
      })

      vPage.drawText('DOKUMEN TERKONTROLI & SAH TERVERIFIKASI', {
        x: 65,
        y: pHeight - 118,
        size: 12,
        font,
        color: rgb(0.02, 0.45, 0.25),
      })
      vPage.drawText('Berkas ini telah disahkan secara digital melalui Portal Dokumen Resmi PT Industri Nabati Lestari.', {
        x: 65,
        y: pHeight - 134,
        size: 8.5,
        font: fontRegular,
        color: rgb(0.2, 0.35, 0.25),
      })

      // Section 1: Informasi Dokumen
      let currentY = pHeight - 172

      vPage.drawText('1. INFORMASI BERKAS DOKUMEN', {
        x: 45,
        y: currentY,
        size: 10,
        font,
        color: rgb(0.15, 0.2, 0.3),
      })
      currentY -= 16

      const infoRows = [
        ['Judul Dokumen', docTitle],
        ['Kategori Dokumen', `${categoryName} (${categoryCode})`],
        ['Tingkat Kerahasiaan', metadata.confidentialityLevel ? `Grade ${metadata.confidentialityLevel} (Terkontroli)` : 'Publik / Internal INL'],
        ['Frekuensi Unduh', `Unduhan Ke-${downloadCountNum} (Terverifikasi System Audit)`],
      ]

      for (const [label, val] of infoRows) {
        vPage.drawRectangle({
          x: 45,
          y: currentY - 14,
          width: 155,
          height: 18,
          color: rgb(0.96, 0.97, 0.98),
          borderColor: rgb(0.85, 0.88, 0.9),
          borderWidth: 0.5,
        })
        vPage.drawRectangle({
          x: 200,
          y: currentY - 14,
          width: pWidth - 245,
          height: 18,
          color: rgb(1, 1, 1),
          borderColor: rgb(0.85, 0.88, 0.9),
          borderWidth: 0.5,
        })
        vPage.drawText(label, { x: 52, y: currentY - 9, size: 8, font, color: rgb(0.3, 0.35, 0.4) })
        vPage.drawText(val.substring(0, 68), { x: 207, y: currentY - 9, size: 8, font: fontRegular, color: rgb(0.1, 0.1, 0.1) })
        currentY -= 18
      }

      currentY -= 12

      // Section 2: Otorisasi & Keputusan Persetujuan
      vPage.drawText('2. OTORISASI AKSES & SINKRONISASI WAKTU LOG', {
        x: 45,
        y: currentY,
        size: 10,
        font,
        color: rgb(0.15, 0.2, 0.3),
      })
      currentY -= 16

      const approvalRows = [
        ['Pemohon / Hak Akses', requesterText],
        ['Pejabat Pengesah', approverText],
        ['Waktu Persetujuan (Approved At)', approvedAtText],
        ['Waktu Pengunduhan (Downloaded At)', downloadedAtText],
        ['Alasan & Keperluan Unduh', safeReason],
      ]

      for (const [label, val] of approvalRows) {
        vPage.drawRectangle({
          x: 45,
          y: currentY - 14,
          width: 155,
          height: 18,
          color: rgb(0.96, 0.97, 0.98),
          borderColor: rgb(0.85, 0.88, 0.9),
          borderWidth: 0.5,
        })
        vPage.drawRectangle({
          x: 200,
          y: currentY - 14,
          width: pWidth - 245,
          height: 18,
          color: rgb(1, 1, 1),
          borderColor: rgb(0.85, 0.88, 0.9),
          borderWidth: 0.5,
        })
        vPage.drawText(label, { x: 52, y: currentY - 9, size: 8, font, color: rgb(0.3, 0.35, 0.4) })
        vPage.drawText(val.substring(0, 68), { x: 207, y: currentY - 9, size: 8, font: fontRegular, color: rgb(0.1, 0.1, 0.1) })
        currentY -= 18
      }

      currentY -= 16

      // Section 3: QR Code Verification Box
      vPage.drawRectangle({
        x: 45,
        y: currentY - 120,
        width: pWidth - 90,
        height: 120,
        color: rgb(0.98, 0.98, 0.99),
        borderColor: rgb(0.8, 0.83, 0.86),
        borderWidth: 0.75,
      })

      const qrBoxSize = 100
      if (qrImage) {
        vPage.drawImage(qrImage, {
          x: 60,
          y: currentY - 110,
          width: qrBoxSize,
          height: qrBoxSize,
        })
      }

      const textX = 175
      vPage.drawText('PEMINDAIAN KODE VERIFIKASI QR (VERIFICATION QR CODE)', {
        x: textX,
        y: currentY - 22,
        size: 9,
        font,
        color: rgb(0.1, 0.15, 0.25),
      })
      vPage.drawText('Pindai QR Code di samping untuk memverifikasi keabsahan lembar otentikasi ini.', {
        x: textX,
        y: currentY - 38,
        size: 8,
        font: fontRegular,
        color: rgb(0.35, 0.4, 0.45),
      })
      vPage.drawText('Status Berkas:', { x: textX, y: currentY - 56, size: 8, font, color: rgb(0.3, 0.3, 0.3) })
      vPage.drawText('DOKUMEN RESMI TERKONTROLI (OFFICIAL CONTROLLED COPY)', { x: textX + 65, y: currentY - 56, size: 8, font: fontRegular, color: rgb(0.04, 0.5, 0.25) })

      vPage.drawText('ID Verifikasi Sistem:', { x: textX, y: currentY - 72, size: 8, font, color: rgb(0.3, 0.3, 0.3) })
      vPage.drawText(`INL-SSO-VERIFIED-${Date.now().toString(36).toUpperCase()}`, { x: textX + 90, y: currentY - 72, size: 8, font: fontRegular, color: rgb(0.2, 0.2, 0.2) })

      // Footer Legal Statement
      const footerY = 45
      vPage.drawLine({
        start: { x: 45, y: footerY + 25 },
        end: { x: pWidth - 45, y: footerY + 25 },
        thickness: 0.75,
        color: rgb(0.8, 0.83, 0.86),
      })

      vPage.drawText('LEGALITAS & KETENTUAN HAK CIPTA DOKUMEN PT INDUSTRI NABATI LESTARI', {
        x: 45,
        y: footerY + 12,
        size: 7.5,
        font,
        color: rgb(0.4, 0.45, 0.5),
      })
      vPage.drawText('Dokumen ini diterbitkan secara elektronik melalui Portal INL SSO. Segala bentuk penyalinan atau pendistribusian tanpa izin resmi merupakan pelanggaran kebijakan perusahaan.', {
        x: 45,
        y: footerY,
        size: 7,
        font: fontRegular,
        color: rgb(0.5, 0.55, 0.6),
      })

    } else {
      // -----------------------------------------------------------------
      // MODE 2: PREVIEW MODE (ONLY CORNER QR STAMP)
      // -----------------------------------------------------------------
      pages.forEach(page => {
        const { width, height } = page.getSize()

        // 2. Official Bottom-Right Verification Stamp (QR Code + Gray Text "Ditandatangani secara elektronik" - No Border)
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

        // Draw QR code centered (without border)
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

        // Draw gray text centered below QR code
        const textX = boxX + (boxWidth - textWidth) / 2
        const textY = boxY + 4.5

        page.drawText(stampText, {
          x: textX,
          y: textY,
          size: fontSize,
          font: fontRegular,
          color: rgb(0.45, 0.48, 0.52),
        })
      })
    }

    const pdfBytes = await pdfDoc.save()
    return Buffer.from(pdfBytes)
  } catch (error) {
    console.error('Failed to apply PDF watermark, returning original file:', error)
    return pdfBuffer
  }
}
