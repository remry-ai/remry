// libsql loads its native module with a runtime require of `@libsql/${target}`, which
// a bundler can't follow, so a compiled binary would look for node_modules when it
// runs. The release build rewrites that line into a static require of the build
// target's package, and Bun then embeds the native module in the binary.

import type { BunPlugin } from 'bun';
import { ok, err, type Result } from '$shared/utils/result';

const DYNAMIC_REQUIRE = 'require(`@libsql/${target}`)';

/** Pure. Fails if libsql stops loading its native module this way, so an upgrade can't silently break the binary. */
export const rewriteLibsqlLoader = (source: string, target: string): Result<string> =>
  source.includes(DYNAMIC_REQUIRE)
    ? ok(source.replace(DYNAMIC_REQUIRE, `require(${JSON.stringify(`@libsql/${target}`)})`))
    : err(new Error('libsql no longer loads its native module with require(`@libsql/${target}`); update scripts/release/libsql.ts'));

export const libsqlNativePlugin = (target: string): BunPlugin => ({
  name: 'libsql-native',
  setup(build) {
    build.onLoad({ filter: /[\\/]node_modules[\\/]libsql[\\/]index\.js$/ }, async (args) => {
      const rewritten = rewriteLibsqlLoader(await Bun.file(args.path).text(), target);
      if (!rewritten.ok) throw rewritten.error;
      return { contents: rewritten.value, loader: 'js' };
    });
  }
});
