import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtGuard } from '../../../../src/auth/guards/jwt.guard.js';

const mockJwt = { verify: jest.fn() };

function contextWith(request: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('JwtGuard', () => {
  let guard: JwtGuard;

  beforeEach(() => {
    jest.clearAllMocks();
    guard = new JwtGuard(mockJwt as never);
  });

  it('allows the request and sets request.user when the Authorization header is valid', () => {
    mockJwt.verify.mockReturnValueOnce({ sub: 'user-1', role: 'user' });
    const request: Record<string, unknown> = {
      headers: { authorization: 'Bearer good-token' },
    };

    expect(guard.canActivate(contextWith(request))).toBe(true);
    expect(mockJwt.verify).toHaveBeenCalledWith('good-token');
    expect(request.user).toEqual({ sub: 'user-1', role: 'user' });
  });

  it('throws UnauthorizedException when there is no Authorization header', () => {
    const request = { headers: {} };
    expect(() => guard.canActivate(contextWith(request))).toThrow(
      UnauthorizedException,
    );
  });

  it('throws UnauthorizedException when jwtService.verify rejects the token', () => {
    mockJwt.verify.mockImplementationOnce(() => {
      throw new Error('invalid signature');
    });
    const request = { headers: { authorization: 'Bearer bad-token' } };
    expect(() => guard.canActivate(contextWith(request))).toThrow(
      UnauthorizedException,
    );
  });

  it('no longer falls back to a cookie — a request carrying only a cookie is rejected', () => {
    const request = {
      headers: {},
      cookies: { 'auth-token': 'some-valid-looking-token' },
    };
    expect(() => guard.canActivate(contextWith(request))).toThrow(
      UnauthorizedException,
    );
    expect(mockJwt.verify).not.toHaveBeenCalled();
  });
});
