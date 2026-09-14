import path from 'node:path'
import { resolveAliasToAbsolute } from './alias-resolver.js'
import { getPrivateParent, isRelativePath } from './private-paths.js'

// Returns true when a non-relative alias import from inside _private/ resolves
// to a path that lives inside the same module directory.
export const isSameModuleAlias = (filename, src, aliases) => {
	if (isRelativePath(src)) {
		return false
	}
	const fileModuleDir = getPrivateParent(filename)
	if (!fileModuleDir) {
		return false
	}

	const absoluteImport = resolveAliasToAbsolute(src, aliases)
	if (!absoluteImport) {
		return false
	}

	return (
		absoluteImport === fileModuleDir ||
		absoluteImport.startsWith(fileModuleDir + path.sep)
	)
}

// Resolves an import specifier to the absolute path it points at, whichever
// form it was written in. Null when no alias covers a non-relative specifier.
export const resolveImport = (filename, src, aliases) =>
	isRelativePath(src)
		? path.resolve(path.dirname(filename), src)
		: resolveAliasToAbsolute(src, aliases)

export const findModuleDir = (filename, src, aliases) => {
	const resolved = resolveImport(filename, src, aliases)
	return resolved === null ? null : getPrivateParent(resolved)
}
