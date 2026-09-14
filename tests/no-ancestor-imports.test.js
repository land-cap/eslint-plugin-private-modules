import { noAncestorImports } from '../rules/no-ancestor-imports.js'
import { opts, fixturePath, tester } from './setup.js'

tester.run('no-ancestor-imports', noAncestorImports, {
	valid: [
		// A file outside any module has no ancestors to violate.
		{
			filename: fixturePath('feed/feed.tsx'),
			code: `import { Panel } from '@/panel'`,
			options: opts,
		},

		// Downward is the whole point: a parent consumes its nested module.
		{
			filename: fixturePath('panel/_private/panel.tsx'),
			code: `import { Header } from './header'`,
			options: opts,
		},

		// The parent's gateway consuming the nested module.
		{
			filename: fixturePath('panel/index.ts'),
			code: `export { Header } from './_private/header'`,
			options: opts,
		},

		// Sideways: sibling nested modules are peers, not ancestors.
		{
			filename: fixturePath('panel/_private/header/_private/header.tsx'),
			code: `import { Toolbar } from '../../toolbar'`,
			options: opts,
		},

		// Reaching outside the tree entirely is unrelated to ancestry.
		{
			filename: fixturePath('panel/_private/header/_private/header.tsx'),
			code: `import { Button } from '@/button'`,
			options: opts,
		},

		// A top-level module importing another top-level module.
		{
			filename: fixturePath('avatar/_private/avatar.tsx'),
			code: `import { Button } from '@/button'`,
			options: opts,
		},

		// Asset imports are ignored.
		{
			filename: fixturePath('panel/_private/header/_private/header.tsx'),
			code: `import tokens from '../../tokens.json'`,
			options: opts,
		},
	],

	invalid: [
		// The parent's gateway, by alias.
		{
			filename: fixturePath('panel/_private/header/_private/header.tsx'),
			code: `import { Panel } from '@/panel'`,
			options: opts,
			output: null,
			errors: [{ messageId: 'ancestorImport' }],
		},

		// The parent's gateway, by relative path.
		{
			filename: fixturePath('panel/_private/header/_private/header.tsx'),
			code: `import { Panel } from '../../../index.ts'`,
			options: opts,
			output: null,
			errors: [{ messageId: 'ancestorImport' }],
		},

		// A plain implementation file of the parent — visible lexically, but
		// still parent knowledge.
		{
			filename: fixturePath('panel/_private/header/_private/header.tsx'),
			code: `import { clamp } from '../../helper.ts'`,
			options: opts,
			output: null,
			errors: [{ messageId: 'ancestorImport' }],
		},

		// The nested module's own gateway is subject to the same rule.
		{
			filename: fixturePath('panel/_private/header/index.ts'),
			code: `import { Panel } from '@/panel'`,
			options: opts,
			output: null,
			errors: [{ messageId: 'ancestorImport' }],
		},
	],
})
