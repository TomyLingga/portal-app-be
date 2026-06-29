function decodeJWT(token: string) {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const payload = Buffer.from(parts[1], 'base64').toString('utf-8')
  return JSON.parse(payload)
}

async function main() {
  const loginUrl = 'http://localhost:3001/api/auth/login'
  
  try {
    const res = await fetch(loginUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'admin@inl.co.id',
        password: 'Admin@123'
      })
    })

    if (!res.ok) {
      console.error('Login request failed:', res.status, await res.text())
      return
    }

    const json = await res.json() as any
    if (json.success && json.data.accessToken) {
      const token = json.data.accessToken
      console.log('Login successful!')
      console.log('Access Token:', token)
      console.log('Refresh Token:', json.data.refreshToken)
      
      const payload = decodeJWT(token)
      console.log('Decoded JWT payload:', payload)
      if (payload) {
        const iat = new Date(payload.iat * 1000)
        const exp = new Date(payload.exp * 1000)
        console.log(`Issued At (iat): ${iat.toLocaleString('id-ID')}`)
        console.log(`Expires At (exp): ${exp.toLocaleString('id-ID')}`)
        console.log(`Token Duration: ${(payload.exp - payload.iat) / 60} minutes`)
      }
    } else {
      console.error('Response structure not matching:', json)
    }
  } catch (err: any) {
    console.error('Error during login request:', err)
  }
}

main()
