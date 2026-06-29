// ─── Debug SMTP Connection Test ───────────────────────────────────────────────
import 'dotenv/config'
import nodemailer from 'nodemailer'

const host     = process.env.MAIL_HOST     || ''
const port     = Number(process.env.MAIL_PORT || 587)
const username = process.env.MAIL_USERNAME  || ''
const password = process.env.MAIL_PASSWORD  || ''
const from     = process.env.MAIL_FROM_ADDRESS || ''

console.log('\n🔍  SMTP Debug Info:')
console.log(`   Host     : ${host}`)
console.log(`   Port     : ${port}`)
console.log(`   Username : ${username}`)
console.log(`   Password : ${'*'.repeat(password.length)} (${password.length} chars)`)
console.log(`   From     : ${from}`)
console.log(`   Secure   : ${port === 465}\n`)

if (!host || !username || !password) {
  console.error('❌  MAIL_HOST, MAIL_USERNAME, or MAIL_PASSWORD is empty in .env!')
  process.exit(1)
}

const transporter = nodemailer.createTransport({
  host,
  port,
  secure: port === 465,
  auth: { user: username, pass: password },
})

async function run() {
  // Step 1: Verify connection
  console.log('⏳  Step 1: Verifying SMTP connection...')
  try {
    await transporter.verify()
    console.log('✅  SMTP connection verified successfully!\n')
  } catch (err: any) {
    console.error('❌  SMTP connection FAILED:')
    console.error(`   Code    : ${err.code || '-'}`)
    console.error(`   Message : ${err.message}`)
    console.error(`   Response: ${err.response || '-'}`)
    console.error('\n💡  Possible fixes:')
    if (err.code === 'ECONNREFUSED') {
      console.error('   → Host atau port salah. Cek MAIL_HOST dan MAIL_PORT di .env')
    } else if (err.code === 'ETIMEDOUT') {
      console.error('   → Koneksi timeout. Firewall/jaringan mungkin memblokir port ini.')
    } else if (err.responseCode === 535 || err.message?.includes('credentials')) {
      console.error('   → Username/password salah. Cek MAIL_USERNAME dan MAIL_PASSWORD.')
      console.error('   → Jika Gmail: pastikan App Password digunakan, bukan password biasa.')
    } else if (err.message?.includes('STARTTLS')) {
      console.error('   → Coba ganti MAIL_PORT=465 atau tambah requireTLS: true')
    }
    process.exit(1)
  }

  // Step 2: Send test email
  const testTo = process.argv[2] || from
  console.log(`⏳  Step 2: Sending test email to ${testTo}...`)
  try {
    const info = await transporter.sendMail({
      from: `"Portal INL Debug" <${from}>`,
      to: testTo,
      subject: '[TEST] Portal INL — SMTP Berhasil',
      html: `
        <div style="font-family:sans-serif;padding:20px;max-width:500px">
          <h2 style="color:#22c55e">✅ SMTP Berhasil!</h2>
          <p>Email ini dikirim dari <strong>${host}:${port}</strong></p>
          <p>Konfigurasi SMTP Portal INL berfungsi dengan baik.</p>
          <hr/>
          <small style="color:#94a3b8">PT. Industri Nabati Lestari — IT Division</small>
        </div>
      `,
    })
    console.log(`✅  Email sent successfully!`)
    console.log(`   messageId : ${info.messageId}`)
    console.log(`   response  : ${info.response}`)
  } catch (err: any) {
    console.error('❌  Failed to send email:')
    console.error(`   ${err.message}`)
  }
}

run()
