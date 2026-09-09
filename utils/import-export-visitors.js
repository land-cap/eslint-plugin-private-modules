import path from 'node:path'

const ASSET_EXTENSIONS = new Set([
	'.css',
	'.scss',
	'.sass',
	'.less',
	'.json',
	'.svg',
	'.png',
	'.jpg',
	'.jpeg',
	'.gif',
	'.webp',
	'.ico',
	'.woff',
	'.woff2',
	'.ttf',
	'.eot',
])

export const isAssetImport = (src) => ASSET_EXTENSIONS.has(path.extname(src))

export const createImportExportVisitors = (check) => ({
	ImportDeclaration: check,
	ExportNamedDeclaration: check,
	ExportAllDeclaration: check,
	ImportExpression: check,
})
