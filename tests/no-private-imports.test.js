import { noPrivateImports } from '../rules/no-private-imports.js'
import { opts, fixturePath, tester, SRC } from './setup.js'

tester.run('no-private-imports', noPrivateImports, {
	valid: [
		// Non-code imports are ignored by this rule.
		{
			filename: fixturePath('feed/feed.tsx'),
			code: `import avatarTokens from '../avatar/_private/tokens.json'`,
			options: opts,
		},

		// Regular file importing from a public (non-_private/) path — always fine.
		{
			filename: fixturePath('feed/feed.tsx'),
			code: `import { Avatar } from '@/avatar/index'`,
			options: opts,
		},

		// Gateway importing from its own sibling _private/ with a relative path — the correct pattern.
		{
			filename: fixturePath('avatar/index.ts'),
			code: `export { getInitials } from './_private/utils.ts'`,
			options: opts,
		},

		// Gateway importing from its own sibling _private/ with an alias path — the plugin
		// is not concerned with relative vs. absolute, only with which module owns the _private/.
		{
			filename: fixturePath('avatar/index.ts'),
			code: `export { getInitials } from '@/avatar/_private/utils'`,
			options: opts,
		},
		// Nested module: the parent gateway may reach into its own _private/ to
		// pick up the nested module's gateway.
		{
			filename: fixturePath('panel/index.ts'),
			code: `export { Header } from './_private/header'`,
			options: opts,
		},

		// Nested module: its gateway owns its own _private/, exactly like a
		// top-level module's gateway does.
		{
			filename: fixturePath('panel/_private/header/index.ts'),
			code: `export { Header } from './_private/header.tsx'`,
			options: opts,
		},

		// Sibling nested modules share a private scope, so one may reach the
		// other's gateway — the path crosses a _private/ that encloses both.
		{
			filename: fixturePath('panel/_private/header/_private/header.tsx'),
			code: `import { Toolbar } from '@/panel/_private/toolbar'`,
			options: opts,
		},

		// A file in the parent's _private/ is inside the scope containing the
		// nested modules, so it may use their gateways.
		{
			filename: fixturePath('panel/_private/panel.tsx'),
			code: `import { Header } from './header'`,
			options: opts,
		},

		// Accepted behavior change: an alias pointing at your own module's
		// _private/ is a path-style problem, not a boundary one. Reported by
		// use-relative-in-private instead.
		{
			filename: fixturePath('avatar/_private/avatar.tsx'),
			code: `import { getInitials } from '@/avatar/_private/utils'`,
			options: opts,
		},
		// External packages are outside this plugin's remit, even when they have
		// a _private/ of their own — no alias covers them, so they never resolve.
		{
			filename: fixturePath('feed/feed.tsx'),
			code: `import x from 'some-pkg/_private/x'`,
			options: opts,
		},
	],

	invalid: [
		// Regular file importing directly from _private/ via relative path.
		// Autofixes to the alias form of the gateway.
		{
			filename: fixturePath('feed/feed.tsx'),
			code: `import { getInitials } from '../avatar/_private/utils'`,
			options: opts,
			output: `import { getInitials } from '@/avatar'`,
			errors: [{ messageId: 'noPrivate' }],
		},

		// Regular file importing directly from _private/ via alias.
		// Autofixes to the alias form of the gateway.
		{
			filename: fixturePath('feed/feed.tsx'),
			code: `import { getInitials } from '@/avatar/_private/utils'`,
			options: opts,
			output: `import { getInitials } from '@/avatar'`,
			errors: [{ messageId: 'noPrivate' }],
		},

		// Cross-module: file inside one module's _private/ reaches into another's.
		// Autofixes to the target module's @/ gateway (not a relative ../../../ path).
		{
			filename: fixturePath('avatar/_private/avatar.tsx'),
			code: `import { Button } from '../../button/_private/button.tsx'`,
			options: opts,
			output: `import { Button } from '@/button'`,
			errors: [{ messageId: 'noPrivate' }],
		},

		// Same cross-module case via alias — still autofixes to the bare gateway.
		{
			filename: fixturePath('avatar/_private/avatar.tsx'),
			code: `import { Button } from '@/button/_private/button.tsx'`,
			options: opts,
			output: `import { Button } from '@/button'`,
			errors: [{ messageId: 'noPrivate' }],
		},

		// Gateway importing from a sibling module's _private/ via a relative path — forbidden,
		// no autofix.
		{
			filename: fixturePath('avatar/index.ts'),
			code: `import { Button } from '../button/_private/button'`,
			options: opts,
			output: null,
			errors: [{ messageId: 'crossModule' }],
		},

		// Same cross-module gateway violation via alias — the plugin doesn't distinguish
		// relative from alias imports, only which module the target belongs to.
		{
			filename: fixturePath('avatar/index.ts'),
			code: `import { Button } from '@/button/_private/button'`,
			options: opts,
			output: null,
			errors: [{ messageId: 'crossModule' }],
		},

		// Import with an explicit file extension in the _private/ path — the fixer
		// should still redirect to the gateway barrel (mirrors real-world TSX imports).
		{
			filename: fixturePath('feed/feed.tsx'),
			code: `import { Avatar } from '@/avatar/_private/avatar.tsx'`,
			options: opts,
			output: `import { Avatar } from '@/avatar'`,
			errors: [{ messageId: 'noPrivate' }],
		},

		// Custom gatewayNames option: when overridden to ['index'] explicitly,
		// the fixer still points at the configured barrel and the message includes it.
		{
			filename: fixturePath('feed/feed.tsx'),
			code: `import { getInitials } from '@/avatar/_private/utils'`,
			options: [{ aliases: { '@/': SRC }, gatewayNames: ['index'] }],
			output: `import { getInitials } from '@/avatar'`,
			errors: [
				{
					messageId: 'noPrivate',
					data: { gatewayList: 'index.ts' },
				},
			],
		},
		// Custom gatewayNames option: fixer and message both follow the configured gateway.
		{
			filename: fixturePath('feed/feed.tsx'),
			code: `import { getInitials } from '@/avatar/_private/utils'`,
			options: [{ aliases: { '@/': SRC }, gatewayNames: ['public'] }],
			output: `import { getInitials } from '@/avatar/public.ts'`,
			errors: [
				{
					messageId: 'noPrivate',
					data: { gatewayList: 'public.ts' },
				},
			],
		},

		// A nested module is invisible from outside its parent's _private/.
		// The existing fixer already lands on @/panel here, because panel is the
		// first module on the path and its gateway re-exports Header.
		{
			filename: fixturePath('feed/feed.tsx'),
			code: `import { Header } from '@/panel/_private/header'`,
			options: opts,
			output: `import { Header } from '@/panel'`,
			errors: [{ messageId: 'noPrivate' }],
		},

		// Sibling nested modules see each other's gateways but not each other's
		// internals. The sibling's own gateway IS visible from here, so that is
		// what the climb stops at — use-relative-in-private then makes it relative.
		{
			filename: fixturePath('panel/_private/header/_private/header.tsx'),
			code: `import { Toolbar } from '@/panel/_private/toolbar/_private/toolbar.ts'`,
			options: opts,
			output: `import { Toolbar } from '@/panel/_private/toolbar'`,
			errors: [{ messageId: 'noPrivate' }],
		},

		// A nested module's gateway may not reach into a sibling's _private/.
		{
			filename: fixturePath('panel/_private/header/index.ts'),
			code: `export { Toolbar } from '@/panel/_private/toolbar/_private/toolbar.ts'`,
			options: opts,
			output: null,
			errors: [{ messageId: 'crossModule' }],
		},

		// The importing file lives in panel's _private/, so it can see the nested
		// module's own gateway — that, not panel's, is the right target. The old
		// fixer rewrites this to `@/panel`, which would leave the file importing
		// its own module through its own gateway.
		{
			filename: fixturePath('panel/_private/panel.tsx'),
			code: `import { Header } from '@/panel/_private/header/_private/header.tsx'`,
			options: opts,
			output: `import { Header } from '@/panel/_private/header'`,
			errors: [{ messageId: 'noPrivate' }],
		},

		// Deep import from outside: the owning module's gateway is private too,
		// so the climb continues outward to @/panel, which re-exports Header.
		{
			filename: fixturePath('feed/feed.tsx'),
			code: `import { Header } from '@/panel/_private/header/_private/header.tsx'`,
			options: opts,
			output: `import { Header } from '@/panel'`,
			errors: [{ messageId: 'noPrivate' }],
		},

		// An alias whose target sits inside a private subtree still cannot be
		// used to reach in: violations are judged on where a specifier resolves,
		// not on whether its text happens to contain `_private/`.
		{
			filename: fixturePath('feed/feed.tsx'),
			code: `import { Header } from '@header/index.ts'`,
			options: [
				{
					aliases: {
						'@/': SRC,
						'@header/': fixturePath('panel/_private/header'),
					},
				},
			],
			output: `import { Header } from '@/panel'`,
			errors: [{ messageId: 'noPrivate' }],
		},
	],
})
