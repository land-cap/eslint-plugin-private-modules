import path from 'node:path'
import { isGatewayFile } from './private-paths.js'

const PRIVATE_SEGMENT = `${path.sep}_private${path.sep}`

// True when `absPath` is `dir` itself or lives underneath it. The separator
// check keeps `/src/panel-extra` from counting as inside `/src/panel`.
export const isWithin = (absPath, dir) =>
	absPath === dir || absPath.startsWith(dir + path.sep)

// The innermost `<module>/_private` directory enclosing `absPath`, or null.
// Enclosing _private/ directories nest, so the innermost one implies all the
// outer ones — which is why visibility only ever has to check this one.
const innermostPrivateDir = (absPath) => {
	const idx = absPath.lastIndexOf(PRIVATE_SEGMENT)
	return idx === -1 ? null : absPath.slice(0, idx + PRIVATE_SEGMENT.length - 1)
}

// The module a path belongs to, or null when it belongs to none.
//
// Gateway files belong to their own directory; anything else belongs to the
// innermost module whose _private/ contains it. Checking the gateway case
// first is what makes `panel/_private/header/index.ts` belong to
// `panel/_private/header` rather than to `panel`.
export const ownerOf = (absPath, gatewayNames) => {
	if (isGatewayFile(absPath, gatewayNames)) {
		return path.dirname(absPath)
	}
	const idx = absPath.lastIndexOf(PRIVATE_SEGMENT)
	return idx === -1 ? null : absPath.slice(0, idx)
}

// Lexical scope: `targetPath` is visible to `fromFile` when it sits in no
// _private/ at all, or when `fromFile` is inside the innermost _private/
// enclosing it — where the owning module's gateway counts as inside.
export const isVisible = (fromFile, targetPath, gatewayNames) => {
	const scope = innermostPrivateDir(targetPath)
	if (scope === null) {
		return true
	}
	if (isWithin(fromFile, scope)) {
		return true
	}

	const moduleDir = path.dirname(scope)
	return (
		isGatewayFile(fromFile, gatewayNames) &&
		path.dirname(fromFile) === moduleDir
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
export const rootModuleOf = (absPath, gatewayNames) => {
	const owner = ownerOf(absPath, gatewayNames)
	if (owner === null) {
		return null
	}
	const chain = ancestorsOf(owner, gatewayNames)
	return chain.length === 0 ? owner : chain.at(-1)
}
