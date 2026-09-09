import path from 'node:path'
import { isPrivatePath, isGatewayFile } from '../utils/private-paths.js'
import { ALIAS_SCHEMA } from '../utils/alias-resolver.js'
import { findModuleDir } from '../utils/module-resolution.js'
import {
	findGatewayFile,
	buildGatewayPath,
} from '../utils/gateway-discovery.js'
import {
	gatewayExportsAll,
	getImportedNames,
} from '../utils/gateway-exports.js'
import {
	createImportExportVisitors,
	isAssetImport,
} from '../utils/import-export-visitors.js'
import { formatGatewayList } from '../utils/gateway-names.js'
import { createReplaceSourceFix } from '../utils/rule-fixes.js'
import { getRuleOptions } from '../utils/rule-options.js'

// --- fix builder ---

const buildGatewayFix = (
	node,
	sourceNode,
	filename,
	src,
	aliases,
	gatewayNames,
) => {
	const moduleDir = findModuleDir(filename, src, aliases)
	if (!moduleDir) {
		return null
	}

	const gatewayFile = findGatewayFile(moduleDir, gatewayNames)
	if (!gatewayFile) {
		return null
	}

	const names = getImportedNames(node)
	// null = namespace/wildcard/dynamic — can't verify, skip fix
	if (names === null) {
		return null
	}
	// non-empty names = verify gateway exports them all
	if (names.length > 0 && !gatewayExportsAll(gatewayFile, names)) {
		return null
	}

	const gatewayPath = buildGatewayPath(gatewayFile, aliases)
	if (!gatewayPath) {
		return null
	}

	return createReplaceSourceFix(sourceNode, gatewayPath)
}

// --- rule ---

export const noPrivateImports = {
	meta: {
		type: 'problem',
		fixable: 'code',
		schema: [ALIAS_SCHEMA],
		messages: {
			noPrivate:
				"Do not import from _private/ directly. Use the module's {{gatewayList}} barrel instead.",
			crossModule:
				"Gateway files may only import from their own sibling _private/, not from another module's.",
		},
	},

	create(context) {
		const { aliases, gatewayNames, filename } = getRuleOptions(context)

		const check = (node) => {
			const sourceNode = node.source
			const src = sourceNode?.value
			if (!src || isAssetImport(src) || !isPrivatePath(src)) {
				return
			}

			if (!isGatewayFile(filename, gatewayNames)) {
				context.report({
					node,
					messageId: 'noPrivate',
					data: { gatewayList: formatGatewayList(gatewayNames) },
					fix: buildGatewayFix(
						node,
						sourceNode,
						filename,
						src,
						aliases,
						gatewayNames,
					),
				})
				return
			}

			const importModuleDir = findModuleDir(filename, src, aliases)
			if (importModuleDir !== path.dirname(filename)) {
				context.report({ node, messageId: 'crossModule' })
			}
		}

		return createImportExportVisitors(check)
	},
}
