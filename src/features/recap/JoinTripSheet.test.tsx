import { describe, it, expect, vi, afterEach } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { AuthProvider, type AuthUser } from '../auth/AuthContext'
import { AddPhotosBanner } from './AddPhotosBanner'
import { CODE_LENGTH, RESEND_COOLDOWN_SECONDS, RESEND_HINT } from './JoinTripSheet'

/** Synthetic unit-test values (never rendered in the product). */
const TOKEN = 'tok_abcdefghijklmnopqrstuvwxyz012345'
const EMAIL = 'bea@example.com'
const MASKED = 'b•••@example.com'
const TRIP_PHRASE = 'the Anaheim, California trip'
const CODE_FAILED = "That code didn't work. Check it or request a new one."

const verifiedUser: AuthUser = { id: 'u1', email: EMAIL, displayName: 'bea', emailVerified: true }

/** One stubbed response. */
interface Reply {
  status: number
  body: unknown
}

/**
 * Stubs fetch. `me` answers the session check; `join` is a queue of join
 * responses (the last one repeats); verify defaults to success; `logoutFails`
 * makes the sign-out request reject like a dropped connection.
 */
function stubApi({
  me = null,
  join = [{ status: 200, body: { joined: true } }],
  verify = { status: 200, body: { user: verifiedUser } },
  logoutFails = false,
}: { me?: AuthUser | null; join?: Reply[]; verify?: Reply; logoutFails?: boolean } = {}) {
  const joinQueue = [...join]
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    let reply: Reply
    if (url === '/api/auth/me') reply = { status: 200, body: { user: me } }
    else if (url === '/api/auth/code/request') reply = { status: 200, body: { ok: true } }
    else if (url === '/api/auth/code/verify') reply = verify
    else if (url === '/api/auth/logout') {
      if (logoutFails) throw new TypeError('Failed to fetch')
      reply = { status: 200, body: { ok: true } }
    }
    else if (url === `/api/recap/${TOKEN}/join`) reply = joinQueue.length > 1 ? (joinQueue.shift() as Reply) : joinQueue[0]
    else throw new Error(`unexpected fetch ${url} ${init?.method ?? 'GET'}`)
    return { ok: reply.status >= 200 && reply.status < 300, status: reply.status, json: async () => reply.body }
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

/** Calls made to one URL, with their parsed JSON bodies. */
function callsTo(fetchMock: ReturnType<typeof stubApi>, url: string): unknown[] {
  return fetchMock.mock.calls
    .filter(([called]) => called === url)
    .map(([, init]) => (init?.body ? JSON.parse(String(init.body)) : undefined))
}

/** Shows the current path, query and navigation state so tests can assert where the app went. */
function LocationProbe() {
  const location = useLocation()
  return (
    <p data-testid="location">
      {location.pathname}
      {location.search}|{JSON.stringify(location.state ?? null)}
    </p>
  )
}

/**
 * Renders the banner on the public recap route, plus a stand-in for the
 * login page. Returns the `onJoined` spy along with the render result.
 */
function renderBanner(query = '') {
  const onJoined = vi.fn()
  const result = render(
    <MemoryRouter initialEntries={[`/recap/${TOKEN}${query}`]}>
      <AuthProvider>
        <Routes>
          <Route
            path="/recap/:token"
            element={<AddPhotosBanner token={TOKEN} tripPhrase={TRIP_PHRASE} onJoined={onJoined} />}
          />
          <Route path="/login" element={<h1>Login page</h1>} />
        </Routes>
        <LocationProbe />
      </AuthProvider>
    </MemoryRouter>,
  )
  return { ...result, onJoined }
}

/** Fills the code boxes by pasting `code` and presses Verify. */
function enterCode(code = '482913') {
  fireEvent.paste(codeBoxes()[0], { clipboardData: { getData: () => code } })
  fireEvent.click(screen.getByRole('button', { name: 'Verify code' }))
}

/** Opens the sheet from the banner and waits for step 1. */
async function openSheet() {
  const button = await screen.findByRole('button', { name: 'Add photos' })
  fireEvent.click(button)
  return screen.findByRole('dialog', { name: 'Sign in or create an account' })
}

/** From step 1, sends a code to EMAIL with the given button and waits for step 2. */
async function goToCodeStep(buttonName = 'Continue') {
  const dialog = await openSheet()
  fireEvent.change(within(dialog).getByLabelText('Email'), { target: { value: EMAIL } })
  fireEvent.click(within(dialog).getByRole('button', { name: buttonName }))
  return screen.findByRole('dialog', { name: 'Check your email' })
}

/** The six code boxes, in order. */
function codeBoxes(): HTMLInputElement[] {
  return Array.from({ length: CODE_LENGTH }, (_, i) => screen.getByLabelText(`Digit ${i + 1} of ${CODE_LENGTH}`) as HTMLInputElement)
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('AddPhotosBanner', () => {
  it('shows the design copy and opens step 1 with focus on the email field for a signed-out viewer', async () => {
    stubApi()
    renderBanner()
    expect(screen.getByRole('heading', { name: 'Were you on this trip?' })).toBeInTheDocument()
    expect(screen.getByText('Add your photos to this trip so everyone can see how it went.')).toBeInTheDocument()
    const dialog = await openSheet()
    expect(within(dialog).getByLabelText('Email')).toHaveFocus()
    expect(within(dialog).getByText('Verify it’s you before adding photos to this trip.')).toBeInTheDocument()
    // No invite note unless the viewer came from the invite email.
    expect(within(dialog).queryByText(/invited this email/)).toBeNull()
  })

  it('asks for a real address before sending anything', async () => {
    const fetchMock = stubApi()
    renderBanner()
    const dialog = await openSheet()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Continue' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Enter the email address the trip owner invited.')
    expect(callsTo(fetchMock, '/api/auth/code/request')).toHaveLength(0)
  })

  it('Continue requests a code and step 2 shows the masked email with focus on the first box', async () => {
    const fetchMock = stubApi()
    renderBanner()
    const dialog = await goToCodeStep()
    expect(callsTo(fetchMock, '/api/auth/code/request')).toEqual([{ email: EMAIL }])
    expect(within(dialog).getByText(`We sent a code to ${MASKED}`)).toBeInTheDocument()
    const boxes = codeBoxes()
    expect(boxes).toHaveLength(CODE_LENGTH)
    expect(boxes[0]).toHaveFocus()
    expect(boxes[0]).toHaveAttribute('autocomplete', 'one-time-code')
    for (const box of boxes) expect(box).toHaveAttribute('inputmode', 'numeric')
  })

  it('"Create an account" sends the same code and says a new account is made if none exists', async () => {
    const fetchMock = stubApi()
    renderBanner()
    const dialog = await goToCodeStep('Create an account')
    expect(callsTo(fetchMock, '/api/auth/code/request')).toEqual([{ email: EMAIL }])
    expect(within(dialog).getByText(/creates your Trip One account if you don’t have one yet/)).toBeInTheDocument()
  })

  it('typing advances box by box and Backspace on an empty box goes back and clears it', async () => {
    stubApi()
    renderBanner()
    await goToCodeStep()
    const boxes = codeBoxes()
    fireEvent.change(boxes[0], { target: { value: '4' } })
    expect(boxes[1]).toHaveFocus()
    fireEvent.change(boxes[1], { target: { value: '8' } })
    expect(boxes[2]).toHaveFocus()
    // Letters are ignored.
    fireEvent.change(boxes[2], { target: { value: 'x' } })
    expect(boxes[2]).toHaveValue('')
    expect(boxes[2]).toHaveFocus()
    fireEvent.keyDown(boxes[2], { key: 'Backspace' })
    expect(boxes[1]).toHaveFocus()
    expect(boxes[1]).toHaveValue('')
    expect(boxes[0]).toHaveValue('4')
  })

  it('pasting a 6-digit code into any box fills every box', async () => {
    stubApi()
    renderBanner()
    await goToCodeStep()
    const boxes = codeBoxes()
    fireEvent.paste(boxes[3], { clipboardData: { getData: () => ' 482 913 ' } })
    expect(boxes.map((b) => b.value).join('')).toBe('482913')
    expect(boxes[CODE_LENGTH - 1]).toHaveFocus()
  })

  it('verifies, joins and shows step 3, whose "Add your photos" closes the sheet into contributor mode without navigating', async () => {
    const fetchMock = stubApi()
    const { onJoined } = renderBanner()
    await goToCodeStep()
    enterCode()
    const heading = await screen.findByRole('heading', { name: 'You’re on this trip' })
    expect(heading).toHaveFocus()
    expect(callsTo(fetchMock, '/api/auth/code/verify')).toEqual([{ email: EMAIL, code: '482913' }])
    expect(callsTo(fetchMock, `/api/recap/${TOKEN}/join`)).toHaveLength(1)
    expect(screen.getByText(`${MASKED} is confirmed on ${TRIP_PHRASE}. The owner added this email, so you can add your own photos now.`)).toBeInTheDocument()
    // Nothing on step 3 leads to the trip itself.
    expect(screen.queryByRole('link')).toBeNull()
    expect(document.body.innerHTML).not.toContain('/trip/')
    expect(onJoined).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Add your photos' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(onJoined).toHaveBeenCalledTimes(1)
    expect(onJoined).toHaveBeenCalledWith(true)
    expect(screen.getByTestId('location')).toHaveTextContent(`/recap/${TOKEN}|`)
  })

  it('closing step 3 without pressing "Add your photos" still switches to contributor mode, without opening the picker', async () => {
    stubApi()
    const { onJoined } = renderBanner()
    await goToCodeStep()
    enterCode()
    await screen.findByRole('heading', { name: 'You’re on this trip' })
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(onJoined).toHaveBeenCalledWith(false)
  })

  it('closing the sheet before joining does not switch modes', async () => {
    stubApi()
    const { onJoined } = renderBanner()
    await goToCodeStep()
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(onJoined).not.toHaveBeenCalled()
  })

  it('a double press of Continue sends one code, and a double Verify spends the code once', async () => {
    const fetchMock = stubApi()
    renderBanner()
    const dialog = await openSheet()
    fireEvent.change(within(dialog).getByLabelText('Email'), { target: { value: EMAIL } })
    const continueButton = within(dialog).getByRole('button', { name: 'Continue' })
    fireEvent.click(continueButton)
    fireEvent.click(continueButton)
    await screen.findByRole('dialog', { name: 'Check your email' })
    expect(callsTo(fetchMock, '/api/auth/code/request')).toHaveLength(1)
    fireEvent.paste(codeBoxes()[0], { clipboardData: { getData: () => '482913' } })
    const verifyButton = screen.getByRole('button', { name: 'Verify code' })
    fireEvent.click(verifyButton)
    fireEvent.click(verifyButton)
    await screen.findByRole('heading', { name: 'You’re on this trip' })
    expect(callsTo(fetchMock, '/api/auth/code/verify')).toHaveLength(1)
    expect(callsTo(fetchMock, `/api/recap/${TOKEN}/join`)).toHaveLength(1)
  })

  it('a 401 join after verifying asks for a new code, and the next Verify runs the new code through verify', async () => {
    const fetchMock = stubApi({
      join: [
        { status: 401, body: { error: 'Sign in first' } },
        { status: 200, body: { joined: true } },
      ],
    })
    renderBanner()
    await goToCodeStep()
    enterCode('482913')
    expect(await screen.findByRole('alert')).toHaveTextContent('Your sign-in didn’t stick. Please request a new code.')
    // The spent code is cleared from the boxes.
    expect(codeBoxes().map((b) => b.value).join('')).toBe('')
    enterCode('777111')
    await screen.findByRole('heading', { name: 'You’re on this trip' })
    expect(callsTo(fetchMock, '/api/auth/code/verify')).toEqual([
      { email: EMAIL, code: '482913' },
      { email: EMAIL, code: '777111' },
    ])
  })

  it('a wrong code shows the server message in an alert and stays on step 2', async () => {
    const fetchMock = stubApi({ verify: { status: 400, body: { error: CODE_FAILED } } })
    renderBanner()
    await goToCodeStep()
    fireEvent.paste(codeBoxes()[0], { clipboardData: { getData: () => '000000' } })
    fireEvent.click(screen.getByRole('button', { name: 'Verify code' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(CODE_FAILED)
    expect(screen.getByRole('dialog', { name: 'Check your email' })).toBeInTheDocument()
    expect(callsTo(fetchMock, `/api/recap/${TOKEN}/join`)).toHaveLength(0)
  })

  it('shows the spam hint only after a code was re-sent', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    stubApi()
    renderBanner()
    await goToCodeStep()
    expect(screen.queryByText(RESEND_HINT)).toBeNull()
    for (let second = 0; second < RESEND_COOLDOWN_SECONDS; second++) {
      await act(async () => {
        vi.advanceTimersByTime(1000)
      })
    }
    fireEvent.click(screen.getByRole('button', { name: 'Didn’t get it? Resend code' }))
    expect(await screen.findByText(RESEND_HINT)).toBeInTheDocument()
    expect(RESEND_HINT).toBe('Still nothing? Check spam, or try again in an hour.')
  })

  it('Resend is locked for the cooldown, then sends a new code and announces it', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const fetchMock = stubApi()
    renderBanner()
    await goToCodeStep()
    const locked = screen.getByRole('button', { name: `Didn’t get it? Resend code in ${RESEND_COOLDOWN_SECONDS}s` })
    expect(locked).toBeDisabled()
    // The countdown re-arms one timer per second, so time advances a second at a time.
    for (let second = 1; second < RESEND_COOLDOWN_SECONDS; second++) {
      await act(async () => {
        vi.advanceTimersByTime(1000)
      })
    }
    expect(screen.getByRole('button', { name: 'Didn’t get it? Resend code in 1s' })).toBeDisabled()
    await act(async () => {
      vi.advanceTimersByTime(1000)
    })
    const resend = screen.getByRole('button', { name: 'Didn’t get it? Resend code' })
    expect(resend).toBeEnabled()
    fireEvent.click(resend)
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(`We sent a new code to ${MASKED}.`))
    expect(callsTo(fetchMock, '/api/auth/code/request')).toHaveLength(2)
    expect(screen.getByRole('button', { name: `Didn’t get it? Resend code in ${RESEND_COOLDOWN_SECONDS}s` })).toBeDisabled()
  })

  it('a 403 after verifying names the email, and "Use a different email" signs out back to an empty step 1', async () => {
    const fetchMock = stubApi({ join: [{ status: 403, body: { error: "This email isn't invited to this trip." } }] })
    renderBanner()
    await goToCodeStep()
    enterCode()
    expect(await screen.findByRole('alert')).toHaveTextContent(
      `This email isn't invited to this trip. Ask the trip owner to invite ${EMAIL}.`,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Use a different email' }))
    const dialog = await screen.findByRole('dialog', { name: 'Sign in or create an account' })
    expect(callsTo(fetchMock, '/api/auth/logout')).toHaveLength(1)
    const email = within(dialog).getByLabelText('Email')
    expect(email).toHaveValue('')
    await waitFor(() => expect(email).toHaveFocus())
  })

  it('"Use a different email" still starts over when the sign-out request fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    stubApi({ join: [{ status: 403, body: { error: 'x' } }], logoutFails: true })
    renderBanner()
    await goToCodeStep()
    enterCode()
    await screen.findByRole('heading', { name: 'Use the invited email' })
    fireEvent.click(screen.getByRole('button', { name: 'Use a different email' }))
    const dialog = await screen.findByRole('dialog', { name: 'Sign in or create an account' })
    expect(within(dialog).getByLabelText('Email')).toHaveValue('')
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('sign-out request failed'))
    warn.mockRestore()
  })

  it('"Sign in with a password instead" goes to /login set to come back with ?join=1', async () => {
    stubApi()
    renderBanner()
    const dialog = await openSheet()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Sign in with a password instead' }))
    expect(await screen.findByRole('heading', { name: 'Login page' })).toBeInTheDocument()
    expect(screen.getByTestId('location')).toHaveTextContent(`/login|{"from":"/recap/${TOKEN}?join=1"}`)
  })

  it('Escape closes the sheet and returns focus to the banner button', async () => {
    stubApi()
    renderBanner()
    await openSheet()
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(screen.getByRole('button', { name: 'Add photos' })).toHaveFocus()
  })

  it('a viewer signed in with a verified email joins directly into contributor mode, with no sheet', async () => {
    const fetchMock = stubApi({ me: verifiedUser })
    const { onJoined } = renderBanner()
    // Wait for the session to settle before pressing.
    await waitFor(() => expect(callsTo(fetchMock, '/api/auth/me')).toHaveLength(1))
    await act(async () => {})
    fireEvent.click(screen.getByRole('button', { name: 'Add photos' }))
    await waitFor(() => expect(onJoined).toHaveBeenCalledWith(true))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByTestId('location')).toHaveTextContent(`/recap/${TOKEN}|`)
    expect(callsTo(fetchMock, '/api/auth/code/request')).toHaveLength(0)
  })

  it('a verified viewer whose email is not invited gets the refusal sheet naming their email', async () => {
    const fetchMock = stubApi({ me: verifiedUser, join: [{ status: 403, body: { error: 'x' } }] })
    renderBanner()
    await waitFor(() => expect(callsTo(fetchMock, '/api/auth/me')).toHaveLength(1))
    await act(async () => {})
    fireEvent.click(screen.getByRole('button', { name: 'Add photos' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(`Ask the trip owner to invite ${EMAIL}.`)
    expect(screen.getByRole('heading', { name: 'Use the invited email' })).toHaveFocus()
  })

  it('?join=1 for an unverified password account opens step 1 prefilled with its email, without joining, and clears the flag', async () => {
    const fetchMock = stubApi({ me: { ...verifiedUser, emailVerified: false } })
    const { onJoined } = renderBanner('?join=1')
    const dialog = await screen.findByRole('dialog', { name: 'Sign in or create an account' })
    expect(within(dialog).getByLabelText('Email')).toHaveValue(EMAIL)
    expect(screen.getByTestId('location')).toHaveTextContent(`/recap/${TOKEN}|`)
    expect(screen.getByTestId('location')).not.toHaveTextContent('join=1')
    // Closing and letting the page settle does not run anything.
    fireEvent.keyDown(document, { key: 'Escape' })
    await act(async () => {})
    expect(callsTo(fetchMock, `/api/recap/${TOKEN}/join`)).toHaveLength(0)
    expect(onJoined).not.toHaveBeenCalled()
  })

  it('?join=1 while signed in with a verified email joins once and switches to contributor mode', async () => {
    const fetchMock = stubApi({ me: verifiedUser })
    const { onJoined } = renderBanner('?join=1')
    await waitFor(() => expect(onJoined).toHaveBeenCalledWith(true))
    expect(callsTo(fetchMock, `/api/recap/${TOKEN}/join`)).toHaveLength(1)
    expect(screen.getByTestId('location')).toHaveTextContent(`/recap/${TOKEN}|`)
  })

  it('?join=1 with nobody signed in does not call join', async () => {
    const fetchMock = stubApi()
    renderBanner('?join=1')
    await waitFor(() => expect(callsTo(fetchMock, '/api/auth/me')).toHaveLength(1))
    await act(async () => {})
    expect(callsTo(fetchMock, `/api/recap/${TOKEN}/join`)).toHaveLength(0)
  })

  it('?invite=1 opens the sheet on arrival with the "invited this email" note', async () => {
    const fetchMock = stubApi()
    renderBanner('?invite=1')
    const dialog = await screen.findByRole('dialog', { name: 'Sign in or create an account' })
    expect(within(dialog).getByText(`The owner of ${TRIP_PHRASE} invited this email to add photos.`)).toBeInTheDocument()
    expect(callsTo(fetchMock, `/api/recap/${TOKEN}/join`)).toHaveLength(0)
  })
})
