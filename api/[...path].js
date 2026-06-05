export default async function handler(req, res) {
  const target = `http://129.151.190.212:8000${req.url}`

  const headers = {}
  if (req.headers['content-type']) headers['Content-Type'] = req.headers['content-type']
  if (req.headers['authorization']) headers['Authorization'] = req.headers['authorization']

  const options = { method: req.method, headers }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    options.body = JSON.stringify(req.body)
  }

  try {
    const upstream = await fetch(target, options)
    const body = await upstream.text()
    res.status(upstream.status)
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json')
    res.send(body)
  } catch (err) {
    res.status(502).json({ detail: `Proxy error: ${err.message}` })
  }
}
