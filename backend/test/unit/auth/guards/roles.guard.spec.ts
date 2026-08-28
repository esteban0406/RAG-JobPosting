import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { RolesGuard } from '../../../../src/auth/guards/roles.guard.js';

const mockJwt = { verify: jest.fn() };

function contextWith(
  request: Record<string, unknown>,
  requiredRoles: string[] | undefined,
): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => ({}),
    getClass: () => ({}),
    __requiredRoles: requiredRoles,
  } as unknown as ExecutionContext;
}

function buildGuard(requiredRoles: string[] | undefined) {
  const reflector = {
    getAllAndOverride: jest.fn().mockReturnValue(requiredRoles),
  };
  return new RolesGuard(reflector as never, mockJwt as never);
}

describe('RolesGuard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('verifies the token itself — works with no JwtGuard in front of it', () => {
    mockJwt.verify.mockReturnValueOnce({ sub: 'admin-1', role: 'admin' });
    const guard = buildGuard(['admin']);
    const request = { headers: { authorization: 'Bearer good-token' } };

    expect(guard.canActivate(contextWith(request, ['admin']))).toBe(true);
    expect(mockJwt.verify).toHaveBeenCalledWith('good-token');
  });

  it('throws UnauthorizedException (not a silent pass) when there is no token at all', () => {
    const guard = buildGuard(undefined);
    const request = { headers: {} };

    expect(() => guard.canActivate(contextWith(request, undefined))).toThrow(
      UnauthorizedException,
    );
  });

  it('rejects a valid token whose role is not in the required list', () => {
    mockJwt.verify.mockReturnValueOnce({ sub: 'user-1', role: 'user' });
    const guard = buildGuard(['admin']);
    const request = { headers: { authorization: 'Bearer good-token' } };

    expect(guard.canActivate(contextWith(request, ['admin']))).toBe(false);
  });

  it('no longer falls back to a cookie', () => {
    const guard = buildGuard(['admin']);
    const request = {
      headers: {},
      cookies: { 'auth-token': 'some-token' },
    };

    expect(() => guard.canActivate(contextWith(request, ['admin']))).toThrow(
      UnauthorizedException,
    );
    expect(mockJwt.verify).not.toHaveBeenCalled();
  });
});
