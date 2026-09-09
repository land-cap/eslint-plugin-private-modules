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

		// Non-gateway file inside a module's own _private/ reaching into a sibling _private/
		// file via alias — still not a gateway, so it must go through the gateway too.
		{
			filename: fixturePath('avatar/_private/avatar.tsx'),
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
	],
})
