import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllEnvs(); window.history.replaceState(null, '', '/') })
HTMLDialogElement.prototype.showModal = function () { this.open = true }
HTMLDialogElement.prototype.close = function () { this.open = false }
Element.prototype.scrollIntoView = vi.fn()
