/**
 * The teammates clients import the phone's pure view-models (`mobile/src/agents/v2/*.ts`), and those files import each
 * other the way Metro and tsc do: without an extension. Node's ESM loader needs one, so extensionless relative
 * specifiers fall back to `.ts` / `.tsx` / `/index.ts`. Test-only; the app bundle resolves them itself.
 */
export async function resolve(specifier, context, next) {
  try { return await next(specifier, context); } catch (error) {
    if (error?.code === 'ERR_MODULE_NOT_FOUND' && /^\.{1,2}\//.test(specifier) && !/\.[a-z]+$/i.test(specifier)) {
      for (const suffix of ['.ts', '.tsx', '/index.ts']) { try { return await next(`${specifier}${suffix}`, context); } catch { /* try the next */ } }
    }
    throw error;
  }
}
