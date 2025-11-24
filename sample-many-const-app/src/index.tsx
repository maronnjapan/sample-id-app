import { Hono } from 'hono'
import { renderer } from './renderer'

const defaultCommand =
  '保存したファイルを参照して、メンバーが行うべきタスクリストを作成後、カレンダーに予定を追加し、関連するドキュメントをクラウドストレージにアップロードしてください。'

const app = new Hono()

app.use(renderer)

app.get('/', (c) => {
  return c.render(
    <main class="app-shell">
      <section class="chat-panel">

        <div class="chat-log" id="chat-log" aria-live="polite" aria-label="Simulated chat transcript">
          <div class="message bot">
            <div class="avatar" aria-hidden="true">AI</div>
            <div class="bubble">
              <p>
                こんにちは！私はAIアシスタントです。あなたの指示に基づいて、さまざまなタスクを実行するお手伝いをします。
              </p>
            </div>
          </div>
        </div>

        <form id="connect-form" class="connect-form">
          <label class="visually-hidden" htmlFor="mcp-command">
            MCPへの送信内容
          </label>
          <div class="input-shell">
            <textarea
              id="mcp-command"
              name="command"
              rows={4}
              required
              data-default-command={defaultCommand}
              placeholder={defaultCommand}
            >
              {defaultCommand}
            </textarea>
            <button type="submit" class="send-button" aria-label="MCPへ送信">
              <span class="send-icon" aria-hidden="true"></span>
            </button>
          </div>
        </form>
      </section>

      <section class="consent-panel" aria-live="polite">

        <div class="consent-stage" id="consent-stage">
        </div>
      </section>
    </main>
  )
})

export default app
