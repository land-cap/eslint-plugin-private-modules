import path from 'node:path'
import {
	isRelativePath,
	isInsidePrivate,
	isGatewayFile,
	getPrivateParent,
} from '../utils/private-paths.js'
import {
	resolveAliasToRelative,
	resolveAliasToAbsolute,
	ALIAS_SCHEMA,
} from '../utils/alias-resolver.js'
import { isSameModuleAlias } from '../utils/module-resolution.js'
import { findGatewayFile } from '../utils/gateway-discovery.js'
import {
	getImportedNames,
	resolveGatewayFile,
	buildPrivateSourceMap,
} from '../utils/gateway-exports.js'
import {
	createImportExportVisitors,
	isAssetImport,
} from '../utils/import-export-visitors.js'
import { createReplaceSourceFix } from '../utils/rule-fixes.js'
import { getRuleOptions } from '../utils/rule-options.js'

const buildFix = (relativePath, sourceNode) =>
	createReplaceSourceFix(sourceNode, relativePath)

// Given a gateway violation, try to find a single _private/ source file that
// exports all of the imported names and return a fixer for it, or null.
const buildGatewayFix = (node, gatewayPath, fromDir) => {
	const names = getImportedNames(node)
	if (!names || names.length === 0) {
		return null
	}

	const sourceMap = buildPrivateSourceMap(gatewayPath)
	const gatewayDir = path.dirname(gatewayPath)

	// Collect the _private/ source path for every imported name.
	const sourcePaths = new Set()
	for (const name of names) {
		const relSrc = sourceMap.get(name)
		// name not found in source map → can't fix
		if (!relSrc) {
			return null
		}
		sourcePaths.add(path.resolve(gatewayDir, relSrc))
	}

	// Only fix when all names come from exactly one source file.
	if (sourcePaths.size !== 1) {
		return null
	}

	const [absoluteSrc] = sourcePaths
	const relative = path.relative(fromDir, absoluteSrc).replace(/\\/g, '/')
	const relativePath = relative.startsWith('.') ? relative : `./${relative}`

	return createReplaceSourceFix(node.source, relativePath)
}

// Given an alias's resolved absolute target and the importing file's own
// module dir, returns the module's gateway file on disk when the alias
// points at that gateway (bare module root, e.g. `@/avatar`, or an explicit
// gateway name, e.g. `@/avatar/index`) — or null otherwise.
const resolveAliasGatewayFile = (absoluteImport, moduleDir, gatewayNames) => {
	if (!absoluteImport) {
		return null
	}
	if (absoluteImport === moduleDir) {
		return findGatewayFile(moduleDir, gatewayNames)
	}
	if (
		isGatewayFile(absoluteImport, gatewayNames) &&
		path.dirname(absoluteImport) === moduleDir
	) {
		return resolveGatewayFile(absoluteImport)
	}
	return null
}

export const useRelativeInPrivate = {
	meta: {
		type: 'problem',
		fixable: 'code',
		schema: [ALIAS_SCHEMA],
		messages: {
			useRelative:
				'Inside _private/, use relative imports for same-module references — not path aliases.',
			noGateway:
				"Inside _private/, do not import from the module's public gateway — import directly from the source file in _private/.",
		},
	},

	create(context) {
		const { aliases, gatewayNames, filename } = getRuleOptions(context)

		const check = (node) => {
			const sourceNode = node.source
			const src = sourceNode?.value
			if (!src || isAssetImport(src) || !isInsidePrivate(filename)) {
				return
			}

			// Alias import that resolves within the same module → must use relative,
			// unless it points at the module's own gateway, which gets the same
			// noGateway treatment as a relative gateway import below.
			if (!isRelativePath(src) && isSameModuleAlias(filename, src, aliases)) {
				const moduleDir = getPrivateParent(filename)
				const absoluteImport = resolveAliasToAbsolute(src, aliases)
				const gatewayPath = resolveAliasGatewayFile(
					absoluteImport,
					moduleDir,
					gatewayNames,
				)

				if (gatewayPath) {
					context.report({
						node,
						messageId: 'noGateway',
						fix: buildGatewayFix(node, gatewayPath, path.dirname(filename)),
					})
					return
				}

				const relativePath = resolveAliasToRelative(src, aliases, filename)
				context.report({
					node,
					messageId: 'useRelative',
					fix: buildFix(relativePath, sourceNode),
				})
				return
			}

			// Relative import that resolves to the same module's public gateway →
			// import directly from the _private/ source file instead.
			if (isRelativePath(src)) {
				const resolvedBase = path.resolve(path.dirname(filename), src)
				const moduleDir = getPrivateParent(filename)
				if (
					moduleDir &&
					isGatewayFile(resolvedBase, gatewayNames) &&
					path.dirname(resolvedBase) === moduleDir
				) {
					const gatewayPath = resolveGatewayFile(resolvedBase)
					context.report({
						node,
						messageId: 'noGateway',
						fix: gatewayPath
							? buildGatewayFix(node, gatewayPath, path.dirname(filename))
							: null,
					})
				}
			}
		}

		return createImportExportVisitors(check)
	},
}
