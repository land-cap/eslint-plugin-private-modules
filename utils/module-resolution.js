import path from 'node:path'
import { findBestAliasEntry, resolveAliasToAbsolute } from './alias-resolver.js'
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

const resolveModuleDirFromRelative = (filename, src) =>
	getPrivateParent(path.resolve(path.dirname(filename), src))

const resolveModuleDirFromAlias = (src, aliases) => {
	const entry = findBestAliasEntry(src, aliases)
	if (!entry) {
		return null
	}
	const [prefix, target] = entry
	return getPrivateParent(
		path.join(path.resolve(target), src.slice(prefix.length)),
	)
}

export const findModuleDir = (filename, src, aliases) =>
	isRelativePath(src)
		? resolveModuleDirFromRelative(filename, src)
		: resolveModuleDirFromAlias(src, aliases)
