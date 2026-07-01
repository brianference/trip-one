import { Component, type ReactNode } from 'react'
import { logger } from '../lib/logger'

interface Props {
  label: string
  children: ReactNode
}

interface State {
  hasError: boolean
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: Error) {
    logger.error(`${this.props.label} view crashed`, error)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div role="alert">
          <p>{this.props.label}: something went wrong loading this section.</p>
        </div>
      )
    }
    return this.props.children
  }
}
