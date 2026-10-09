// Pure: the source of src/shared/license/public-key.ts for a public key.

export const publicKeyModule = (publicKeyPem: string): string => [
  '// The public half of the Remry Pro signing key, made by `bun run license:keygen`.',
  '// It only checks license keys; issuing one needs the private half, which is never in this repo.',
  '',
  `export const LICENSE_PUBLIC_KEY = ${JSON.stringify(publicKeyPem.trim() + '\n')};`,
  ''
].join('\n');

/**
 * Pure. Where the private key is by default: ~/.remry-license/private.pem, or a folder
 * from before the renames (Wonos, then Working Notes) while the key is still only there.
 */
export const defaultPrivateKeyPath = (home: string, exists: (path: string) => boolean): string => {
  const current = `${home}/.remry-license/private.pem`;
  if (exists(current)) return current;
  const legacy = [`${home}/.wonos-license/private.pem`, `${home}/.working-notes-license/private.pem`].find(exists);
  return legacy ?? current;
};
