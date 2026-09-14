# Nested Modules — Design

Date: 2026-09-14 Status: Approved, ready for implementation planning

## Problem

A module today is flat: a directory holding `_private/` and a gateway file. There is no way to express that a module is
an implementation detail of another module. Two things are missing:

1. A module nested inside another module's `_private/` should be reachable only from within that private scope — never
   from outside the parent.
2. A nested module must not import from the module that encloses it. Doing so closes a cycle: the parent's gateway
   re-exports from its `_private/`, which is where the nested module lives.

The current implementation also resolves module ownership with `getPrivateParent`, which slices at the **first**
`_private/` segment. Under nesting that returns the outermost module for a file that belongs to an inner one, so all
three existing rules mis-attribute nested files.

## Model

One new util, `utils/module-scope.js`, holds the entire model. Three primitives, plus one derived helper:

### `ownerOf(absPath, gatewayNames)`

Which module a path belongs to:

1. `basename(absPath)` (without extension) is in `gatewayNames` → `dirname(absPath)`
2. else `absPath` contains `_private/` → slice at the **last** `/_private/` segment
3. else → `null` (outside any module)

Gateway-first ordering is required: `feature/_private/sub/index.ts` belongs to `feature/_private/sub`, not to `feature`.
The existing `getModuleDir` helper inside `use-absolute-outside-module` checks private-first and gets this wrong under
nesting.

The same function answers both queries the rules need. For a file, it gives the module the file belongs to. For a
resolved import specifier, it gives the innermost module whose `_private/` the specifier penetrates — which is what the
boundary check wants.

### `isVisible(F, T)` — lexical scope

The `_private/` directories enclosing any path form a chain by containment, so only the innermost one needs checking:

> T is visible to F iff T has no enclosing `_private/`, or F is _within_ the innermost `M/_private/` that encloses T —
> where "within" means F is inside `M/_private/`, **or** F is M's gateway file.

The gateway clause is what permits `feature/index.ts` to import `./_private/sub`.

Consequences, all intended:

- An outsider cannot see any module nested in a `_private/`.
- Sibling nested modules in the same `_private/` see each other's gateways.
- A nested module cannot see a sibling's internals, only its gateway.
- A deep file can reach an "uncle" module living in an enclosing `_private/`.

### `ancestorsOf(M)`

Repeatedly apply `ownerOf` to the module directory itself: `feature/_private/sub` → `feature` → `null`.

Parent-agnosticism is then a one-line predicate: F's import is illegal when `ownerOf(T)` is a strict ancestor of
`ownerOf(F)`.

This formulation yields the sibling case for free. `feature/_private/b` is owned by itself, not by `feature`, so it is
allowed — while both `feature/index.ts` and `feature/_private/helper.ts` are owned by `feature` and are therefore both
blocked. Agnosticism is full: a nested module may not reach _any_ file belonging to an enclosing module, gateway or
plain private file alike. The nested module stays relocatable.

### `rootModuleOf(F)` (derived)

The outermost module enclosing F — the last entry of `ancestorsOf(ownerOf(F))`, or `ownerOf(F)` itself when that chain
is empty; `null` when F belongs to no module. The two path-style rules are scoped by this rather than by the owning
module, which is what lets relative paths travel between sibling nested modules.

### Orthogonality

The two boundary rules never both fire on the same import. Visibility catches reaching _down_ into a private scope you
are not in; ancestry catches reaching _up_. Every combination was traced against both predicates:

| F           | T                                 | visibility                            | ancestry                 |
| ----------- | --------------------------------- | ------------------------------------- | ------------------------ |
| outsider    | `feature/_private/sub/_private/x` | reports                               | F has no owner → silent  |
| nested file | `@/feature` (parent gateway)      | specifier has no `_private/` → silent | reports                  |
| nested file | `@/feature/_private/helper`       | F is in scope → silent                | reports                  |
| nested file | sibling `../../b`                 | silent                                | different owner → silent |

## Rule Changes

### `no-private-imports` (recommended)

The trigger stays syntactic — the specifier must literally contain `_private/`. This keeps bare package specifiers out
of the resolution path cheaply, and every legal or illegal cross-private reference under these conventions does contain
the segment.

The check becomes: resolve T to an absolute path, report only when `isVisible(F, T)` is false. Message selection is
unchanged — `crossModule` when F is a gateway file, `noPrivate` otherwise — so existing messages and their tests are
preserved.

The fixer gains a walk-up. From `ownerOf(T)`, climb `ancestorsOf` until reaching a module whose gateway is visible to F,
then require `gatewayExportsAll(thatGateway, names)` before offering the fix. For non-nested code the walk is zero steps
and behavior is identical to today. Only the final gateway needs the export check: the existing scanner already matches
`export { X } from './_private/sub'`, because that source string contains `_private`. When no visible gateway exports
every name, report without a fix. `crossModule` remains unfixed, as today.

Supporting extraction: `module-resolution.js` already computes the resolved absolute path internally in both its
relative and alias branches and then discards it. Surface that as `resolveImport(filename, src, aliases)` and rebuild
`findModuleDir` on top of it.

### `use-relative-in-private` (strict)

`isSameModuleAlias` becomes `isWithinRootModule` — the scope widens from the owning module to the **outermost**
enclosing module. This is what makes `@/feature/_private/b` report `useRelative` and fix to `../../b`.

`noGateway` stays scoped to F's own owning module. An enclosing module's gateway is `no-ancestor-imports`' business,
which avoids a double report.

### `use-absolute-outside-module` (strict)

Delete the local `getModuleDir` in favor of `rootModuleOf(F)`, the outermost enclosing module. A relative import is
legal iff T resolves inside that module; otherwise it is reported and fixed to the alias form. Files outside any module
resolve to `null` and keep today's behavior of flagging every relative import.

The effect is the intended relaxation: relative paths travel freely within one top-level module's subtree — including
between sibling nested modules — and an alias is required the moment an import leaves it. This matches the rule's own
rationale; a private scope moves as a unit, so relative paths inside it stay legible and survive relocation.

The existing early return on `_private/`-bearing specifiers is unchanged, so `no-private-imports` keeps sole ownership
of those.

### `no-ancestor-imports` (new, recommended)

- `M = ownerOf(F)`; return when null.
- `A = ownerOf(T)`; return when null.
- Report `ancestorImport` when A is a strict ancestor of M.

Skips asset imports and any specifier that does not resolve (bare package specifiers).

No autofix — inverting a dependency is not a mechanical transformation.

Message: _"A nested module must not import from an enclosing module. Invert the dependency or hoist the shared code out
of the parent."_

It is a separate rule rather than a message on `no-private-imports` because an ancestor import is typically a public
path (`@/feature`), not a `_private/` one, and because the cycle guard should be independently disable-able.

### Config surface

`recommendedConfig` becomes `[no-private-imports, no-ancestor-imports]`; `strictConfig` adds the two path rules as
before. `privateModuleBoundary.rules` and `index.d.ts` both grow the new entry. Upgrading can surface a new error, but
only in a codebase that already nests a module inside a `_private/`.

## Accepted Behavior Change

Today `avatar/_private/avatar.tsx` writing `@/avatar/_private/utils` reports `noPrivate` and autofixes to `@/avatar`.
Under the visibility model it is silent in `no-private-imports`, and `use-relative-in-private` handles it instead,
fixing to `./utils`.

This is deliberate. The old behavior routes a file through its own module's gateway, which `use-relative-in-private`'s
`noGateway` then immediately undoes — the rules converge, but via a detour. It also fails to generalize: the same alias
form aimed at a sibling nested module would be "fixed" to `@/feature` when the correct result is `../../b`. Splitting
the concerns — one rule owns boundaries, one owns path style — resolves both.

The cost is that `recommended`-only consumers lose an error for that case. It is a path-style issue strictly within a
single module, which is what the `strict` tier is for.

## Fixtures and Testing

New fixture tree under `tests/__fixtures__/src/`:

```
panel/
├── _private/
│   ├── panel.tsx          ← parent implementation
│   ├── helper.ts          ← parent plain private file (ancestor-rule target)
│   ├── header/            ← nested module
│   │   ├── _private/header.tsx
│   │   └── index.ts
│   └── toolbar/           ← sibling nested module
│       ├── _private/toolbar.ts
│       └── index.ts
└── index.ts               ← re-exports from ./_private/panel.tsx and ./_private/header
```

`panel/index.ts` must re-export a name originating deep inside `header`; that is what makes the walk-up fix testable end
to end. An outsider importing `@/panel/_private/header/_private/header.tsx` fixes to `@/panel`, while a name
`panel/index.ts` does not re-export reports with no fix.

Test files:

- **`tests/module-scope.test.js`** — `ownerOf`, `isVisible`, `ancestorsOf` directly. These three carry the whole model;
  exercising them only through rules would make failures hard to localize. `gateway-discovery.test.js` is the precedent
  for unit-testing a util.
- **`tests/no-ancestor-imports.test.js`** — nested file → parent gateway (error); → parent's plain private file (error);
  → sibling gateway (valid); → outside the tree (valid); outsider with no owning module (valid); parent → nested module
  (valid, downward is the point).
- Additions to the three existing rule test files for nested cases: sibling gateway access, the walk-up fix and its
  no-fix variant, `@/panel/_private/toolbar` → `../../toolbar`, and a relative sibling import accepted by
  `use-absolute-outside-module`.

The existing suite is the regression net and must pass untouched, with the single exception documented above.

Work is test-first: each rule change starts as a failing RuleTester case under the repo's existing `node --test` setup.

## Documentation

- _What Is a Module_ — add nesting and the containment rule.
- _Module Contract_ — restate in visibility and agnosticism terms rather than "only gateway files may import from
  `_private/`".
- _Plugin Rules_ — document `no-ancestor-imports` with examples.
- _Configs_ — note the recommended-tier addition and the accepted behavior change.
