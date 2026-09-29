import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { StopPhotoButton } from './StopPhotoButton'

describe('StopPhotoButton', () => {
  it('renders a real button labelled "Add photo to {stop name}"', () => {
    render(<StopPhotoButton stopName="Louvre Museum" uploading={false} onSelect={vi.fn()} />)
    const button = screen.getByRole('button', { name: 'Add photo to Louvre Museum' })
    expect(button.tagName).toBe('BUTTON')
  })

  it('renders a visually hidden file input that accepts images with no camera-only capture', () => {
    render(<StopPhotoButton stopName="Louvre Museum" uploading={false} onSelect={vi.fn()} />)
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    expect(input).toBeInTheDocument()
    expect(input).toHaveAttribute('accept', 'image/*')
    expect(input).not.toHaveAttribute('capture')
    expect(input.className).toContain('chronicle-visually-hidden')
  })

  it('clicking the button opens the hidden file input', () => {
    render(<StopPhotoButton stopName="Louvre Museum" uploading={false} onSelect={vi.fn()} />)
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    const clickSpy = vi.spyOn(input, 'click')
    fireEvent.click(screen.getByRole('button', { name: 'Add photo to Louvre Museum' }))
    expect(clickSpy).toHaveBeenCalledTimes(1)
  })

  it('calls onSelect with the chosen file and resets the input value', () => {
    const onSelect = vi.fn()
    render(<StopPhotoButton stopName="Louvre Museum" uploading={false} onSelect={onSelect} />)
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File(['bytes'], 'photo.jpg', { type: 'image/jpeg' })
    fireEvent.change(input, { target: { files: [file] } })
    expect(onSelect).toHaveBeenCalledWith(file)
    expect(input.value).toBe('')
  })

  it('does not call onSelect when the file picker is dismissed with no file', () => {
    const onSelect = vi.fn()
    render(<StopPhotoButton stopName="Louvre Museum" uploading={false} onSelect={onSelect} />)
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(input, { target: { files: [] } })
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('shows "Uploading…" and disables the button while an upload is in flight', () => {
    render(<StopPhotoButton stopName="Louvre Museum" uploading={true} onSelect={vi.fn()} />)
    const button = screen.getByRole('button', { name: 'Add photo to Louvre Museum' })
    expect(button).toBeDisabled()
    expect(button).toHaveTextContent('Uploading…')
  })
})
