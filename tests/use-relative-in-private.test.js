import { useRelativeInPrivate } from '../rules/use-relative-in-private.js'
import { opts, fixturePath, tester, SRC } from './setup.js'

tester.run('use-relative-in-private', useRelativeInPrivate, {
	valid: [
		// File outside _private/ — rule doesn't apply regardless of import style.
		{
			filename: fixturePath('avatar/avatar.stories.tsx'),
			code: `import { Avatar } from '@/avatar/_private/avatar'`,
			options: opts,
		},
		// Inside _private/, relative import to a sibling _private/ file — correct style.
		{
			filename: fixturePath('avatar/_private/utils.test.ts'),
			code: `import { getInitials } from './utils'`,
			options: opts,
		},
		// Inside _private/, alias import to a different module — out of scope for this rule.
		{
			filename: fixturePath('avatar/_private/avatar.tsx'),
			code: `import { Button } from '@/button/index'`,
			options: opts,
		},
		// Inside _private/, relative import to a non-gateway file at the module root — OK.
		{
			filename: fixturePath('avatar/_private/avatar.tsx'),
			code: `import { TAvatarSize } from '../types'`,
			options: opts,
		},
		// The parent's gateway is an ancestor import — no-ancestor-imports owns
		// it. Rewriting it to a relative path would endorse a cycle.
		{
			filename: fixturePath('panel/_private/header/_private/header.tsx'),
			code: `import { Panel } from '@/panel'`,
			options: opts,
		},

		// Already relative and pointing at a sibling nested module's gateway.
		{
			filename: fixturePath('panel/_private/header/_private/header.tsx'),
			code: `import { Toolbar } from '../../toolbar'`,
			options: opts,
		},
	],

	invalid: [
		// --- useRelative: alias import that resolves inside the same module ---

		// Alias to a sibling _private/ file — must use a relative path instead.
		{
			filename: fixturePath('avatar/_private/utils.test.ts'),
			code: `import { getInitials } from '@/avatar/_private/utils'`,
			options: opts,
			output: `import { getInitials } from './utils'`,
			errors: [{ messageId: 'useRelative' }],
		},

		// Alias to a non-private file inside the same module dir — still same-module.
		{
			filename: fixturePath('avatar/_private/avatar.tsx'),
			code: `import { someHelper } from '@/avatar/helpers'`,
			options: opts,
			output: `import { someHelper } from '../helpers'`,
			errors: [{ messageId: 'useRelative' }],
		},

		// --- noGateway: relative import that resolves to the module's own gateway ---

		// Single name — gateway re-exports it from a known _private/ file, so a
		// direct autofix is possible.
		{
			filename: fixturePath('avatar/_private/utils.test.ts'),
			code: `import { getInitials } from '../index'`,
			options: opts,
			output: `import { getInitials } from './utils.ts'`,
			errors: [{ messageId: 'noGateway' }],
		},
		// Same noGateway behavior with custom gatewayNames.
		{
			filename: fixturePath('avatar/_private/utils.test.ts'),
			code: `import { getInitials } from '../public'`,
			options: [{ aliases: { '@/': SRC }, gatewayNames: ['public'] }],
			output: `import { getInitials } from './utils.ts'`,
			errors: [{ messageId: 'noGateway' }],
		},

		// Multiple names from different _private/ source files — no autofix because
		// the imports would have to be split across two statements.
		{
			filename: fixturePath('avatar/_private/utils.test.ts'),
			code: `import { getInitials, Avatar } from '../index'`,
			options: opts,
			output: null,
			errors: [{ messageId: 'noGateway' }],
		},

		// --- noGateway: alias import that resolves to the module's own gateway ---

		// Bare alias to the module root — implicit index resolution, same as
		// how consumers outside the module would import it.
		{
			filename: fixturePath('avatar/_private/utils.test.ts'),
			code: `import { getInitials } from '@/avatar'`,
			options: opts,
			output: `import { getInitials } from './utils.ts'`,
			errors: [{ messageId: 'noGateway' }],
		},
		// Alias explicitly naming the gateway file.
		{
			filename: fixturePath('avatar/_private/utils.test.ts'),
			code: `import { getInitials } from '@/avatar/index'`,
			options: opts,
			output: `import { getInitials } from './utils.ts'`,
			errors: [{ messageId: 'noGateway' }],
		},
		// Same alias-to-gateway behavior with custom gatewayNames.
		{
			filename: fixturePath('avatar/_private/utils.test.ts'),
			code: `import { getInitials } from '@/avatar/public'`,
			options: [{ aliases: { '@/': SRC }, gatewayNames: ['public'] }],
			output: `import { getInitials } from './utils.ts'`,
			errors: [{ messageId: 'noGateway' }],
		},

		// Alias to your own module's _private/ from another file in that _private/.
		// Moved here from no-private-imports: this is a path-style violation.
		{
			filename: fixturePath('avatar/_private/avatar.tsx'),
			code: `import { getInitials } from '@/avatar/_private/utils'`,
			options: opts,
			output: `import { getInitials } from './utils'`,
			errors: [{ messageId: 'useRelative' }],
		},

		// Alias aimed at a sibling nested module — both files live in the same
		// top-level module, so the reference must be relative.
		{
			filename: fixturePath('panel/_private/header/_private/header.tsx'),
			code: `import { Toolbar } from '@/panel/_private/toolbar'`,
			options: opts,
			output: `import { Toolbar } from '../../toolbar'`,
			errors: [{ messageId: 'useRelative' }],
		},

		// Alias aimed at the nested module's own gateway — still noGateway,
		// scoped to the file's own module rather than the outermost one.
		{
			filename: fixturePath('panel/_private/header/_private/header.tsx'),
			code: `import { Header } from '@/panel/_private/header'`,
			options: opts,
			output: `import { Header } from './header.tsx'`,
			errors: [{ messageId: 'noGateway' }],
		},
	],
})
