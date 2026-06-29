// ─── Utils: Mailer (Nodemailer + Mailtrap SMTP) ───────────────────────────────
import nodemailer from 'nodemailer'
import { config } from '../config/env'

// Port 465 = SSL (secure: true), Port 587/2525 = STARTTLS (secure: false)
const transporter = nodemailer.createTransport({
  host:   config.mail.host,
  port:   config.mail.port,
  secure: config.mail.port === 465,
  auth: {
    user: config.mail.username,
    pass: config.mail.password,
  },
})

export interface SendMailOptions {
  to: string
  subject: string
  html?: string
  text?: string
}

export async function sendMail({ to, subject, html, text }: SendMailOptions) {
  const from = `"${config.mail.fromName}" <${config.mail.fromAddress}>`
  const info = await transporter.sendMail({
    from,
    to,
    subject,
    ...(html ? { html } : {}),
    ...(text ? { text } : {}),
  })
  console.log(`📧  Email sent to ${to} — messageId: ${info.messageId}`)
  return info
}
