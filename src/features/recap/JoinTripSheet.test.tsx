import { describe, it, expect, vi, afterEach } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { AuthProvider, type AuthUser } from '../auth/AuthContext'
import { AddPhotosBanner } from './AddPhotosBanner'
import { CODE_LENGTH, RESEND_COOLDOWN_SECONDS } from './JoinTripSheet'

/** Synthetic unit-test values (never rendered in the product). */
const TOKEN = 'tok_abcdefghijklmnopqrstuvwxyz012345'
const TRIP_ID = '11111111-2222-4333-8444-555555555555'
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
 * responses (the last one repeats); verify defaults to success.
 */
function stubApi({
  me = null,
  join = [{ status: 200, body: { tripId: TRIP_ID } }],
  verify = { status: 200, body: { user: verifiedUser } },
}: { me?: AuthUser | null; join?: Reply[]; verify?: Reply } = {}) {
  const joinQueue = [...join]
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    let reply: Reply
    if (url === '/api/auth/me') reply = { status: 200, body: { user: me } }
    else if (url === '/api/auth/code/request') reply = { status: 200, body: { ok: true } }
    else if (url === '/api/auth/code/verify') reply = verify
    else if (url === '/api/auth/logout') reply = { status: 200, body: { ok: true } }
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

/** Renders the banner on the public recap route, plus stand-ins for the pages it can send you to. */
function renderBanner(query = '') {
  return render(
    <MemoryRouter initialEntries={[`/recap/${TOKEN}${query}`]}>
      <AuthProvider>
        <Routes>
          <Route path="/recap/:token" element={<AddPhotosBanner token={TOKEN} tripPhrase={TRIP_PHRASE} />} />
          <Route path="/trip/:id/plan" element={<h1>Trip plan</h1>} />
          <Route path="/login" element={<h1>Login page</h1>} />
        </Routes>
        <LocationProbe />
      </AuthProvider>
    </MemoryRouter>,
  )
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

  it('verifies, joins and shows step 3; the trip id appears only after the 200 join', async () => {
    const fetchMock = stubApi()
    const { container } = renderBanner()
    await goToCodeStep()
    expect(container.ownerDocument.body.innerHTML).not.toContain(TRIP_ID)
    fireEvent.paste(codeBoxes()[0], { clipboardData: { getData: () => '482913' } })
    fireEvent.click(screen.getByRole('button', { name: 'Verify code' }))
    const heading = await screen.findByRole('heading', { name: 'You’re on this trip' })
    expect(heading).toHaveFocus()
    expect(callsTo(fetchMock, '/api/auth/code/verify')).toEqual([{ email: EMAIL, code: '482913' }])
    expect(callsTo(fetchMock, `/api/recap/${TOKEN}/join`)).toHaveLength(1)
    expect(screen.getByText(`${MASKED} is confirmed on ${TRIP_PHRASE}. The owner added this email, so you can add your own photos now.`)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('link', { name: 'Go to the trip and add photos' }))
    expect(await screen.findByRole('heading', { name: 'Trip plan' })).toBeInTheDocument()
    expect(screen.getByTestId('location')).toHaveTextContent(`/trip/${TRIP_ID}/plan`)
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
    fireEvent.paste(codeBoxes()[0], { clipboardData: { getData: () => '482913' } })
    fireEvent.click(screen.getByRole('button', { name: 'Verify code' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      `This email isn't invited to this trip. Ask the trip owner to invite ${EMAIL}.`,
    )
    expect(document.body.innerHTML).not.toContain(TRIP_ID)
    fireEvent.click(screen.getByRole('button', { name: 'Use a different email' }))
    const dialog = await screen.findByRole('dialog', { name: 'Sign in or create an account' })
    expect(callsTo(fetchMock, '/api/auth/logout')).toHaveLength(1)
    const email = within(dialog).getByLabelText('Email')
    expect(email).toHaveValue('')
    await waitFor(() => expect(email).toHaveFocus())
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

  it('a viewer signed in with a verified email joins directly, with no sheet', async () => {
    const fetchMock = stubApi({ me: verifiedUser })
    renderBanner()
    // Wait for the session to settle before pressing.
    await waitFor(() => expect(callsTo(fetchMock, '/api/auth/me')).toHaveLength(1))
    await act(async () => {})
    fireEvent.click(screen.getByRole('button', { name: 'Add photos' }))
    expect(await screen.findByRole('heading', { name: 'Trip plan' })).toBeInTheDocument()
    expect(screen.getByTestId('location')).toHaveTextContent(`/trip/${TRIP_ID}/plan`)
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

  it('?join=1 resumes the join once the viewer is signed in, exactly once, and clears the flag', async () => {
    const fetchMock = stubApi({
      me: { ...verifiedUser, emailVerified: false },
      join: [{ status: 403, body: { error: 'x' } }],
    })
    renderBanner('?join=1')
    expect(await screen.findByRole('alert')).toHaveTextContent(`Ask the trip owner to invite ${EMAIL}.`)
    expect(screen.getByTestId('location')).toHaveTextContent(`/recap/${TOKEN}|`)
    expect(screen.getByTestId('location')).not.toHaveTextContent('join=1')
    // Closing and letting the page settle does not run it again.
    fireEvent.keyDown(document, { key: 'Escape' })
    await act(async () => {})
    expect(callsTo(fetchMock, `/api/recap/${TOKEN}/join`)).toHaveLength(1)
  })

  it('?join=1 while signed in with a verified email lands on the trip', async () => {
    stubApi({ me: verifiedUser })
    renderBanner('?join=1')
    expect(await screen.findByRole('heading', { name: 'Trip plan' })).toBeInTheDocument()
    expect(screen.getByTestId('location')).toHaveTextContent(`/trip/${TRIP_ID}/plan`)
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
