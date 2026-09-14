import path from 'node:path'
import { resolveAliasToAbsolute } from './alias-resolver.js'
import { isRelativePath } from './private-paths.js'

// Resolves an import specifier to the absolute path it points at, whichever
// form it was written in. Null when no alias covers a non-relative specifier.
export const resolveImport = (filename, src, aliases) =>
	isRelativePath(src)
		? path.resolve(path.dirname(filename), src)
		: resolveAliasToAbsolute(src, aliases)
