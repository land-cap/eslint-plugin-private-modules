import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { SRC, fixturePath as at } from './setup.js'
import {
	ownerOf,
	isWithin,
	isVisible,
	ancestorsOf,
	rootModuleOf,
	isAncestorImport,
} from '../utils/module-scope.js'
import { resolveImport } from '../utils/module-resolution.js'

const NAMES = ['index']

describe('ownerOf', () => {
	it('returns null for a file outside any module', () => {
		assert.equal(ownerOf(at('feed', 'feed.tsx'), NAMES), null)
	})

	it('assigns a gateway file to its own directory', () => {
		assert.equal(ownerOf(at('avatar', 'index.ts'), NAMES), at('avatar'))
	})

	it('assigns a _private/ file to the module owning that _private/', () => {
		assert.equal(
			ownerOf(at('avatar', '_private', 'utils.ts'), NAMES),
			at('avatar'),
		)
	})

	it('assigns a nested _private/ file to the innermost module, not the outermost', () => {
		assert.equal(
			ownerOf(
				at('panel', '_private', 'header', '_private', 'header.tsx'),
				NAMES,
			),
			at('panel', '_private', 'header'),
		)
	})

	it('assigns a nested gateway to its own directory, not the enclosing module', () => {
		assert.equal(
			ownerOf(at('panel', '_private', 'header', 'index.ts'), NAMES),
			at('panel', '_private', 'header'),
		)
	})

	it('honours a custom gatewayNames list', () => {
		assert.equal(ownerOf(at('avatar', 'public.ts'), ['public']), at('avatar'))
		assert.equal(ownerOf(at('avatar', 'public.ts'), NAMES), null)
	})
})

describe('isWithin', () => {
	it('is true for the directory itself and for descendants', () => {
		assert.equal(isWithin(at('panel'), at('panel')), true)
		assert.equal(isWithin(at('panel', '_private', 'x.ts'), at('panel')), true)
	})

	it('is false for a sibling with a shared name prefix', () => {
		assert.equal(isWithin(at('panel-extra', 'x.ts'), at('panel')), false)
	})
})

describe('isVisible', () => {
	const outsider = at('feed', 'feed.tsx')

	it('allows any path with no enclosing _private/', () => {
		assert.equal(isVisible(outsider, at('avatar', 'index.ts'), NAMES), true)
	})

	it('blocks an outsider from the _private/ of another module', () => {
		assert.equal(
			isVisible(outsider, at('avatar', '_private', 'utils.ts'), NAMES),
			false,
		)
	})

	it('lets a gateway see the _private/ of its own module', () => {
		assert.equal(
			isVisible(
				at('avatar', 'index.ts'),
				at('avatar', '_private', 'utils.ts'),
				NAMES,
			),
			true,
		)
	})

	it('blocks a gateway from the _private/ of another module', () => {
		assert.equal(
			isVisible(
				at('avatar', 'index.ts'),
				at('button', '_private', 'button.tsx'),
				NAMES,
			),
			false,
		)
	})

	it('lets a file inside _private/ see its siblings there', () => {
		assert.equal(
			isVisible(
				at('avatar', '_private', 'avatar.tsx'),
				at('avatar', '_private', 'utils.ts'),
				NAMES,
			),
			true,
		)
	})

	it('lets a nested module see the gateway of a sibling nested module', () => {
		assert.equal(
			isVisible(
				at('panel', '_private', 'header', '_private', 'header.tsx'),
				at('panel', '_private', 'toolbar', 'index.ts'),
				NAMES,
			),
			true,
		)
	})

	it('blocks a nested module from the internals of a sibling nested module', () => {
		assert.equal(
			isVisible(
				at('panel', '_private', 'header', '_private', 'header.tsx'),
				at('panel', '_private', 'toolbar', '_private', 'toolbar.ts'),
				NAMES,
			),
			false,
		)
	})

	it('blocks an outsider from a nested module entirely', () => {
		assert.equal(
			isVisible(outsider, at('panel', '_private', 'header', 'index.ts'), NAMES),
			false,
		)
	})

	it('lets a parent gateway see a nested module', () => {
		assert.equal(
			isVisible(
				at('panel', 'index.ts'),
				at('panel', '_private', 'header'),
				NAMES,
			),
			true,
		)
	})
})

describe('ancestorsOf', () => {
	it('is empty for a top-level module', () => {
		assert.deepEqual(ancestorsOf(at('avatar'), NAMES), [])
	})

	it('lists enclosing modules outward', () => {
		assert.deepEqual(ancestorsOf(at('panel', '_private', 'header'), NAMES), [
			at('panel'),
		])
	})

	it('walks more than one level', () => {
		assert.deepEqual(
			ancestorsOf(
				at('panel', '_private', 'header', '_private', 'badge'),
				NAMES,
			),
			[at('panel', '_private', 'header'), at('panel')],
		)
	})
})

describe('rootModuleOf', () => {
	it('returns null outside any module', () => {
		assert.equal(rootModuleOf(at('feed', 'feed.tsx'), NAMES), null)
	})

	it('returns the module itself for a top-level module file', () => {
		assert.equal(
			rootModuleOf(at('avatar', '_private', 'utils.ts'), NAMES),
			at('avatar'),
		)
	})

	it('returns the outermost module for a deeply nested file', () => {
		assert.equal(
			rootModuleOf(
				at('panel', '_private', 'header', '_private', 'header.tsx'),
				NAMES,
			),
			at('panel'),
		)
	})
})

describe('resolveImport', () => {
	const aliases = { '@/': SRC }

	it('resolves a relative specifier against the importing file', () => {
		assert.equal(
			resolveImport(
				at('avatar', '_private', 'avatar.tsx'),
				'./utils.ts',
				aliases,
			),
			at('avatar', '_private', 'utils.ts'),
		)
	})

	it('resolves an alias specifier against its target directory', () => {
		assert.equal(
			resolveImport(at('feed', 'feed.tsx'), '@/avatar/_private/utils', aliases),
			at('avatar', '_private', 'utils'),
		)
	})

	it('returns null for a specifier no alias covers', () => {
		assert.equal(resolveImport(at('feed', 'feed.tsx'), 'react', aliases), null)
	})
})

describe('isAncestorImport', () => {
	const nested = at('panel', '_private', 'header', '_private', 'header.tsx')

	it('flags the gateway of the parent module addressed as a bare directory', () => {
		assert.equal(isAncestorImport(nested, at('panel'), NAMES), true)
	})

	it('flags the gateway of the parent module addressed by filename', () => {
		assert.equal(isAncestorImport(nested, at('panel', 'index.ts'), NAMES), true)
	})

	it('flags a plain implementation file of the parent', () => {
		assert.equal(
			isAncestorImport(nested, at('panel', '_private', 'helper.ts'), NAMES),
			true,
		)
	})

	it('does not flag a sibling nested module', () => {
		assert.equal(
			isAncestorImport(nested, at('panel', '_private', 'toolbar'), NAMES),
			false,
		)
	})

	it('does not flag an unrelated top-level module', () => {
		assert.equal(isAncestorImport(nested, at('button'), NAMES), false)
	})

	it('does not flag anything for a file outside any module', () => {
		assert.equal(
			isAncestorImport(at('feed', 'feed.tsx'), at('panel'), NAMES),
			false,
		)
	})
})
