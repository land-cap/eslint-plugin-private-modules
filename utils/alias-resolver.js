import path from 'node:path'
import { readFileSync } from 'node:fs'

const stripJsonc = (raw) =>
	raw
		.replace(/\/\/[^\n]*/g, '')
		.replace(/\/\*[\s\S]*?\*\//g, '')
		.replace(/,(\s*[}\]])/g, '$1')

const readJsonc = (absPath) =>
	JSON.parse(stripJsonc(readFileSync(absPath, 'utf8')))

const extractAliasEntries = (paths, baseDir) =>
	Object.entries(paths)
		.filter(
			([pattern, targets]) =>
				pattern.endsWith('/*') &&
				typeof targets[0] === 'string' &&
				targets[0].endsWith('/*'),
		)
		.map(([pattern, [target]]) => [
			pattern.slice(0, -1),
			path.resolve(baseDir, target.slice(0, -1)),
		])

export const parseTsconfigPaths = (tsconfigPath) => {
	const absPath = path.resolve(tsconfigPath)
	const dir = path.dirname(absPath)
	const { extends: ext, compilerOptions: { baseUrl, paths = {} } = {} } =
		readJsonc(absPath)

	const parentAliases =
		typeof ext === 'string' ? parseTsconfigPaths(path.resolve(dir, ext)) : {}
	const baseDir = baseUrl ? path.resolve(dir, baseUrl) : dir

	return Object.fromEntries([
		...Object.entries(parentAliases),
		...extractAliasEntries(paths, baseDir),
	])
}

// Match the most specific alias prefix.
// Subtle but important: Object iteration order should not decide resolution
// when aliases overlap (e.g. "@/", "@/feature/").
export const findBestAliasEntry = (src, aliases) => {
	let best = null
	for (const [prefix, target] of Object.entries(aliases)) {
		if (!src.startsWith(prefix)) {
			continue
		}
		if (!best || prefix.length > best[0].length) {
			best = [prefix, target]
		}
	}
	return best
}

// Resolves an alias import (e.g. `@/api`) to the absolute filesystem path it
// points at, or null when no alias entry matches.
export const resolveAliasToAbsolute = (src, aliases) => {
	const entry = findBestAliasEntry(src, aliases)
	if (!entry) {
		return null
	}

	const [prefix, target] = entry
	return path.join(path.resolve(target), src.slice(prefix.length))
}

export const resolveAliasToRelative = (src, aliases, fromFile) => {
	const absoluteImport = resolveAliasToAbsolute(src, aliases)
	if (!absoluteImport) {
		return null
	}

	const relative = path.relative(path.dirname(fromFile), absoluteImport)
	return (relative.startsWith('.') ? relative : `./${relative}`).replace(
		/\\/g,
		'/',
	)
}

// Reverse of resolveAliasToRelative: converts a relative import to its alias form (e.g. @/...).
// Returns null if no alias covers the resolved path.
export const resolveRelativeToAlias = (src, fromFile, aliases) => {
	const absoluteImport = path.resolve(path.dirname(fromFile), src)

	let bestPrefix = null
	let bestTarget = null
	for (const [prefix, target] of Object.entries(aliases)) {
		if (!absoluteImport.startsWith(target + '/') && absoluteImport !== target) {
			continue
		}
		if (!bestTarget || target.length > bestTarget.length) {
			bestPrefix = prefix
			bestTarget = target
		}
	}

	if (!bestPrefix) {
		return null
	}
	// prefix ends with '/' (e.g. '@/'); target has no trailing slash.
	// Slice target.length + 1 to drop the leading '/' from the remainder.
	const remainder = absoluteImport.slice(bestTarget.length + 1)
	return bestPrefix + remainder
}

// Reverse lookup: find the alias entry whose target directory contains an
// absolute file path (e.g. a resolved gateway file), regardless of how the
// original import was written (relative or alias).
export const findAliasEntryForPath = (absolutePath, aliases) => {
	let best = null
	for (const [prefix, target] of Object.entries(aliases)) {
		const resolvedTarget = path.resolve(target)
		if (
			absolutePath !== resolvedTarget &&
			!absolutePath.startsWith(resolvedTarget + path.sep)
		) {
			continue
		}
		if (!best || resolvedTarget.length > best[1].length) {
			best = [prefix, resolvedTarget]
		}
	}
	return best
}

export const ALIAS_SCHEMA = {
	type: 'object',
	properties: {
		aliases: { type: 'object', additionalProperties: { type: 'string' } },
		gatewayNames: {
			type: 'array',
			items: { type: 'string' },
			minItems: 1,
		},
	},
	additionalProperties: false,
}
