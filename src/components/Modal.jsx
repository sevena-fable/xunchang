import { useLayoutEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

export default function Modal({ open = true, onClose, label, children, className = '', closeOnBackdrop = true }) {
  const ref = useRef(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useLayoutEffect(() => {
    if (!open) return
    const dialog = ref.current
    const previous = document.activeElement
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    dialog.showModal()
    return () => {
      dialog.close()
      document.body.style.overflow = overflow
      if (previous?.isConnected) previous.focus({ preventScroll: true })
    }
  }, [open])

  if (!open) return null
  return createPortal(
    <dialog
      ref={ref}
      aria-label={label}
      className={`desk-modal ${className}`}
      onCancel={(event) => { event.preventDefault(); event.stopPropagation(); closeRef.current?.() }}
      onClick={(event) => { event.stopPropagation(); if (closeOnBackdrop && event.target === event.currentTarget) closeRef.current?.() }}
    >
      {children}
    </dialog>,
    document.body,
  )
}
