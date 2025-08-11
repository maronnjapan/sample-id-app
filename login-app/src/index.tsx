import { Hono } from 'hono'
import { renderer } from './renderer'
import { getCookie, setCookie } from 'hono/cookie'

const app = new Hono()

app.use(renderer)

const LoginForm = () => (
  <div style="max-width: 400px; margin: 100px auto; padding: 20px; border: 1px solid #ddd; border-radius: 5px;">
    <h2>ログイン</h2>
    <form method="post" action="/login">
      <div style="margin-bottom: 15px;">
        <label htmlFor="username" style="display: block; margin-bottom: 5px;">ユーザー名:</label>
        <input
          type="text"
          id="username"
          name="username"
          required
          style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 3px;"
        />
      </div>
      <div style="margin-bottom: 15px;">
        <label htmlFor="password" style="display: block; margin-bottom: 5px;">パスワード:</label>
        <input
          type="password"
          id="password"
          name="password"
          required
          style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 3px;"
        />
      </div>
      <button
        type="submit"
        id="login-button"
        style="width: 100%; padding: 10px; background-color: #007bff; color: white; border: none; border-radius: 3px; cursor: pointer;"
      >
        ログイン
      </button>
    </form>
  </div>
)

const Dashboard = () => (
  <div style="max-width: 600px; margin: 50px auto; padding: 20px;">
    <h1>ダッシュボード</h1>
    <p>ようこそ！</p>
    <p>ログインが完了しました。</p>
    <form method="post" action="/logout">
      <button
        type="submit"
        style="padding: 8px 16px; background-color: #dc3545; color: white; border: none; border-radius: 3px; cursor: pointer;"
      >
        ログアウト
      </button>
    </form>
  </div>
)

app.get('/', (c) => {
  const isLoggedIn = getCookie(c, 'logged_in')

  if (isLoggedIn) {
    return c.render(<Dashboard />)
  }

  return c.redirect('/login')
})

app.get('/login', (c) => {
  return c.render(<LoginForm />)
})

app.post('/login', async (c) => {
  const body = await c.req.formData()
  const username = body.get('username') as string
  const password = body.get('password') as string

  if (username && password) {
    setCookie(c, 'logged_in', 'true')
    return c.redirect('/')
  }

  return c.render(<LoginForm />)
})

app.post('/logout', (c) => {
  setCookie(c, 'logged_in', '', { maxAge: 0 })
  return c.redirect('/')
})

export default app
