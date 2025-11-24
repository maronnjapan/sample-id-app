type OAuthService = {
  id: string
  brand: string
  description: string
  scopes: string[]
  icon: string
}

type ConsentRound = {
  id: string
  title: string
  reason: string
  reminder: string
  services: OAuthService[]
}

type PersistedHistory = {
  roundId: string
  approved: string[]
}

type PersistedState = {
  command: string
  active: boolean
  roundIndex: number
  serviceIndex: number
  currentApprovals: string[]
  pendingRedirect: boolean
  history: PersistedHistory[]
  needsFinalResponse: boolean
}

type ChatEntry = {
  sender: 'user' | 'ai'
  text: string
}

const consentRounds: ConsentRound[] = [
  {
    id: 'doc-reference',
    title: 'コネクタ1：ドキュメント参照',
    reason: '保存したファイルを参照してタスクを整理できるよう、共有ストレージの接続が必要です。',
    reminder: '資料置き場を読み取ることで、タスクリストに過去のアウトラインや添付を反映できます。',
    services: [
      {
        id: 'project-vault',
        brand: 'Project Vault',
        description: 'チームのDrive / Dropboxから最新のドキュメントと添付を検索します。',
        scopes: ['ドキュメント読み取り', 'フォルダ構造閲覧', 'ユーザープロフィール閲覧'],
        icon: 'D',
      },
    ],
  },
  {
    id: 'task-automation',
    title: 'コネクタ2：タスクセントラル',
    reason: '作成したタスクリストをメンバーのタスク管理ツールへ反映させる必要があります。',
    reminder: 'チャットで決めたToDoをSprintボードへ自動登録します。',
    services: [
      {
        id: 'sprint-flow',
        brand: 'Sprint Flow',
        description: 'Asana / Jira のボードにカードを追加・更新できるようにします。',
        scopes: ['タスク作成', 'タスク更新', '担当者参照'],
        icon: 'T',
      },
    ],
  },
  {
    id: 'calendar-bridge',
    title: 'コネクタ3：スケジュール連携',
    reason: 'カレンダーに予定を追加するため、各メンバーの空き状況へアクセスします。',
    reminder: '日程調整と予定登録をAPI経由で実行できるようになります。',
    services: [
      {
        id: 'pulse-calendar',
        brand: 'Pulse Calendar',
        description: 'Google / Outlook カレンダーの空き時間確認とイベント登録を行います。',
        scopes: ['カレンダー閲覧', '予定作成', '参加者が持つ全ての個人情報へのアクセス'],
        icon: 'C',
      },
    ],
  },
  {
    id: 'cloud-upload',
    title: 'コネクタ4：クラウドアップロード',
    reason: '関連ドキュメントをクラウドストレージへアップロードするワークフローを完結させます。',
    reminder: '承認済みファイルを安全なバケットへ転送し、共有リンクを生成します。',
    services: [
      {
        id: 'sky-transfer',
        brand: 'Sky Transfer',
        description: 'S3 / Box へファイルを新規アップロードし、アクセス許可を設定します。',
        scopes: ['ファイルアップロード', '公開リンク生成', '監査ログ記録'],
        icon: 'U',
      },
    ],
  },
]

const totalRounds = consentRounds.length
const roundById = new Map(consentRounds.map((round) => [round.id, round]))
const serviceById = new Map(
  consentRounds.flatMap((round) => round.services.map((service) => [service.id, service] as const))
)

const STATE_KEY = 'oauth-fatigue-state'
const CHAT_KEY = 'oauth-fatigue-chat'

const url = new URL(window.location.href)
const screenMode = url.searchParams.get('screen') === 'oauth' ? 'oauth' : 'chat'
const requestedRound = Number(url.searchParams.get('round') ?? '0')
const requestedService = Number(url.searchParams.get('service') ?? '0')

const chatLog = document.getElementById('chat-log') as HTMLDivElement | null
const consentStage = document.getElementById('consent-stage') as HTMLDivElement | null
const fatigueIndicator = document.getElementById('fatigue-indicator') as HTMLDivElement | null
const connectForm = document.getElementById('connect-form') as HTMLFormElement | null
const commandInput = document.getElementById('mcp-command') as HTMLTextAreaElement | null
const chatStatus = document.getElementById('chat-status') as HTMLDivElement | null
const chatStatusText = chatStatus?.querySelector('.status-text') as HTMLSpanElement | null

let pendingTimer: number | undefined
let preConnectTimer: number | undefined
let pendingBubble: HTMLDivElement | null = null
let thinkingBubble: HTMLDivElement | null = null
let finalResponseTimer: number | undefined

seedInitialChat()
renderChatFromStore()

if (screenMode === 'oauth') {
  document.body?.classList.add('mode-oauth')
  setupConsentScreen(requestedRound, requestedService)
} else {
  document.body?.classList.add('mode-chat')
  setupChatScreen()
}

ensureInitialViewportScroll()

function setupChatScreen() {
  const state = loadState()
  refreshFatigueIndicator(state)
  lockForm(state.active)
  connectForm?.addEventListener('submit', handleChatSubmit)
  renderChatStage(state)
  hydrateCommandField(state)

  setChatStatus(state.active ? '接続処理中' : '待機中', state.active ? 'active' : 'idle')

  if (state.active && state.pendingRedirect) {
    const targetRound = Math.min(state.roundIndex, totalRounds - 1)
    const nextServiceIndex = Math.max(state.serviceIndex, 0)
    startConnectingSequence(targetRound, nextServiceIndex)
    return
  }

  if (!state.active && state.needsFinalResponse && state.history.length === totalRounds) {
    queueFinalChatResponse(state)
    const updated = { ...state, needsFinalResponse: false }
    saveState(updated)
  }
}

function setupConsentScreen(roundIndex: number, serviceIndex: number) {
  const state = loadState()
  refreshFatigueIndicator(state)

  if (!state.active) {
    redirectToChat()
    return
  }

  cancelConnectingSequence()
  setChatStatus('OAuth画面表示中', 'active')

  if (state.pendingRedirect) {
    consumeRedirectFlag()
  }

  if (!Number.isFinite(roundIndex) || roundIndex < 0 || roundIndex >= totalRounds) {
    goToConsentScreen(state.roundIndex, state.serviceIndex)
    return
  }

  if (roundIndex !== state.roundIndex) {
    goToConsentScreen(state.roundIndex, state.serviceIndex)
    return
  }

  const round = consentRounds[roundIndex]
  if (!round) {
    redirectToChat()
    return
  }

  const maxServices = round.services.length
  if (!Number.isFinite(serviceIndex) || serviceIndex < 0 || serviceIndex >= maxServices) {
    goToConsentScreen(roundIndex, state.serviceIndex)
    return
  }

  if (serviceIndex !== state.serviceIndex) {
    goToConsentScreen(roundIndex, state.serviceIndex)
    return
  }

  renderServiceConsent(round, serviceIndex)
}

function handleChatSubmit(event: Event) {
  event.preventDefault()
  const command = (commandInput?.value ?? '').trim()
  if (!command) return

  cancelFinalResponse()

  if (commandInput) {
    commandInput.value = ''
  }

  const state = loadState()
  appendChat('user', command)
  renderChatFromStore()
  if (commandInput) {
    commandInput.value = ''
  }
  scrollPageToBottom()
  if (state.active) {
    appendChat('ai', 'まだ前のOAuth画面を処理中です。右側の案内から続きの同意画面を開いてください。')
    renderChatFromStore()
    return
  }

  const nextState: PersistedState = {
    command,
    active: true,
    roundIndex: 0,
    serviceIndex: 0,
    currentApprovals: [],
    pendingRedirect: true,
    history: [],
    needsFinalResponse: false,
  }

  saveState(nextState)
  lockForm(true)
  startConnectingSequence(0, 0)
}

function renderChatStage(state: PersistedState) {
  if (!consentStage) return
  consentStage.innerHTML = ''

  if (state.active) {
    consentStage.append(buildActivePanel(state))
    return
  }

  if (state.history.length > 0) {
    consentStage.append(buildSummaryPanel(state))
    return
  }

  const info = document.createElement('p')
  info.className = 'info'
  info.textContent = 'MCPコマンドを送信すると、疑似OAuth画面にリダイレクトされ同意疲れを体験できます。'
  consentStage.append(info)
}

function buildActivePanel(state: PersistedState) {
  const card = document.createElement('div')
  card.className = 'round-complete'

  const round = consentRounds[state.roundIndex]
  const service = round?.services[state.serviceIndex]

  const heading = document.createElement('h3')
  heading.textContent = round
    ? `${round.title} · ${service ? service.brand : '次のサービス'}`
    : '次の同意画面が待機中'
  const detail = document.createElement('p')
  if (round && service) {
    detail.textContent = `${state.history.length} / ${totalRounds} ラウンド完了済み。残り ${round.services.length - state.serviceIndex} サービスに個別同意が必要です。`
  } else {
    detail.textContent = '進行中の同意フローがあります。続きのOAuth画面を開いてください。'
  }

  const list = renderHistoryList(state.history)

  const button = document.createElement('button')
  button.type = 'button'
  button.textContent = service ? `${service.brand} の同意画面へ` : '同意画面に進む'
  button.addEventListener('click', () => {
    goToConsentScreen(state.roundIndex, state.serviceIndex)
  })

  card.append(heading, detail)
  if (list.childElementCount > 0) {
    card.append(list)
  }
  card.append(button)
  return card
}

function buildSummaryPanel(state: PersistedState) {
  const panel = document.createElement('div')
  panel.className = 'complete-panel'

  const heading = document.createElement('h3')
  heading.textContent = 'MCPとの接続が完了しました'

  const detail = document.createElement('p')
  detail.textContent = '以下の同意内容が記録されています。再度体験する場合は新しいコマンドを送信してください。'

  const list = renderHistoryList(state.history)

  const restart = document.createElement('button')
  restart.type = 'button'
  restart.className = 'ghost'
  restart.textContent = '同意疲れをもう一度体験'
  restart.addEventListener('click', () => {
    cancelFinalResponse()
    clearState()
    const resetState = loadState()
    refreshFatigueIndicator(resetState)
    lockForm(false)
    hydrateCommandField(resetState)
    renderChatStage(resetState)
    appendChat('ai', '新しいMCP要求を受け付けました。再度コマンドを送信してください。')
    renderChatFromStore()
    setChatStatus('待機中', 'idle')
  })

  panel.append(heading, detail, list, restart)
  return panel
}

function renderHistoryList(history: PersistedHistory[]) {
  const list = document.createElement('ol')
  list.className = 'summary-list'

  history.forEach((entry, index) => {
    const round = roundById.get(entry.roundId)
    if (!round) return
    const item = document.createElement('li')
    const title = document.createElement('strong')
    title.textContent = `${index + 1}. ${round.title}`
    const approvedLabels = entry.approved
      .map((serviceId) => serviceById.get(serviceId)?.brand ?? serviceId)
      .join(', ')
    const details = document.createElement('span')
    details.textContent = approvedLabels || '許可なし'
    item.append(title, details)
    list.append(item)
  })

  return list
}

function renderServiceConsent(round: ConsentRound, serviceIndex: number) {
  if (!consentStage) return
  consentStage.innerHTML = ''

  const service = round.services[serviceIndex]
  if (!service) {
    redirectToChat()
    return
  }

  const form = document.createElement('form')
  form.className = 'oauth-form line-consent'

  const dialog = document.createElement('div')
  dialog.className = 'oauth-dialog line-dialog'

  const hero = document.createElement('div')
  hero.className = 'line-hero'
  const heroIcon = document.createElement('span')
  heroIcon.className = 'line-hero-icon'
  heroIcon.textContent = service.icon
  const heroText = document.createElement('div')
  heroText.className = 'line-hero-text'
  const heroName = document.createElement('strong')
  heroName.textContent = service.brand
  const heroMeta = document.createElement('span')
  heroMeta.textContent = `提供: MCP Operator`
  heroText.append(heroName, heroMeta)
  const heroBadge = document.createElement('span')
  heroBadge.className = 'line-hero-badge'
  heroBadge.textContent = 'アプリ連携'
  hero.append(heroIcon, heroText, heroBadge)

  const body = document.createElement('div')
  body.className = 'line-body'

  const summary = document.createElement('p')
  summary.className = 'line-summary'
  summary.textContent = `${round.title} のために ${service.brand} のデータへのアクセスを求めています。 (${serviceIndex + 1}/${round.services.length})`

  const account = document.createElement('p')
  account.className = 'line-account'
  account.textContent = '連携アカウント: ユーザー（サンプル）'

  const scopeSection = document.createElement('section')
  scopeSection.className = 'line-permissions'
  const scopeTitle = document.createElement('h4')
  scopeTitle.textContent = '許可されるアクセス内容'
  const scopeList = document.createElement('ul')
  scopeList.className = 'line-scope-list'
  service.scopes.forEach((scope) => {
    const item = document.createElement('li')
    item.textContent = scope
    scopeList.append(item)
  })
  scopeSection.append(scopeTitle, scopeList)

  body.append(summary, account, scopeSection)

  const actions = document.createElement('div')
  actions.className = 'line-actions'
  const denyButton = document.createElement('button')
  denyButton.type = 'button'
  denyButton.className = 'ghost'
  denyButton.textContent = '許可しない'
  denyButton.addEventListener('click', () => {
    handleServiceDecision(round, service, false)
  })

  const allowButton = document.createElement('button')
  allowButton.type = 'submit'
  allowButton.textContent = '許可する'

  dialog.append(hero, body, actions)
  actions.append(denyButton, allowButton)
  form.append(dialog)

  form.addEventListener('submit', (event) => {
    event.preventDefault()
    handleServiceDecision(round, service, true)
  })

  consentStage.append(form)
}

function handleServiceDecision(round: ConsentRound, service: OAuthService, approved: boolean) {
  const state = loadState()
  if (!state.active) {
    redirectToChat()
    return
  }

  const currentRound = consentRounds[state.roundIndex]
  if (!currentRound || currentRound.id !== round.id) {
    goToConsentScreen(state.roundIndex, state.serviceIndex)
    return
  }

  const isExpectingService = currentRound.services[state.serviceIndex]?.id === service.id
  if (!isExpectingService) {
    goToConsentScreen(state.roundIndex, state.serviceIndex)
    return
  }

  const updatedApprovals = state.currentApprovals.filter((id) => id !== service.id)
  if (approved) {
    updatedApprovals.push(service.id)
  }

  const serviceCount = currentRound.services.length
  const nextServiceIndex = state.serviceIndex + 1
  const completedRound = nextServiceIndex >= serviceCount

  let nextState: PersistedState

  if (!completedRound) {
    nextState = {
      ...state,
      serviceIndex: nextServiceIndex,
      currentApprovals: updatedApprovals,
      pendingRedirect: true,
      needsFinalResponse: state.needsFinalResponse,
    }
  } else {
    const nextHistory: PersistedHistory[] = [...state.history, { roundId: round.id, approved: updatedApprovals }]
    const nextRoundIndex = state.roundIndex + 1
    const stillActive = nextRoundIndex < totalRounds
    nextState = {
      command: state.command,
      active: stillActive,
      roundIndex: nextRoundIndex,
      serviceIndex: 0,
      currentApprovals: [],
      pendingRedirect: stillActive,
      history: nextHistory,
      needsFinalResponse: !stillActive,
    }

    appendChat(
      'ai',
      `${round.title} の同意を受け取りました。${updatedApprovals.length} 件のサービスを読み取り対象に設定します。`
    )
    if (!stillActive) {
      appendChat('ai', 'すべてのOAuth同意が完了しました。セッションを終了します。')
    }
    renderChatFromStore()
  }

  saveState(nextState)
  refreshFatigueIndicator(nextState)
  if (!nextState.active) {
    lockForm(false)
  }

  const feedback = approved ? '許可しました。' : '拒否しました。'
  appendChat('ai', `${service.brand} へのアクセスを${feedback}`)
  renderChatFromStore()
  setChatStatus(nextState.active ? 'チャット画面に戻ります' : '待機中', nextState.active ? 'active' : 'idle')
  renderReturningCard(nextState)
}

function renderReturningCard(state: PersistedState) {
  if (!consentStage) return
  consentStage.innerHTML = ''

  const card = document.createElement('div')
  card.className = 'redirect-screen'

  const message = document.createElement('p')
  message.className = 'redirect-message'
  message.textContent = '同意しました。元の画面に戻ります。'
  card.append(message)
  consentStage.append(card)

  window.setTimeout(() => {
    redirectToChat()
  }, 800)
}

function goToConsentScreen(round: number, service: number) {
  const basePath = window.location.pathname
  window.location.href = `${basePath}?screen=oauth&round=${round}&service=${service}`
}

function redirectToChat() {
  const basePath = window.location.pathname
  window.location.href = basePath
}

function startConnectingSequence(round: number, service: number) {
  cancelConnectingSequence()
  showThinkingIndicator()
  setChatStatus('チャット応答を準備中...', 'thinking')
  preConnectTimer = window.setTimeout(() => {
    preConnectTimer = undefined
    removeThinkingBubble()
    showConnectingIndicator()
    setChatStatus('MCPへ接続中...', 'active')
    pendingTimer = window.setTimeout(() => {
      pendingTimer = undefined
      removePendingBubble()
      appendChat(
        'ai',
        '接続準備が整いました。続いてOAuth同意画面に切り替えるので、権限を確認してから進んでください。'
      )
      renderChatFromStore()
      setChatStatus('同意画面へ遷移中', 'active')
      goToConsentScreen(round, service)
    }, 2000)
  }, 1200)
}

function cancelConnectingSequence() {
  if (preConnectTimer !== undefined) {
    window.clearTimeout(preConnectTimer)
    preConnectTimer = undefined
  }
  if (pendingTimer !== undefined) {
    window.clearTimeout(pendingTimer)
    pendingTimer = undefined
  }
  removeThinkingBubble()
  removePendingBubble()
}

function queueFinalChatResponse(state: PersistedState) {
  cancelFinalResponse()
  const label = state.command && state.command.length > 0 ? state.command : '最新のリクエスト'
  const narrative = summarizeOperations(state.history)
  showThinkingIndicator()
  setChatStatus('回答を作成中...', 'thinking')
  finalResponseTimer = window.setTimeout(() => {
    finalResponseTimer = undefined
    removeThinkingBubble()
    appendChat('ai', buildFinalResponse(label, narrative))
    renderChatFromStore()
    setChatStatus('待機中', 'idle')
    scrollPageToBottom()
    const current = loadState()
    if (current.needsFinalResponse) {
      saveState({ ...current, needsFinalResponse: false })
    }
  }, 1800)
}

function cancelFinalResponse() {
  if (finalResponseTimer !== undefined) {
    window.clearTimeout(finalResponseTimer)
    finalResponseTimer = undefined
  }
  if (thinkingBubble) {
    removeThinkingBubble()
  }
}

function buildFinalResponse(command: string, narrative: string) {
  const lines = [
    `ご依頼の「${command}」について疑似的にMCPへ接続し、付与された権限の範囲で処理しました。`,
  ]
  if (narrative) {
    lines.push('', '実施した内容', narrative)
  }
  lines.push('', '追加の質問や指示があれば続けて入力してください。')
  return lines.join('\n')
}

function summarizeOperations(history: PersistedHistory[]) {
  if (!history.length) return ''
  const paragraphs = history.map((entry) => {
    const round = roundById.get(entry.roundId)
    if (!round) {
      return ''
    }
    if (entry.approved.length === 0) {
      return `${round.title} では権限が承認されなかったため、状況ログのみを記録しました。`
    }
    const reason = round.reason.replace(/。$/, '')
    const reminder = round.reminder.replace(/。$/, '')
    return `${round.title} では${reason.replace(/^MCPは/, '')}ための情報を集約し、${reminder}という方針で指示内容に合わせて整理しました。`
  })
  return paragraphs.filter(Boolean).join('\n\n')
}

function showThinkingIndicator() {
  if (!chatLog) return
  removeThinkingBubble()

  const wrapper = document.createElement('div')
  wrapper.className = 'message bot thinking'

  const avatar = document.createElement('div')
  avatar.className = 'avatar'
  avatar.textContent = 'AI'

  const bubble = document.createElement('div')
  bubble.className = 'bubble'
  const label = document.createElement('span')
  label.textContent = '回答内容を検討中'
  const indicator = document.createElement('div')
  indicator.className = 'typing-indicator'
  for (let i = 0; i < 3; i++) {
    const dot = document.createElement('span')
    dot.className = 'dot'
    dot.style.animationDelay = `${i * 0.12}s`
    indicator.append(dot)
  }
  bubble.append(label, indicator)

  wrapper.append(avatar, bubble)
  chatLog.append(wrapper)
  chatLog.scrollTop = chatLog.scrollHeight
  thinkingBubble = wrapper
}

function showConnectingIndicator() {
  if (!chatLog) return
  removePendingBubble()

  const wrapper = document.createElement('div')
  wrapper.className = 'message bot connecting'

  const avatar = document.createElement('div')
  avatar.className = 'avatar'
  avatar.textContent = 'AI'

  const bubble = document.createElement('div')
  bubble.className = 'bubble'
  const label = document.createElement('span')
  label.textContent = 'MCPへ接続中'
  const indicator = document.createElement('div')
  indicator.className = 'connect-indicator'
  const bar = document.createElement('span')
  bar.className = 'bar'
  indicator.append(bar)
  bubble.append(label, indicator)

  wrapper.append(avatar, bubble)
  chatLog.append(wrapper)
  chatLog.scrollTop = chatLog.scrollHeight
  pendingBubble = wrapper
}

function removePendingBubble() {
  if (pendingBubble?.parentElement) {
    pendingBubble.parentElement.removeChild(pendingBubble)
  }
  pendingBubble = null
}

function removeThinkingBubble() {
  if (thinkingBubble?.parentElement) {
    thinkingBubble.parentElement.removeChild(thinkingBubble)
  }
  thinkingBubble = null
}

function loadState(): PersistedState {
  const raw = sessionStorage.getItem(STATE_KEY)
  if (!raw) {
    return {
      command: '',
      active: false,
      roundIndex: 0,
      serviceIndex: 0,
      currentApprovals: [],
      pendingRedirect: false,
      history: [],
      needsFinalResponse: false,
    }
  }
  try {
    const parsed = JSON.parse(raw) as Partial<PersistedState>
    const safeRound = Math.min(Math.max(parsed.roundIndex ?? 0, 0), totalRounds)
    const safeService = Math.max(parsed.serviceIndex ?? 0, 0)
    const safeHistory = Array.isArray(parsed.history) ? parsed.history : []
    const safeApprovals = Array.isArray(parsed.currentApprovals) ? parsed.currentApprovals : []
    return {
      command: parsed.command ?? '',
      active: Boolean(parsed.active),
      roundIndex: safeRound,
      serviceIndex: safeService,
      currentApprovals: safeApprovals,
      pendingRedirect: Boolean(parsed.pendingRedirect),
      history: safeHistory,
      needsFinalResponse: Boolean(parsed.needsFinalResponse),
    }
  } catch (error) {
    console.error('Failed to parse persisted state', error)
    return {
      command: '',
      active: false,
      roundIndex: 0,
      serviceIndex: 0,
      currentApprovals: [],
      pendingRedirect: false,
      history: [],
      needsFinalResponse: false,
    }
  }
}

function saveState(state: PersistedState) {
  sessionStorage.setItem(STATE_KEY, JSON.stringify(state))
}

function clearState() {
  sessionStorage.removeItem(STATE_KEY)
}

function consumeRedirectFlag() {
  const state = loadState()
  if (!state.pendingRedirect) return
  saveState({ ...state, pendingRedirect: false })
}

function setChatStatus(text: string, tone: 'idle' | 'thinking' | 'active' = 'idle') {
  if (!chatStatus) return
  chatStatus.classList.remove('thinking', 'active')
  if (tone !== 'idle') {
    chatStatus.classList.add(tone)
  }
  if (chatStatusText) {
    chatStatusText.textContent = text
  }
}

function seedInitialChat() {
  const existing = loadChat()
  if (existing.length > 0) return
  const intro: ChatEntry[] = [
    {
      sender: 'ai',
      text: 'こんにちは！私はAIアシスタントです。あなたの指示に基づいて、さまざまなタスクを実行するお手伝いをします。',
    }
  ]
  saveChat(intro)
}

function loadChat(): ChatEntry[] {
  const raw = sessionStorage.getItem(CHAT_KEY)
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as ChatEntry[]
    return Array.isArray(parsed) ? parsed : []
  } catch (error) {
    console.error('Failed to parse chat log', error)
    return []
  }
}

function saveChat(entries: ChatEntry[]) {
  sessionStorage.setItem(CHAT_KEY, JSON.stringify(entries))
}

function appendChat(sender: ChatEntry['sender'], text: string) {
  const entries = loadChat()
  entries.push({ sender, text })
  saveChat(entries)
}

function renderChatFromStore() {
  if (!chatLog) return
  chatLog.innerHTML = ''
  const entries = loadChat()
  entries.forEach((entry) => {
    const wrapper = document.createElement('div')
    wrapper.className = `message ${entry.sender === 'user' ? 'user' : 'bot'}`

    const avatar = document.createElement('div')
    avatar.className = 'avatar'
    avatar.textContent = entry.sender === 'user' ? 'YOU' : 'AI'

    const bubble = document.createElement('div')
    bubble.className = 'bubble'
    entry.text.split('\n').forEach((line, index) => {
      const paragraph = document.createElement('p')
      paragraph.textContent = line
      if (index > 0) {
        paragraph.classList.add('stacked')
      }
      bubble.append(paragraph)
    })

    wrapper.append(avatar, bubble)
    chatLog.append(wrapper)
  })
  chatLog.scrollTop = chatLog.scrollHeight
}

function scrollPageToBottom() {
  window.requestAnimationFrame(() => {
    window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' })
  })
}

function ensureInitialViewportScroll() {
  if (document.readyState === 'complete') {
    scrollViewportToBottom()
    return
  }
  window.addEventListener('load', scrollViewportToBottom, { once: true })
}

function scrollViewportToBottom() {
  window.requestAnimationFrame(() => {
    const bodyHeight = document.body ? document.body.scrollHeight : 0
    const docHeight = document.documentElement ? document.documentElement.scrollHeight : 0
    const target = Math.max(bodyHeight, docHeight)
    window.scrollTo({ top: target, behavior: 'auto' })
  })
}

function hydrateCommandField(state: PersistedState) {
  if (!commandInput) return
  const preset =
    commandInput.dataset?.defaultCommand ?? commandInput.defaultValue ?? commandInput.placeholder ?? ''
  const desired = state.command && state.command.length > 0 ? state.command : preset
  commandInput.value = desired
}

function lockForm(disabled: boolean) {
  if (!commandInput) return
  commandInput.disabled = disabled
  const submitButton = connectForm?.querySelector('button[type="submit"]') as HTMLButtonElement | null
  if (submitButton) {
    submitButton.disabled = disabled
  }
}

function refreshFatigueIndicator(state = loadState()) {
  if (!fatigueIndicator) return
  const completed = state.history.length
  const stillWorking = state.active && completed < totalRounds
  const currentRound = stillWorking ? completed + 1 : totalRounds

  let message = `同意画面の進捗: ${completed} / ${totalRounds}`
  if (stillWorking) {
    const round = consentRounds[state.roundIndex]
    const servicesTotal = round?.services.length ?? 0
    const servicePosition = Math.min(state.serviceIndex + 1, servicesTotal)
    message += ` · 現在ラウンド ${currentRound}`
    if (servicesTotal > 0) {
      message += ` · サービス ${servicePosition}/${servicesTotal}`
    }
  } else if (!state.active && completed === totalRounds && totalRounds > 0) {
    message += ' · セッション完了'
  }

  fatigueIndicator.textContent = message
}
