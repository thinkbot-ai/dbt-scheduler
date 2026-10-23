const SECRET_PATTERNS: readonly RegExp[] = [
  /x-access-token:[^@\s'"]+/gi,
  /Authorization:\s*Basic\s+[A-Za-z0-9+/=]+/gi,
  /Authorization:\s*Bearer\s+[A-Za-z0-9._-]+/gi,
  /http\.extraHeader=\S+/gi,
  /\bghp_[A-Za-z0-9]+/g,
  /\bgithub_pat_[A-Za-z0-9_]+/g,
  /\bghs_[A-Za-z0-9]+/g,
  /\/\/[^/\s'"]+@/g,
];

export function redactSecrets(value: string): string {
  let redacted = value;
  for (const pattern of SECRET_PATTERNS) {
    redacted = redacted.replace(pattern, (match) => {
      if (match.startsWith('//')) {
        return '//[redacted]@';
      }
      if (match.toLowerCase().startsWith('authorization:')) {
        return 'Authorization: [redacted]';
      }
      if (match.toLowerCase().startsWith('http.extraheader=')) {
        return 'http.extraHeader=[redacted]';
      }
      return '[redacted]';
    });
  }
  return redacted;
}

export function containsSecret(value: string, secret: string): boolean {
  return secret.length > 0 && value.includes(secret);
}
