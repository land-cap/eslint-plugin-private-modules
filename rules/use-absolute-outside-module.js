import path from 'node:path'
import {
	isRelativePath,
	isPrivatePath,
	isInsidePrivate,
	isGatewayFile,
	getPrivateParent,
} from '../utils/private-paths.js'
import {
	resolveRelativeToAlias,
	ALIAS_SCHEMA,
} from '../utils/alias-resolver.js'
import {
	createImportExportVisitors,
	isAssetImport,
} from '../utils/import-export-visitors.js'
import { createReplaceSourceFix } from '../utils/rule-fixes.js'
import { getRuleOptions } from '../utils/rule-options.js'

// --- helpers ---

// Returns the module directory for `filename`, or null when the file is not
// part of any module (neither inside _private/ nor a gateway file).
const getModuleDir = (filename, gatewayNames) => {
	if (isInsidePrivate(filename)) {
		return getPrivateParent(filename)
	}
	if (isGatewayFile(filename, gatewayNames)) {
		return path.dirname(filename)
	}
	return null
}

// True when `absoluteImport` falls inside `moduleDir`.
const isWithinModule = (absoluteImport, moduleDir) =>
	absoluteImport === moduleDir ||
	absoluteImport.startsWith(moduleDir + path.sep)

// --- rule ---

export const useAbsoluteOutsideModule = {
	meta: {
		type: 'problem',
		docs: {
			description: 'Require path-alias imports when crossing module boundaries',
			recommended: false,
			url: 'https://github.com/land-cap/eslint-plugin-private-modules#use-absolute-outside-module',
		},
		fixable: 'code',
		schema: [ALIAS_SCHEMA],
		messages: {
			outsideModuleRelative:
				'Use a path alias (@/) instead of a relative import outside your module.',
		},
	},

	create(context) {
		const { aliases, gatewayNames, filename } = getRuleOptions(context)

		const check = (node) => {
			const sourceNode = node.source
			const src = sourceNode?.value
			if (!src || !isRelativePath(src)) {
				return
			}
			// css/asset files → skip
			if (isAssetImport(src)) {
				return
			}
			// Defer to no-private-imports for any _private/ path to avoid double-reporting.
			if (isPrivatePath(src)) {
				return
			}

			const absoluteImport = path.resolve(path.dirname(filename), src)
			const moduleDir = getModuleDir(filename, gatewayNames)

			// File is inside a module — only flag when the import escapes the module.
			if (moduleDir !== null && isWithinModule(absoluteImport, moduleDir)) {
				return
			}

			const aliasPath = resolveRelativeToAlias(src, filename, aliases)
			context.report({
				node,
				messageId: 'outsideModuleRelative',
				fix: createReplaceSourceFix(sourceNode, aliasPath),
			})
		}

		return createImportExportVisitors(check)
	},
}
