import { readFileSync, existsSync } from 'node:fs'

// Returns gateway export info:
// - hasWildcard: true when `export * from ..._private...` is present
// - names: explicitly exported names from `_private/` re-exports
const scanGatewayExports = (gatewayPath) => {
	const content = readFileSync(gatewayPath, 'utf8')
	const hasWildcard = /export\s+\*\s+from\s+['"][^'"]*_private[^'"]*['"]/m.test(
		content,
	)

	// `export { Foo, Bar as Baz } from './_private/...'`
	// `export type { Foo } from './_private/...'`
	const names = new Set()
	const re =
		/export(?:\s+type)?\s*\{([^}]+)\}\s+from\s+['"][^'"]*_private[^'"]*['"]/gm
	for (const [, bindings] of content.matchAll(re)) {
		for (const binding of bindings.split(',')) {
			// "Foo as Bar" -> exported name is "Bar"; plain "Foo" -> "Foo"
			const exportedName = binding
				.trim()
				.split(/\s+as\s+/)
				.at(-1)
				?.trim()
			if (exportedName) {
				names.add(exportedName)
			}
		}
	}

	return { hasWildcard, names }
}

const gatewayExportsCache = new Map()

const getGatewayExports = (gatewayPath) => {
	if (!gatewayExportsCache.has(gatewayPath)) {
		gatewayExportsCache.set(gatewayPath, scanGatewayExports(gatewayPath))
	}
	return gatewayExportsCache.get(gatewayPath)
}

// Returns true if the gateway exports all of the given names.
export const gatewayExportsAll = (gatewayPath, names) => {
	const exportInfo = getGatewayExports(gatewayPath)
	return names.every((name) => {
		// `export *` does not re-export default in ESM.
		if (name === 'default') {
			return exportInfo.names.has('default')
		}
		return exportInfo.hasWildcard || exportInfo.names.has(name)
	})
}

// Resolves a gateway base path (no extension) to the actual file on disk.
export const resolveGatewayFile = (basePath) => {
	if (existsSync(basePath)) {
		return basePath
	}
	const candidate = `${basePath}.ts`
	return existsSync(candidate) ? candidate : null
}

// Returns Map<exportedName, relativeSourcePath> for all _private/ re-exports in a gateway file.
export const buildPrivateSourceMap = (gatewayPath) => {
	const content = readFileSync(gatewayPath, 'utf8')
	const map = new Map()
	const re =
		/export(?:\s+type)?\s*\{([^}]+)\}\s+from\s+['"]([^'"]*_private[^'"]*)['"]/gm
	for (const [, bindings, src] of content.matchAll(re)) {
		for (const binding of bindings.split(',')) {
			const exportedName = binding
				.trim()
				.split(/\s+as\s+/)
				.at(-1)
				?.trim()
			if (exportedName) {
				map.set(exportedName, src)
			}
		}
	}
	return map
}

// Returns source-side names referenced by an import/export node,
// or null when they cannot be enumerated (namespace specifier, export *, dynamic import).
export const getImportedNames = (node) => {
	if (
		node.type === 'ImportExpression' ||
		node.type === 'ExportAllDeclaration'
	) {
		return null
	}

	const names = []
	for (const spec of node.specifiers ?? []) {
		if (spec.type === 'ImportNamespaceSpecifier') {
			return null
		}
		if (spec.type === 'ImportDefaultSpecifier') {
			names.push('default')
		}
		if (spec.type === 'ImportSpecifier') {
			names.push(spec.imported.name)
		}
		if (spec.type === 'ExportSpecifier') {
			names.push(spec.local.name)
		}
	}
	return names
}
