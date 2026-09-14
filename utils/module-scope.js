import path from 'node:path'
import { isGatewayFile } from './private-paths.js'
import { findGatewayFile } from './gateway-discovery.js'

const PRIVATE_SEGMENT = `${path.sep}_private${path.sep}`

// True when `absPath` is `dir` itself or lives underneath it. The separator
// check keeps `/src/panel-extra` from counting as inside `/src/panel`.
export const isWithin = (absPath, dir) =>
	absPath === dir || absPath.startsWith(dir + path.sep)

// The module owning the innermost `_private/` that encloses `absPath`, or
// null when no `_private/` does. Enclosing _private/ directories nest, so the
// innermost one implies all the outer ones — which is why visibility only
// ever has to check this one.
const privateOwnerOf = (absPath) => {
	const idx = absPath.lastIndexOf(PRIVATE_SEGMENT)
	return idx === -1 ? null : absPath.slice(0, idx)
}

// The module a path belongs to, or null when it belongs to none.
//
// Gateway files belong to their own directory; anything else belongs to the
// innermost module whose _private/ contains it. Checking the gateway case
// first is what makes `panel/_private/header/index.ts` belong to
// `panel/_private/header` rather than to `panel`.
export const ownerOf = (absPath, gatewayNames) =>
	isGatewayFile(absPath, gatewayNames)
		? path.dirname(absPath)
		: privateOwnerOf(absPath)

// Lexical scope: `targetPath` is visible to `fromFile` when it sits in no
// _private/ at all, or when `fromFile` is inside the innermost _private/
// enclosing it — where that scope's own gateway counts as inside, since a
// gateway lives lexically outside the `_private/` it owns.
export const isVisible = (fromFile, targetPath, gatewayNames) => {
	const moduleDir = privateOwnerOf(targetPath)
	if (moduleDir === null) {
		return true
	}

	return (
		isWithin(fromFile, path.join(moduleDir, '_private')) ||
		(isGatewayFile(fromFile, gatewayNames) &&
			path.dirname(fromFile) === moduleDir)
	)
}

// The modules enclosing `moduleDir`, nearest first. Each step strips at least
// one path segment, so the walk always terminates.
export const ancestorsOf = (moduleDir, gatewayNames) => {
	const chain = []
	let current = ownerOf(moduleDir, gatewayNames)
	while (current !== null) {
		chain.push(current)
		current = ownerOf(current, gatewayNames)
	}
	return chain
}

// The outermost module enclosing `absPath` — the scope within which relative
// imports stay legible, since a module's whole subtree moves as one unit.
// That is the prefix before the *first* `_private/`; a file in no `_private/`
// at all is its own root module when it is a gateway, and otherwise in none.
export const rootModuleOf = (absPath, gatewayNames) => {
	const idx = absPath.indexOf(PRIVATE_SEGMENT)
	if (idx !== -1) {
		return absPath.slice(0, idx)
	}
	return isGatewayFile(absPath, gatewayNames) ? path.dirname(absPath) : null
}

// The module a resolved import refers to. A bare directory naming a module
// refers to that module (via its gateway), not to the private scope the
// directory happens to sit in — without this, every sibling nested module
// would look like it belonged to the shared parent.
//
// This is the one function here that touches the filesystem: telling a bare
// module directory apart from any other path means looking for a gateway in
// it. The extension check keeps plain file paths, which can never be a module
// directory, from reaching (and polluting) the gateway lookup cache.
export const targetModuleOf = (resolved, gatewayNames) => {
	if (path.extname(resolved) !== '') {
		return ownerOf(resolved, gatewayNames)
	}
	return findGatewayFile(resolved, gatewayNames) === null
		? ownerOf(resolved, gatewayNames)
		: resolved
}

// True when the import reaches a module that encloses the importing file's
// module. Nested modules must stay agnostic of their parents; the parent's
// gateway re-exports the nested module, so an upward import closes a cycle.
export const isAncestorImport = (fromFile, resolved, gatewayNames) => {
	const importerModule = ownerOf(fromFile, gatewayNames)
	if (importerModule === null) {
		return false
	}

	// Pure string work, and empty for every top-level module — so this runs
	// before targetModuleOf, which would otherwise hit the filesystem to
	// answer a question with no possible ancestor to match.
	const ancestors = ancestorsOf(importerModule, gatewayNames)
	if (ancestors.length === 0) {
		return false
	}

	return ancestors.includes(targetModuleOf(resolved, gatewayNames))
}

// Path-style rules only govern imports the boundary rules accept: rewriting
// the path of an import that is itself a boundary violation just produces a
// differently-spelled violation.
export const isLegalImport = (fromFile, resolved, gatewayNames) =>
	isVisible(fromFile, resolved, gatewayNames) &&
	!isAncestorImport(fromFile, resolved, gatewayNames)
