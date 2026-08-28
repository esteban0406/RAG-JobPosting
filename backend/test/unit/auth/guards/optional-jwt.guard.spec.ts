import { ExecutionContext } from '@nestjs/common';
import { OptionalJwtGuard } from '../../../../src/auth/guards/optional-jwt.guard.js';

const mockJwt = { verify: jest.fn() };

function contextWith(request: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('OptionalJwtGuard', () => {
  let guard: OptionalJwtGuard;

  beforeEach(() => {
    jest.clearAllMocks();
    guard = new OptionalJwtGuard(mockJwt as never);
  });

  it('proceeds unauthenticated (no throw) when there is no Authorization header', () => {
    const request: Record<string, unknown> = { headers: {} };
    expect(guard.canActivate(contextWith(request))).toBe(true);
    expect(request.user).toBeUndefined();
  });

  it('sets request.user when the header carries a valid token', () => {
    mockJwt.verify.mockReturnValueOnce({ sub: 'user-1', role: 'user' });
    const request: Record<string, unknown> = {
      headers: { authorization: 'Bearer good-token' },
    };

    expect(guard.canActivate(contextWith(request))).toBe(true);
    expect(request.user).toEqual({ sub: 'user-1', role: 'user' });
  });

  it('proceeds unauthenticated when the token is invalid, rather than throwing', () => {
    mockJwt.verify.mockImplementationOnce(() => {
      throw new Error('bad token');
    });
    const request: Record<string, unknown> = {
      headers: { authorization: 'Bearer bad-token' },
    };

    expect(guard.canActivate(contextWith(request))).toBe(true);
    expect(request.user).toBeUndefined();
  });

  it('no longer falls back to a cookie — a cookie-only request stays unauthenticated', () => {
    const request: Record<string, unknown> = {
      headers: {},
      cookies: { 'auth-token': 'some-valid-looking-token' },
    };

    expect(guard.canActivate(contextWith(request))).toBe(true);
    expect(request.user).toBeUndefined();
    expect(mockJwt.verify).not.toHaveBeenCalled();
  });
});
