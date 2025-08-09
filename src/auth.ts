import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { AuthToken, JWTPayload, TokenType, PERMISSION_SETS } from './types.js';

export class AuthManager {
  private tokens: Map<string, AuthToken> = new Map();
  private secret: string;
  private revokedTokens: Set<string> = new Set();

  constructor(secret: string, initialTokens: string[] = []) {
    this.secret = secret;
    
    // Add initial static tokens if provided
    initialTokens.forEach((token, index) => {
      const authToken: AuthToken = {
        id: `static-${index}`,
        type: 'master',
        permissions: PERMISSION_SETS['master'] || [],
        createdAt: new Date(),
        description: `Initial static token ${index + 1}`
      };
      this.tokens.set(token, authToken);
    });
  }

  generateToken(type: TokenType, expiresIn?: string, description?: string): string {
    const tokenId = uuidv4();
    const permissions = PERMISSION_SETS[type] || [];
    
    const authToken: AuthToken = {
      id: tokenId,
      type,
      permissions,
      createdAt: new Date(),
      ...(description && { description })
    };

    if (expiresIn) {
      const expiresAt = new Date();
      const duration = this.parseDuration(expiresIn);
      expiresAt.setTime(expiresAt.getTime() + duration);
      authToken.expiresAt = expiresAt;
    }

    const payload: JWTPayload = {
      tokenId,
      type,
      permissions,
      iat: Math.floor(Date.now() / 1000)
    };

    if (expiresIn) {
      payload.exp = Math.floor((authToken.expiresAt!.getTime()) / 1000);
    }

    const token = jwt.sign(payload, this.secret);
    this.tokens.set(token, authToken);
    
    return token;
  }

  verifyToken(token: string): AuthToken | null {
    // Check if token is revoked
    if (this.revokedTokens.has(token)) {
      return null;
    }

    // Check if it's a static token
    if (this.tokens.has(token)) {
      const authToken = this.tokens.get(token)!;
      
      // Check expiration
      if (authToken.expiresAt && authToken.expiresAt < new Date()) {
        this.tokens.delete(token);
        return null;
      }

      // Update last used
      authToken.lastUsed = new Date();
      return authToken;
    }

    // Try to verify as JWT
    try {
      const payload = jwt.verify(token, this.secret) as JWTPayload;
      
      // Check if we have the token in our store
      if (this.tokens.has(token)) {
        const authToken = this.tokens.get(token)!;
        authToken.lastUsed = new Date();
        return authToken;
      }

      // Create auth token from JWT payload
      const authToken: AuthToken = {
        id: payload.tokenId || 'unknown',
        type: payload.type,
        permissions: payload.permissions,
        createdAt: new Date(payload.iat * 1000),
        lastUsed: new Date()
      };

      if (payload.exp) {
        authToken.expiresAt = new Date(payload.exp * 1000);
      }

      return authToken;
    } catch (error) {
      return null;
    }
  }

  revokeToken(token: string): boolean {
    this.revokedTokens.add(token);
    return this.tokens.delete(token);
  }

  listTokens(): AuthToken[] {
    return Array.from(this.tokens.values()).filter(token => 
      !token.expiresAt || token.expiresAt > new Date()
    );
  }

  hasPermission(token: AuthToken, requiredPermissions: string[]): boolean {
    return requiredPermissions.every(permission => 
      token.permissions.includes(permission)
    );
  }

  private parseDuration(duration: string): number {
    const match = duration.match(/^(\d+)([smhd])$/);
    if (!match) {
      throw new Error('Invalid duration format. Use format like: 30s, 5m, 2h, 7d');
    }

    const value = parseInt(match[1]!);
    const unit = match[2]!;

    switch (unit) {
      case 's': return value * 1000;
      case 'm': return value * 60 * 1000;
      case 'h': return value * 60 * 60 * 1000;
      case 'd': return value * 24 * 60 * 60 * 1000;
      default: throw new Error('Invalid duration unit');
    }
  }

  // Clean up expired tokens
  cleanup(): void {
    const now = new Date();
    for (const [token, authToken] of this.tokens.entries()) {
      if (authToken.expiresAt && authToken.expiresAt < now) {
        this.tokens.delete(token);
      }
    }
  }
}
