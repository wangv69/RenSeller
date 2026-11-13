import { vi } from 'vitest'

export function query(result: unknown) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    neq: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    range: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    single: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockReturnThis(),
    abortSignal: vi.fn().mockReturnThis(),
    then: (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve),
  }
  return chain
}

export const session = {
  user: {
    id: 'self',
    email: 'test@rpi.edu',
    app_metadata: {} as Record<string, unknown>,
    user_metadata: { username: 'test' },
  },
}
