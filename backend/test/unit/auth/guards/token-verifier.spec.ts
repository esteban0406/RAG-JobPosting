import { UnauthorizedException } from '@nestjs/common';
import { verifyRequestToken } from '../../../../src/auth/guards/token-verifier.js';

const mockJwt = { verify: jest.fn() };

describe('verifyRequestToken', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns the payload and sets request.user on success', () => {
    mockJwt.verify.mockReturnValueOnce({ sub: 'user-1', role: 'user' });
    const request: Record<string, unknown> = {
      headers: { authorization: 'Bearer good-token' },
    };

    const payload = verifyRequestToken(request as never, mockJwt as never);

    expect(payload).toEqual({ sub: 'user-1', role: 'user' });
    expect(request.user).toEqual({ sub: 'user-1', role: 'user' });
  });

  it('throws UnauthorizedException when the header is missing', () => {
    const request = { headers: {} };
    expect(() => verifyRequestToken(request as never, mockJwt as never)).toThrow(
      UnauthorizedException,
    );
  });

  it('throws UnauthorizedException when the header does not start with "Bearer "', () => {
    const request = { headers: { authorization: 'Basic abc123' } };
    expect(() => verifyRequestToken(request as never, mockJwt as never)).toThrow(
      UnauthorizedException,
    );
  });

  it('throws UnauthorizedException when jwtService.verify throws', () => {
    mockJwt.verify.mockImplementationOnce(() => {
      throw new Error('expired');
    });
    const request = { headers: { authorization: 'Bearer expired-token' } };
    expect(() => verifyRequestToken(request as never, mockJwt as never)).toThrow(
      UnauthorizedException,
    );
  });
});
